import 'reflect-metadata';
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import { db } from './platform/db.js';
import { ensureBucket, retrieve } from './platform/storage.js';
import { resolveClientRepository } from './platform/repository.js';
import { sweepUnreferencedUploads } from './modules/fieldwork/uploads.js';
import { createTrialBalanceImportProcessor } from './modules/fieldwork/import-worker.js';
import { dispatchPendingOutbox } from './platform/outbox.js';
import { RuntimeModule, Readiness } from './platform/runtime.js';
import { readConfiguration } from './platform/config.js';

@Module({ imports: [RuntimeModule] })
class WorkerModule {}

export async function runWorker() {
  readConfiguration();
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  await app.get(Readiness).check();
  await ensureBucket();

  const redis = new URL(process.env.REDIS_URL!);
  const connection = {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: redis.username ? decodeURIComponent(redis.username) : undefined,
    password: redis.password ? decodeURIComponent(redis.password) : undefined,
    ...(redis.protocol === 'rediss:' ? { tls: { servername: redis.hostname, rejectUnauthorized: true } } : {}),
    maxRetriesPerRequest: null,
  };
  const queue = new Queue('tb-import', { connection });
  const processImport = createTrialBalanceImportProcessor(async (document, batch) => {
    const repository = document.key.startsWith('graph:')
      ? await resolveClientRepository(db, batch.firmId, batch.clientId, 'evidence')
      : undefined;
    return retrieve(document.key, repository);
  });
  const worker = new Worker('tb-import', processImport, { connection, concurrency: 1 });
  worker.on('failed', job => console.error('Trial-balance worker delivery failed', job?.id));

  let publishing = false;
  const relay = async () => {
    if (publishing) return;
    publishing = true;
    try {
      const result = await dispatchPendingOutbox(async dispatch => {
        await queue.add(dispatch.name, dispatch.data, {
          jobId: dispatch.jobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: true,
          removeOnFail: true,
        });
      });
      if (result.claimed) console.log('Outbox relay', JSON.stringify(result));
    } catch {
      console.error('Outbox relay pass failed; PostgreSQL intent remains available for recovery');
    } finally {
      publishing = false;
    }
  };
  const timer = setInterval(() => { void relay(); }, 1_000);
  void relay();

  // Unreferenced uploads are cleaned only after a grace period, and Graph evidence is never deleted.
  const sweepTimer = setInterval(() => {
    sweepUnreferencedUploads({ olderThanMinutes: 60 })
      .then(result => {
        if (result.scanned) {
          console.log('Upload sweep', JSON.stringify({
            scanned: result.scanned,
            cleaned: result.cleaned,
            reviewRequired: result.reviewRequired,
          }));
        }
      })
      .catch(() => console.error('Upload sweep failed'));
  }, 600_000);

  const shutdown = async () => {
    clearInterval(timer);
    clearInterval(sweepTimer);
    await worker.close();
    await queue.close();
    await db.$disconnect();
    await app.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
