import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a6a6a6a6-a6a6-46a6-86a6-a6a6a6a6a6a6';
const clientId = 'b6b6b6b6-b6b6-46b6-86b6-b6b6b6b6b6b6';
const engagementId = 'c6c6c6c6-c6c6-46c6-86c6-c6c6c6c6c6c6';
const preparerId = 'd6d6d6d6-d6d6-46d6-86d6-d6d6d6d6d6d6';
const viewerId = 'e6e6e6e6-e6e6-46e6-86e6-e6e6e6e6e6e6';
const csv = 'code,name,current,prior\n100,Cash,1.00,0.00\n200,Equity,-1.00,0.00\n300,Revenue,0.00,0.00\n';

test('T049 batch mapping is all-or-nothing, version-checked, race-safe and idempotent on PostgreSQL 18.6', { timeout: 240_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_tb_mapping').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-tb-mapping' });
    const { db, upload, mapBatch, retrieveBytes } = await import('@auditsphere/server');
    const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
    const processImport = createTrialBalanceImportProcessor(async document => retrieveBytes(document.key));
    try {
      await db.firm.create({ data: { id: firmId, name: 'Mapping firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Mapping client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Mapping engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.create({ data: { id: preparerId, email: 'mapping-preparer@example.test', role: 'PREPARER' } });
      await db.user.create({ data: { id: viewerId, email: 'mapping-viewer@example.test', role: 'PREPARER' } });
      for (const userId of [preparerId, viewerId]) {
        await db.membership.create({ data: { userId, firmId, clientId, engagementId, role: 'PREPARER' } });
        await db.roleGrant.create({ data: { userId, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: preparerId } });
      }
      // Only the preparer may write; the viewer holds read access alone.
      await db.roleGrant.create({ data: { userId: preparerId, capability: 'FIELDWORK_WRITE', firmId, clientId, engagementId, grantedBy: preparerId } });

      const batch = await upload(engagementId, preparerId, { filename: 'mapping.csv', csv }) as { id: string };
      const event = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId: batch.id } });
      await processImport({ id: event.operationId, data: { outboxEventId: event.id, operationId: event.operationId, payloadVersion: 1 }, attemptsMade: 0, opts: { attempts: 3 } } as never);
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: batch.id } })).status, 'MAPPING_REQUIRED');

      const rows = await db.tbRow.findMany({ where: { importId: batch.id }, orderBy: { position: 'asc' } });
      const [cash, equity, revenue] = rows;
      const versionsOf = async () => Object.fromEntries((await db.tbRow.findMany({ where: { importId: batch.id }, select: { code: true, version: true, fsli: true } })).map(row => [row.code, { version: row.version, fsli: row.fsli }]));
      const importVersion = async () => (await db.tbImport.findUniqueOrThrow({ where: { id: batch.id } })).version;
      const mappedAudits = async () => db.auditEvent.count({ where: { engagementId, action: 'TB_MAPPED' } });
      const statusOf = (reason: unknown) => (reason as { getStatus?: () => number }).getStatus?.();

      // Denied path: a reader without FIELDWORK_WRITE cannot map anything, and nothing changes.
      const beforeDenied = await versionsOf();
      await assert.rejects(mapBatch(engagementId, batch.id, viewerId, {
        idempotencyKey: randomUUID(), changes: [{ rowId: cash.id, expectedVersion: 1, fsli: 'Cash and equivalents' }],
      }));
      assert.deepEqual(await versionsOf(), beforeDenied, 'a denied mapping leaves every row unchanged');

      // Malformed input is refused before the transaction: duplicate row IDs and empty batches.
      await assert.rejects(mapBatch(engagementId, batch.id, preparerId, {
        idempotencyKey: randomUUID(), changes: [
          { rowId: cash.id, expectedVersion: 1, fsli: 'Cash and equivalents' },
          { rowId: cash.id, expectedVersion: 1, fsli: 'Equity' },
        ],
      }), (reason: unknown) => statusOf(reason) === 400);
      await assert.rejects(mapBatch(engagementId, batch.id, preparerId, { idempotencyKey: randomUUID(), changes: [] }), (reason: unknown) => statusOf(reason) === 400);

      // AC1: two editors race for the same row with the same expected version. Exactly one succeeds.
      const winnerKey = randomUUID();
      const loserKey = randomUUID();
      const races = await Promise.allSettled([
        mapBatch(engagementId, batch.id, preparerId, { idempotencyKey: winnerKey, changes: [{ rowId: cash.id, expectedVersion: 1, fsli: 'Cash and equivalents' }] }),
        mapBatch(engagementId, batch.id, preparerId, { idempotencyKey: loserKey, changes: [{ rowId: cash.id, expectedVersion: 1, fsli: 'Revenue' }] }),
      ]);
      const fulfilled = races.filter(result => result.status === 'fulfilled');
      const rejected = races.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
      assert.equal(fulfilled.length, 1, 'exactly one editor wins the race');
      assert.equal(rejected.length, 1, 'the other editor receives a conflict');
      assert.equal(statusOf(rejected[0].reason), 409);
      assert.match(String((rejected[0].reason as Error).message), /rows changed/);
      const afterRace = await versionsOf();
      assert.equal(afterRace[100].version, 2, 'the winning write incremented the row exactly once');
      // The winner is the request whose receipt was committed. Only its FSLI may be applied.
      const winnerIsFirst = Boolean(await db.commandReceipt.findUnique({ where: { key: winnerKey } }));
      const winner = winnerIsFirst ? { key: winnerKey, fsli: 'Cash and equivalents' } : { key: loserKey, fsli: 'Revenue' };
      assert.equal(afterRace[100].fsli, winner.fsli, 'no loser data is applied');

      // AC3: a lost response is retried with the same key and body. The original outcome is returned,
      // and neither the row nor the batch version moves again.
      const retryAudits = await mappedAudits();
      const retryVersion = await importVersion();
      const replay = await mapBatch(engagementId, batch.id, preparerId, { idempotencyKey: winner.key, changes: [{ rowId: cash.id, expectedVersion: 1, fsli: winner.fsli }] });
      assert.deepEqual(replay, { saved: 1 });
      assert.equal((await versionsOf())[100].version, 2, 'replay does not apply the change twice');
      assert.equal(await importVersion(), retryVersion);
      assert.equal(await mappedAudits(), retryAudits, 'replay writes no new audit event');
      // The same key with a different body is a client error, not a second write.
      await assert.rejects(mapBatch(engagementId, batch.id, preparerId, { idempotencyKey: winner.key, changes: [{ rowId: equity.id, expectedVersion: 1, fsli: 'Equity' }] }), (reason: unknown) => statusOf(reason) === 409);

      // AC2: one stale row in a multi-row batch rolls back the whole batch. The fresh row is not mapped.
      const beforeStale = await versionsOf();
      const beforeStaleImport = await importVersion();
      const beforeStaleAudits = await mappedAudits();
      await assert.rejects(mapBatch(engagementId, batch.id, preparerId, {
        idempotencyKey: randomUUID(), changes: [
          { rowId: equity.id, expectedVersion: 1, fsli: 'Equity' },
          { rowId: revenue.id, expectedVersion: 42, fsli: 'Revenue' },
        ],
      }), (reason: unknown) => statusOf(reason) === 409);
      assert.deepEqual(await versionsOf(), beforeStale, 'a stale row in the batch leaves no other row mapped');
      assert.equal(await importVersion(), beforeStaleImport, 'the batch version does not move on a failed batch');
      assert.equal(await mappedAudits(), beforeStaleAudits, 'a failed batch writes no audit event');

      // A clean batch of the remaining rows succeeds, showing the failed attempt left no partial state.
      const finished = await mapBatch(engagementId, batch.id, preparerId, {
        idempotencyKey: randomUUID(), changes: [
          { rowId: equity.id, expectedVersion: 1, fsli: 'Equity' },
          { rowId: revenue.id, expectedVersion: 1, fsli: 'Revenue' },
        ],
      });
      assert.deepEqual(finished, { saved: 2 });
      const finalRows = await versionsOf();
      assert.equal(finalRows[200].fsli, 'Equity');
      assert.equal(finalRows[300].fsli, 'Revenue');
      assert.equal(await importVersion(), beforeStaleImport + 1, 'one successful batch increments the batch version once');

      console.log('T049 batch mapping: denial, race, all-or-nothing rollback and idempotent replay verified on PostgreSQL 18.6');
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});
