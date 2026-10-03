import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { db } from './db.js';

export const TRIAL_BALANCE_IMPORT_EVENT = 'tb.import' as const;
const outboxIdSchema = z.uuid();
const trialBalancePayloadSchema = z.object({}).strict();
const outboxJobSchema = z.object({
  outboxEventId: outboxIdSchema,
  operationId: outboxIdSchema,
  payloadVersion: z.literal(1),
}).strict();

export type TrialBalanceOutboxJob = z.infer<typeof outboxJobSchema>;
export type OutboxScope = { firmId: string; clientId: string; engagementId: string };

export function parseTrialBalanceOutboxJob(value: unknown): TrialBalanceOutboxJob {
  try {
    return outboxJobSchema.parse(value);
  } catch {
    throw Object.assign(new Error('Invalid trial-balance queue payload'), { code: 'OUTBOX_EVENT_INVALID' });
  }
}

export type OutboxDispatch = {
  jobId: string;
  name: 'parse';
  data: TrialBalanceOutboxJob;
};
type OutboxRecord = {
  id: string;
  operationId: string;
  type: string;
  payloadVersion: number;
  payload: Prisma.JsonValue;
  dispatchClaimToken: string;
};

/**
 * Insert operation state and its typed outbox intent in the caller's business transaction.
 * The durable operation UUID is reused as the outbox UUID and deterministic BullMQ job ID.
 */
export async function createTrialBalanceImportOutbox(
  client: Prisma.TransactionClient,
  scope: OutboxScope & { importId: string },
): Promise<string> {
  const operationId = randomUUID();
  const { importId, ...engagementScope } = scope;
  await client.backgroundOperation.create({
    data: {
      id: operationId,
      ...engagementScope,
      type: TRIAL_BALANCE_IMPORT_EVENT,
      state: 'QUEUED',
    },
  });
  await client.outboxEvent.create({
    data: {
      id: operationId,
      operationId,
      ...engagementScope,
      importId,
      type: TRIAL_BALANCE_IMPORT_EVENT,
      payloadVersion: 1,
      payload: trialBalancePayloadSchema.parse({}),
    },
  });
  return operationId;
}

export function parseTrialBalanceOutbox(event: {
  id: unknown;
  operationId: unknown;
  type: unknown;
  payloadVersion: unknown;
  payload: unknown;
}): TrialBalanceOutboxJob {
  if (event.type !== TRIAL_BALANCE_IMPORT_EVENT || event.payloadVersion !== 1) {
    throw Object.assign(new Error('Unsupported outbox event type or payload version'), { code: 'OUTBOX_EVENT_INVALID' });
  }
  try {
    trialBalancePayloadSchema.parse(event.payload);
    const id = outboxIdSchema.parse(event.id);
    const operationId = outboxIdSchema.parse(event.operationId);
    if (id !== operationId) throw new Error('Outbox event operation identity does not match');
    return outboxJobSchema.parse({ outboxEventId: id, operationId, payloadVersion: 1 });
  } catch {
    throw Object.assign(new Error('Invalid trial-balance outbox record'), { code: 'OUTBOX_EVENT_INVALID' });
  }
}

function safeDispatchErrorCode(error: unknown): string {
  const candidate = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  return typeof candidate === 'string' && /^[A-Z0-9_.:-]{1,120}$/.test(candidate)
    ? candidate
    : 'QUEUE_ENQUEUE_FAILED';
}

/**
 * Recover stale operations conservatively, then claim a dispatch batch in one PostgreSQL
 * transaction. Pure, repeatable TB parsing may be requeued; a stale future provider operation is
 * marked UNKNOWN so an external effect is never repeated on assumption.
 */
