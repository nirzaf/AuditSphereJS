import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const key = () => randomUUID();
type CommandResult = { id: string; receiptId: string; status?: string; revision?: number; number?: number; amount?: string; dueOn?: string; contractFee?: string; proposalRevision?: number };
const asRecord = (value: unknown): CommandResult => { assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'command returned no record'); return value as CommandResult; };

test('the dual-key gate closes all key combinations and billing milestones round within the contracted fee', { timeout: 180_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('billing_gates').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, createProposal, presentProposal, acceptProposal, recordRiskClearance, approveFirmPostingPolicy, issueInvoice, recordInvoicePayment, issueInvoiceReceipt, applyLifecycleCommand } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), userId = randomUUID(), partnerId = randomUUID(), billingId = randomUUID();
      await db.user.createMany({ data: [
        { id: userId, email: 'commercial2@test.local', role: 'APPROVER' },
        { id: partnerId, email: 'partner2@test.local', role: 'APPROVER' },
        { id: billingId, email: 'billing2@test.local', role: 'BILLING' },
      ] });
      await db.firm.create({ data: { id: firmId, name: 'Gate firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Gate client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Gate engagement' } });
      await db.membership.createMany({ data: [
        { userId, firmId, clientId, engagementId, role: 'APPROVER' },
        { userId: partnerId, firmId, clientId, engagementId, role: 'APPROVER' },
        { userId: billingId, firmId, clientId, engagementId, role: 'BILLING' },
      ] });
      await db.roleGrant.createMany({ data: [
        { userId, capability: 'COMMERCIAL_MANAGE', firmId, grantedBy: userId },
        { userId, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: userId },
        { userId: partnerId, capability: 'RISK_PARTNER_CLEAR', firmId, grantedBy: userId },
        { userId: partnerId, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: userId },
        { userId: billingId, capability: 'PRACTICE_MANAGE', firmId, grantedBy: billingId },
        { userId: billingId, capability: 'PRACTICE_POST', firmId, grantedBy: billingId },
        { userId: billingId, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: billingId },
      ] });
      const lifecycle = async (command: string, actor = userId) => {
        const engagement = await db.engagement.findUniqueOrThrow({ where: { id: engagementId }, select: { version: true } });
        return applyLifecycleCommand(engagementId, actor, { command, expectedVersion: engagement.version, idempotencyKey: key() });
      };

      // T063 AC1 — the (no Key 1, Key 2 recorded) combination: risk clearance alone cannot clear.
      const proposal = asRecord(await createProposal(userId, engagementId, { idempotencyKey: key(), service: 'External statutory audit', periodStart: '2025-01-01', periodEnd: '2025-12-31', totalAmount: '120000.01' }));
      await lifecycle('OPEN_PROPOSAL');
      await presentProposal(userId, engagementId, proposal.id, { idempotencyKey: key(), expectedVersion: 1 });
      await lifecycle('DISPATCH_PROPOSAL');
      await recordRiskClearance(partnerId, engagementId, { idempotencyKey: key(), reason: 'ISA 220 acceptance complete; independence confirmed.' });
      await assert.rejects(lifecycle('ISSUE_ENGAGEMENT_LETTER', partnerId), /Key 1 is missing/, 'risk clearance without client acceptance never issues the letter');
      await acceptProposal(userId, engagementId, proposal.id, { idempotencyKey: key(), expectedVersion: 1, evidenceRef: 'signed-acceptance.pdf' });
      await lifecycle('ISSUE_ENGAGEMENT_LETTER', partnerId);
      assert.ok(await db.engagementLetterRecord.findUnique({ where: { engagementId } }));

      // T063 AC2 — acceptance evidence that drifts from the presented revision cannot clear.
      // The issued letter itself is immutable, so the drift case runs on a sibling engagement.
      const driftEngagementId = randomUUID();
      await db.engagement.create({ data: { id: driftEngagementId, firmId, clientId, name: 'Gate drift engagement' } });
      await db.membership.createMany({ data: [
        { userId, firmId, clientId, engagementId: driftEngagementId, role: 'APPROVER' },
        { userId: partnerId, firmId, clientId, engagementId: driftEngagementId, role: 'APPROVER' },
      ] });
      const driftProposal = asRecord(await createProposal(userId, driftEngagementId, { idempotencyKey: key(), service: 'External statutory audit', periodStart: '2025-01-01', periodEnd: '2025-12-31', totalAmount: '120000.01' }));
      const driftLifecycle = async (command: string) => {
        const engagement = await db.engagement.findUniqueOrThrow({ where: { id: driftEngagementId }, select: { version: true } });
        return applyLifecycleCommand(driftEngagementId, partnerId, { command, expectedVersion: engagement.version, idempotencyKey: key() });
      };
      await driftLifecycle('OPEN_PROPOSAL');
      await presentProposal(userId, driftEngagementId, driftProposal.id, { idempotencyKey: key(), expectedVersion: 1 });
      await driftLifecycle('DISPATCH_PROPOSAL');
      await recordRiskClearance(partnerId, driftEngagementId, { idempotencyKey: key(), reason: 'ISA 220 acceptance complete; independence confirmed.' });
      await acceptProposal(userId, driftEngagementId, driftProposal.id, { idempotencyKey: key(), expectedVersion: 1, evidenceRef: 'signed-acceptance.pdf' });
      await db.commercialProposal.update({ where: { id: driftProposal.id }, data: { clientResponse: { revision: 99, evidenceRef: 'tampered.pdf' } } });
      const drifted = await driftLifecycle('ISSUE_ENGAGEMENT_LETTER').then(() => null, (error: unknown) => error);
      assert.match(drifted instanceof Error ? drifted.message : String(drifted), /does not match its presented revision/i, 'drifted acceptance evidence cannot produce a false clearance');

      // T070 AC2 — both milestones derive from the fee; their sum never exceeds it.
      await db.practiceAccount.createMany({ data: [
        { firmId, code: '120', name: 'Client receivables', kind: 'ASSET' },
        { firmId, code: '200', name: 'Deferred engagement fees', kind: 'LIABILITY' },
      ] });
      await db.practicePeriod.create({ data: { firmId, startsOn: new Date('2000-01-01T00:00:00.000Z'), endsOn: new Date('2100-12-31T00:00:00.000Z') } });
      await approveFirmPostingPolicy(billingId, engagementId, { policyVersion: 'TEST-D07-G1', revenueTreatment: 'DEFERRED_UNTIL_RELEASE', taxTreatment: 'NO_TAX', idempotencyKey: key() });
      const advance = asRecord(await issueInvoice(billingId, engagementId, { idempotencyKey: key(), kind: 'ADVANCE_50' as const, dueOn: '2025-12-31' }));
      const finalInvoice = asRecord(await issueInvoice(billingId, engagementId, { idempotencyKey: key(), kind: 'FINAL_50' as const, dueOn: '2026-01-31' }));
      const total = Number(advance.amount) + Number(finalInvoice.amount);
      assert.equal(total.toFixed(2), '120000.01', 'milestone rounding never exceeds the agreed fee');
      assert.equal(finalInvoice.amount, '60000.01', 'the final invoice carries the exact remaining balance');

      // T071 AC2/AC3 — overpayment is refused with no partial payment or ledger state behind.
      const beforePayments = await db.invoicePayment.count({ where: { invoiceId: advance.id } });
      const beforeJournals = await db.practiceJournal.count({ where: { firmId } });
      await assert.rejects(recordInvoicePayment(billingId, engagementId, advance.id, { idempotencyKey: key(), amount: '999999.00', reference: 'TRF-OVER' }), /exceeds the outstanding/);
      assert.equal(await db.invoicePayment.count({ where: { invoiceId: advance.id } }), beforePayments, 'a refused payment leaves no payment row');
      assert.equal(await db.practiceJournal.count({ where: { firmId } }), beforeJournals, 'a refused payment leaves no journal behind');

      // T072 AC1 — one receipt identity: a different key cannot mint a second receipt.
      await recordInvoicePayment(billingId, engagementId, advance.id, { idempotencyKey: key(), amount: advance.amount, reference: 'TRF-FULL' });
      const receipt = asRecord(await issueInvoiceReceipt(billingId, engagementId, advance.id, key()));
      assert.equal(await db.invoiceReceipt.count({ where: { invoiceId: advance.id } }), 1);
      const secondAttempt = await issueInvoiceReceipt(billingId, engagementId, advance.id, key()).then(value => ({ kind: 'replayed' as const, value }), (error: unknown) => ({ kind: 'rejected' as const, error }));
      assert.equal(await db.invoiceReceipt.count({ where: { invoiceId: advance.id } }), 1, 'a second receipt attempt never mints a second receipt');
      if (secondAttempt.kind === 'replayed') assert.equal(asRecord(secondAttempt.value).receiptId, receipt.receiptId, 'the replay returns the original receipt identity');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
