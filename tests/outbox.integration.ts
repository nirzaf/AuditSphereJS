import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Queue, Worker } from '../packages/server/tests/bullmq-test-adapter.js';
import { GenericContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const redisImage = 'redis:8.10@sha256:6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee';
const csv = 'code,name,current,prior\n1000,Cash,125.50,100.00\n2000,Payables,-25.50,-20.00\n';

test('durable outbox survives enqueue gaps and worker loss using PostgreSQL and Redis', { timeout: 180_000 }, async () => {
  const previousRedisUrl = process.env.REDIS_URL;
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:18.6')
      .withDatabase('outbox')
      .withUsername('owner')
      .withPassword(randomBytes(24).toString('hex'))
      .start(),
    new GenericContainer(redisImage)
      .withExposedPorts(6379)
      .withCommand(['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'])
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections', 1))
      .start(),
  ]);
  const databaseUrl = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    SERVICE_NAME: 'outbox-integration',
    DATABASE_URL: databaseUrl,
    MIGRATION_DATABASE_URL: databaseUrl,
  };
  let queue: Queue | undefined;
  let worker: Worker | undefined;
  let crashedWorker: Worker | undefined;
  let db: typeof import('../packages/server/src/platform/db.js').db | undefined;
  let workerEvidence: string | Buffer = csv;
  let cancellationImportId: string | undefined;
  let cancellationOperationId: string | undefined;
  try {
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 90_000, stdio: 'pipe' });
    Object.assign(process.env, env, { REDIS_URL: redisUrl });
    const [dbModule, outbox, processorModule] = await Promise.all([
      import('../packages/server/src/platform/db.js'),
      import('../packages/server/src/platform/outbox.js'),
      import('../packages/server/src/modules/fieldwork/import-worker.js'),
    ]);
    db = dbModule.db;
    const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID();
    const importId = randomUUID(), documentId = randomUUID();
    const digest = createHash('sha256').update(csv).digest('hex');
    const scope = { firmId, clientId, engagementId };
    const now = new Date();
    await db.$transaction(async tx => {
      await tx.firm.create({ data: { id: firmId, name: 'Outbox integration firm' } });
      await tx.client.create({ data: { id: clientId, firmId, name: 'Outbox integration client' } });
      await tx.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Outbox integration engagement' } });
      await tx.document.create({ data: {
        id: documentId,
        engagementId,
        key: `acceptance:${randomUUID()}`,
        sha256: digest,
        filename: 'trial-balance.csv',
      } });
      await tx.tbImport.create({ data: {
        id: importId,
        ...scope,
        documentId,
        sha256: digest,
        status: 'QUEUED',
      } });
      const actualOperationId = await outbox.createTrialBalanceImportOutbox(tx, { ...scope, importId });
      assert.match(actualOperationId, /^[0-9a-f-]{36}$/i);
    });
    const event = await db.outboxEvent.findFirstOrThrow({ where: { importId } });
    assert.equal(event.operationId, event.id);
    const queueName = `outbox-${randomUUID().replaceAll('-', '')}`;
    const connection = { host: redis.getHost(), port: redis.getMappedPort(6379), maxRetriesPerRequest: null };
    queue = new Queue(queueName, { connection });

    let releaseClaim!: () => void;
    let onClaimed!: () => void;
    const claimedSignal = new Promise<void>(resolve => { onClaimed = resolve; });
    const claimGate = new Promise<void>(resolve => { releaseClaim = resolve; });
    const concurrentFirst = outbox.dispatchPendingOutbox(async () => {
      onClaimed();
      await claimGate;
      throw Object.assign(new Error('queue connection was lost before enqueue'), { code: 'ECONNRESET' });
    });
    await claimedSignal;
    const concurrentSecond = await outbox.dispatchPendingOutbox(async () => assert.fail('a live PostgreSQL claim must exclude a second relay'));
    assert.deepEqual(concurrentSecond, { claimed: 0, published: 0, failed: 0 });
    releaseClaim();
    assert.deepEqual(await concurrentFirst, { claimed: 1, published: 0, failed: 1 });

    const beforeEnqueue = await db.backgroundOperation.findUniqueOrThrow({ where: { id: event.operationId } });
    assert.equal(beforeEnqueue.state, 'QUEUED');
    assert.equal((await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).publishedAt, null);

    const enqueue = async (dispatch: { jobId: string; name: 'parse'; data: unknown }) => {
      await queue!.add(dispatch.name, dispatch.data, {
        jobId: dispatch.jobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      });
    };
    const afterEnqueueCrash = await outbox.dispatchPendingOutbox(async dispatch => {
      await enqueue(dispatch);
      throw Object.assign(new Error('enqueue response was lost after Redis accepted the job'), { code: 'ECONNRESET' });
    });
    assert.deepEqual(afterEnqueueCrash, { claimed: 1, published: 0, failed: 1 });
    assert.ok(await queue.getJob(event.operationId), 'the accepted Redis job remains present after the relay loses its response');
    assert.equal((await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).completedAt, null);

    const retryDispatch = await outbox.dispatchPendingOutbox(enqueue);
    assert.deepEqual(retryDispatch, { claimed: 1, published: 1, failed: 0 });
    assert.ok(await queue.getJob(event.operationId), 'retry uses the stable operation UUID and does not create a second job');
    const queuedEvent = await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    assert.ok(queuedEvent.publishedAt);
    assert.equal(queuedEvent.completedAt, null, 'successful enqueue must not be reported as business completion');
    assert.equal((await db.backgroundOperation.findUniqueOrThrow({ where: { id: event.operationId } })).state, 'QUEUED');

    // Simulate worker loss after its durable claim but before completion; the outbox row remains
    // authoritative, and a later scan reclaims the expired operation and republishes its job.
    crashedWorker = new Worker(queueName, async job => {
      await outbox.claimBackgroundOperation(String(job.data.operationId));
      throw new Error('simulated worker termination');
    }, { connection, concurrency: 1 });
    const failedDelivery = new Promise<void>(resolve => crashedWorker!.once('failed', () => resolve()));
    await failedDelivery;
    await crashedWorker.close();
    crashedWorker = undefined;
    assert.equal((await db.backgroundOperation.findUniqueOrThrow({ where: { id: event.operationId } })).state, 'RUNNING');
    assert.equal(await queue.getJob(event.operationId), undefined, 'the failed Redis delivery is removed so it can be reconstructed');

    const recoveryTime = new Date(Date.now() + 11 * 60_000);
    const recovery = await outbox.dispatchPendingOutbox(enqueue, { now: recoveryTime, staleOperationMs: 10 * 60_000 });
    assert.deepEqual(recovery, { claimed: 1, published: 1, failed: 0 });
    assert.ok(await queue.getJob(event.operationId));

    worker = new Worker(queueName, processorModule.createTrialBalanceImportProcessor(async (_document, batch) => {
      if (batch.id === cancellationImportId && cancellationOperationId) {
        setTimeout(() => worker?.cancelJob(cancellationOperationId!, 'T031 cooperative cancellation acceptance'), 25);
      }
      return workerEvidence;
    }), { connection, concurrency: 1 });
    const waitForCompletion = async () => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const operation = await db!.backgroundOperation.findUniqueOrThrow({ where: { id: event.operationId } });
        if (operation.state === 'COMPLETED') return operation;
        if (operation.state === 'FAILED' || operation.state === 'UNKNOWN') throw new Error(`Unexpected operation terminal state ${operation.state}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Trial-balance worker did not complete the recovered operation');
    };
    const completed = await waitForCompletion();
    assert.deepEqual(completed.result, { status: 'MAPPING_REQUIRED', rowCount: 2 });
    assert.equal(await db.tbRow.count({ where: { importId } }), 2);
    const completedEvent = await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    assert.ok(completedEvent.completedAt);
    const completedBatch = await db.tbImport.findUniqueOrThrow({ where: { id: importId } });
    assert.equal(completedBatch.status, 'MAPPING_REQUIRED');
    assert.equal(completedBatch.rowCount, 2);

    // Cancel a large CSV while it is being persisted. The signal is checked at each 1,000-row
    // boundary, the open PostgreSQL transaction rolls back, and the durable operation is terminal.
    const cancelCsv = 'code,name,current,prior\n' + Array.from(
      { length: 50_000 }, (_, index) => `${String(index).padStart(5, '0')},Account ${index},1,-1`,
    ).join('\n');
    const cancelDigest = createHash('sha256').update(cancelCsv).digest('hex');
    cancellationImportId = randomUUID();
    const cancellationDocumentId = randomUUID();
    await db.$transaction(async tx => {
      await tx.document.create({
        data: { id: cancellationDocumentId, engagementId, key: `acceptance:${randomUUID()}`, sha256: cancelDigest, filename: 'cancel-trial-balance.csv' },
      });
      await tx.tbImport.create({
        data: { id: cancellationImportId!, ...scope, documentId: cancellationDocumentId, sha256: cancelDigest, status: 'QUEUED' },
      });
      cancellationOperationId = await outbox.createTrialBalanceImportOutbox(tx, { ...scope, importId: cancellationImportId! });
    });
    workerEvidence = cancelCsv;
    const cancelEvent = await db.outboxEvent.findFirstOrThrow({ where: { importId: cancellationImportId } });
    const cancelled = new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Worker did not reach the cancellation checkpoint')), 30_000);
      const poll = async () => {
        const operation = await db!.backgroundOperation.findUniqueOrThrow({ where: { id: cancellationOperationId } });
        if (operation.state === 'CANCELLED') {
          clearTimeout(deadline);
          resolve();
        } else setTimeout(() => { void poll(); }, 50);
      };
      void poll();
    });
    await queue.add('parse', {
      outboxEventId: cancelEvent.id,
      operationId: cancellationOperationId,
      payloadVersion: 1,
    }, { jobId: cancellationOperationId, attempts: 1, removeOnComplete: true, removeOnFail: true });
    await cancelled;
    assert.equal(await db.tbRow.count({ where: { importId: cancellationImportId } }), 0, 'cancelled transaction leaves no partial parsed rows');
    const cancelledImport = await db.tbImport.findUniqueOrThrow({ where: { id: cancellationImportId } });
    assert.equal(cancelledImport.status, 'FAILED');
    assert.equal(cancelledImport.error, 'Background operation cancelled');
    const cancelledEvent = await db.outboxEvent.findUniqueOrThrow({ where: { id: cancellationOperationId } });
    assert.ok(cancelledEvent.failedAt);
    assert.equal(cancelledEvent.lastDispatchErrorCode, 'OPERATION_CANCELLED');

    const unknownOperationId = randomUUID();
    const staleDate = new Date(Date.now() - 20 * 60_000);
    await db.$transaction(async tx => {
      await tx.backgroundOperation.create({ data: {
        id: unknownOperationId,
        ...scope,
        type: 'external.notification',
        state: 'RUNNING',
        startedAt: staleDate,
        updatedAt: staleDate,
      } });
      await tx.outboxEvent.create({ data: {
        id: unknownOperationId,
        operationId: unknownOperationId,
        ...scope,
        type: 'external.notification',
        payloadVersion: 1,
        payload: {},
        createdAt: staleDate,
      } });
    });
    const unknownScan = await outbox.dispatchPendingOutbox(async () => assert.fail('ambiguous provider outcomes must not be resent'));
    assert.deepEqual(unknownScan, { claimed: 0, published: 0, failed: 0 });
    const unknown = await db.backgroundOperation.findUniqueOrThrow({ where: { id: unknownOperationId } });
    assert.equal(unknown.state, 'UNKNOWN');
    assert.equal(unknown.unknownCode, 'OPERATION_LEASE_EXPIRED');
    assert.ok((await outbox.listUnknownBackgroundOperations(10)).some(item => item.id === unknownOperationId));
  } finally {
    await crashedWorker?.close(true).catch(() => undefined);
    await worker?.close(true).catch(() => undefined);
    if (queue) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
    await db?.$disconnect();
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
    await Promise.all([postgres.stop(), redis.stop()]);
  }
});
