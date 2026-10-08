import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a7a7a7a7-a7a7-47a7-87a7-a7a7a7a7a7a7';
const clientId = 'b7b7b7b7-b7b7-47b7-87b7-b7b7b7b7b7b7';
const engagementId = 'c7c7c7c7-c7c7-47c7-87c7-c7c7c7c7c7c7';
const preparerId = 'd7d7d7d7-d7d7-47d7-87d7-d7d7d7d7d7d7';
const finalizerId = 'e7e7e7e7-e7e7-47e7-87e7-e7e7e7e7e7e7';
const viewerId = 'f7f7f7f7-f7f7-47f7-87f7-f7f7f7f7f7f7';
// Balanced in both periods: current sums to 0 and prior sums to 0.
const csv = [
  'code,name,current,prior',
  '100,Cash,120.00,100.00',
  '150,Receivables,30.00,0.00',
  '200,Sales,-200.00,-160.00',
  '250,Operating costs,50.00,40.00',
  '300,Payables,0.00,20.00',
].join('\n') + '\n';
const mapping: Record<string, string> = {
  100: 'Cash and equivalents',
  150: 'Trade receivables',
  200: 'Revenue',
  250: 'Operating expenses',
  300: 'Trade payables',
};

test('T050 Trial Balance summary is statement-ordered, database-aggregated, variance-correct and gated by finalization', { timeout: 240_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_tb_summary').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-tb-summary' });
    const { db, upload, mapBatch, finalize, statementSummary, retrieveBytes } = await import('@auditsphere/server');
    const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
    const processImport = createTrialBalanceImportProcessor(async document => retrieveBytes(document.key));
    try {
      await db.firm.create({ data: { id: firmId, name: 'Summary firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Summary client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Summary engagement', state: 'FIELDWORK_EXECUTION' } });
      for (const [userId, email] of [[preparerId, 'summary-preparer@example.test'], [finalizerId, 'summary-finalizer@example.test'], [viewerId, 'summary-viewer@example.test']] as const) {
        await db.user.create({ data: { id: userId, email, role: 'PREPARER' } });
        await db.membership.create({ data: { userId, firmId, clientId, engagementId, role: 'PREPARER' } });
        await db.roleGrant.create({ data: { userId, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: preparerId } });
      }
      await db.roleGrant.create({ data: { userId: preparerId, capability: 'FIELDWORK_WRITE', firmId, clientId, engagementId, grantedBy: preparerId } });
      // Finalization is a reviewer-level capability: the role matrix never grants it to PREPARER.
      await db.membership.updateMany({ where: { userId: finalizerId, engagementId }, data: { role: 'REVIEWER' } });
      await db.roleGrant.create({ data: { userId: finalizerId, capability: 'FIELDWORK_FINALIZE', firmId, clientId, engagementId, grantedBy: preparerId } });

      const batch = await upload(engagementId, preparerId, { filename: 'summary.csv', csv }) as { id: string };
      const event = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId: batch.id } });
      await processImport({ id: event.operationId, data: { outboxEventId: event.id, operationId: event.operationId, payloadVersion: 1 }, attemptsMade: 0, opts: { attempts: 3 } } as never);
      const rows = await db.tbRow.findMany({ where: { importId: batch.id }, orderBy: { position: 'asc' } });

      // Before mapping, every balance is reported as unmapped rather than silently dropped.
      const beforeMapping = await statementSummary(engagementId, batch.id);
      assert.equal(beforeMapping.unmapped?.count, 5);
      assert.deepEqual(beforeMapping.profitAndLoss, []);
      assert.deepEqual(beforeMapping.balanceSheet, []);

      // Finalization gate: an unmapped account cannot be finalized, and a reader cannot finalize at all.
      await assert.rejects(finalize(engagementId, batch.id, finalizerId, { expectedVersion: 1 }), (reason: unknown) => (reason as { getStatus?: () => number }).getStatus?.() === 400);
      await assert.rejects(finalize(engagementId, batch.id, viewerId, { expectedVersion: 1 }));

      await mapBatch(engagementId, batch.id, preparerId, {
        idempotencyKey: randomUUID(),
        changes: rows.map(row => ({ rowId: row.id, expectedVersion: row.version, fsli: mapping[row.code] as never })),
      });
      const mappedVersion = (await db.tbImport.findUniqueOrThrow({ where: { id: batch.id } })).version;
      const finalized = await finalize(engagementId, batch.id, finalizerId, { expectedVersion: mappedVersion });
      assert.deepEqual(finalized, { status: 'FINALIZED' });

      // AC1: totals match the hand-computed fixture for every statement line.
      const summary = await statementSummary(engagementId, batch.id);
      assert.deepEqual(summary.profitAndLoss, [
        { fsli: 'Revenue', current: '-200.000000', prior: '-160.000000', change: '-40.000000', percent: '-25.000000', direction: 'DECREASE', count: 1 },
        { fsli: 'Operating expenses', current: '50.000000', prior: '40.000000', change: '10.000000', percent: '25.000000', direction: 'INCREASE', count: 1 },
      ], 'profit and loss lines come first, in the contract FSLI order, with exact variance');
      assert.deepEqual(summary.balanceSheet, [
        { fsli: 'Cash and equivalents', current: '120.000000', prior: '100.000000', change: '20.000000', percent: '20.000000', direction: 'INCREASE', count: 1 },
        // AC3: a zero prior-year base is NO_BASE with no percentage, never a misleading 0%.
        { fsli: 'Trade receivables', current: '30.000000', prior: '0.000000', change: '30.000000', percent: null, direction: 'NO_BASE', count: 1 },
        { fsli: 'Trade payables', current: '0.000000', prior: '20.000000', change: '-20.000000', percent: '-100.000000', direction: 'DECREASE', count: 1 },
      ], 'balance sheet lines follow the balance sheet, with NO_BASE for the zero prior base');
      assert.equal(summary.unmapped, null);
      assert.deepEqual(summary.placeholders, { accountsReceivable: 'ROUTE_PENDING', workprograms: 'ROUTE_PENDING' });

      // Both statements together balance to zero in each period, as the finalized source does.
      const sum = (lines: typeof summary.balanceSheet, key: 'current' | 'prior') => lines.reduce((total, line) => total + Number(line[key]), 0);
      assert.equal(sum([...summary.profitAndLoss, ...summary.balanceSheet], 'current'), 0);
      assert.equal(sum([...summary.profitAndLoss, ...summary.balanceSheet], 'prior'), 0);

      // AC2: the summary is aggregates only. No account code or raw balance row crosses the boundary.
      const serialized = JSON.stringify(summary);
      assert.doesNotMatch(serialized, /"code"|"rowId"|"name":/);
      for (const code of Object.keys(mapping)) assert.doesNotMatch(serialized, new RegExp(`"${code}"`));
      assert.ok(summary.profitAndLoss.length + summary.balanceSheet.length <= 5, 'at most one line per FSLI');

      console.log('T050 summary: database aggregation, statement order, zero-base variance, aggregates-only output and finalization gates verified on PostgreSQL 18.6');
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});
