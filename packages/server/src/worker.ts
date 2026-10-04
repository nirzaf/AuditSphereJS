import 'reflect-metadata';
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import { db } from './platform/db.js';
import { ensureBucket, retrieve } from './platform/storage.js';
import { resolveClientRepository } from './platform/repository.js';
import { sweepUnreferencedUploads } from './modules/fieldwork/uploads.js';
import { sweepPracticeExpenseReceiptUploads } from './modules/practice/expense-receipts.js';
import { createTrialBalanceImportProcessor } from './modules/fieldwork/import-worker.js';
import { dispatchPendingOutbox } from './platform/outbox.js';
import { RuntimeModule, Readiness } from './platform/runtime.js';
import { readConfiguration } from './platform/config.js';
import {
  durableQueueJobOptions,
  onceAsync,
  publishWithTimeout,
  redisConnectionOptions,
  registerWorkerShutdown,
  safeQueueErrorCode,
  trialBalanceWorkerOptions,
} from './platform/queue-runtime.js';

@Module({ imports: [RuntimeModule] })
class WorkerModule {}

export async function runWorker() {
  readConfiguration();
  const app = await NestFactory.createApplicationContext(WorkerModule);
  await app.get(Readiness).check();
  await ensureBucket();

  const queue = new Queue('tb-import', {
    connection: redisConnectionOptions(process.env.REDIS_URL!, 'producer'),
  });
  queue.on('error', error => console.error('Trial-balance producer Redis error', safeQueueErrorCode(error)));
  const processImport = createTrialBalanceImportProcessor(async (document, batch) => {
    const repository = document.key.startsWith('graph:')
      ? await resolveClientRepository(db, batch.firmId, batch.clientId, 'evidence')
      : undefined;
    return retrieve(document.key, repository);
  });
  const worker = new Worker('tb-import', processImport, {
    connection: redisConnectionOptions(process.env.REDIS_URL!, 'worker'),
    ...trialBalanceWorkerOptions,
  });
  worker.on('error', error => console.error('Trial-balance worker Redis error', safeQueueErrorCode(error)));
  worker.on('failed', (job, error) => console.error('Trial-balance worker delivery failed', JSON.stringify({
    jobId: job?.id,
    operationId: job?.data.operationId,
    attempt: job ? job.attemptsMade + 1 : undefined,
    errorCode: safeQueueErrorCode(error),
  })));

  let relayInFlight: Promise<void> | undefined;
  let sweepInFlight: Promise<void> | undefined;
  let publishing = false;
  const relay = async () => {
    if (publishing) return;
    publishing = true;
    try {
      const result = await dispatchPendingOutbox(async dispatch => {
        await publishWithTimeout(() => queue.add(dispatch.name, dispatch.data, {
          jobId: dispatch.jobId,
          ...durableQueueJobOptions,
        }));
      });
      if (result.claimed) console.log('Outbox relay', JSON.stringify(result));
    } catch {
      console.error('Outbox relay pass failed; PostgreSQL intent remains available for recovery');
    } finally {
      publishing = false;
    }
  };
  const relayOnce = () => relayInFlight ??= relay().finally(() => { relayInFlight = undefined; });
  const timer = setInterval(() => { void relayOnce(); }, 1_000);
  void relayOnce();

  // Unreferenced uploads are cleaned only after a grace period, and Graph evidence is never deleted.
  const sweepTimer = setInterval(() => {
    sweepInFlight ??= Promise.all([
      sweepUnreferencedUploads({ olderThanMinutes: 60 }),
      sweepPracticeExpenseReceiptUploads({ staleCleaningMinutes: 60 }),
    ])
      .then(([fieldwork, practice]) => {
        if (fieldwork.scanned || practice.scanned) console.log('Upload sweep', JSON.stringify({
          fieldwork: { scanned: fieldwork.scanned, cleaned: fieldwork.cleaned, reviewRequired: fieldwork.reviewRequired },
          practice: { scanned: practice.scanned, cleaned: practice.cleaned, reviewRequired: practice.reviewRequired },
        }));
      })
      .catch(() => console.error('Upload sweep failed'))
      .then(() => { sweepInFlight = undefined; });
  }, 600_000);

  const shutdown = onceAsync(async () => {
    clearInterval(timer);
    clearInterval(sweepTimer);
    await Promise.allSettled([relayInFlight, sweepInFlight].filter((job): job is Promise<void> => !!job));
    // close() stops new claims and waits for the current import to reach its transaction boundary.
    await worker.close();
    await queue.close();
    await db.$disconnect();
    await app.close();
  });
  registerWorkerShutdown(process.once.bind(process), shutdown, () => {
    console.error('Worker shutdown failed');
    process.exitCode = 1;
  });
}
