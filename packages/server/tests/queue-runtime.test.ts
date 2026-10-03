import { describe, expect, it, vi } from 'vitest';
import {
  durableQueueJobOptions,
  onceAsync,
  publishWithTimeout,
  registerWorkerShutdown,
  redisConnectionOptions,
  safeQueueErrorCode,
  trialBalanceWorkerOptions,
} from '../src/platform/queue-runtime.js';

describe('BullMQ runtime policy', () => {
  it('separates fail-fast producer connections from persistent worker connections', () => {
    const producer = redisConnectionOptions('rediss://worker:secret@redis.example:6380', 'producer');
    const worker = redisConnectionOptions('redis://redis.example:6379', 'worker');
    expect(producer).toMatchObject({ maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1_000 });
    expect(producer.password).toBe('secret');
    expect(producer.tls).toEqual({ servername: 'redis.example', rejectUnauthorized: true });
    expect(worker).toMatchObject({ maxRetriesPerRequest: null, enableOfflineQueue: true, connectTimeout: 5_000 });
    expect(worker.retryStrategy?.(10)).toBe(3_000);
    expect(() => redisConnectionOptions('http://redis.example', 'worker')).toThrow('must use redis or rediss');
  });

  it('bounds processing concurrency and keeps failed jobs for a limited inspection window', () => {
    expect(trialBalanceWorkerOptions).toMatchObject({ concurrency: 1, maxStalledCount: 1 });
    expect(durableQueueJobOptions).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 86_400, count: 5_000 },
      removeOnFail: { age: 604_800, count: 1_000 },
    });
  });

  it('logs only a bounded stable error code and closes once across repeated signals', async () => {
    expect(safeQueueErrorCode(Object.assign(new Error('secret payload'), { code: 'IMPORT_INVALID' }))).toBe('IMPORT_INVALID');
    expect(safeQueueErrorCode(new Error('sensitive failure'))).toBe('QUEUE_JOB_FAILED');
    expect(safeQueueErrorCode(Object.assign(new Error(), { code: 'not safe\nvalue' }))).toBe('QUEUE_JOB_FAILED');
    const close = vi.fn(async () => undefined);
    const shutdown = onceAsync(close);
    const listeners = new Map<string, () => void>();
    const onError = vi.fn();
    registerWorkerShutdown((signal, listener) => listeners.set(signal, listener), shutdown, onError);
    listeners.get('SIGTERM')?.();
    listeners.get('SIGINT')?.();
    await shutdown();
    expect(close).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('bounds BullMQ Queue.add readiness waits and exposes a stable retryable code', async () => {
    await expect(publishWithTimeout(() => new Promise(() => undefined), 50))
      .rejects.toMatchObject({ code: 'QUEUE_PUBLISH_TIMEOUT' });
    await expect(publishWithTimeout(async () => 'published', 50)).resolves.toBe('published');
  });
});
