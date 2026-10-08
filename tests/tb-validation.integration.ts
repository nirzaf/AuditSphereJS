import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a8a8a8a8-a8a8-48a8-88a8-a8a8a8a8a8a8';
const clientId = 'b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8';
const engagementId = 'c8c8c8c8-c8c8-48c8-88c8-c8c8c8c8c8c8';
const preparerId = 'd8d8d8d8-d8d8-48d8-88d8-d8d8d8d8d8d8';
const reviewerId = 'e8e8e8e8-e8e8-48e8-88e8-e8e8e8e8e8e8';
const fslis = ['Cash and equivalents', 'Trade receivables', 'Property and equipment', 'Trade payables', 'Equity', 'Revenue', 'Operating expenses'];
const statusOf = (reason: unknown) => (reason as { getStatus?: () => number }).getStatus?.();

test('T079 Trial Balance validation blocks unbalanced finalization and reconciles golden fixture totals', { timeout: 300_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_tb_validation_rules').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-tb-validation-rules' });
    const { db, upload, mapBatch, finalize, statementSummary, retrieveBytes } = await import('@auditsphere/server');
    const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
    const processImport = createTrialBalanceImportProcessor(async document => retrieveBytes(document.key));
    try {
      await db.firm.create({ data: { id: firmId, name: 'Rules firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Rules client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Rules engagement', state: 'FIELDWORK_EXECUTION' } });
      for (const [userId, email, role] of [[preparerId, 'rules-preparer@example.test', 'PREPARER'], [reviewerId, 'rules-reviewer@example.test', 'REVIEWER']] as const) {
        await db.user.create({ data: { id: userId, email, role: 'PREPARER' } });
        await db.membership.create({ data: { userId, firmId, clientId, engagementId, role } });
        await db.roleGrant.create({ data: { userId, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: preparerId } });
      }
      await db.roleGrant.create({ data: { userId: preparerId, capability: 'FIELDWORK_WRITE', firmId, clientId, engagementId, grantedBy: preparerId } });
      await db.roleGrant.create({ data: { userId: reviewerId, capability: 'FIELDWORK_FINALIZE', firmId, clientId, engagementId, grantedBy: preparerId } });

      const stageAndProcess = async (filename: string, csv: string) => {
        const batch = await upload(engagementId, preparerId, { filename, csv }) as { id: string };
        const event = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId: batch.id } });
        await processImport({ id: event.operationId, data: { outboxEventId: event.id, operationId: event.operationId, payloadVersion: 1 }, attemptsMade: 0, opts: { attempts: 3 } } as never);
        return batch.id;
      };
      // Maps every row, in contract-sized batches, to a contract FSLI. The mapping itself is not under test here.
      const mapEverything = async (importId: string) => {
        const rows = await db.tbRow.findMany({ where: { importId }, orderBy: { position: 'asc' }, select: { id: true, version: true } });
        for (let offset = 0; offset < rows.length; offset += 500) {
          await mapBatch(engagementId, importId, preparerId, {
            idempotencyKey: randomUUID(),
            changes: rows.slice(offset, offset + 500).map((row, index) => ({ rowId: row.id, expectedVersion: row.version, fsli: fslis[(offset + index) % fslis.length] as never })),
          });
        }
        return (await db.tbImport.findUniqueOrThrow({ where: { id: importId } })).version;
      };

      // AC3: the golden 5,000-row fixture's normalized totals reconcile with its manifest.
      const manifest = JSON.parse(readFileSync(resolve('fixtures/trial-balance/generated/manifest.json'), 'utf8'));
      const golden = manifest.datasets.find((item: { filename: string }) => item.filename === 'balance-5000.csv');
      const goldenImport = await stageAndProcess('balance-5000.csv', readFileSync(resolve('fixtures/trial-balance/generated/balance-5000.csv'), 'utf8'));
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: goldenImport } })).rowCount, golden.rows);
      const sumCurrent = async (where: object) => (await db.tbRow.aggregate({ where: { importId: goldenImport, ...where }, _sum: { current: true } }))._sum.current?.toFixed(2) ?? '0.00';
      const sumPrior = async (where: object) => (await db.tbRow.aggregate({ where: { importId: goldenImport, ...where }, _sum: { prior: true } }))._sum.prior?.toFixed(2) ?? '0.00';
      assert.equal(await sumCurrent({ current: { gte: 0 } }), golden.expectedCurrentDebits);
      assert.equal((-Number(await sumCurrent({ current: { lt: 0 } }))).toFixed(2), golden.expectedCurrentCredits);
      assert.equal(await sumPrior({ prior: { gte: 0 } }), golden.expectedPriorDebits);
      assert.equal((-Number(await sumPrior({ prior: { lt: 0 } }))).toFixed(2), golden.expectedPriorCredits);
      assert.equal(await sumCurrent({}), golden.expectedCurrentNet);
      assert.equal(await sumPrior({}), golden.expectedPriorNet);
      assert.equal(await db.tbRow.count({ where: { importId: goldenImport, current: { lt: 0 } } }), golden.negativeCurrentRows);
      assert.equal(await db.tbRow.count({ where: { importId: goldenImport, prior: { equals: 0 } } }), golden.zeroPriorRows);

      // AC1: an unbalanced import is staged and mapped, but it cannot finalize, and its status does not change.
      const unbalancedCsv = 'code,name,current,prior\n100,Cash,10.00,0.00\n200,Equity,-9.99,0.00\n';
      const unbalanced = await stageAndProcess('unbalanced.csv', unbalancedCsv);
      const unbalancedVersion = await mapEverything(unbalanced);
      const unmappedBefore = await statementSummary(engagementId, unbalanced);
      assert.equal(unmappedBefore.unmapped, null, 'every row is mapped before finalization is attempted');
      await assert.rejects(finalize(engagementId, unbalanced, reviewerId, { expectedVersion: unbalancedVersion }), (reason: unknown) => statusOf(reason) === 400 && /balance to zero/.test(String((reason as Error).message)));
      assert.equal((await db.tbImport.findUniqueOrThrow({ where: { id: unbalanced } })).status, 'MAPPING_REQUIRED', 'a rejected finalization leaves the batch editable');

      // AC2: the same account code in another batch is never merged into this one. The golden batch is unaffected.
      const goldenBefore = await statementSummary(engagementId, goldenImport);
      const sameCodeCsv = 'code,name,current,prior\n100,Cash in another batch,0.00,0.00\n';
      const sibling = await stageAndProcess('sibling.csv', sameCodeCsv);
      assert.equal(await db.tbRow.count({ where: { importId: sibling, code: '100' } }), 1);
      assert.deepEqual(await statementSummary(engagementId, goldenImport), goldenBefore, 'a batch sharing an account code is not merged into another batch');

      // Balanced data finalizes. The golden batch is mapped and finalized through the real gate.
      const goldenVersion = await mapEverything(goldenImport);
      assert.deepEqual(await finalize(engagementId, goldenImport, reviewerId, { expectedVersion: goldenVersion }), { status: 'FINALIZED' });

      console.log('T079 validation: unbalanced finalization blocked, golden totals reconciled to the manifest, and batches never merged on shared codes, verified on PostgreSQL 18.6');
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});
