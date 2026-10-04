import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GenericContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, Queue, Worker } from '../packages/server/tests/bullmq-test-adapter.js';
import { FixedClock } from '../packages/server/src/platform/clock.js';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const redisImage = 'redis:8.10@sha256:6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee';

test('durable deadline scanner catches up once and recovers queue loss with PostgreSQL and Redis', { timeout: 180_000 }, async () => {
  const previousEnvironment = Object.fromEntries(['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'REDIS_URL', 'NODE_ENV', 'SERVICE_NAME']
    .map(key => [key, process.env[key]]));
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:18.6@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722')
      .withDatabase('scheduler')
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
    SERVICE_NAME: 'scheduler-integration',
    DATABASE_URL: databaseUrl,
    MIGRATION_DATABASE_URL: databaseUrl,
  };
  const connection = { host: redis.getHost(), port: redis.getMappedPort(6379), maxRetriesPerRequest: null };
  let queue: Queue | undefined;
  let worker: Worker | undefined;
  let db: typeof import('../packages/server/src/platform/db.js').db | undefined;

  try {
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 90_000, stdio: 'pipe' });
    Object.assign(process.env, env, { REDIS_URL: redisUrl });
    const [dbModule, scheduler, outbox, grants] = await Promise.all([
      import('../packages/server/src/platform/db.js'),
      import('../packages/server/src/platform/scheduler.js'),
      import('../packages/server/src/platform/outbox.js'),
      import('../packages/server/src/platform/scheduler-role-grants.js'),
    ]);
    db = dbModule.db;
    const privilegeProbe = new Client({ connectionString: databaseUrl });
    await privilegeProbe.connect();
    try {
      await privilegeProbe.query('CREATE ROLE auditsphere_api NOLOGIN');
      await privilegeProbe.query('CREATE ROLE auditsphere_worker NOLOGIN');
      for (const grant of grants.schedulerRoleGrants) await privilegeProbe.query(grant);
      const privileges = await privilegeProbe.query<{ api_schedule: boolean; api_outbox_insert: boolean; api_outbox_delete: boolean; worker_schedule: boolean; worker_operation_insert: boolean; worker_outbox_insert: boolean; worker_delete: boolean }>(`
        SELECT
          has_table_privilege('auditsphere_api', 'scheduled_deadlines', 'SELECT,INSERT,UPDATE') AS api_schedule,
          has_table_privilege('auditsphere_api', '"OutboxEvent"', 'INSERT') AS api_outbox_insert,
          has_table_privilege('auditsphere_api', '"OutboxEvent"', 'DELETE') AS api_outbox_delete,
          has_table_privilege('auditsphere_worker', 'scheduled_deadlines', 'SELECT,INSERT,UPDATE') AS worker_schedule,
          has_table_privilege('auditsphere_worker', 'background_operations', 'INSERT') AS worker_operation_insert,
          has_table_privilege('auditsphere_worker', '"OutboxEvent"', 'INSERT') AS worker_outbox_insert,
          (has_table_privilege('auditsphere_worker', 'scheduled_deadlines', 'DELETE') OR has_table_privilege('auditsphere_worker', 'background_operations', 'DELETE') OR has_table_privilege('auditsphere_worker', '"OutboxEvent"', 'DELETE')) AS worker_delete
      `);
      assert.deepEqual(privileges.rows[0], {
        api_schedule: true,
        api_outbox_insert: true,
        api_outbox_delete: false,
        worker_schedule: true,
        worker_operation_insert: true,
        worker_outbox_insert: true,
        worker_delete: false,
      }, 'runtime role grants must permit only required deadline and outbox operations');
    } finally {
      await privilegeProbe.end();
    }
    const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID();
    const scope = { firmId, clientId, engagementId };
    await db.$transaction(async tx => {
      await tx.firm.create({ data: { id: firmId, name: 'Scheduler integration firm' } });
      await tx.client.create({ data: { id: clientId, firmId, name: 'Scheduler integration client' } });
      await tx.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Scheduler integration engagement' } });
    });

    const clock = new FixedClock('2026-02-03T04:05:06.000Z');
    const before = {
      ...scope,
      idempotencyKey: 'reminder:revision-1',
      eventType: 'deadline.reminder',
      classification: 'INFORMATIONAL' as const,
      dueAt: new Date(clock.now().getTime() - 1),
      payload: { destination: { channel: 'internal', templateVersion: 1 }, recipients: ['preparer'] },
    };
    const at = {
      ...scope,
      idempotencyKey: 'archive:signature-2026-02-03',
      eventType: 'archive.enforce',
      classification: 'ENFORCEMENT' as const,
      dueAt: clock.now(),
      payload: { sourcePolicy: 'R070' },
    };
    const after = {
      ...scope,
      idempotencyKey: 'reminder:revision-2',
      eventType: 'deadline.reminder',
      classification: 'INFORMATIONAL' as const,
      dueAt: new Date(clock.now().getTime() + 1),
      payload: { destination: { templateVersion: 1, channel: 'internal' }, recipients: ['preparer'] },
    };
    const cancelled = {
      ...scope,
      idempotencyKey: 'reminder:cancelled',
      eventType: 'deadline.reminder',
      classification: 'INFORMATIONAL' as const,
      dueAt: new Date(clock.now().getTime() + 86_400_000),
      payload: {},
    };
    let beforeId = '', atId = '', afterId = '', cancelledId = '';
    await db.$transaction(async tx => {
      beforeId = (await scheduler.scheduleDeadline(tx, before)).id;
      atId = (await scheduler.scheduleDeadline(tx, at)).id;
      afterId = (await scheduler.scheduleDeadline(tx, after)).id;
      cancelledId = (await scheduler.scheduleDeadline(tx, cancelled)).id;
      assert.equal(await scheduler.cancelScheduledDeadline(tx, scope, cancelled.idempotencyKey, clock.now()), true);
      assert.equal(await scheduler.cancelScheduledDeadline(tx, scope, cancelled.idempotencyKey, clock.now()), false);
      const replay = await scheduler.scheduleDeadline(tx, { ...before, payload: { recipients: ['preparer'], destination: { templateVersion: 1, channel: 'internal' } } });
      assert.equal(replay.id, beforeId, 'canonical JSON object ordering preserves an identical idempotent replay');
      await assert.rejects(() => scheduler.scheduleDeadline(tx, { ...before, dueAt: new Date(before.dueAt.getTime() + 60_000) }), /different content/);
    });

    const [replicaA, replicaB] = await Promise.all([
      scheduler.enqueueDueDeadlines({ now: clock.now(), batchSize: 1 }),
      scheduler.enqueueDueDeadlines({ now: clock.now(), batchSize: 1 }),
    ]);
    assert.equal(replicaA.scanned + replicaB.scanned, 2, 'two replicas claim each before/at deadline once');
    assert.ok(replicaA.scanned <= 1 && replicaB.scanned <= 1, 'each scheduler pass respects its requested bound');
    assert.deepEqual(new Set([...replicaA.operationIds, ...replicaB.operationIds]), new Set([beforeId, atId]));
    assert.equal((await db.scheduledDeadline.findUniqueOrThrow({ where: { id: afterId } })).state, 'SCHEDULED', 'an after-boundary schedule stays pending');
    assert.equal(await db.backgroundOperation.count({ where: { type: 'scheduler.deadline', engagementId } }), 2);
    assert.equal(await db.outboxEvent.count({ where: { type: 'scheduler.deadline', engagementId } }), 2);
    assert.equal((await db.scheduledDeadline.findUniqueOrThrow({ where: { id: cancelledId } })).state, 'CANCELLED');

    // Simulate downtime: the next bounded scan catches up the deadline that became due while no scanner ran.
    clock.advanceSeconds(1);
    const catchUp = await scheduler.enqueueDueDeadlines({ now: clock.now(), batchSize: 2 });
    assert.deepEqual(new Set(catchUp.operationIds), new Set([afterId]));
    assert.equal(await scheduler.enqueueDueDeadlines({ now: clock.now(), batchSize: 2 }).then(result => result.scanned), 0);

    const queueName = `scheduler-${randomUUID().replaceAll('-', '')}`;
    queue = new Queue(queueName, { connection });
    const enqueue = async (dispatch: { jobId: string; name: 'execute'; data: unknown }) => queue!.add(dispatch.name, dispatch.data, {
      jobId: dispatch.jobId,
      attempts: 3,
      backoff: { type: 'fixed', delay: 25 },
      removeOnComplete: true,
      removeOnFail: true,
    });
    const lostAck = await outbox.dispatchPendingOutbox(async dispatch => {
      if (dispatch.queue !== 'scheduled-deadlines') throw new Error(`Unexpected outbox queue ${dispatch.queue}`);
      await enqueue(dispatch);
      throw Object.assign(new Error('Simulated relay acknowledgement loss'), { code: 'ECONNRESET' });
    });
    assert.deepEqual(lostAck, { claimed: 3, published: 0, failed: 3 });
    assert.equal(await queue.getJob(beforeId) !== undefined, true, 'Redis may accept a job even when the relay loses its acknowledgement');
    const replayed = await outbox.dispatchPendingOutbox(async dispatch => {
      if (dispatch.queue !== 'scheduled-deadlines') throw new Error(`Unexpected outbox queue ${dispatch.queue}`);
      await enqueue(dispatch);
    });
    assert.deepEqual(replayed, { claimed: 3, published: 3, failed: 0 });
    assert.equal(await queue.getJob(beforeId) !== undefined, true, 'stable operation UUID prevents duplicate Redis work');

    const reminderAttempts = new Map<string, number>();
    let enforcementStarted!: () => void;
    let releaseEnforcement!: () => void;
    const enforcementStart = new Promise<void>(resolve => { enforcementStarted = resolve; });
    const enforcementGate = new Promise<void>(resolve => { releaseEnforcement = resolve; });
    const processor = scheduler.createScheduledDeadlineProcessor({
      'deadline.reminder': async ({ deadline }) => {
        assert.equal(deadline.classification, 'INFORMATIONAL');
        const attempts = (reminderAttempts.get(deadline.id) ?? 0) + 1;
        reminderAttempts.set(deadline.id, attempts);
        if (deadline.id === beforeId && attempts === 1) throw new Error('Retry the internal reminder');
        return { delivered: false, notificationIntent: 'deferred-to-outbox' };
      },
      'archive.enforce': async ({ client, deadline }) => {
        assert.equal(deadline.classification, 'ENFORCEMENT');
        assert.equal(await client.document.count({ where: { engagementId } }), 0, 'enforcement has no generated-PDF or document prerequisite');
        enforcementStarted();
        await enforcementGate;
        return { archived: true, source: 'deadline' };
      },
    }, () => clock.now());
    worker = new Worker(queueName, processor, { connection, concurrency: 3 });
    const retryObserved = new Promise<void>(resolve => worker!.on('failed', job => {
      if (job?.id === beforeId) resolve();
    }));
    await enforcementStart;
    await retryObserved;
    const reminderCompletionDeadline = Date.now() + 20_000;
    while (Date.now() < reminderCompletionDeadline) {
      const remindersCompleted = await db.backgroundOperation.count({ where: { id: { in: [beforeId, afterId] }, state: 'COMPLETED' } });
      if (remindersCompleted === 2) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(await db.backgroundOperation.count({ where: { id: { in: [beforeId, afterId] }, state: 'COMPLETED' } }), 2, 'both reminders finish before graceful shutdown stops new claims');
    const closing = worker.close();
    releaseEnforcement();
    await closing;
    worker = undefined;

    const completionDeadline = Date.now() + 20_000;
    while (Date.now() < completionDeadline) {
      const completed = await db.backgroundOperation.count({ where: { id: { in: [beforeId, atId, afterId] }, state: 'COMPLETED' } });
      if (completed === 3) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(await db.backgroundOperation.count({ where: { id: { in: [beforeId, atId, afterId] }, state: 'COMPLETED' } }), 3);
    assert.equal(reminderAttempts.get(beforeId), 2, 'the transient reminder failure is retried exactly once');
    assert.equal(reminderAttempts.get(afterId), 1, 'the other reminder is delivered once');
    assert.deepEqual((await db.backgroundOperation.findUniqueOrThrow({ where: { id: atId } })).result, { archived: true, source: 'deadline' });
    assert.equal(await db.outboxEvent.count({ where: { id: { in: [beforeId, atId, afterId] }, completedAt: { not: null } } }), 3);

    // Simulate lost Redis job and a process that died after its durable RUNNING claim.
    const recoveryDue = new Date(Date.now() - 1);
    let recoveryId = '';
    await db.$transaction(async tx => {
      recoveryId = (await scheduler.scheduleDeadline(tx, {
        ...scope,
        idempotencyKey: 'maintenance:restart-recovery',
        eventType: 'maintenance.recovery',
        classification: 'INFORMATIONAL',
        dueAt: recoveryDue,
        payload: {},
      })).id;
    });
    assert.equal((await scheduler.enqueueDueDeadlines({ now: new Date(), batchSize: 1 })).operationIds[0], recoveryId);
    await outbox.dispatchPendingOutbox(async dispatch => {
      if (dispatch.queue !== 'scheduled-deadlines') throw new Error(`Unexpected outbox queue ${dispatch.queue}`);
      await enqueue(dispatch);
    });
    const accepted = await queue.getJob(recoveryId);
    assert.ok(accepted);
    await accepted.remove();
    assert.equal(await outbox.claimBackgroundOperation(recoveryId), true);
    const recoveryTime = new Date(Date.now() + 11 * 60_000);
    await db.backgroundOperation.update({ where: { id: recoveryId }, data: { updatedAt: new Date(recoveryTime.getTime() - 11 * 60_000) } });
    const recovered = await outbox.dispatchPendingOutbox(async dispatch => {
      if (dispatch.queue !== 'scheduled-deadlines') throw new Error(`Unexpected outbox queue ${dispatch.queue}`);
      await enqueue(dispatch);
    }, { now: recoveryTime, staleOperationMs: 10 * 60_000 });
    assert.deepEqual(recovered, { claimed: 1, published: 1, failed: 0 });
    assert.ok(await queue.getJob(recoveryId), 'PostgreSQL reconstructs the missing Redis job after stale-claim recovery');
    const recoveredWorker = new Worker(queueName, scheduler.createScheduledDeadlineProcessor({
      'maintenance.recovery': async () => ({ recovered: true }),
    }, () => recoveryTime), { connection, concurrency: 1 });
    try {
      const recoveredDeadline = Date.now() + 15_000;
      while (Date.now() < recoveredDeadline) {
        if ((await db.backgroundOperation.findUniqueOrThrow({ where: { id: recoveryId } })).state === 'COMPLETED') break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal((await db.backgroundOperation.findUniqueOrThrow({ where: { id: recoveryId } })).state, 'COMPLETED');
      assert.deepEqual((await db.backgroundOperation.findUniqueOrThrow({ where: { id: recoveryId } })).result, { recovered: true });
    } finally {
      await recoveredWorker.close();
    }
  } finally {
    await worker?.close(true).catch(() => undefined);
    if (queue) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
    await db?.$disconnect();
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all([postgres.stop(), redis.stop()]);
  }
});
