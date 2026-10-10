import { acceptPresentedProposalFixture } from './factories/proposal-client.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const key = () => randomUUID();
type CommandResult = { id: string; status?: string; reviewVersion?: number; templateVersion?: string; readiness?: { commercial: { ready: boolean }; planning: { ready: boolean }; fieldwork: { ready: boolean } } };
const asRecord = (value: unknown): CommandResult => { assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'command returned no record'); return value as CommandResult; };

test('the acceptance questionnaire feeds Key 2 with versioned, segregated, stale-proof clearances', { timeout: 240_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('acceptance').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, createAcceptanceCase, recordAcceptanceAnswer, completeAcceptanceReview, clearAcceptanceCase, engagementIdentity, applyLifecycleCommand, createProposal, presentProposal, createEngagement } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), userId = randomUUID(), partnerId = randomUUID(), partner2Id = randomUUID();
      await db.user.createMany({ data: [
        { id: userId, email: 'accept@test.local', role: 'APPROVER' },
        { id: partnerId, email: 'accept-partner@test.local', role: 'APPROVER' },
        { id: partner2Id, email: 'accept-partner2@test.local', role: 'APPROVER' },
      ] });
      await db.firm.create({ data: { id: firmId, name: 'Acceptance firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Acceptance client' } });
      const makeEngagement = async (name: string) => {
        const engagementId = randomUUID();
        await db.engagement.create({ data: { id: engagementId, firmId, clientId, name, period: 'FY2025' } });
        await db.membership.createMany({ data: [
          { userId, firmId, clientId, engagementId, role: 'APPROVER' },
          { userId: partnerId, firmId, clientId, engagementId, role: 'APPROVER' },
          { userId: partner2Id, firmId, clientId, engagementId, role: 'APPROVER' },
        ] });
        return engagementId;
      };
      const lifecycle = async (engagementId: string, command: string, actor = partnerId) => {
        const engagement = await db.engagement.findUniqueOrThrow({ where: { id: engagementId }, select: { version: true } });
        return applyLifecycleCommand(engagementId, actor, { command, expectedVersion: engagement.version, idempotencyKey: key() });
      };
      const seedAnswers = async (engagementId: string) => {
        await recordAcceptanceAnswer(partnerId, engagementId, { idempotencyKey: key(), questionId: 'ubo', answer: 'Holding family office', evidenceRef: 'ubo-register.pdf' });
        await recordAcceptanceAnswer(partnerId, engagementId, { idempotencyKey: key(), questionId: 'aml', answer: 'Cleared', evidenceRef: 'aml-check.pdf' });
        await recordAcceptanceAnswer(partnerId, engagementId, { idempotencyKey: key(), questionId: 'integrity', answer: 'No adverse findings' });
        await recordAcceptanceAnswer(partnerId, engagementId, { idempotencyKey: key(), questionId: 'independence', answer: 'Confirmed', evidenceRef: 'independence.pdf' });
      };

      const engagementId = await makeEngagement('Acceptance engagement');
      await db.roleGrant.createMany({ data: [
        { userId, capability: 'COMMERCIAL_MANAGE', firmId, grantedBy: userId },
        { userId, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: userId },
        { userId: partnerId, capability: 'RISK_PARTNER_CLEAR', firmId, grantedBy: userId },
        { userId: partnerId, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: userId },
        { userId: partnerId, capability: 'COMMERCIAL_MANAGE', firmId, grantedBy: userId },
        { userId: partner2Id, capability: 'RISK_PARTNER_CLEAR', firmId, grantedBy: userId },
        { userId: partner2Id, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: userId },
      ] });

      // T056 AC1 — the track selects the versioned template; AC2 — missing answers are detected.
      const acceptanceCase = asRecord(await createAcceptanceCase(userId, engagementId, { idempotencyKey: key(), track: 'NEW_CLIENT' }));
      assert.equal(acceptanceCase.templateVersion, 'NC-1');
      await assert.rejects(completeAcceptanceReview(partnerId, engagementId), /Required answers are missing/);
      await seedAnswers(engagementId);
      const completed = asRecord(await completeAcceptanceReview(partnerId, engagementId));
      assert.equal(completed.status, 'REVIEW_COMPLETE');

      const proposal = asRecord(await createProposal(userId, engagementId, { idempotencyKey: key(), service: 'External statutory audit', periodStart: '2025-01-01', periodEnd: '2025-12-31', totalAmount: '80000.00' }));
      await lifecycle(engagementId, 'OPEN_PROPOSAL', userId);
      await presentProposal(userId, engagementId, proposal.id, { idempotencyKey: key(), expectedVersion: 1 });
      await lifecycle(engagementId, 'DISPATCH_PROPOSAL');
      await acceptPresentedProposalFixture(userId, engagementId, proposal.id);

      // T057 AC2 — the preparer of the review cannot self-clear.
      await assert.rejects(clearAcceptanceCase(partnerId, engagementId, { idempotencyKey: key(), reason: 'Self-clearing attempt with a full reason.' }), /cannot self-clear/);
      // T059 AC1 — the authorized partner clears the current version.
      const cleared = asRecord(await clearAcceptanceCase(partner2Id, engagementId, { idempotencyKey: key(), reason: 'ISA 220 acceptance reviewed on NC-1 with evidence.' }));
      assert.equal(cleared.reviewVersion, 1);

      // T057 AC3 / T059 AC3 — post-clearance edits bump the review version; the stale approval cannot clear the gate.
      await recordAcceptanceAnswer(partnerId, engagementId, { idempotencyKey: key(), questionId: 'integrity', answer: 'Adverse finding discovered; under review' });
      const caseAfterEdit = await db.acceptanceCase.findUniqueOrThrow({ where: { engagementId } });
      assert.equal(caseAfterEdit.reviewVersion, 2);
      assert.equal(caseAfterEdit.status, 'REVIEW_COMPLETE');
      await assert.rejects(lifecycle(engagementId, 'ISSUE_ENGAGEMENT_LETTER'), /Key 2 is stale/);
      await clearAcceptanceCase(partner2Id, engagementId, { idempotencyKey: key(), reason: 'Re-cleared on NC-1 after the adverse-finding review.' });
      await lifecycle(engagementId, 'ISSUE_ENGAGEMENT_LETTER');

      // T058 — the CONTINUANCE track on a second engagement: explicit prior-year data, no assumptions.
      const continuanceId = await makeEngagement('Continuance engagement');
      await createAcceptanceCase(userId, continuanceId, { idempotencyKey: key(), track: 'CONTINUANCE' });
      const continuanceCase = await db.acceptanceCase.findUniqueOrThrow({ where: { engagementId: continuanceId } });
      assert.equal(continuanceCase.templateVersion, 'CO-1');
      await assert.rejects(completeAcceptanceReview(partnerId, continuanceId), /Required answers are missing: priorFees/);
      await recordAcceptanceAnswer(partnerId, continuanceId, { idempotencyKey: key(), questionId: 'priorFees', answer: 'Settled in full', evidenceRef: 'receipt-2024.pdf' });
      await recordAcceptanceAnswer(partnerId, continuanceId, { idempotencyKey: key(), questionId: 'priorFeesOutstanding', answer: 'NONE' });
      await recordAcceptanceAnswer(partnerId, continuanceId, { idempotencyKey: key(), questionId: 'managementChanges', answer: 'No changes', evidenceRef: 'registry-extract.pdf' });
      await recordAcceptanceAnswer(partnerId, continuanceId, { idempotencyKey: key(), questionId: 'litigation', answer: 'None', evidenceRef: 'legal-search.pdf' });
      const answers = (await db.acceptanceCase.findUniqueOrThrow({ where: { engagementId: continuanceId } })).answers as Record<string, { answer: string }>;
      assert.equal(answers['priorFeesOutstanding'].answer, 'NONE', 'prior-year data is explicit, never assumed');

      // T059 AC2 — re-clearing the current version satisfies the gate; commercial reads the same record.
      await completeAcceptanceReview(partnerId, continuanceId);
      await clearAcceptanceCase(partner2Id, continuanceId, { idempotencyKey: key(), reason: 'Continuance reviewed on CO-1 with explicit prior-year data.' });
      const reclearedCase = await db.acceptanceCase.findUniqueOrThrow({ where: { engagementId: continuanceId } });
      assert.equal(reclearedCase.reviewVersion, 1);
      assert.equal(reclearedCase.status, 'CLEARED');
      const linkedClearance = await db.riskClearance.findFirstOrThrow({ where: { engagementId: continuanceId, acceptanceCaseId: reclearedCase.id } });
      assert.equal(linkedClearance.reviewVersion, reclearedCase.reviewVersion, 'commercial reads exactly the governance-recorded clearance');

      // T055 — engagement identity distinguishes readiness; substitution fails; duplicates are explicit.
      const identity = asRecord(await engagementIdentity(engagementId));
      const readiness = identity.readiness!;
      assert.equal(readiness.commercial.ready, true, 'dual keys and letter make commercial ready');
      assert.equal(readiness.planning.ready, false, 'no finalized TB or materiality yet');
      assert.equal(readiness.fieldwork.ready, false);
      await assert.rejects(engagementIdentity(randomUUID()), /Engagement not found/, 'a substituted engagement id resolves nothing');
      const duplicateAttempt = await createEngagement(userId, engagementId, { idempotencyKey: key(), clientId, name: 'Acceptance engagement', service: 'External statutory audit', period: 'FY2025' }).then(() => null, (error: unknown) => error);
      assert.match(duplicateAttempt instanceof Error ? duplicateAttempt.message : String(duplicateAttempt), /already exists for this client/);
      await assert.rejects(createEngagement(userId, engagementId, { idempotencyKey: key(), clientId: randomUUID(), name: 'Foreign client engagement', service: 'Audit', period: 'FY2025' }), /Client not found in this firm/);
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
