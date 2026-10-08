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
const approverId = 'e6e6e6e6-e6e6-46e6-86e6-e6e6e6e6e6e6';
const capabilities = ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'FIELDWORK_FINALIZE', 'TB_PUBLISH', 'MAPPING_APPROVE', 'TAXONOMY_MANAGE', 'MATERIALITY_MANAGE', 'MATERIALITY_APPROVE'] as const;
const revenueAssessment = { benchmarkKind: 'REVENUE', ratePercent: '1', performancePercent: '75', trivialPercent: '5' };
const fsliOf: Record<string, string> = { '100': 'Cash and equivalents', '200': 'Trade payables', '300': 'Revenue', '400': 'Operating expenses' };

test('D18 supersession keeps one active finalized trial balance and invalidates the approvals that cite a superseded version', { timeout: 300_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_tb_supersession').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'local-s3', S3_BUCKET: 'evidence-tb-supersession' });
    const { db, upload, mapBatch, finalize, supersede, publishBalances, approveImportMapping, createTaxonomyVersion, approveTaxonomyVersion, calculateMaterialityAssessment, approveMaterialityAssessment, latestMaterialityAssessment, retrieveBytes } = await import('@auditsphere/server');
    const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
    const processImport = createTrialBalanceImportProcessor(async (document) => retrieveBytes(document.key));
    try {
      await db.firm.create({ data: { id: firmId, name: 'Supersession firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Supersession client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Supersession engagement', state: 'FIELDWORK_EXECUTION', period: 'FY2026' } });
      for (const [userId, email] of [[preparerId, 'supersession-preparer@example.test'], [approverId, 'supersession-approver@example.test']] as const) {
        await db.user.create({ data: { id: userId, email, role: 'APPROVER' } });
        await db.membership.create({ data: { userId, firmId, clientId, engagementId, role: 'APPROVER' } });
        for (const capability of capabilities) await db.roleGrant.create({ data: { userId, capability, firmId, clientId, engagementId, grantedBy: preparerId } });
      }

      const taxonomy = await createTaxonomyVersion(preparerId, engagementId, { name: 'STE-STATUTORY', lines: [
        { code: 'Revenue', label: 'Revenue', statementSection: 'INCOME', sortOrder: 1 },
        { code: 'Operating expenses', label: 'Operating expenses', statementSection: 'EXPENSE', sortOrder: 2 },
        { code: 'Cash and equivalents', label: 'Cash and equivalents', statementSection: 'ASSETS', sortOrder: 3 },
        { code: 'Trade payables', label: 'Trade payables', statementSection: 'LIABILITIES', sortOrder: 4 },
      ] }) as { id: string; version: number };
      await approveTaxonomyVersion(preparerId, engagementId, taxonomy.id, { expectedVersion: taxonomy.version });

      // Each version goes through the real staging, mapping and mapping-approval commands.
      const stage = async (filename: string, csv: string) => {
        const batch = await upload(engagementId, preparerId, { filename, csv }) as { id: string };
        const event = await db.outboxEvent.findFirstOrThrow({ where: { type: 'tb.import', importId: batch.id } });
        await processImport({ id: event.operationId, data: { outboxEventId: event.id, operationId: event.operationId, payloadVersion: 1 }, attemptsMade: 0, opts: { attempts: 3 } } as never);
        const rows = await db.tbRow.findMany({ where: { importId: batch.id }, orderBy: { position: 'asc' }, select: { id: true, version: true, code: true } });
        await mapBatch(engagementId, batch.id, preparerId, { idempotencyKey: randomUUID(), changes: rows.map((row) => ({ rowId: row.id, expectedVersion: row.version, fsli: fsliOf[row.code] as never })) });
        await approveImportMapping(preparerId, engagementId, batch.id, { expectedVersion: await versionOf(batch.id), idempotencyKey: randomUUID() });
        return batch.id;
      };
      const versionOf = async (importId: string) => (await db.tbImport.findUniqueOrThrow({ where: { id: importId } })).version;
      const statusOf = async (importId: string) => (await db.tbImport.findUniqueOrThrow({ where: { id: importId } })).status;
      const calculate = (actorId: string) => calculateMaterialityAssessment(actorId, engagementId, { ...revenueAssessment, idempotencyKey: randomUUID() }) as Promise<{ assessmentId: string }>;

      const first = await stage('first.csv', 'code,name,current,prior\n100,Cash,100.00,0.00\n200,Trade payables,-30.00,0.00\n300,Revenue,-90.00,0.00\n400,Operating expenses,20.00,0.00\n');
      const second = await stage('second.csv', 'code,name,current,prior\n100,Cash,50.00,0.00\n200,Trade payables,-20.00,0.00\n300,Revenue,-40.00,0.00\n400,Operating expenses,10.00,0.00\n');

      // AC1: one active finalized version. A second finalization is refused by the service and by the database.
      await finalize(engagementId, first, approverId, { expectedVersion: await versionOf(first) });
      await assert.rejects(finalize(engagementId, second, approverId, { expectedVersion: await versionOf(second) }), /supersede it explicitly/);
      await assert.rejects(db.tbImport.update({ where: { id: second }, data: { status: 'FINALIZED' } }));
      assert.equal(await statusOf(second), 'MAPPING_REQUIRED');

      // Publish the active version and approve a materiality assessment that cites it.
      await publishBalances(engagementId, preparerId, { importId: first, expectedVersion: await versionOf(first), idempotencyKey: randomUUID() });
      const calculatedFirst = await calculate(preparerId);
      await approveMaterialityAssessment(approverId, engagementId, calculatedFirst.assessmentId, { idempotencyKey: randomUUID() });

      // AC2: supersession is explicit and names the version. A stale version or a short reason is refused.
      await assert.rejects(supersede(engagementId, first, approverId, { expectedVersion: (await versionOf(first)) + 1, reason: 'Wrong expected version for the test' }), /Import changed/);
      await assert.rejects(supersede(engagementId, first, approverId, { expectedVersion: await versionOf(first), reason: 'short' }));

      // AC3: superseding invalidates the approval that cites the version, and the audit trail records it.
      const superseded = await supersede(engagementId, first, approverId, { expectedVersion: await versionOf(first), reason: 'Replaced by the corrected trial balance' });
      assert.deepEqual(superseded, { status: 'SUPERSEDED', invalidatedAssessments: 1 });
      assert.equal(await statusOf(first), 'SUPERSEDED');
      const invalidation = await db.materialityInvalidation.findUniqueOrThrow({ where: { assessmentId: calculatedFirst.assessmentId } });
      assert.equal(invalidation.supersededImportId, first);
      assert.equal((await db.materialityAssessment.findUniqueOrThrow({ where: { id: calculatedFirst.assessmentId } })).status, 'APPROVED');
      assert.equal((await latestMaterialityAssessment(engagementId)).invalidated, true);
      assert.equal(await db.auditEvent.count({ where: { engagementId, action: 'TB_SUPERSEDED' } }), 1);

      // AC4: a superseded version stays immutable, cannot be superseded again, and cannot carry new work.
      await assert.rejects(db.tbRow.updateMany({ where: { importId: first }, data: { fsli: 'Revenue' } }), /immutable/);
      await assert.rejects(supersede(engagementId, first, approverId, { expectedVersion: await versionOf(first), reason: 'Second supersession of the same version' }), /Only the active finalized trial balance/);
      await assert.rejects(calculate(preparerId), /superseded/);

      // The corrected version becomes the one active version once it is finalized and published.
      await finalize(engagementId, second, approverId, { expectedVersion: await versionOf(second) });
      const publishedSecond = await publishBalances(engagementId, preparerId, { importId: second, expectedVersion: await versionOf(second), idempotencyKey: randomUUID() }) as { sequence: number };
      assert.equal(publishedSecond.sequence, 2);
      const calculatedSecond = await calculate(preparerId);
      await approveMaterialityAssessment(approverId, engagementId, calculatedSecond.assessmentId, { idempotencyKey: randomUUID() });
      const latest = await latestMaterialityAssessment(engagementId);
      assert.equal(latest.invalidated, false);
      assert.equal(latest.stale, false);

      // AC5: a record cannot dismiss a live approval, and an existing record cannot be rewritten.
      await assert.rejects(db.materialityInvalidation.create({ data: { firmId, clientId, engagementId, assessmentId: calculatedSecond.assessmentId, supersededImportId: second, reason: 'Attempted dismissal of a live approval', invalidatedBy: approverId } }), /superseded trial balance/);
      await assert.rejects(db.materialityInvalidation.update({ where: { assessmentId: calculatedFirst.assessmentId }, data: { reason: 'Rewritten reason for the record' } }), /append-only/);

      console.log('one active trial balance enforced; supersession invalidated the cited approval and kept the superseded version immutable');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
