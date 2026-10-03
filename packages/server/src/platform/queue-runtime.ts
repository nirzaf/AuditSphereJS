import type { RedisOptions } from 'ioredis';

export type QueueConnectionRole = 'producer' | 'worker';

/**
 * Producers fail a dispatch quickly while Redis is unavailable; their durable intent remains
 * in PostgreSQL for the next outbox pass. Worker connections keep reconnecting so Redis
 * maintenance does not require restarting the process.
 */
export function redisConnectionOptions(redisUrl: string, role: QueueConnectionRole): RedisOptions {
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new TypeError('Queue Redis URL must use redis or rediss');
  }
  const worker = role === 'worker';
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    ...(parsed.protocol === 'rediss:'
      ? { tls: { servername: parsed.hostname, rejectUnauthorized: true } }
      : {}),
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker,
    connectTimeout: worker ? 5_000 : 1_000,
    retryStrategy: (attempt: number) => Math.min(100 * 2 ** Math.min(attempt - 1, 5), 3_000),
  };
}

/** One-at-a-time parsing is the measured memory/CPU budget for the current worker image. */
export const trialBalanceWorkerOptions = {
  concurrency: 1,
  lockDuration: 60_000,
  stalledInterval: 30_000,
  maxStalledCount: 1,
} as const;

/** Failed jobs remain inspectable for a bounded period; PostgreSQL stays authoritative. */
export const durableQueueJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 1_000 },
} as const;

export function safeQueueErrorCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  return typeof code === 'string' && /^[A-Z0-9_.:-]{1,120}$/.test(code)
    ? code
    : 'QUEUE_JOB_FAILED';
}

/**
 * BullMQ waits for its queue connection to become ready before Queue.add settles. Bound the
 * caller's wait so PostgreSQL dispatch claims are released promptly during Redis outages. A
 * timed-out Redis command may still be accepted later; stable job IDs make the next outbox pass
 * safe to repeat.
 */
export async function publishWithTimeout<T>(publish: () => Promise<T>, timeoutMs = 1_500): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 30_000) {
    throw new TypeError('Queue publish timeout must be 50..30000 milliseconds');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(publish),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('Queue publish timed out'), { code: 'QUEUE_PUBLISH_TIMEOUT' })), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Prevents duplicate cleanup paths when SIGINT/SIGTERM arrive close together. */
export function onceAsync(action: () => Promise<void>): () => Promise<void> {
  let closing: Promise<void> | undefined;
  return () => closing ??= action();
}

export function registerWorkerShutdown(
  register: (signal: 'SIGINT' | 'SIGTERM', listener: () => void) => unknown,
  shutdown: () => Promise<void>,
  onError: () => void,
): void {
  const handle = () => { void shutdown().catch(onError); };
  register('SIGINT', handle);
  register('SIGTERM', handle);
}
