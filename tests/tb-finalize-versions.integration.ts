import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a9a9a9a9-a9a9-49a9-89a9-a9a9a9a9a9a9';
const clientId = 'b9b9b9b9-b9b9-49b9-89b9-b9b9b9b9b9b9';
const engagementId = 'c9c9c9c9-c9c9-49c9-89c9-c9c9c9c9c9c9';
const preparerId = 'd9d9d9d9-d9d9-49d9-89d9-d9d9d9d9d9d9';
const reviewerId = 'e9e9e9e9-e9e9-49e9-89e9-e9e9e9e9e9e9';
const fslis = ['Cash and equivalents', 'Trade receivables', 'Property and equipment', 'Trade payables', 'Equity', 'Revenue', 'Operating expenses'];
const statusOf = (reason: unknown) => (reason as { getStatus?: () => number }).getStatus?.();

test('T081 finalization is single-winner under concurrency and leaves earlier finalized batches queryable', { timeout: 240_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_tb_finalize_versions').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-tb-finalize-versions' });
    const { db, upload, mapBatch, finalize, supersede, statementSummary, retrieveBytes } = await import('@auditsphere/server');
    const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
    const processImport = createTrialBalanceImportProcessor(async document => retrieveBytes(document.key));
    try {
      await db.firm.create({ data: { id: firmId, name: 'Versions firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Versions client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Versions engagement', state: 'FIELDWORK_EXECUTION', period: 'FY2026' } });
      for (const [userId, email, role] of [[preparerId, 'versions-preparer@example.test', 'PREPARER'], [reviewerId, 'versions-reviewer@example.test', 'REVIEWER']] as const) {
        await db.user.create({ data: { id: userId, email, role: 'PREPARER' } });
        await db.membership.create({ data: { userId, firmId, clientId, engagementId, role } });
        await db.roleGrant.create({ data: { userId, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: preparerId } });
      }
      await db.roleGrant.create({ data: { userId: preparerId, capability: 'FIELDWORK_WRITE', firmId, clientId, engagementId, grantedBy: preparerId } });
      await db.roleGrant.create({ data: { userId: reviewerId, capability: 'FIELDWORK_FINALIZE', firmId, clientId, engagementId, grantedBy: preparerId } });

      const stageMapped = async (filename: string, csv: string) => {
        const batch = await upload(engagementId, preparerId, { filename, csv }) as { id: string };
        const event = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId: batch.id } });
        await processImport({ id: event.operationId, data: { outboxEventId: event.id, operationId: event.operationId, payloadVersion: 1 }, attemptsMade: 0, opts: { attempts: 3 } } as never);
        const rows = await db.tbRow.findMany({ where: { importId: batch.id }, orderBy: { position: 'asc' }, select: { id: true, version: true } });
        await mapBatch(engagementId, batch.id, preparerId, {
          idempotencyKey: randomUUID(),
          changes: rows.map((row, index) => ({ rowId: row.id, expectedVersion: row.version, fsli: fslis[index % fslis.length] as never })),
        });
        return batch.id;
      };
      const versionOf = async (importId: string) => (await db.tbImport.findUniqueOrThrow({ where: { id: importId } })).version;

      const first = await stageMapped('first.csv', 'code,name,current,prior\n100,Cash,10.00,0.00\n200,Equity,-10.00,0.00\n');
      const second = await stageMapped('second.csv', 'code,name,current,prior\n100,Cash,5.00,3.00\n300,Payables,-5.00,-3.00\n');

      // AC3: two concurrent finalize commands for the same batch and version. Exactly one may succeed.
      const firstVersion = await versionOf(first);
      const races = await Promise.allSettled([
        finalize(engagementId, first, reviewerId, { expectedVersion: firstVersion }),
        finalize(engagementId, first, reviewerId, { expectedVersion: firstVersion }),
      ]);
      const fulfilled = races.filter(result => result.status === 'fulfilled');
      const rejected = races.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
      assert.equal(fulfilled.length, 1, 'exactly one concurrent finalization succeeds');
      assert.equal(rejected.length, 1, 'the other concurrent finalization is refused');
      assert.equal(statusOf(rejected[0].reason), 409, 'the refused command reports a version conflict');
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: first } })).status, 'FINALIZED');
      const finalizedAudits = await db.auditEvent.count({ where: { engagementId, action: 'TB_FINALIZED', payload: { path: ['importId'], equals: first } } });
      assert.equal(finalizedAudits, 1, 'one finalization is recorded in the audit trail');

      // AC2 (D18): a later batch cannot be finalized while the earlier one is active. Supersession is explicit;
      // afterwards the earlier version stays queryable and identical.
      const earlierSummary = await statementSummary(engagementId, first);
      const earlierRows = await db.tbRow.findMany({ where: { importId: first }, orderBy: { position: 'asc' }, select: { code: true, current: true, prior: true, fsli: true, sourceLine: true } });
      await assert.rejects(finalize(engagementId, second, reviewerId, { expectedVersion: await versionOf(second) }), /supersede it explicitly/);
      await supersede(engagementId, first, reviewerId, { expectedVersion: await versionOf(first), reason: 'Replaced by the second batch in the concurrency test' });
      await finalize(engagementId, second, reviewerId, { expectedVersion: await versionOf(second) });
      assert.deepEqual(await statementSummary(engagementId, first), earlierSummary, 'the superseded version is queryable and unchanged');
      assert.deepEqual(await db.tbRow.findMany({ where: { importId: first }, orderBy: { position: 'asc' }, select: { code: true, current: true, prior: true, fsli: true, sourceLine: true } }), earlierRows);
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: first } })).status, 'SUPERSEDED');

      // A stale finalize of a superseded batch is refused and changes nothing.
      const supersededVersion = await versionOf(first);
      await assert.rejects(finalize(engagementId, first, reviewerId, { expectedVersion: firstVersion }), (reason: unknown) => statusOf(reason) === 409);
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: first } })).version, supersededVersion, 'the refused finalization does not move the version');

      console.log('T081 finalization: single winner under concurrency and earlier batches unchanged on later finalization verified on PostgreSQL 18.6');
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});
