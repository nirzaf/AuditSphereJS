import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'ac000000-0000-4000-8000-000000000001';
const clientId = 'ac000000-0000-4000-8000-000000000002';
const engagementId = 'ac000000-0000-4000-8000-000000000003';
const preparerId = 'ac000000-0000-4000-8000-000000000004';
const reviewerId = 'ac000000-0000-4000-8000-000000000005';
const approverId = 'ac000000-0000-4000-8000-000000000006';
const fslis = ['Cash and equivalents', 'Trade receivables', 'Property and equipment', 'Trade payables', 'Equity', 'Revenue', 'Operating expenses'];
const balanced = 'code,name,current,prior\n100,Cash,10.00,0.00\n200,Equity,-10.00,0.00\n';
const statusOf = (reason: unknown) => (reason as { getStatus?: () => number }).getStatus?.();

test('DN-04/D16: finalization requires the recorded statutory period, refuses a changed one, and duplicate engagements are judged by name and period', { timeout: 300_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_tb_period').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-tb-period' });
    const { db, upload, mapBatch, finalize, createEngagement, retrieveBytes } = await import('@auditsphere/server');
    const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
    const processImport = createTrialBalanceImportProcessor(async document => retrieveBytes(document.key));
    try {
      await db.firm.create({ data: { id: firmId, name: 'Period firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Period client' } });
      // No period yet: the engagement was created before periods were recorded.
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Period engagement', state: 'FIELDWORK_EXECUTION' } });
      for (const [userId, email, role] of [[preparerId, 'period-preparer@example.test', 'PREPARER'], [reviewerId, 'period-reviewer@example.test', 'REVIEWER'], [approverId, 'period-approver@example.test', 'APPROVER']] as const) {
        await db.user.create({ data: { id: userId, email, role: 'PREPARER' } });
        await db.membership.create({ data: { userId, firmId, clientId, engagementId, role } });
        await db.roleGrant.create({ data: { userId, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: approverId } });
      }
      await db.roleGrant.create({ data: { userId: preparerId, capability: 'FIELDWORK_WRITE', firmId, clientId, engagementId, grantedBy: approverId } });
      await db.roleGrant.create({ data: { userId: reviewerId, capability: 'FIELDWORK_FINALIZE', firmId, clientId, engagementId, grantedBy: approverId } });
      await db.roleGrant.create({ data: { userId: approverId, capability: 'COMMERCIAL_MANAGE', firmId, clientId, engagementId, grantedBy: approverId } });

      const stageMappedAndProcessed = async (filename: string) => {
        const batch = await upload(engagementId, preparerId, { filename: `${filename}.csv`, csv: balanced + `${filename.length}00,Padding ${filename},0.00,0.00\n` }) as { id: string };
        const event = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId: batch.id } });
        await processImport({ id: event.operationId, data: { outboxEventId: event.id, operationId: event.operationId, payloadVersion: 1 }, attemptsMade: 0, opts: { attempts: 3 } } as never);
        const rows = await db.tbRow.findMany({ where: { importId: batch.id }, orderBy: { position: 'asc' }, select: { id: true, version: true } });
        await mapBatch(engagementId, batch.id, preparerId, {
          idempotencyKey: randomUUID(),
          changes: rows.map((row, index) => ({ rowId: row.id, expectedVersion: row.version, fsli: fslis[index % fslis.length] as never })),
        });
        return batch.id;
      };
      const finalizeNow = async (importId: string) => finalize(engagementId, importId, reviewerId, { expectedVersion: (await db.tbImport.findUniqueOrThrow({ where: { id: importId } })).version });

      // (a) An engagement with no recorded period cannot finalize, even when the balances are right.
      const unrecorded = await stageMappedAndProcessed('unrecorded');
      await assert.rejects(finalizeNow(unrecorded), (reason: unknown) => statusOf(reason) === 409 && /not recorded/.test(String((reason as Error).message)));
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: unrecorded } })).status, 'MAPPING_REQUIRED');

      // (b) Recording the period does not retroactively bless an import staged before it existed.
      await db.engagement.update({ where: { id: engagementId }, data: { period: 'FY2026' } });
      await assert.rejects(finalizeNow(unrecorded), (reason: unknown) => statusOf(reason) === 409 && /changed after this import was staged/.test(String((reason as Error).message)));

      // (c) An import staged for the recorded period finalizes.
      const fy2026 = await stageMappedAndProcessed('fy2026');
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: fy2026 } })).engagementPeriod, 'FY2026');
      assert.deepEqual(await finalizeNow(fy2026), { status: 'FINALIZED' });

      // (d) If the engagement's period changes while an import for the old period is waiting, it cannot finalize.
      const waiting = await stageMappedAndProcessed('waiting');
      await db.engagement.update({ where: { id: engagementId }, data: { period: 'FY2027' } });
      await assert.rejects(finalizeNow(waiting), (reason: unknown) => statusOf(reason) === 409);
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: waiting } })).status, 'MAPPING_REQUIRED', 'a refused finalization leaves the batch editable');
      await db.engagement.update({ where: { id: engagementId }, data: { period: 'FY2026' } });
      // Restoring the period it was staged for makes the same import finalizable again.
      assert.deepEqual(await finalizeNow(waiting), { status: 'FINALIZED' });

      // (e) Duplicate policy: one engagement per client, name and period. Another period is a separate record.
      const first = await createEngagement(approverId, engagementId, { idempotencyKey: randomUUID(), clientId, name: 'Annual audit', service: 'Statutory audit', period: 'FY2026' }) as { id: string; period: string };
      assert.equal(first.period, 'FY2026');
      assert.equal((await db.engagement.findUniqueOrThrow({ where: { id: first.id } })).period, 'FY2026', 'the period is stored on the engagement');
      await assert.rejects(createEngagement(approverId, engagementId, { idempotencyKey: randomUUID(), clientId, name: 'Annual audit', service: 'Statutory audit', period: 'FY2026' }), (reason: unknown) => statusOf(reason) === 409);
      const nextYear = await createEngagement(approverId, engagementId, { idempotencyKey: randomUUID(), clientId, name: 'Annual audit', service: 'Statutory audit', period: 'FY2027' }) as { id: string };
      assert.notEqual(nextYear.id, first.id, 'the same name in another period is a separate engagement');

      console.log('DN-04/D16 statutory period: recorded-period finalization, changed-period refusal and name-and-period duplicate policy verified on PostgreSQL 18.6');
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});
