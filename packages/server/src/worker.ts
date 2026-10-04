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
import { sweepUnfinishedDocumentTemplateAssetUploads } from './platform/document-templates.js';
import { createTrialBalanceImportProcessor } from './modules/fieldwork/import-worker.js';
import { dispatchPendingOutbox } from './platform/outbox.js';
import { createScheduledDeadlineProcessor, enqueueDueDeadlines } from './platform/scheduler.js';
import { configuredGraphMailProvider, dispatchPendingNotifications } from './platform/notifications.js';
import { RuntimeModule, Readiness } from './platform/runtime.js';
import { CLOCK } from './platform/clock.js';
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
  const deadlineQueue = new Queue('scheduled-deadlines', {
    connection: redisConnectionOptions(process.env.REDIS_URL!, 'producer'),
  });
  queue.on('error', error => console.error('Trial-balance producer Redis error', safeQueueErrorCode(error)));
  deadlineQueue.on('error', error => console.error('Deadline producer Redis error', safeQueueErrorCode(error)));
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

  const deadlineProcessor = createScheduledDeadlineProcessor({}, () => app.get(CLOCK).now());
  const deadlineWorker = new Worker('scheduled-deadlines', deadlineProcessor, {
    connection: redisConnectionOptions(process.env.REDIS_URL!, 'worker'),
    ...trialBalanceWorkerOptions,
  });
  deadlineWorker.on('error', error => console.error('Deadline worker Redis error', safeQueueErrorCode(error)));
  deadlineWorker.on('failed', (job, error) => console.error('Deadline worker delivery failed', JSON.stringify({
    jobId: job?.id,
    operationId: job?.data.operationId,
    attempt: job ? job.attemptsMade + 1 : undefined,
    errorCode: safeQueueErrorCode(error),
  })));

  let relayInFlight: Promise<void> | undefined;
  let sweepInFlight: Promise<void> | undefined;
  let notificationInFlight: Promise<void> | undefined;
  let deadlineScanInFlight: Promise<void> | undefined;
  let publishing = false;
  const relay = async () => {
    if (publishing) return;
    publishing = true;
    try {
      const result = await dispatchPendingOutbox(async dispatch => {
        const targetQueue = dispatch.queue === 'tb-import' ? queue : deadlineQueue;
        await publishWithTimeout(() => targetQueue.add(dispatch.name, dispatch.data, {
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

  let scanningDeadlines = false;
  const scanDeadlines = async () => {
    if (scanningDeadlines) return;
    scanningDeadlines = true;
    try {
      const result = await enqueueDueDeadlines({ now: app.get(CLOCK).now(), batchSize: 50 });
      if (result.scanned) console.log('Deadline scanner', JSON.stringify(result));
    } catch {
      // Due intents remain in PostgreSQL and will be picked up by the next bounded scan.
      console.error('Deadline scan failed; durable deadlines remain available for recovery');
    } finally {
      scanningDeadlines = false;
    }
  };
  const scanDeadlinesOnce = () => deadlineScanInFlight ??= scanDeadlines().finally(() => { deadlineScanInFlight = undefined; });
  const deadlineTimer = setInterval(() => { void scanDeadlinesOnce(); }, 15_000);
  void scanDeadlinesOnce();

  const notificationProvider = configuredGraphMailProvider();
  const dispatchNotifications = async () => {
    try {
      const result = await dispatchPendingNotifications(notificationProvider);
      if (result.claimed || result.unknown) console.log('Notification dispatch', JSON.stringify(result));
    } catch {
      // Never log a provider body, recipient, message body, token, or credential.
      console.error('Notification dispatch pass failed; durable PostgreSQL intent remains available');
    }
  };
  const dispatchNotificationsOnce = () => notificationInFlight ??= dispatchNotifications().finally(() => { notificationInFlight = undefined; });
  const notificationTimer = setInterval(() => { void dispatchNotificationsOnce(); }, 2_000);
  void dispatchNotificationsOnce();

  // Unreferenced uploads are cleaned only after a grace period, and Graph evidence is never deleted.
  const sweepOnce = () => {
    sweepInFlight ??= Promise.all([
      sweepUnreferencedUploads({ olderThanMinutes: 60 }),
      sweepPracticeExpenseReceiptUploads({ staleCleaningMinutes: 60 }),
      sweepUnfinishedDocumentTemplateAssetUploads({ olderThanMinutes: 60 }),
    ])
      .then(([fieldwork, practice, templates]) => {
        if (fieldwork.scanned || practice.scanned || templates.scanned) console.log('Upload sweep', JSON.stringify({
          fieldwork: { scanned: fieldwork.scanned, cleaned: fieldwork.cleaned, reviewRequired: fieldwork.reviewRequired },
          practice: { scanned: practice.scanned, cleaned: practice.cleaned, reviewRequired: practice.reviewRequired },
          templateAssets: { scanned: templates.scanned, cleaned: templates.cleaned, reviewRequired: templates.reviewRequired },
        }));
      })
      .catch(() => console.error('Upload sweep failed'))
      .then(() => { sweepInFlight = undefined; });
  };
  // Recover stale upload stages promptly after a worker restart; the sweepers claim rows
  // atomically and enforce their own grace periods before any provider deletion.
  void sweepOnce();
  const sweepTimer = setInterval(sweepOnce, 600_000);

  const shutdown = onceAsync(async () => {
    clearInterval(timer);
    clearInterval(deadlineTimer);
    clearInterval(sweepTimer);
    clearInterval(notificationTimer);
    await Promise.allSettled([relayInFlight, sweepInFlight, notificationInFlight, deadlineScanInFlight].filter((job): job is Promise<void> => !!job));
    // close() stops new claims and waits for the current import to reach its transaction boundary.
    await Promise.all([worker.close(), deadlineWorker.close()]);
    await Promise.all([queue.close(), deadlineQueue.close()]);
    await db.$disconnect();
    await app.close();
  });
  registerWorkerShutdown(process.once.bind(process), shutdown, () => {
    console.error('Worker shutdown failed');
    process.exitCode = 1;
  });
}
