import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { db } from './db.js';
import { runUnitOfWork, type TransactionClient } from './unit-of-work.js';

export type OperationScope = {
  firmId: string;
  clientId: string;
  engagementId: string;
  actorId: string;
};

export type OperationKey = OperationScope & {
  action: string;
  callerKey: string;
  requestHash: string;
};

export type OperationStart =
  | { kind: 'execute'; operationId: string }
  | { kind: 'replay'; result: Prisma.JsonValue };

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Operation request contains a non-finite number');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    const normalized: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) throw new TypeError(`Operation request contains a sparse array at ${index}`);
      normalized.push(canonicalize(value[index]));
    }
    return normalized;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Operation request objects must be plain JSON objects');
    if (Object.getOwnPropertySymbols(record).length) throw new TypeError('Operation request objects cannot contain symbol keys');
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] === undefined) throw new TypeError(`Operation request contains undefined at ${key}`);
      sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  throw new TypeError(`Operation request contains unsupported ${typeof value}`);
}

/** SHA-256 over JSON with recursively sorted object keys and stable array ordering. */
export function normalizedRequestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

/**
 * Acquire a transaction-scoped lock for this idempotency tuple, then create or resolve its
 * durable record. Call only after checking current authorization and while inside the caller's
 * UnitOfWork. Hash collisions in PostgreSQL's advisory lock only serialize unrelated requests;
 * the full unique key remains the correctness boundary.
 */
export async function startOperation(client: TransactionClient, key: OperationKey): Promise<OperationStart> {
  if (!key.action.trim() || !key.callerKey.trim()) throw new TypeError('Operation action and caller key are required');
  if (!/^[0-9a-f]{64}$/.test(key.requestHash)) throw new TypeError('Operation request hash must be a lowercase SHA-256 digest');

  const lockKey = JSON.stringify([
    key.firmId, key.clientId, key.engagementId, key.actorId, key.action, key.callerKey,
  ]);
  await client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL AS locked`;

  const where = {
    firmId_clientId_engagementId_actorId_action_callerKey: {
      firmId: key.firmId,
      clientId: key.clientId,
      engagementId: key.engagementId,
      actorId: key.actorId,
      action: key.action,
      callerKey: key.callerKey,
    },
  };
  const existing = await client.operationRequest.findUnique({ where });
  if (existing) {
    if (existing.requestHash !== key.requestHash) throw new ConflictException('Idempotency key reused with a different request');
    if (existing.state === 'COMPLETED' && existing.result !== null) return { kind: 'replay', result: existing.result };
    if (existing.state === 'UNKNOWN') throw new ConflictException('Operation outcome is unknown and requires reconciliation');
    throw new ConflictException('Operation is already in progress');
  }

  const operation = await client.operationRequest.create({
    data: {
      firmId: key.firmId,
      clientId: key.clientId,
      engagementId: key.engagementId,
      actorId: key.actorId,
      action: key.action,
      callerKey: key.callerKey,
      requestHash: key.requestHash,
    },
    select: { id: true },
  });
  return { kind: 'execute', operationId: operation.id };
}

/** Store the response in the same transaction as the command's business writes and audit row. */
export async function completeOperation(client: TransactionClient, operationId: string, result: Prisma.InputJsonValue): Promise<void> {
  const changed = await client.operationRequest.updateMany({
    where: { id: operationId, state: 'IN_PROGRESS' },
    data: { state: 'COMPLETED', result, completedAt: new Date(), unknownCode: null },
  });
  if (changed.count !== 1) throw new ConflictException('Operation state changed before completion');
}

/**
 * Persist uncertainty after an external call has an ambiguous outcome. Keep provider detail out
 * of this field; use a stable, non-secret reconciliation code. This runs in its own transaction
 * after the external I/O and is safe to repeat with the same code.
 */
export async function recordUnknownOperation(operationId: string, unknownCode: string): Promise<void> {
  if (!/^[A-Z0-9_.:-]{1,120}$/.test(unknownCode)) throw new TypeError('Unknown outcome requires a stable reconciliation code');
  await runUnitOfWork(async ({ client }) => {
    const current = await client.operationRequest.findUnique({ where: { id: operationId }, select: { state: true, unknownCode: true } });
    if (!current) throw new NotFoundException('Operation request not found');
    if (current.state === 'UNKNOWN' && current.unknownCode === unknownCode) return;
    if (current.state !== 'IN_PROGRESS') throw new ConflictException('Only an in-progress operation can be marked unknown');
    await client.operationRequest.update({ where: { id: operationId }, data: { state: 'UNKNOWN', unknownCode } });
  });
}
