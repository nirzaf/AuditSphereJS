import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a7a7a7a7-a7a7-47a7-87a7-a7a7a7a7a7a7';
const clientId = 'b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8';
const engagementId = 'c9c9c9c9-c9c9-49c9-89c9-c9c9c9c9c9c9';
const documentId = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1';
const preparerId = 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2';
const partnerId = 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f3f3';

test('materiality assessments bind a published version, enforce segregation of duties and go stale', { timeout: 180_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_materiality').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, createTaxonomyVersion, approveTaxonomyVersion, approveImportMapping, publishBalances, supersede, calculateMaterialityAssessment, approveMaterialityAssessment, latestMaterialityAssessment } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Materiality firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Materiality client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Materiality engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.createMany({ data: [{ id: preparerId, email: 'approver-calculator@example.test', role: 'APPROVER' }, { id: partnerId, email: 'independent-partner@example.test', role: 'APPROVER' }] });
      await db.membership.createMany({ data: [
        { userId: preparerId, firmId, clientId, engagementId, role: 'APPROVER' },
        { userId: partnerId, firmId, clientId, engagementId, role: 'APPROVER' },
      ] });
      for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'FIELDWORK_FINALIZE', 'TB_PUBLISH', 'MAPPING_APPROVE', 'TAXONOMY_MANAGE', 'MATERIALITY_MANAGE', 'MATERIALITY_APPROVE'] as const) {
        await db.roleGrant.create({ data: { userId: preparerId, capability, firmId, clientId, engagementId, grantedBy: preparerId } });
      }
      for (const capability of ['ENGAGEMENT_READ', 'MATERIALITY_APPROVE'] as const) {
        await db.roleGrant.create({ data: { userId: partnerId, capability, firmId, clientId, engagementId, grantedBy: partnerId } });
      }
      await db.document.create({ data: { id: documentId, engagementId, key: 'materiality/dataset.csv', sha256: 'e'.repeat(64), filename: 'dataset.csv' } });

      const taxonomy = await createTaxonomyVersion(preparerId, engagementId, { name: 'STE-STATUTORY', lines: [
        { code: 'Revenue', label: 'Revenue', statementSection: 'INCOME', sortOrder: 1 },
        { code: 'Operating expenses', label: 'Operating expenses', statementSection: 'EXPENSE', sortOrder: 2 },
        { code: 'Corporate tax', label: 'Corporate tax', statementSection: 'EXPENSE', sortOrder: 3 },
        { code: 'Cash and equivalents', label: 'Cash and equivalents', statementSection: 'ASSETS', sortOrder: 4 },
        { code: 'Trade payables', label: 'Trade payables', statementSection: 'LIABILITIES', sortOrder: 5 },
      ] }) as { id: string; version: number };
      await approveTaxonomyVersion(preparerId, engagementId, taxonomy.id, { expectedVersion: taxonomy.version });

      const importIdFor = (sequence: number) => `20000000-0000-4000-8000-0000000000${String(sequence).padStart(2, '0')}`;
      const makePublished = async (sequence: number, revenue: string, expenses: string, cash: string, payables: string) => {
        const importId = importIdFor(sequence);
        await db.tbImport.create({ data: { id: importId, firmId, clientId, engagementId, documentId, sha256: String(sequence + 4).repeat(64).slice(0, 64), status: 'MAPPING_REQUIRED' } });
        await db.tbRow.createMany({ data: [
          { importId, position: 0, code: '4000', name: 'Revenue', fsli: 'Revenue', current: revenue, prior: '0.000000' },
          { importId, position: 1, code: '5000', name: 'Operating expenses', fsli: 'Operating expenses', current: expenses, prior: '0.000000' },
          { importId, position: 2, code: '5100', name: 'Corporate tax', fsli: 'Corporate tax', current: '50000.000000', prior: '0.000000' },
          { importId, position: 3, code: '1000', name: 'Cash', fsli: 'Cash and equivalents', current: cash, prior: '0.000000' },
          { importId, position: 4, code: '2000', name: 'Payables', fsli: 'Trade payables', current: payables, prior: '0.000000' },
        ] });
        const batch = await db.tbImport.findUniqueOrThrow({ where: { id: importId } });
        await approveImportMapping(preparerId, engagementId, importId, { expectedVersion: batch.version, idempotencyKey: randomUUID() });
        // D18: one active finalized version; the earlier version is superseded explicitly before the next one is finalized.
        if (sequence > 1) await supersede(engagementId, importIdFor(sequence - 1), preparerId, { expectedVersion: 2, reason: 'Superseded by the next accepted trial balance (DN-06)' });
        await db.tbImport.update({ where: { id: importId }, data: { status: 'FINALIZED', version: 2 } });
        const publication = await publishBalances(engagementId, preparerId, { importId, expectedVersion: 2, idempotencyKey: randomUUID() }) as { publicationId: string; sequence: number };
        return publication;
      };

      // No published version means no materiality.
      await assert.rejects(calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'REVENUE', ratePercent: '1', performancePercent: '75', trivialPercent: '5', idempotencyKey: randomUUID() }), /Publish an accepted balance version/);

      const first = await makePublished(1, '-2000000.000000', '1450000.000000', '1000000.000000', '-500000.000000');
      assert.equal(first.sequence, 1);

      // Materiality lineage cannot cross to a publication in another engagement or a taxonomy from another firm.
      const otherEngagementId = randomUUID();
      const otherDocumentId = randomUUID();
      await db.engagement.create({ data: { id: otherEngagementId, firmId, clientId, name: 'Other materiality engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.document.create({ data: { id: otherDocumentId, engagementId: otherEngagementId, key: `materiality/${otherDocumentId}.csv`, sha256: '8'.repeat(64), filename: 'other.csv' } });
      const otherImportId = randomUUID();
      await db.tbImport.create({ data: { id: otherImportId, firmId, clientId, engagementId: otherEngagementId, documentId: otherDocumentId, sha256: 'f'.repeat(64), status: 'FINALIZED' } });
      const otherPublication = await db.balancePublication.create({ data: { firmId, clientId, engagementId: otherEngagementId, importId: otherImportId, sequence: 1, currency: 'QAR', rowCount: 1, digest: 'a'.repeat(64), publishedBy: preparerId } });
      const otherFirmId = randomUUID();
      await db.firm.create({ data: { id: otherFirmId, name: 'Other taxonomy firm' } });
      const otherTaxonomy = await db.taxonomyVersion.create({ data: { firmId: otherFirmId, name: 'OTHER', version: 1, createdBy: preparerId } });
      const invalidLineageInsert = (publicationId: string, taxonomyVersionId: string) => db.$executeRaw`INSERT INTO "MaterialityAssessment" (id,"firmId","clientId","engagementId","publicationId","taxonomyVersionId","benchmarkKind","sourceLineCount",currency,"benchmarkAmount","planningMateriality","tolerableError","sadThreshold","ratePercent","performancePercent","trivialPercent","policyVersion","inputHash","calculatedBy") VALUES (gen_random_uuid(), ${firmId}::uuid, ${clientId}::uuid, ${engagementId}::uuid, ${publicationId}::uuid, ${taxonomyVersionId}::uuid, 'REVENUE', 1, 'QAR', 1, 1, 1, 1, 1, 75, 5, 'test-v1', ${'b'.repeat(64)}, ${preparerId}::uuid)`;
      await assert.rejects(invalidLineageInsert(otherPublication.id, taxonomy.id), /MaterialityAssessment_publication_scope_fkey/);
      await assert.rejects(invalidLineageInsert(first.publicationId, otherTaxonomy.id), /MaterialityAssessment_taxonomy_scope_fkey/);

      const calculated = await calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'REVENUE', ratePercent: '1', performancePercent: '75', trivialPercent: '5', idempotencyKey: randomUUID() }) as { assessmentId: string; planningMateriality: string; tolerableError: string; sadThreshold: string; benchmarkAmount: string; inputHash: string };
      assert.equal(calculated.benchmarkAmount, '2000000.000000');
      assert.equal(calculated.planningMateriality, '20000.000000');
      assert.equal(calculated.tolerableError, '15000.000000');
      assert.equal(calculated.sadThreshold, '1000.000000');
      assert.match(calculated.inputHash, /^[0-9a-f]{64}$/);

      // A user without the capability cannot calculate.
      await assert.rejects(calculateMaterialityAssessment(partnerId, engagementId, { benchmarkKind: 'REVENUE', ratePercent: '1', performancePercent: '75', trivialPercent: '5', idempotencyKey: randomUUID() }), /not granted/i);
      // Out-of-policy rates are rejected.
      await assert.rejects(calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'REVENUE', ratePercent: '5', performancePercent: '75', trivialPercent: '5', idempotencyKey: randomUUID() }), /must be between/);
      // The calculator cannot approve their own assessment.
      await assert.rejects(approveMaterialityAssessment(preparerId, engagementId, calculated.assessmentId, { idempotencyKey: randomUUID() }), /cannot approve their own/);

      // A newer accepted balance version makes the pending assessment stale.
      const second = await makePublished(2, '-3000000.000000', '2000000.000000', '1200000.000000', '-250000.000000');
      assert.equal(second.sequence, 2);
      assert.equal((await latestMaterialityAssessment(engagementId)).stale, true);
      await assert.rejects(approveMaterialityAssessment(partnerId, engagementId, calculated.assessmentId, { idempotencyKey: randomUUID() }), /newer accepted balance version/);

      const recalculated = await calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'REVENUE', ratePercent: '1', performancePercent: '75', trivialPercent: '5', idempotencyKey: randomUUID() }) as { assessmentId: string; planningMateriality: string };
      assert.equal(recalculated.planningMateriality, '30000.000000');
      const approved = await approveMaterialityAssessment(partnerId, engagementId, recalculated.assessmentId, { idempotencyKey: randomUUID() }) as { status: string };
      assert.equal(approved.status, 'APPROVED');
      const latest = await latestMaterialityAssessment(engagementId);
      assert.equal(latest.stale, false);
      assert.equal(latest.status, 'APPROVED');
      assert.equal(latest.currentPublicationId, second.publicationId);

      // D19: profit before tax is normalized only through a recorded adjustment approved by someone else,
      // and manager rounding stays within plus or minus 5 %. Profit before tax on the second version is 1,000,000.
      const noAuthorityId = randomUUID();
      await db.user.create({ data: { id: noAuthorityId, email: 'no-authority@example.test', role: 'APPROVER' } });
      const adjustment = { description: 'One-off legal settlement', amount: '100000', reason: 'Settled dispute, not expected to recur', approvedBy: partnerId };
      const normalized = await calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'PROFIT_BEFORE_TAX', ratePercent: '5', performancePercent: '75', trivialPercent: '3', roundedPlanningMateriality: '57500', normalizationAdjustments: [adjustment], idempotencyKey: randomUUID() }) as { assessmentId: string; benchmarkAmount: string; rawPlanningMateriality: string; planningMateriality: string; tolerableError: string; sadThreshold: string };
      assert.equal(normalized.benchmarkAmount, '1100000.000000');
      assert.equal(normalized.rawPlanningMateriality, '55000.000000');
      assert.equal(normalized.planningMateriality, '57500.000000');
      assert.equal(normalized.tolerableError, '43125.000000');
      assert.equal(normalized.sadThreshold, '1725.000000');
      const storedNormalized = await db.materialityAssessment.findUniqueOrThrow({ where: { id: normalized.assessmentId } });
      assert.equal((storedNormalized.normalizationAdjustments as Array<{ approvedBy: string }>)[0].approvedBy, partnerId);
      await assert.rejects(calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'PROFIT_BEFORE_TAX', ratePercent: '5', performancePercent: '75', trivialPercent: '3', normalizationAdjustments: [{ ...adjustment, approvedBy: preparerId }], idempotencyKey: randomUUID() }), /cannot approve the adjustment/);
      await assert.rejects(calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'PROFIT_BEFORE_TAX', ratePercent: '5', performancePercent: '75', trivialPercent: '3', normalizationAdjustments: [{ ...adjustment, approvedBy: noAuthorityId }], idempotencyKey: randomUUID() }), /does not hold materiality approval authority/);
      await assert.rejects(calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'REVENUE', ratePercent: '1', performancePercent: '75', trivialPercent: '5', normalizationAdjustments: [adjustment], idempotencyKey: randomUUID() }), /Only profit before tax/);
      await assert.rejects(calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'PROFIT_BEFORE_TAX', ratePercent: '5', performancePercent: '75', trivialPercent: '3', roundedPlanningMateriality: '60000', idempotencyKey: randomUUID() }), /at most 5.000000%/);
      await assert.rejects(calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'TOTAL_EXPENSES', ratePercent: '1', performancePercent: '75', trivialPercent: '5', idempotencyKey: randomUUID() }));
      // The database enforces the same rules for any writer, not only this service.
      const constrained = { firmId, clientId, engagementId, publicationId: second.publicationId, taxonomyVersionId: taxonomy.id, benchmarkKind: 'REVENUE', sourceLineCount: 1, currency: 'QAR', benchmarkAmount: '2000000.000000', planningMateriality: '30000.000000', tolerableError: '15000.000000', sadThreshold: '1000.000000', ratePercent: '1.000000', performancePercent: '75.000000', trivialPercent: '5.000000', policyVersion: 'STE-MATERIALITY-2026.2', inputHash: 'b'.repeat(64), calculatedBy: preparerId };
      await assert.rejects(db.materialityAssessment.create({ data: { ...constrained, rawPlanningMateriality: '20000.000000' } }), /materiality_rounding_check/);
      await assert.rejects(db.materialityAssessment.create({ data: { ...constrained, rawPlanningMateriality: null, normalizationAdjustments: [adjustment] } }), /materiality_normalization_check/);

      // An approved assessment is frozen; assessments are never deleted.
      await assert.rejects(db.$executeRaw`UPDATE "MaterialityAssessment" SET "planningMateriality" = 1 WHERE id = ${recalculated.assessmentId}::uuid`, /immutable/);
      await assert.rejects(db.$executeRaw`DELETE FROM "MaterialityAssessment" WHERE id = ${recalculated.assessmentId}::uuid`, /append-only/);

      console.log('materiality bound to a published version, SoD enforced and staleness detected');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
