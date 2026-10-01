/**
 * Shared unit-of-work / transaction context (T024).
 *
 * Modules own their business operations, but every command must commit its domain changes,
 * append-only audit rows and any required outbox/operation receipts together, on one connection,
 * with bounded retry only for retryable PostgreSQL conflicts. This file provides that single
 * mechanism without turning it into a global mutable transaction singleton: the transaction client
 * is passed explicitly to module facades and nested calls reuse the same `client`.
 *
 * Lock-ordering convention (avoid deadlocks between concurrent commands):
 *   1. lock the parent `Engagement` row (`FOR UPDATE`) before reading any aggregate state;
 *   2. then lock/modify the engagement-scoped aggregate (import, journal, assessment, ...);
 *   3. then write child rows, audit events and receipts.
 * Never take two engagement locks in the same transaction in a different relative order.
 *
 * External I/O boundary: network, object-storage, PDF and notification work must never run inside
 * the database transaction. Register such work with {@link UnitOfWork.afterCommit}; it runs only
 * after the transaction has committed, so a rolled-back command performs no external side effect.
 */
import { Prisma } from '../generated/prisma/client.js';
import { db } from './db.js';

export type TransactionClient = Prisma.TransactionClient;
export type DatabaseClient = typeof db;

/** PostgreSQL/Prisma codes that represent a transient conflict a fresh retry may succeed on. */
const RETRYABLE_CODES = new Set(['P2034', '40001', '40P01', '40P03', '55P03']);
const RETRYABLE_PATTERN = /deadlock detected|could not serialize access|transaction failed due to a write conflict or a deadlock/i;

/**
 * Classify a failure. Only a transient PostgreSQL conflict is retryable; a validation,
 * authorization or business error must surface to the caller unchanged on the first attempt.
 */
export function isRetryableConflict(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return RETRYABLE_CODES.has(code);
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return RETRYABLE_PATTERN.test(message);
}

/** Deterministic capped exponential backoff in milliseconds; pure so it can be unit-tested. */
export function backoffDelay(attempt: number, baseMs = 20, capMs = 500): number {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('Attempt must be a positive integer');
  return Math.min(capMs, baseMs * 2 ** (attempt - 1));
}

/** Engagement rows are the only documents a command may lock first, in a fixed table order. */
export type LockableTable = 'Engagement';

/**
 * Take a row lock in the canonical order. The table name is restricted to a reviewed allowlist
 * because a raw lock statement cannot parameterize its relation.
 */
export async function lockForUpdate(client: TransactionClient, table: LockableTable, id: string): Promise<void> {
  if (table !== 'Engagement') throw new Error(`Unsupported lock target: ${table}`);
  await client.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${id}::uuid FOR UPDATE`;
}

/** A single business command's transaction scope plus its deferred, post-commit side effects. */
export class UnitOfWork {
  private readonly deferred: Array<() => void | Promise<void>> = [];
  constructor(readonly client: TransactionClient) {}

  /** Defer an external side effect until after the transaction commits. Never run it inline. */
  afterCommit(task: () => void | Promise<void>): void {
    this.deferred.push(task);
  }

  /** Run and clear every registered post-commit task. Internal: invoked only after a commit. */
  async flush(): Promise<void> {
    const tasks = this.deferred.splice(0, this.deferred.length);
    for (const task of tasks) await task();
  }
}

export interface UnitOfWorkOptions {
  /** Pooled client to run against. Defaults to the shared application client. */
  client?: DatabaseClient;
  /** Total attempts including the first. Retries only retryable conflicts. */
  maxAttempts?: number;
  /** Invoked before each retry with the failed attempt number and error. */
  onRetry?: (attempt: number, error: unknown) => void;
  /** Injectable wait so tests can run without real sleeps. */
  wait?: (ms: number) => Promise<void>;
  /** Interactive transaction timeout in milliseconds. */
  timeoutMs?: number;
}

const wait = async (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run one business command inside a single interactive transaction with bounded retry.
 *
 * The supplied `work` receives a {@link UnitOfWork}. Its `client` is the transaction client, so any
 * nested module call reuses the same connection and participates in the same commit/rollback (AC2).
 * Any error thrown inside `work` rolls the whole command back (AC1) and discards deferred tasks.
 * A retryable conflict re-runs `work` from the start; because a rolled-back attempt persisted
 * nothing and a command derives its business identifier deterministically, a retry cannot duplicate
 * one (AC3). Non-retryable failures propagate immediately without a second attempt.
 */
export async function runUnitOfWork<T>(work: (scope: UnitOfWork) => Promise<T>, options: UnitOfWorkOptions = {}): Promise<T> {
  const client = options.client ?? db;
  const maxAttempts = options.maxAttempts ?? 3;
  const sleep = options.wait ?? wait;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new Error('maxAttempts must be 1..10');
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let scope: UnitOfWork | undefined;
    let value: T;
    try {
      value = await client.$transaction(async (tx) => {
        scope = new UnitOfWork(tx);
        return work(scope);
      }, { maxWait: 5000, timeout: options.timeoutMs ?? 30000 });
    } catch (error) {
      lastError = error;
      if (!isRetryableConflict(error) || attempt === maxAttempts) throw error;
      options.onRetry?.(attempt, error);
      await sleep(backoffDelay(attempt));
      continue;
    }
    // The database has committed. A deferred I/O failure must never replay the command.
    // Durable delivery must use an outbox; afterCommit is only a best-effort wake-up seam.
    await scope?.flush();
    return value;
  }
  throw lastError;
}
