import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Job } from 'bullmq';
import { z } from 'zod';
import type { Prisma, ScheduledDeadline as ScheduledDeadlineRecord } from '../generated/prisma/client.js';
import { db } from './db.js';
import { createCorrelationId, currentCorrelationId } from './observability/correlation.js';
import {
  SCHEDULED_DEADLINE_EVENT,
  claimBackgroundOperation,
  completeBackgroundOperation,
  failBackgroundOperation,
  parseScheduledDeadlineOutbox,
  parseScheduledDeadlineOutboxJob,
  retryBackgroundOperation,
  type ScheduledDeadlineOutboxJob,
  type OutboxScope,
} from './outbox.js';

const deadlineInputSchema = z.object({
  firmId: z.uuid(),
  clientId: z.uuid(),
  engagementId: z.uuid(),
  idempotencyKey: z.string().trim().min(1).max(200),
  eventType: z.string().regex(/^[a-z][a-z0-9_.-]{1,119}$/),
  classification: z.enum(['INFORMATIONAL', 'ENFORCEMENT']),
  dueAt: z.date(),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

const scanOptionsSchema = z.object({
  now: z.date(),
  batchSize: z.number().int().min(1).max(250).default(50),
}).strict();

export type DeadlineClassification = 'INFORMATIONAL' | 'ENFORCEMENT';
export type ScheduleDeadlineInput = z.input<typeof deadlineInputSchema>;
export type ScheduledDeadlineContext = {
  client: Prisma.TransactionClient;
  deadline: ScheduledDeadlineRecord;
  now: Date;
};
export type ScheduledDeadlineHandler = (context: ScheduledDeadlineContext) => Promise<Prisma.InputJsonValue | void>;
export type ScheduledDeadlineHandlers = Readonly<Record<string, ScheduledDeadlineHandler>>;

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonValue {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(value); } catch { throw new TypeError('Scheduled deadline payload must be JSON serializable'); }
  if (!encoded || Buffer.byteLength(encoded) > 32_768) throw new TypeError('Scheduled deadline payload must be at most 32 KiB');
  const parsed: unknown = JSON.parse(encoded);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new TypeError('Scheduled deadline payload must be a JSON object');
  return parsed as Prisma.InputJsonValue;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameSchedule(existing: ScheduledDeadlineRecord, input: z.output<typeof deadlineInputSchema>, payload: Prisma.InputJsonValue): boolean {
  return existing.eventType === input.eventType
    && existing.classification === input.classification
    && existing.dueAt.getTime() === input.dueAt.getTime()
    && stableJson(existing.payload) === stableJson(payload);
}

/**
 * Persist a deadline inside the source workflow's transaction. Replays with the same scoped key
 * return the same row; a changed deadline must use a new revision key so completed history cannot
 * be silently moved.
 */
export async function scheduleDeadline(client: Prisma.TransactionClient, value: ScheduleDeadlineInput) {
  const parsed = deadlineInputSchema.parse(value);
  if (!Number.isFinite(parsed.dueAt.getTime())) throw new TypeError('Scheduled deadline instant is invalid');
  const payload = jsonObject(parsed.payload);
  const correlationId = createCorrelationId(currentCorrelationId());
  const scope = { firmId: parsed.firmId, clientId: parsed.clientId, engagementId: parsed.engagementId };
  const where = { firmId_clientId_engagementId_idempotencyKey: { ...scope, idempotencyKey: parsed.idempotencyKey } };
  const existing = await client.scheduledDeadline.findUnique({ where });
  if (existing) {
    if (!sameSchedule(existing, parsed, payload)) throw new ConflictException('Scheduled deadline key was already used for different content');
    return existing;
  }

  await client.scheduledDeadline.createMany({
    data: [{
      ...scope,
      idempotencyKey: parsed.idempotencyKey,
      eventType: parsed.eventType,
      classification: parsed.classification,
      dueAt: parsed.dueAt,
      payload,
      correlationId,
    }],
    skipDuplicates: true,
  });
  const persisted = await client.scheduledDeadline.findUnique({ where });
  if (!persisted) throw new NotFoundException('Scheduled deadline was not persisted');
  if (!sameSchedule(persisted, parsed, payload)) throw new ConflictException('Scheduled deadline key was already used for different content');
  return persisted;
}

/** Only a not-yet-due schedule can be cancelled. Queued and completed work is durable history. */
export async function cancelScheduledDeadline(
  client: Prisma.TransactionClient,
  scope: OutboxScope,
  idempotencyKey: string,
  now: Date,
): Promise<boolean> {
  const parsed = z.object({
    firmId: z.uuid(),
    clientId: z.uuid(),
    engagementId: z.uuid(),
    idempotencyKey: z.string().trim().min(1).max(200),
    now: z.date(),
  }).strict().parse({ ...scope, idempotencyKey, now });
  if (!Number.isFinite(parsed.now.getTime())) throw new TypeError('Invalid scheduled deadline cancellation');
  const unique = { firmId_clientId_engagementId_idempotencyKey: {
    firmId: parsed.firmId, clientId: parsed.clientId, engagementId: parsed.engagementId, idempotencyKey: parsed.idempotencyKey,
  } };
  const changed = await client.scheduledDeadline.updateMany({
    where: { firmId: parsed.firmId, clientId: parsed.clientId, engagementId: parsed.engagementId, idempotencyKey: parsed.idempotencyKey, state: 'SCHEDULED' },
    data: { state: 'CANCELLED', cancelledAt: parsed.now, updatedAt: parsed.now },
  });
  if (changed.count) return true;
  const current = await client.scheduledDeadline.findUnique({ where: unique });
  if (!current || current.state === 'CANCELLED') return false;
  throw new ConflictException('A queued or terminal deadline cannot be cancelled');
}

/**
 * Claim a bounded set of overdue rows with PostgreSQL SKIP LOCKED. The deadline state, durable
 * operation and outbox event commit together; a restart can re-dispatch the same operation ID.
 */
export async function enqueueDueDeadlines(options: { now: Date; batchSize?: number }) {
  const parsed = scanOptionsSchema.parse(options);
  const now = parsed.now;
  return db.$transaction(async tx => {
    const due = await tx.$queryRaw<Array<Pick<ScheduledDeadlineRecord, 'id' | 'firmId' | 'clientId' | 'engagementId' | 'correlationId'>>> `
      WITH due AS (
        SELECT id
        FROM scheduled_deadlines
        WHERE state = 'SCHEDULED' AND "dueAt" <= ${now}
        ORDER BY "dueAt", id
        FOR UPDATE SKIP LOCKED
        LIMIT ${parsed.batchSize}
      )
      UPDATE scheduled_deadlines AS deadline
      SET state = 'QUEUED', "queuedAt" = ${now}, "updatedAt" = ${now}
      FROM due
      WHERE deadline.id = due.id
      RETURNING deadline.id, deadline."firmId", deadline."clientId", deadline."engagementId", deadline."correlationId"
    `;

    for (const deadline of due) {
      // Stable row ID is also the operation, outbox and BullMQ identity.
      await tx.backgroundOperation.create({
        data: {
          id: deadline.id,
          firmId: deadline.firmId,
          clientId: deadline.clientId,
          engagementId: deadline.engagementId,
          type: SCHEDULED_DEADLINE_EVENT,
          correlationId: deadline.correlationId,
          state: 'QUEUED',
          startedAt: now,
          updatedAt: now,
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: deadline.id,
          operationId: deadline.id,
          firmId: deadline.firmId,
          clientId: deadline.clientId,
          engagementId: deadline.engagementId,
          deadlineId: deadline.id,
          type: SCHEDULED_DEADLINE_EVENT,
          correlationId: deadline.correlationId,
          payloadVersion: 1,
          payload: {},
          createdAt: now,
        },
      });
    }
    return { scanned: due.length, operationIds: due.map(deadline => deadline.id) };
  }, { timeout: 10_000 });
}

async function failUnregisteredDeadline(job: ScheduledDeadlineOutboxJob, now: Date): Promise<void> {
  await db.$transaction(async tx => {
    const changed = await tx.backgroundOperation.updateMany({
      where: { id: job.operationId, state: 'QUEUED' },
      data: { state: 'FAILED', errorCode: 'DEADLINE_HANDLER_UNAVAILABLE', failedAt: now, updatedAt: now },
    });
    if (!changed.count) return;
    await tx.scheduledDeadline.updateMany({ where: { id: job.deadlineId, state: 'QUEUED' }, data: { state: 'FAILED', failedAt: now, updatedAt: now } });
    await tx.outboxEvent.updateMany({
      where: { id: job.outboxEventId, completedAt: null, failedAt: null },
      data: { failedAt: now, lastDispatchErrorCode: 'DEADLINE_HANDLER_UNAVAILABLE' },
    });
  });
  console.error('Scheduled deadline has no registered handler', JSON.stringify({ operationId: job.operationId, errorCode: 'DEADLINE_HANDLER_UNAVAILABLE' }));
}

/**
 * All deadline effects must be database-only and commit in the same transaction as operation
 * completion. Handlers that need external delivery should append their own durable outbox intent.
 */
export function createScheduledDeadlineProcessor(handlers: ScheduledDeadlineHandlers, now: () => Date = () => new Date()) {
  return async (rawJob: Pick<Job<ScheduledDeadlineOutboxJob>, 'id' | 'data' | 'attemptsMade' | 'opts'>): Promise<void> => {
    const job = parseScheduledDeadlineOutboxJob(rawJob.data);
    if (rawJob.id !== job.operationId || job.outboxEventId !== job.operationId) throw new Error('Scheduled-deadline job identity does not match its durable operation');
    const event = await db.outboxEvent.findUnique({ where: { id: job.outboxEventId } });
    if (!event || event.deadlineId !== job.deadlineId || event.importId || event.type !== SCHEDULED_DEADLINE_EVENT) throw new Error('Scheduled-deadline outbox scope is invalid');
    const persisted = parseScheduledDeadlineOutbox(event);
    if (persisted.operationId !== job.operationId) throw new Error('Scheduled-deadline queue payload does not match PostgreSQL');
    const deadline = await db.scheduledDeadline.findFirst({ where: { id: job.deadlineId, firmId: event.firmId, clientId: event.clientId, engagementId: event.engagementId } });
    if (!deadline) throw new Error('Scoped scheduled deadline not found');
    const handler = Object.hasOwn(handlers, deadline.eventType) ? handlers[deadline.eventType] : undefined;
    if (typeof handler !== 'function') {
      await failUnregisteredDeadline(job, now());
      return;
    }
    if (!await claimBackgroundOperation(job.operationId)) return;

    try {
      const completion = await db.$transaction(async tx => {
        await tx.$queryRaw`
          SELECT id FROM scheduled_deadlines
          WHERE id = ${job.deadlineId}::uuid
            AND "firmId" = ${event.firmId}::uuid
            AND "clientId" = ${event.clientId}::uuid
            AND "engagementId" = ${event.engagementId}::uuid
          FOR UPDATE
        `;
        const current = await tx.scheduledDeadline.findUnique({ where: { id: job.deadlineId } });
        if (!current) throw new Error('Scheduled deadline disappeared before execution');
        if (current.state === 'COMPLETED') return current;
        if (current.state !== 'QUEUED') throw new Error('Scheduled deadline is not queued');
        const result = await handler({ client: tx, deadline: current, now: now() });
        const completedAt = now();
        const changed = await tx.scheduledDeadline.updateMany({
          where: { id: job.deadlineId, state: 'QUEUED' },
          data: { state: 'COMPLETED', completedAt, updatedAt: completedAt },
        });
        if (changed.count !== 1) throw new ConflictException('Scheduled deadline changed before completion');
        await completeBackgroundOperation(tx, job.operationId, result ?? { processed: true });
        return current;
      }, { timeout: 15_000 });
      void completion;
    } catch (error) {
      const terminal = rawJob.attemptsMade + 1 >= (rawJob.opts.attempts || 1);
      await db.$transaction(async tx => {
        const operation = await tx.backgroundOperation.findUnique({ where: { id: job.operationId }, select: { state: true } });
        if (operation?.state !== 'RUNNING') return;
        if (terminal) {
          const stamp = now();
          await tx.scheduledDeadline.updateMany({ where: { id: job.deadlineId, state: 'QUEUED' }, data: { state: 'FAILED', failedAt: stamp, updatedAt: stamp } });
          await failBackgroundOperation(tx, job.operationId, 'DEADLINE_PROCESSING_FAILED');
        } else {
          await retryBackgroundOperation(tx, job.operationId);
        }
      });
      throw error;
    }
  };
}
