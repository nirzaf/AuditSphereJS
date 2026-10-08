import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a4a4';
const clientId = 'b5b5b5b5-b5b5-45b5-85b5-b5b5b5b5b5b5';
const engagementId = 'c6c6c6c6-c6c6-46c6-86c6-c6c6c6c6c6c6';
const managerId = 'd7d7d7d7-d7d7-47d7-87d7-d7d7d7d7d7d7';
const partnerId = 'e8e8e8e8-e8e8-48e8-88e8-e8e8e8e8e8e8';
const preparerId = '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a';
const documentId = 'ab0b0b0b-ab0b-40b0-80b0-b0b0b0b0b0b0';

test('risk colours follow the published balance against approved TE and PM, are append-only, and a red band needs current Partner clearance', { timeout: 240_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_risk').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, createRisk, assessRiskBand, clearRiskBand, assignRiskOwner, currentRisks, createTaxonomyVersion, approveTaxonomyVersion, approveImportMapping, publishBalances, supersede, calculateMaterialityAssessment, approveMaterialityAssessment } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Risk firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Risk client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Risk engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.createMany({ data: [
        { id: managerId, email: 'manager@example.test', role: 'REVIEWER' },
        { id: partnerId, email: 'partner@example.test', role: 'APPROVER' },
        { id: preparerId, email: 'calculator@example.test', role: 'APPROVER' },
      ] });
      await db.membership.createMany({ data: [
        { userId: managerId, firmId, clientId, engagementId, role: 'REVIEWER' },
        { userId: partnerId, firmId, clientId, engagementId, role: 'APPROVER' },
        { userId: preparerId, firmId, clientId, engagementId, role: 'APPROVER' },
      ] });
      for (const capability of ['ENGAGEMENT_READ', 'RISK_MANAGE'] as const) {
        await db.roleGrant.create({ data: { userId: managerId, capability, firmId, clientId, engagementId, grantedBy: managerId } });
      }
      for (const capability of ['ENGAGEMENT_READ', 'RISK_PARTNER_CLEAR', 'MATERIALITY_APPROVE'] as const) {
        await db.roleGrant.create({ data: { userId: partnerId, capability, firmId, clientId, engagementId, grantedBy: partnerId } });
      }
      // The preparer builds the balance chain and calculates materiality (the same grants as the materiality test).
      for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'FIELDWORK_FINALIZE', 'TB_PUBLISH', 'MAPPING_APPROVE', 'TAXONOMY_MANAGE', 'MATERIALITY_MANAGE'] as const) {
        await db.roleGrant.create({ data: { userId: preparerId, capability, firmId, clientId, engagementId, grantedBy: preparerId } });
      }
      await db.document.create({ data: { id: documentId, engagementId, key: 'risk/balances.csv', sha256: 'f'.repeat(64), filename: 'balances.csv' } });

      // Capability is required to create and assess.
      await assert.rejects(createRisk(partnerId, engagementId, { title: 'Revenue recognition' }), /not granted/i);
      const risk = await createRisk(managerId, engagementId, { title: 'Revenue recognition', description: 'Cut-off risk around year end' }) as { riskId: string; currentBand: string | null };
      assert.equal(risk.currentBand, null);

      // Without an approved materiality there is no tolerable error to stratify against.
      await assert.rejects(assessRiskBand(managerId, engagementId, risk.riskId, { accountCode: '1000', significant: false, fraudRisk: false }), /Approve materiality/);

      const taxonomy = await createTaxonomyVersion(preparerId, engagementId, { name: 'RISK-STATUTORY', lines: [
        { code: 'Revenue', label: 'Revenue', statementSection: 'INCOME', sortOrder: 1 },
        { code: 'Operating expenses', label: 'Operating expenses', statementSection: 'EXPENSE', sortOrder: 2 },
        { code: 'Corporate tax', label: 'Corporate tax', statementSection: 'EXPENSE', sortOrder: 3 },
        { code: 'Cash and equivalents', label: 'Cash and equivalents', statementSection: 'ASSETS', sortOrder: 4 },
        { code: 'Trade payables', label: 'Trade payables', statementSection: 'LIABILITIES', sortOrder: 5 },
      ] }) as { id: string; version: number };
      await approveTaxonomyVersion(preparerId, engagementId, taxonomy.id, { expectedVersion: taxonomy.version });

      const importIdFor = (sequence: number) => `20000000-0000-4000-8000-0000000000${String(sequence).padStart(2, '0')}`;
      const publishBalanceVersion = async (sequence: number, rows: Array<{ code: string; name: string; fsli: string; current: string }>) => {
        const importId = importIdFor(sequence);
        await db.tbImport.create({ data: { id: importId, firmId, clientId, engagementId, documentId, sha256: String(sequence + 4).repeat(64).slice(0, 64), status: 'MAPPING_REQUIRED' } });
        await db.tbRow.createMany({ data: rows.map((row, position) => ({ importId, position, code: row.code, name: row.name, fsli: row.fsli, current: row.current, prior: '0.000000' })) });
        const batch = await db.tbImport.findUniqueOrThrow({ where: { id: importId } });
        await approveImportMapping(preparerId, engagementId, importId, { expectedVersion: batch.version, idempotencyKey: randomUUID() });
        // D18: one active finalized version; the earlier version is superseded explicitly before the next is finalized.
        if (sequence > 1) await supersede(engagementId, importIdFor(sequence - 1), preparerId, { expectedVersion: 2, reason: 'Superseded by the next accepted trial balance (DN-06)' });
        await db.tbImport.update({ where: { id: importId }, data: { status: 'FINALIZED', version: 2 } });
        return await publishBalances(engagementId, preparerId, { importId, expectedVersion: 2, idempotencyKey: randomUUID() }) as { publicationId: string; sequence: number };
      };

      // Revenue of 2,000,000 at 1 % gives PM 20,000 and TE 15,000 (75 % of PM). The balances sit on the boundaries:
      // cash is just below TE, payables equal TE, and corporate tax equals PM. The rows sum to zero.
      const published = await publishBalanceVersion(1, [
        { code: '4000', name: 'Revenue', fsli: 'Revenue', current: '-2000000.000000' },
        { code: '5000', name: 'Operating expenses', fsli: 'Operating expenses', current: '1980000.000001' },
        { code: '5100', name: 'Corporate tax', fsli: 'Corporate tax', current: '20000.000000' },
        { code: '1000', name: 'Cash', fsli: 'Cash and equivalents', current: '14999.999999' },
        { code: '2000', name: 'Payables', fsli: 'Trade payables', current: '-15000.000000' },
      ]);
      assert.equal(published.sequence, 1);

      const calculated = await calculateMaterialityAssessment(preparerId, engagementId, { benchmarkKind: 'REVENUE', ratePercent: '1', performancePercent: '75', trivialPercent: '5', idempotencyKey: randomUUID() }) as { assessmentId: string; planningMateriality: string; tolerableError: string };
      assert.equal(calculated.planningMateriality, '20000.000000');
      assert.equal(calculated.tolerableError, '15000.000000');
      await approveMaterialityAssessment(partnerId, engagementId, calculated.assessmentId, { idempotencyKey: randomUUID() });

      // The colour is validated before anything is stored, and the account must exist in the published balances.
      await assert.rejects(assessRiskBand(managerId, engagementId, risk.riskId, { accountCode: '', significant: false, fraudRisk: false }));
      await assert.rejects(assessRiskBand(managerId, engagementId, risk.riskId, { accountCode: '1000', significant: false }));
      await assert.rejects(assessRiskBand(managerId, engagementId, risk.riskId, { accountCode: '9999', significant: false, fraudRisk: false }), /not in the published trial balance/);

      // CURRENT section 4 on the absolute balance: GREEN below TE, AMBER from TE, RED from PM (D05 boundaries).
      const green = await assessRiskBand(managerId, engagementId, risk.riskId, { accountCode: '1000', significant: false, fraudRisk: false }) as { assessmentId: string; band: string; absoluteBalance: string; tolerableError: string; planningMateriality: string; ruleVersion: string; requiresPartnerClearance: boolean };
      assert.equal(green.band, 'GREEN');
      assert.equal(green.absoluteBalance, '14999.999999');
      assert.equal(green.tolerableError, '15000.000000');
      assert.equal(green.planningMateriality, '20000.000000');
      assert.equal(green.ruleVersion, 'STE-RISK-BAND-2026.2');
      assert.equal(green.requiresPartnerClearance, false);
      const amber = await assessRiskBand(managerId, engagementId, risk.riskId, { accountCode: '2000', significant: false, fraudRisk: false }) as { band: string; absoluteBalance: string };
      assert.equal(amber.band, 'AMBER', 'a credit balance equal to TE is amber');
      assert.equal(amber.absoluteBalance, '15000.000000', 'the sign is ignored');
      const significant = await assessRiskBand(managerId, engagementId, risk.riskId, { accountCode: '1000', significant: true, fraudRisk: false }) as { band: string };
      assert.equal(significant.band, 'RED', 'a significant estimate is red regardless of amount');
      const red = await assessRiskBand(managerId, engagementId, risk.riskId, { accountCode: '5100', significant: false, fraudRisk: false }) as { assessmentId: string; band: string; requiresPartnerClearance: boolean };
      assert.equal(red.band, 'RED', 'a balance equal to PM is red');
      assert.equal(red.requiresPartnerClearance, true);

      // The database independently rejects a band that does not follow from the stored balances, and a row without its inputs.
      await assert.rejects(db.$executeRaw`INSERT INTO "RiskBandAssessment" (id,"riskId","accountCode","absoluteBalance","tolerableError","planningMateriality","materialityAssessmentId",significant,"fraudRisk",band,"ruleVersion","assessedBy") VALUES (gen_random_uuid(), ${risk.riskId}::uuid, '1000', '14999.999999'::numeric, '15000.000000'::numeric, '20000.000000'::numeric, ${calculated.assessmentId}::uuid, false, false, 'RED', 'STE-RISK-BAND-2026.2', ${managerId}::uuid)`, /risk_band_derivation_check/);
      await assert.rejects(db.$executeRaw`INSERT INTO "RiskBandAssessment" (id,"riskId",significant,"fraudRisk",band,"ruleVersion","assessedBy") VALUES (gen_random_uuid(), ${risk.riskId}::uuid, false, false, 'GREEN', 'STE-RISK-BAND-2026.2', ${managerId}::uuid)`, /risk_band_colour_inputs_check/);

      // Clearance needs the Partner capability and a red, current assessment.
      await assert.rejects(clearRiskBand(managerId, engagementId, red.assessmentId, { note: 'Reviewed' }), /not granted/i);
      await assert.rejects(clearRiskBand(partnerId, engagementId, green.assessmentId, { note: 'Reviewed' }), /only to a red band/);
      const clearance = await clearRiskBand(partnerId, engagementId, red.assessmentId, { note: 'Reviewed with the engagement partner' }) as { clearanceId: string };
      assert.ok(clearance.clearanceId);
      await assert.rejects(clearRiskBand(partnerId, engagementId, red.assessmentId, { note: 'Again' }), /already cleared/);

      // Owner assignment is constrained by the band's minimum rank and by segregation of duties.
      await assert.rejects(assignRiskOwner(managerId, engagementId, risk.riskId, { ownerUserId: partnerId, ownerStaffingLevel: 'StaffAssociate' }), /needs an owner at rank 3/);
      await assert.rejects(assignRiskOwner(managerId, engagementId, risk.riskId, { ownerUserId: managerId, ownerStaffingLevel: 'AuditManager' }), /cannot assign a risk to themselves/);
      const assignment = await assignRiskOwner(managerId, engagementId, risk.riskId, { ownerUserId: partnerId, ownerStaffingLevel: 'AuditManager' }) as { assignmentId: string; band: string };
      assert.equal(assignment.band, 'RED');
      // The database independently enforces the minimum rank.
      await assert.rejects(db.$executeRaw`INSERT INTO "RiskOwnerAssignment" (id,"riskId","assessmentId","ownerUserId","ownerStaffingLevel","assignedBy") VALUES (gen_random_uuid(), ${risk.riskId}::uuid, ${red.assessmentId}::uuid, ${partnerId}::uuid, 'StaffAssociate', ${managerId}::uuid)`, /needs an owner at rank/);

      let risks = await currentRisks(engagementId);
      assert.equal(risks.length, 1);
      assert.equal(risks[0].currentBand, 'RED');
      assert.equal(risks[0].cleared, true);
      assert.equal(risks[0].assessmentCount, 4);

      // A valid assessment from another risk cannot be attached to this risk's assignment.
      const unrelatedRisk = await createRisk(managerId, engagementId, { title: 'Inventory valuation' }) as { riskId: string };
      const unrelatedBand = await assessRiskBand(managerId, engagementId, unrelatedRisk.riskId, { accountCode: '1000', significant: false, fraudRisk: false }) as { assessmentId: string };
      await assert.rejects(db.$executeRaw`INSERT INTO "RiskOwnerAssignment" (id,"riskId","assessmentId","ownerUserId","ownerStaffingLevel","assignedBy") VALUES (gen_random_uuid(), ${risk.riskId}::uuid, ${unrelatedBand.assessmentId}::uuid, ${partnerId}::uuid, 'StaffAssociate', ${managerId}::uuid)`, /RiskOwnerAssignment_assessmentId_riskId_fkey/);

      // A newer assessment supersedes the cleared one; the old clearance cannot clear the new band.
      const latest = await assessRiskBand(managerId, engagementId, risk.riskId, { accountCode: '1000', significant: false, fraudRisk: false }) as { assessmentId: string; band: string };
      assert.equal(latest.band, 'GREEN');
      risks = await currentRisks(engagementId);
      assert.equal(risks[0].currentBand, 'GREEN');
      assert.equal(risks[0].cleared, false, 'the superseded clearance does not clear the current band');
      assert.equal(risks[0].owner, null, 'the assignment bound the superseded assessment, not the current one');
      await assert.rejects(clearRiskBand(partnerId, engagementId, red.assessmentId, { note: 'Stale' }), /supersedes/);

      // A newer accepted balance version makes the approved materiality stale (or invalidated): risk colours are refused until it is recalculated.
      await publishBalanceVersion(2, [
        { code: '4000', name: 'Revenue', fsli: 'Revenue', current: '-2000000.000000' },
        { code: '5000', name: 'Operating expenses', fsli: 'Operating expenses', current: '1980000.000001' },
        { code: '5100', name: 'Corporate tax', fsli: 'Corporate tax', current: '20000.000000' },
        { code: '1000', name: 'Cash', fsli: 'Cash and equivalents', current: '14999.999999' },
        { code: '2000', name: 'Payables', fsli: 'Trade payables', current: '-15000.000000' },
      ]);
      await assert.rejects(assessRiskBand(managerId, engagementId, risk.riskId, { accountCode: '1000', significant: false, fraudRisk: false }), /stale|invalidated/);

      // Assessments and clearances are append-only.
      await assert.rejects(db.$executeRaw`UPDATE "RiskBandAssessment" SET band = 'GREEN' WHERE id = ${red.assessmentId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`DELETE FROM "RiskBandAssessment" WHERE id = ${red.assessmentId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`UPDATE "RiskPartnerClearance" SET note = 'changed' WHERE id = ${clearance.clearanceId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`UPDATE "RiskOwnerAssignment" SET "ownerStaffingLevel" = 'EngagementPartner' WHERE id = ${assignment.assignmentId}::uuid`, /append-only/);

      console.log('risk colours follow the published balance against approved TE and PM, are append-only, and red bands require current Partner clearance');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