async function claimDispatchBatch(options: {
  batchSize: number;
  claimLeaseMs: number;
  staleOperationMs: number;
  now: Date;
}): Promise<OutboxRecord[]> {
  const token = randomUUID();
  const claimExpiresAt = new Date(options.now.getTime() + options.claimLeaseMs);
  const staleBefore = new Date(options.now.getTime() - options.staleOperationMs);
  return db.$transaction(async tx => {
    await tx.$executeRaw`
      UPDATE background_operations
      SET state = CASE WHEN type = ${TRIAL_BALANCE_IMPORT_EVENT} THEN 'QUEUED' ELSE 'UNKNOWN' END,
          "unknownCode" = CASE WHEN type = ${TRIAL_BALANCE_IMPORT_EVENT} THEN NULL ELSE 'OPERATION_LEASE_EXPIRED' END,
          "updatedAt" = ${options.now}
      WHERE state = 'RUNNING'
        AND "updatedAt" <= ${staleBefore}
    `;

    return tx.$queryRaw<OutboxRecord[]>`
      WITH candidates AS (
        SELECT event.id
        FROM "OutboxEvent" AS event
        JOIN background_operations AS operation
          ON operation.id = event."operationId"
         AND operation."firmId" = event."firmId"
         AND operation."clientId" = event."clientId"
         AND operation."engagementId" = event."engagementId"
        WHERE event.type = ${TRIAL_BALANCE_IMPORT_EVENT}
          AND event."completedAt" IS NULL
          AND event."failedAt" IS NULL
          AND operation.state = 'QUEUED'
          AND (event."dispatchClaimExpiresAt" IS NULL OR event."dispatchClaimExpiresAt" <= ${options.now})
        ORDER BY event."createdAt", event.id
        FOR UPDATE OF event SKIP LOCKED
        LIMIT ${options.batchSize}
      )
      UPDATE "OutboxEvent" AS event
      SET "dispatchClaimToken" = ${token}::uuid,
          "dispatchClaimExpiresAt" = ${claimExpiresAt},
          "dispatchAttempts" = event."dispatchAttempts" + 1
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.id,
                event."operationId",
                event.type,
                event."payloadVersion",
                event.payload,
                event."dispatchClaimToken"
    `;
  });
}

export async function dispatchPendingOutbox(
  publish: (dispatch: OutboxDispatch) => Promise<unknown>,
  options: {
    batchSize?: number;
    claimLeaseMs?: number;
    staleOperationMs?: number;
    now?: Date;
  } = {},
): Promise<{ claimed: number; published: number; failed: number }> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 100;
  const claimLeaseMs = options.claimLeaseMs ?? 30_000;
  const staleOperationMs = options.staleOperationMs ?? 10 * 60_000;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new TypeError('Outbox batch size must be 1..500');
  if (!Number.isInteger(claimLeaseMs) || claimLeaseMs < 1_000 || claimLeaseMs > 10 * 60_000) throw new TypeError('Outbox dispatch claim lease must be 1 second..10 minutes');
  if (!Number.isInteger(staleOperationMs) || staleOperationMs < 60_000) throw new TypeError('Outbox operation recovery age must be at least 1 minute');
  const events = await claimDispatchBatch({
    batchSize,
    claimLeaseMs,
    staleOperationMs,
    now,
  });
  let published = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const job = parseTrialBalanceOutbox(event);
      await publish({ jobId: job.operationId, name: 'parse', data: job });
      await db.outboxEvent.updateMany({
        where: { id: event.id, dispatchClaimToken: event.dispatchClaimToken },
        data: {
          publishedAt: now,
          dispatchClaimToken: null,
          dispatchClaimExpiresAt: null,
          lastDispatchErrorCode: null,
        },
      });
      published++;
    } catch (error) {
      const errorCode = safeDispatchErrorCode(error);
      await db.outboxEvent.updateMany({
        where: { id: event.id, dispatchClaimToken: event.dispatchClaimToken },
        data: {
          dispatchClaimToken: null,
          dispatchClaimExpiresAt: null,
          lastDispatchErrorCode: errorCode,
        },
      });
      if (errorCode === 'OUTBOX_EVENT_INVALID') {
        await db.backgroundOperation.updateMany({
          where: { id: event.operationId, state: 'QUEUED' },
          data: { state: 'UNKNOWN', unknownCode: errorCode, updatedAt: now },
        });
      }
      failed++;
    }
  }
  return { claimed: events.length, published, failed };
}

