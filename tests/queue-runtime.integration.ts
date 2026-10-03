import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Queue, Redis, Worker } from '../packages/server/tests/bullmq-test-adapter.js';
import { GenericContainer, Wait } from 'testcontainers';
import {
  durableQueueJobOptions,
  publishWithTimeout,
  redisConnectionOptions,
  trialBalanceWorkerOptions,
} from '../packages/server/src/platform/queue-runtime.js';

const redisImage = 'redis:8.10@sha256:6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('BullMQ producers fail fast, workers reconnect, failed jobs stay inspectable, and CPU jobs do not stall the API loop', { timeout: 90_000 }, async () => {
  const redis = await new GenericContainer(redisImage)
    .withExposedPorts(6379)
    .withCommand(['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'])
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections', 1))
    .start();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const queueName = `runtime-${randomUUID().replaceAll('-', '')}`;
  const queue = new Queue(queueName, {
    connection: redisConnectionOptions(redisUrl, 'producer'),
    defaultJobOptions: durableQueueJobOptions,
  });
  queue.on('error', () => undefined);
  let worker: Worker | undefined;
  let rescueWorker: Worker | undefined;
  let drainQueue: Queue | undefined;
  let stalledQueue: Queue | undefined;
  let api: ReturnType<typeof createServer> | undefined;
  let child: ReturnType<typeof spawn> | undefined;
  let drainChild: ReturnType<typeof spawn> | undefined;
  let stalledChild: ReturnType<typeof spawn> | undefined;
  try {
    await queue.waitUntilReady();
    const unavailable = new Queue(`${queueName}-offline`, {
      connection: redisConnectionOptions('redis://127.0.0.1:1', 'producer'),
    });
    unavailable.on('error', () => undefined);
    const start = Date.now();
    try {
      await publishWithTimeout(() => unavailable.add('parse', { operationId: randomUUID() }), 500);
      assert.fail('an unavailable Redis producer must reject within its configured timeout');
    } catch (error) {
      assert.equal((error as { code?: string }).code, 'QUEUE_PUBLISH_TIMEOUT');
      assert.ok(Date.now() - start < 1_500, 'unavailable queue publication must fail within the bounded producer window');
    } finally {
      await unavailable.close();
    }

    const completed: string[] = [];
    const failures: string[] = [];
    worker = new Worker(queueName, async job => {
      if (job.name === 'fail') {
        failures.push(String(job.data.operationId));
        throw Object.assign(new Error('private source content must not be placed in operational logs'), { code: 'SYNTHETIC_FAILURE' });
      }
      completed.push(String(job.data.operationId));
    }, {
      connection: redisConnectionOptions(redisUrl, 'worker'),
      ...trialBalanceWorkerOptions,
    });
    worker.on('error', () => undefined);
    await worker.waitUntilReady();

    const failedId = randomUUID();
    const failed = await queue.add('fail', { operationId: failedId }, {
      jobId: failedId,
      attempts: 2,
      backoff: { type: 'fixed', delay: 20 },
      removeOnFail: durableQueueJobOptions.removeOnFail,
    });
    const failureDeadline = Date.now() + 10_000;
    while (Date.now() < failureDeadline && (failures.length < 2 || await failed.getState() !== 'failed')) await sleep(25);
    assert.equal(failures.length, 2, 'job retry count is separate from Redis reconnection behavior');
    const retained = await queue.getJob(failedId);
    assert.ok(retained, 'failed jobs remain available for bounded operations review');
    assert.equal(retained.id, failedId, 'the durable operation ID is the correlation and deduplication key');
    assert.equal((await retained.getState()), 'failed');
    assert.equal((await queue.add('fail', { operationId: failedId }, { jobId: failedId })).id, failedId);
    assert.equal(await queue.getJobCounts('waiting', 'failed').then(counts => counts.waiting), 0, 'safe repeated enqueue does not create another job');

    // Drop every existing Redis client except the issuing control connection. BullMQ's worker
    // and producer reconnect policies must recover without process restart.
    const control = new Redis(redisConnectionOptions(redisUrl, 'worker'));
    await control.call('CLIENT', 'KILL', 'TYPE', 'normal', 'SKIPME', 'YES');
    await control.quit();
    await sleep(350);
    const recoveredId = randomUUID();
    const recoveredDeadline = Date.now() + 15_000;
    let published = false;
    while (!published && Date.now() < recoveredDeadline) {
      try {
        await queue.add('parse', { operationId: recoveredId }, { jobId: recoveredId });
        published = true;
      } catch {
        await sleep(100);
      }
    }
    assert.ok(published, 'producer reconnects and allows the PostgreSQL outbox to retry publication');
    while (!completed.includes(recoveredId) && Date.now() < recoveredDeadline) await sleep(25);
    assert.ok(completed.includes(recoveredId), 'worker reconnects and resumes job processing');

    // Windows does not deliver SIGTERM to Node's signal handler; Linux CI exercises the real
    // signal path. The same registered shutdown callback is covered by the unit-level test.
    if (process.platform !== 'win32') {
    const drainQueueName = `drain-${randomUUID().replaceAll('-', '')}`;
    drainQueue = new Queue(drainQueueName, { connection: redisConnectionOptions(redisUrl, 'producer') });
    drainQueue.on('error', () => undefined);
    const drainJobId = randomUUID();
    await drainQueue.add('drain', { operationId: drainJobId }, { jobId: drainJobId });
    const drainScript = [
      "import { Worker } from 'bullmq';",
      `const connection = { host: ${JSON.stringify(redis.getHost())}, port: ${redis.getMappedPort(6379)}, maxRetriesPerRequest: null };`,
      `const worker = new Worker(${JSON.stringify(drainQueueName)}, async () => { console.log('JOB_STARTED'); await new Promise(resolve => setTimeout(resolve, 600)); }, { connection, lockDuration: 2_000, stalledInterval: 500 });`,
      "worker.on('error', () => undefined);",
      "worker.on('completed', () => console.log('JOB_COMPLETED'));",
      "let shuttingDown = false;",
      "const shutdown = async () => { if (shuttingDown) return; shuttingDown = true; await worker.close(); console.log('SHUTDOWN_DRAINED'); };",
      "process.once('SIGTERM', () => { void shutdown(); });",
    ].join('\n');
    drainChild = spawn(process.execPath, ['--input-type=module', '-e', drainScript], {
      cwd: 'packages/server',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let drainOutput = '';
    drainChild.stdout?.on('data', chunk => { drainOutput += String(chunk); });
    drainChild.stderr?.on('data', chunk => { drainOutput += String(chunk); });
    const drainStartDeadline = Date.now() + 10_000;
    while (!drainOutput.includes('JOB_STARTED') && Date.now() < drainStartDeadline) await sleep(20);
    assert.ok(drainOutput.includes('JOB_STARTED'), `shutdown worker did not start its durable job: ${drainOutput}`);
    const drainExit = once(drainChild, 'exit');
    drainChild.kill('SIGTERM');
    const drainDeadline = Date.now() + 10_000;
    while (!drainOutput.includes('SHUTDOWN_DRAINED') && Date.now() < drainDeadline) await sleep(20);
    assert.ok(drainOutput.includes('JOB_COMPLETED') && drainOutput.includes('SHUTDOWN_DRAINED'), `SIGTERM did not drain the active job: ${drainOutput}`);
    if (drainChild.exitCode === null) await drainExit;
    await drainQueue.close();
    drainQueue = undefined;
    }

    const stalledQueueName = `stalled-${randomUUID().replaceAll('-', '')}`;
    stalledQueue = new Queue(stalledQueueName, { connection: redisConnectionOptions(redisUrl, 'producer') });
    stalledQueue.on('error', () => undefined);
    const stalledJobId = randomUUID();
    await stalledQueue.add('stalled', { operationId: stalledJobId }, { jobId: stalledJobId, attempts: 2 });
    const stalledScript = [
      "import { Worker } from 'bullmq';",
      `const connection = { host: ${JSON.stringify(redis.getHost())}, port: ${redis.getMappedPort(6379)}, maxRetriesPerRequest: null };`,
      `const worker = new Worker(${JSON.stringify(stalledQueueName)}, async () => { console.log('STALL_STARTED'); await new Promise(() => undefined); }, { connection, lockDuration: 1_000, stalledInterval: 250, maxStalledCount: 1 });`,
      "worker.on('error', () => undefined);",
    ].join('\n');
    stalledChild = spawn(process.execPath, ['--input-type=module', '-e', stalledScript], {
      cwd: 'packages/server',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stalledOutput = '';
    stalledChild.stdout?.on('data', chunk => { stalledOutput += String(chunk); });
    stalledChild.stderr?.on('data', chunk => { stalledOutput += String(chunk); });
    const stalledStartDeadline = Date.now() + 10_000;
    while (!stalledOutput.includes('STALL_STARTED') && Date.now() < stalledStartDeadline) await sleep(20);
    assert.ok(stalledOutput.includes('STALL_STARTED'), `crash worker did not claim its job: ${stalledOutput}`);
    stalledChild.kill('SIGKILL');
    if (stalledChild.exitCode === null) await once(stalledChild, 'exit');
    const recoveredStalled: string[] = [];
    const stalledSignal = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Replacement worker did not reclaim the stalled job')), 15_000);
      rescueWorker = new Worker(stalledQueueName, async job => { recoveredStalled.push(String(job.data.operationId)); }, {
        connection: redisConnectionOptions(redisUrl, 'worker'),
        concurrency: 1,
        lockDuration: 1_000,
        stalledInterval: 250,
        maxStalledCount: 1,
      });
      rescueWorker.on('error', () => undefined);
      rescueWorker.on('completed', async () => {
        if (recoveredStalled.includes(stalledJobId)) {
          clearTimeout(timeout);
          await rescueWorker?.close();
          resolve();
        }
      });
      void rescueWorker.waitUntilReady();
    });
    await stalledSignal;
    assert.deepEqual(recoveredStalled, [stalledJobId]);
    await stalledQueue.close();
    stalledQueue = undefined;

    // A CPU-bound synthetic processor runs in the worker process. The API event loop is a
    // separate process and must continue answering while that processor is busy.
    api = createServer((_request, response) => { response.writeHead(200); response.end('ok'); });
    api.listen(0, '127.0.0.1');
    await once(api, 'listening');
    const address = api.address();
    if (!address || typeof address === 'string') throw new Error('Synthetic API did not bind a TCP port');
    const cpuQueue = `cpu-${randomUUID().replaceAll('-', '')}`;
    const script = [
      "import { Queue, Worker } from 'bullmq';",
      `const connection = { host: ${JSON.stringify(redis.getHost())}, port: ${redis.getMappedPort(6379)}, maxRetriesPerRequest: null };`,
      `const queue = new Queue(${JSON.stringify(cpuQueue)}, { connection });`,
      `const operationId = ${JSON.stringify(randomUUID())};`,
      `await queue.add('cpu', { operationId }, { jobId: operationId });`,
      `const worker = new Worker(${JSON.stringify(cpuQueue)}, async () => { const until = Date.now() + 2_000; while (Date.now() < until) {} }, { connection, concurrency: 1, lockDuration: 10_000 });`,
      "worker.on('completed', async () => { await worker.close(); await queue.close(); console.log('CPU_JOB_COMPLETED'); });",
    ].join('\n');
    child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: 'packages/server',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let childOutput = '';
    child.stdout?.on('data', chunk => { childOutput += String(chunk); });
    child.stderr?.on('data', chunk => { childOutput += String(chunk); });
    const deadline = Date.now() + 10_000;
    let latency = Number.POSITIVE_INFINITY;
    while (Date.now() < deadline && childOutput.includes('CPU_JOB_COMPLETED') === false) {
      const requestStart = Date.now();
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/health/live`);
      assert.equal(response.status, 200);
      await response.text();
      latency = Math.min(latency, Date.now() - requestStart);
      await sleep(50);
    }
    assert.ok(childOutput.includes('CPU_JOB_COMPLETED'), `synthetic worker process did not complete: ${childOutput}`);
    assert.ok(latency < 1_000, `API event loop stalled for ${latency}ms during worker CPU processing`);
    const exit = child.exitCode === null ? once(child, 'exit') : Promise.resolve([]);
    await exit;
  } finally {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    if (drainChild && drainChild.exitCode === null) drainChild.kill('SIGKILL');
    if (stalledChild && stalledChild.exitCode === null) stalledChild.kill('SIGKILL');
    if (rescueWorker) await rescueWorker.close(true).catch(() => undefined);
    if (drainQueue) await drainQueue.close().catch(() => undefined);
    if (stalledQueue) await stalledQueue.close().catch(() => undefined);
    if (worker) await worker.close(true).catch(() => undefined);
    await queue.close().catch(() => undefined);
    if (api?.listening) await new Promise<void>(resolve => api!.close(() => resolve()));
    await redis.stop();
  }
});
