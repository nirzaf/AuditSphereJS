import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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

test('risk bands are derived, append-only, and a red band needs current Partner clearance', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_risk').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, createRisk, assessRiskBand, clearRiskBand, assignRiskOwner, currentRisks } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Risk firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Risk client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Risk engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.createMany({ data: [{ id: managerId, email: 'manager@example.test', role: 'REVIEWER' }, { id: partnerId, email: 'partner@example.test', role: 'APPROVER' }] });
      for (const capability of ['ENGAGEMENT_READ', 'RISK_MANAGE'] as const) {
        await db.roleGrant.create({ data: { userId: managerId, capability, firmId, clientId, engagementId, grantedBy: managerId } });
      }
      for (const capability of ['ENGAGEMENT_READ', 'RISK_PARTNER_CLEAR'] as const) {
        await db.roleGrant.create({ data: { userId: partnerId, capability, firmId, clientId, engagementId, grantedBy: partnerId } });
      }

      // Capability is required to create and assess.
      await assert.rejects(createRisk(partnerId, engagementId, { title: 'Revenue recognition' }), /not granted/i);
      const risk = await createRisk(managerId, engagementId, { title: 'Revenue recognition', description: 'Cut-off risk around year end' }) as { riskId: string; currentBand: string | null };
      assert.equal(risk.currentBand, null);

      // The band follows from the scores; invalid scores fail before persistence. Nest reports the
      // Zod issues in the response body, so the assertion is on rejection rather than a message.
      await assert.rejects(assessRiskBand(managerId, engagementId, risk.riskId, { likelihood: 0, magnitude: 2, significant: false, fraudRisk: false }));
      await assert.rejects(assessRiskBand(managerId, engagementId, risk.riskId, { likelihood: 4, magnitude: 1, significant: false, fraudRisk: false }));
      await assert.rejects(assessRiskBand(managerId, engagementId, risk.riskId, { likelihood: 4, magnitude: 1, significant: false, fraudRisk: false }), /Bad Request/);

      const green = await assessRiskBand(managerId, engagementId, risk.riskId, { likelihood: 1, magnitude: 2, significant: false, fraudRisk: false }) as { assessmentId: string; band: string; requiresPartnerClearance: boolean };
      assert.equal(green.band, 'GREEN');
      assert.equal(green.requiresPartnerClearance, false);
      const amber = await assessRiskBand(managerId, engagementId, risk.riskId, { likelihood: 2, magnitude: 2, significant: false, fraudRisk: false }) as { band: string };
      assert.equal(amber.band, 'AMBER');
      const fraud = await assessRiskBand(managerId, engagementId, risk.riskId, { likelihood: 1, magnitude: 1, significant: false, fraudRisk: true }) as { band: string };
      assert.equal(fraud.band, 'RED', 'a fraud risk is always red');
      const red = await assessRiskBand(managerId, engagementId, risk.riskId, { likelihood: 2, magnitude: 3, significant: false, fraudRisk: false }) as { assessmentId: string; band: string; requiresPartnerClearance: boolean };
      assert.equal(red.band, 'RED');
      assert.equal(red.requiresPartnerClearance, true);

      // The database independently rejects a band that does not follow from its inputs.
      await assert.rejects(db.$executeRaw`INSERT INTO "RiskBandAssessment" (id,"riskId",likelihood,magnitude,significant,"fraudRisk",band,"ruleVersion","assessedBy") VALUES (gen_random_uuid(), ${risk.riskId}::uuid, 1, 1, false, false, 'RED', 'x', ${managerId}::uuid)`, /risk_band_derivation_check/);

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
      const unrelatedBand = await assessRiskBand(managerId, engagementId, unrelatedRisk.riskId, { likelihood: 1, magnitude: 1, significant: false, fraudRisk: false }) as { assessmentId: string };
      await assert.rejects(db.$executeRaw`INSERT INTO "RiskOwnerAssignment" (id,"riskId","assessmentId","ownerUserId","ownerStaffingLevel","assignedBy") VALUES (gen_random_uuid(), ${risk.riskId}::uuid, ${unrelatedBand.assessmentId}::uuid, ${partnerId}::uuid, 'StaffAssociate', ${managerId}::uuid)`, /RiskOwnerAssignment_assessmentId_riskId_fkey/);

      // A newer assessment supersedes the cleared one; the old clearance cannot clear the new band.
      const latest = await assessRiskBand(managerId, engagementId, risk.riskId, { likelihood: 1, magnitude: 1, significant: false, fraudRisk: false }) as { assessmentId: string; band: string };
      assert.equal(latest.band, 'GREEN');
      risks = await currentRisks(engagementId);
      assert.equal(risks[0].currentBand, 'GREEN');
      assert.equal(risks[0].cleared, false, 'the superseded clearance does not clear the current band');
      assert.equal(risks[0].owner, null, 'the assignment bound the superseded assessment, not the current one');
      await assert.rejects(clearRiskBand(partnerId, engagementId, red.assessmentId, { note: 'Stale' }), /supersedes/);

      // Assessments and clearances are append-only.
      await assert.rejects(db.$executeRaw`UPDATE "RiskBandAssessment" SET band = 'GREEN' WHERE id = ${red.assessmentId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`DELETE FROM "RiskBandAssessment" WHERE id = ${red.assessmentId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`UPDATE "RiskPartnerClearance" SET note = 'changed' WHERE id = ${clearance.clearanceId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`UPDATE "RiskOwnerAssignment" SET "ownerStaffingLevel" = 'EngagementPartner' WHERE id = ${assignment.assignmentId}::uuid`, /append-only/);

      console.log('risk bands derived and append-only, red bands require current Partner clearance');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