export async function claimBackgroundOperation(operationId: string): Promise<boolean> {
  const changed = await db.backgroundOperation.updateMany({
    where: { id: operationId, state: 'QUEUED' },
    data: { state: 'RUNNING', attemptCount: { increment: 1 }, updatedAt: new Date() },
  });
  return changed.count === 1;
}

export async function completeBackgroundOperation(
  client: Prisma.TransactionClient,
  operationId: string,
  result: Prisma.InputJsonValue,
): Promise<void> {
  const now = new Date();
  const changed = await client.backgroundOperation.updateMany({
    where: { id: operationId, state: 'RUNNING' },
    data: { state: 'COMPLETED', result, completedAt: now, updatedAt: now, errorCode: null, unknownCode: null },
  });
  if (changed.count !== 1) throw new ConflictException('Background operation changed before completion');
  const event = await client.outboxEvent.updateMany({
    where: { operationId, completedAt: null, failedAt: null },
    data: { completedAt: now },
  });
  if (event.count !== 1) throw new ConflictException('Outbox event changed before operation completion');
}

export async function retryBackgroundOperation(client: Prisma.TransactionClient, operationId: string): Promise<void> {
  const changed = await client.backgroundOperation.updateMany({
    where: { id: operationId, state: 'RUNNING' },
    data: { state: 'QUEUED', updatedAt: new Date() },
  });
  if (changed.count !== 1) throw new ConflictException('Background operation changed before retry');
}

export async function failBackgroundOperation(client: Prisma.TransactionClient, operationId: string, errorCode: string): Promise<void> {
  if (!/^[A-Z0-9_.:-]{1,120}$/.test(errorCode)) throw new TypeError('Background operation failure requires a stable code');
  const now = new Date();
  const operation = await client.backgroundOperation.updateMany({
    where: { id: operationId, state: 'RUNNING' },
    data: { state: 'FAILED', errorCode, failedAt: now, updatedAt: now },
  });
  if (operation.count !== 1) throw new ConflictException('Background operation changed before failure was recorded');
  const event = await client.outboxEvent.updateMany({
    where: { operationId, completedAt: null, failedAt: null },
    data: { failedAt: now, lastDispatchErrorCode: errorCode },
  });
  if (event.count !== 1) throw new ConflictException('Outbox event changed before failure was recorded');
}

export async function markBackgroundOperationUnknown(operationId: string, unknownCode: string): Promise<void> {
  if (!/^[A-Z0-9_.:-]{1,120}$/.test(unknownCode)) throw new TypeError('Unknown outcome requires a stable reconciliation code');
  const changed = await db.backgroundOperation.updateMany({
    where: { id: operationId, state: { in: ['QUEUED', 'RUNNING'] } },
    data: { state: 'UNKNOWN', unknownCode, updatedAt: new Date() },
  });
  if (changed.count !== 1) {
    const current = await db.backgroundOperation.findUnique({ where: { id: operationId }, select: { state: true, unknownCode: true } });
    if (!current) throw new NotFoundException('Background operation not found');
    if (current.state === 'UNKNOWN' && current.unknownCode === unknownCode) return;
    throw new ConflictException('Only a pending background operation can be marked unknown');
  }
}

export async function listUnknownBackgroundOperations(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new TypeError('Unknown operation limit must be 1..500');
  return db.backgroundOperation.findMany({
    where: { state: 'UNKNOWN' },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true, firmId: true, clientId: true, engagementId: true, type: true, unknownCode: true, startedAt: true, updatedAt: true },
  });
}
