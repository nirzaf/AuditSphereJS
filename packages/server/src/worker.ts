import 'reflect-metadata';
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import { db } from './platform/db.js';
import { ensureBucket, retrieveBytes } from './platform/storage.js';
import { resolveClientRepository } from './platform/repository.js';
import { sweepUnreferencedUploads } from './modules/fieldwork/uploads.js';
import { sweepPracticeExpenseReceiptUploads } from './modules/practice/expense-receipts.js';
import { sweepUnfinishedDocumentTemplateAssetUploads } from './platform/document-templates.js';
import { createTrialBalanceImportProcessor } from './modules/fieldwork/import-worker.js';
import { dispatchPendingOutbox } from './platform/outbox.js';
import { createScheduledDeadlineProcessor, enqueueDueDeadlines } from './platform/scheduler.js';
import { configuredGraphMailProvider, dispatchPendingNotifications } from './platform/notifications.js';
import { RuntimeModule, Readiness, OPERATIONAL_METRICS } from './platform/runtime.js';
import { CLOCK } from './platform/clock.js';
import { readConfiguration } from './platform/config.js';
import { runWithCorrelationId } from './platform/observability/correlation.js';
import { safeOperationalCode } from './platform/observability/logging.js';
import { createMetricsServer, listenMetricsServer } from './platform/observability/metrics-http.js';
import { databasePool } from './platform/db.js';
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
  const config = readConfiguration();
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const readiness = await app.get(Readiness).assertRequired();
  if (readiness.status === 'degraded') console.error(JSON.stringify({ event: 'startup.degraded', service: 'auditsphere-worker', dependencies: readiness.dependencies, alerts: readiness.alerts }));
  await ensureBucket();
  const metrics = app.get(OPERATIONAL_METRICS);
  const metricsServer = createMetricsServer(metrics, config.OBSERVABILITY_METRICS_TOKEN ?? '', () => ({
    total: databasePool.totalCount, idle: databasePool.idleCount, waiting: databasePool.waitingCount, max: databasePool.options.max ?? 0,
  }), { host: config.OBSERVABILITY_METRICS_HOST, port: config.OBSERVABILITY_METRICS_PORT, service: 'auditsphere-worker' });
  try {
    await listenMetricsServer(metricsServer, config.OBSERVABILITY_METRICS_HOST, config.OBSERVABILITY_METRICS_PORT);
  } catch (error) {
    await Promise.allSettled([db.$disconnect(), app.close()]);
    throw new Error(`Worker metrics listener could not start (${safeOperationalCode(error, 'METRICS_LISTENER_ERROR')}); check OBSERVABILITY_METRICS_HOST and OBSERVABILITY_METRICS_PORT.`);
  }

  const queue = new Queue('tb-import', {
    connection: redisConnectionOptions(process.env.REDIS_URL!, 'producer'),
  });
  const deadlineQueue = new Queue('scheduled-deadlines', {
    connection: redisConnectionOptions(process.env.REDIS_URL!, 'producer'),
  });
  const processImportCore = createTrialBalanceImportProcessor(async (document, batch) => {
    const repository = document.key.startsWith('graph:')
      ? await resolveClientRepository(db, batch.firmId, batch.clientId, 'evidence')
      : undefined;
    return retrieveBytes(document.key, repository);
  });
  const processImport = (job: Parameters<typeof processImportCore>[0], token?: string, signal?: AbortSignal) =>
    runWithCorrelationId(job.data.correlationId ?? job.data.outboxEventId, () => processImportCore(job, token, signal));
  const worker = new Worker('tb-import', processImport, {
    connection: redisConnectionOptions(process.env.REDIS_URL!, 'worker'),
    ...trialBalanceWorkerOptions,
  });
  const reportRedisState = (up: boolean, code = 'REDIS_CONNECTION_ERROR') => {
    const previous = metrics.dependencyState('redis');
    metrics.setDependency('redis', up ? 'up' : 'down');
    const state = up ? 'up' : 'down';
    if (previous === state) return;
    const event = { event: 'dependency.health_transition', dependency: 'redis', state, code, action: up ? undefined : 'Restore Redis; durable PostgreSQL outbox jobs remain available for automatic retry.' };
    if (up && previous === 'down') console.info(JSON.stringify(event));
    else if (!up) console.error(JSON.stringify(event));
  };
  worker.on('error', error => { metrics.recordQueueOutcome('tb-import', 'error'); reportRedisState(false, safeQueueErrorCode(error)); });
  worker.on('failed', (job, error) => {
    metrics.recordQueueOutcome('tb-import', 'failed');
    console.error('Trial-balance worker delivery failed', JSON.stringify({
    jobId: job?.id,
    operationId: job?.data.operationId,
    correlationId: job?.data.correlationId,
    attempt: job ? job.attemptsMade + 1 : undefined,
    errorCode: safeQueueErrorCode(error),
    }));
  });
  worker.on('completed', () => metrics.recordQueueOutcome('tb-import', 'completed'));
  worker.on('stalled', () => metrics.recordQueueOutcome('tb-import', 'stalled'));

  const deadlineProcessorCore = createScheduledDeadlineProcessor({}, () => app.get(CLOCK).now());
  const deadlineProcessor = (job: Parameters<typeof deadlineProcessorCore>[0]) =>
    runWithCorrelationId(job.data.correlationId ?? job.data.outboxEventId, () => deadlineProcessorCore(job));
  const deadlineWorker = new Worker('scheduled-deadlines', deadlineProcessor, {
    connection: redisConnectionOptions(process.env.REDIS_URL!, 'worker'),
    ...trialBalanceWorkerOptions,
  });
  deadlineWorker.on('error', error => { metrics.recordQueueOutcome('scheduled-deadlines', 'error'); reportRedisState(false, safeQueueErrorCode(error)); });
  deadlineWorker.on('failed', (job, error) => {
    metrics.recordQueueOutcome('scheduled-deadlines', 'failed');
    console.error('Deadline worker delivery failed', JSON.stringify({
    jobId: job?.id,
    operationId: job?.data.operationId,
    correlationId: job?.data.correlationId,
    attempt: job ? job.attemptsMade + 1 : undefined,
    errorCode: safeQueueErrorCode(error),
    }));
  });
  deadlineWorker.on('completed', () => metrics.recordQueueOutcome('scheduled-deadlines', 'completed'));
  deadlineWorker.on('stalled', () => metrics.recordQueueOutcome('scheduled-deadlines', 'stalled'));

  queue.on('error', error => { metrics.recordQueueOutcome('tb-import', 'error'); reportRedisState(false, safeQueueErrorCode(error)); });
  deadlineQueue.on('error', error => { metrics.recordQueueOutcome('scheduled-deadlines', 'error'); reportRedisState(false, safeQueueErrorCode(error)); });
  const refreshQueueMetrics = async () => {
    const entries = [[queue, 'tb-import'], [deadlineQueue, 'scheduled-deadlines']] as const;
    for (const [target, name] of entries) {
      try {
        const counts = await target.getJobCounts('waiting', 'active', 'delayed', 'failed');
        const waiting = await target.getWaiting(0, 99);
        const oldestTimestamp = waiting.reduce((oldest, job) => Math.min(oldest, job.timestamp), Number.POSITIVE_INFINITY);
        metrics.setQueueSnapshot(name, {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          oldestWaitingAgeSeconds: Number.isFinite(oldestTimestamp) ? Math.max(0, Date.now() - oldestTimestamp) / 1_000 : 0,
        });
        reportRedisState(true);
      } catch (error) {
        reportRedisState(false, safeQueueErrorCode(error));
        metrics.recordQueueOutcome(name, 'error');
      }
    }
  };
  const queueMetricsTimer = setInterval(() => { void refreshQueueMetrics(); }, 15_000);
  queueMetricsTimer.unref();
  void refreshQueueMetrics();

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
        await runWithCorrelationId(dispatch.data.correlationId, async () => {
          const targetQueue = dispatch.queue === 'tb-import' ? queue : deadlineQueue;
          try {
            await publishWithTimeout(() => targetQueue.add(dispatch.name, dispatch.data, {
              jobId: dispatch.jobId,
              ...durableQueueJobOptions,
            }));
            reportRedisState(true);
          } catch (error) {
            reportRedisState(false, safeQueueErrorCode(error));
            metrics.recordQueueOutcome(dispatch.queue, 'error');
            console.error(JSON.stringify({ event: 'queue.publish_failed', queue: dispatch.queue, correlationId: dispatch.data.correlationId, errorCode: safeQueueErrorCode(error), action: 'PostgreSQL outbox intent will be retried by the next relay pass.' }));
            throw error;
          }
        });
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
    clearInterval(queueMetricsTimer);
    clearInterval(deadlineTimer);
    clearInterval(sweepTimer);
    clearInterval(notificationTimer);
    await Promise.allSettled([relayInFlight, sweepInFlight, notificationInFlight, deadlineScanInFlight].filter((job): job is Promise<void> => !!job));
    // close() stops new claims and waits for the current import to reach its transaction boundary.
    await Promise.all([worker.close(), deadlineWorker.close()]);
    await Promise.all([queue.close(), deadlineQueue.close()]);
    await new Promise<void>(resolve => metricsServer.close(() => resolve()));
    await db.$disconnect();
    await app.close();
  });
  registerWorkerShutdown(process.once.bind(process), shutdown, () => {
    console.error('Worker shutdown failed');
    process.exitCode = 1;
  });
}
