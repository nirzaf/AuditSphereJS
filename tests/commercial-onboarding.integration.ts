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
type CommandResult = { id: string; kind?: string; status?: string; revision?: number; number?: number; amount?: string; proposalId?: string; proposalRevision?: number; contractFee?: string; dueOn?: string };
const asRecord = (value: unknown): CommandResult => { assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'command returned no record'); return value as CommandResult; };

test('the commercial onboarding spine enforces the dual-key and advance gates end to end', { timeout: 180_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('commercial').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, createProposal, presentProposal, acceptProposal, createAcceptanceCase, recordAcceptanceAnswer, completeAcceptanceReview, clearAcceptanceCase, recordRiskClearance, dualKeyStatus, approveFirmPostingPolicy, issueInvoice, voidInvoice, listInvoices, recordInvoicePayment, issueInvoiceReceipt, applyLifecycleCommand } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), userId = randomUUID(), partnerId = randomUUID(), billingId = randomUUID();
      await db.user.createMany({ data: [
        { id: userId, email: 'commercial@test.local', role: 'APPROVER' },
        { id: partnerId, email: 'partner@test.local', role: 'APPROVER' },
        { id: billingId, email: 'billing@test.local', role: 'BILLING' },
      ] });
      await db.firm.create({ data: { id: firmId, name: 'Onboarding firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Onboarding client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Onboarding engagement' } });
      await db.membership.createMany({ data: [
        { userId: userId, firmId, clientId, engagementId, role: 'APPROVER' },
        { userId: partnerId, firmId, clientId, engagementId, role: 'APPROVER' },
        { userId: billingId, firmId, clientId, engagementId, role: 'BILLING' },
      ] });
      await db.roleGrant.createMany({ data: [
        { userId, capability: 'COMMERCIAL_MANAGE', firmId, grantedBy: userId },
        { userId, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: userId },
        { userId: billingId, capability: 'PRACTICE_MANAGE', firmId, grantedBy: billingId },
        { userId: billingId, capability: 'PRACTICE_POST', firmId, grantedBy: billingId },
        { userId: billingId, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: billingId },
        { userId: partnerId, capability: 'RISK_PARTNER_CLEAR', firmId, grantedBy: userId },
        { userId: partnerId, capability: 'LIFECYCLE_COMMAND', firmId, grantedBy: userId },
      ] });
      const lifecycle = async (command: string, actor = userId) => {
        const engagement = await db.engagement.findUniqueOrThrow({ where: { id: engagementId }, select: { version: true } });
        return applyLifecycleCommand(engagementId, actor, { command, expectedVersion: engagement.version, idempotencyKey: key() });
      };

      // LEAD_INGESTION refuses commercial transitions without a proposal.
      await assert.rejects(lifecycle('OPEN_PROPOSAL'), /Draft a commercial proposal/);
      const proposal = asRecord(await createProposal(userId, engagementId, { idempotencyKey: key(), service: 'External statutory audit', periodStart: '2025-01-01', periodEnd: '2025-12-31', totalAmount: '120000.02' }));
      await assert.rejects(lifecycle('OPEN_PROPOSAL', billingId), /authorized staff role/i, 'billing authority does not confer partner proposal authority');
      await lifecycle('OPEN_PROPOSAL');
      assert.equal((await db.engagement.findUnique({ where: { id: engagementId } }))?.state, 'PROPOSAL_GENERATION');

      // Dispatch requires a presented revision; presenting pins the snapshot.
      await assert.rejects(lifecycle('DISPATCH_PROPOSAL'), /Present a proposal revision/);
      await assert.rejects(presentProposal(userId, engagementId, proposal.id, { idempotencyKey: key(), expectedVersion: 2 }), /Proposal changed; reload before presenting/);
      await presentProposal(userId, engagementId, proposal.id, { idempotencyKey: key(), expectedVersion: 1 });
      await lifecycle('DISPATCH_PROPOSAL');

      // INV-001: the letter is blocked with only one key, in either order.
      await assert.rejects(lifecycle('ISSUE_ENGAGEMENT_LETTER', billingId), /authorized staff role/i, 'billing staff cannot issue the partner engagement-letter gate');
      await assert.rejects(lifecycle('ISSUE_ENGAGEMENT_LETTER', partnerId), /Key 1 is missing/);
      await assert.rejects(acceptProposal(userId, engagementId, proposal.id, { idempotencyKey: key(), expectedVersion: 2, evidenceRef: 'signed-acceptance.pdf' }), /Only the authenticated client/);
      await acceptPresentedProposalFixture(userId, engagementId, proposal.id);
      await assert.rejects(lifecycle('ISSUE_ENGAGEMENT_LETTER', userId), /Key 2 is missing/);
      await assert.rejects(recordRiskClearance(userId, engagementId, { idempotencyKey: key(), reason: 'Partner clearance attempted without the authority.' }), /not granted/);
      await createAcceptanceCase(userId, engagementId, { idempotencyKey: key(), track: 'NEW_CLIENT' });
      await recordAcceptanceAnswer(userId, engagementId, { idempotencyKey: key(), questionId: 'ubo', answer: 'Holding family office', evidenceRef: 'ubo-register.pdf' });
      await recordAcceptanceAnswer(userId, engagementId, { idempotencyKey: key(), questionId: 'aml', answer: 'Cleared', evidenceRef: 'aml-check.pdf' });
      await recordAcceptanceAnswer(userId, engagementId, { idempotencyKey: key(), questionId: 'integrity', answer: 'No adverse findings' });
      await recordAcceptanceAnswer(userId, engagementId, { idempotencyKey: key(), questionId: 'independence', answer: 'Confirmed', evidenceRef: 'independence.pdf' });
      await completeAcceptanceReview(userId, engagementId);
      await clearAcceptanceCase(partnerId, engagementId, { idempotencyKey: key(), reason: 'ISA 220 acceptance complete; independence confirmed.' });
      const status = await dualKeyStatus(engagementId);
      assert.equal(status.key1Status, 'RECORDED'); assert.equal(status.key2Status, 'RECORDED'); assert.equal(status.letterIssued, false);
      await lifecycle('ISSUE_ENGAGEMENT_LETTER', partnerId);
      const letter = await db.engagementLetterRecord.findUnique({ where: { engagementId } });
      assert.match(letter?.letterText ?? '', /ENGAGEMENT LETTER \(ISA 210\)/);
      assert.match(letter?.letterText ?? '', /120000\.02 QAR/);
      // The issued letter is immutable at the database boundary.
      await assert.rejects(db.$executeRawUnsafe(`UPDATE "EngagementLetterRecord" SET "letterText" = 'tampered'`), /Issued commercial records are immutable/);

      // Invoice recognition fails closed unless the firm has provisioned the required chart
      // and an open accounting period. The eventual approval is an explicit firm decision.
      const receivableAccount = await db.practiceAccount.create({ data: { firmId, code: '120', name: 'Client receivables', kind: 'ASSET' } });
      const deferredFeeAccount = await db.practiceAccount.create({ data: { firmId, code: '200', name: 'Deferred engagement fees', kind: 'LIABILITY' } });
      await db.practicePeriod.create({ data: { firmId, startsOn: new Date('2000-01-01T00:00:00.000Z'), endsOn: new Date('2100-12-31T00:00:00.000Z') } });
      await assert.rejects(
        issueInvoice(userId, engagementId, { idempotencyKey: key(), kind: 'ADVANCE_50' as const, dueOn: '2025-12-31' }),
        /PRACTICE_MANAGE is not granted/i,
        'audit approval authority does not grant invoice authority',
      );
      await assert.rejects(
        issueInvoice(billingId, engagementId, { idempotencyKey: key(), kind: 'ADVANCE_50' as const, dueOn: '2025-12-31' }),
        /approved deferred-fee, no-tax firm posting policy is required/i,
      );
      assert.equal(await db.engagementInvoice.count({ where: { engagementId } }), 0, 'missing policy leaves no invoice behind');
      assert.equal(await db.practiceJournal.count({ where: { firmId } }), 0, 'missing policy leaves no journal behind');
      await approveFirmPostingPolicy(billingId, engagementId, {
        policyVersion: 'TEST-D07-1', revenueTreatment: 'DEFERRED_UNTIL_RELEASE', taxTreatment: 'NO_TAX', idempotencyKey: key(),
      });

      // Invoice terms are derived from the exact accepted contract, not caller-supplied money.
      const forgedAmount = { idempotencyKey: key(), kind: 'ADVANCE_50' as const, dueOn: '2025-12-31', amount: '0.00' };
      await assert.rejects(issueInvoice(billingId, engagementId, forgedAmount), /Invoice amount is derived/);
      const advanceRequests = [
        { idempotencyKey: key(), kind: 'ADVANCE_50' as const, dueOn: '2025-12-31' },
        { idempotencyKey: key(), kind: 'ADVANCE_50' as const, dueOn: '2025-12-31' },
      ];
      const competingAdvances = await Promise.allSettled(advanceRequests.map(request => issueInvoice(billingId, engagementId, request)));
      assert.equal(competingAdvances.filter(result => result.status === 'fulfilled').length, 1, 'different-key requests cannot duplicate an active advance milestone');
      assert.equal(competingAdvances.filter(result => result.status === 'rejected').length, 1);
      const winningIndex = competingAdvances.findIndex(result => result.status === 'fulfilled');
      const invoice = asRecord((competingAdvances[winningIndex] as PromiseFulfilledResult<unknown>).value);
      assert.equal(invoice.kind, 'ADVANCE_50'); assert.equal(invoice.amount, '60000.01');
      assert.equal(invoice.contractFee, '120000.02'); assert.equal(invoice.proposalRevision, 1); assert.equal(invoice.dueOn, '2025-12-31');
      const recognition = await db.invoiceLedgerPosting.findUniqueOrThrow({ where: { invoiceId_firmId_engagementId: { invoiceId: invoice.id, firmId, engagementId } }, include: { journal: { include: { lines: true } } } });
      assert.equal(recognition.journal.status, 'POSTED');
      assert.equal(recognition.journal.reference, `INV-${String(invoice.number).padStart(6, '0')}-R01`);
      const recognitionLines = new Map(recognition.journal.lines.map(line => [line.accountId, { debit: line.debit.toString(), credit: line.credit.toString() }]));
      assert.deepEqual(recognitionLines.get(receivableAccount.id), { debit: '60000.01', credit: '0' });
      assert.deepEqual(recognitionLines.get(deferredFeeAccount.id), { debit: '0', credit: '60000.01' });
      assert.equal(asRecord(await issueInvoice(billingId, engagementId, advanceRequests[winningIndex])).id, invoice.id, 'a retry replays the same invoice');
      assert.equal(await db.engagementInvoice.count({ where: { engagementId, kind: 'ADVANCE_50', status: { not: 'VOID' } } }), 1);
      await assert.rejects(db.$executeRaw`UPDATE "EngagementInvoice" SET "amount" = "amount" + 1 WHERE id = ${invoice.id}::uuid`, /invoice terms and lines cannot be edited/i);
      await assert.rejects(db.$executeRaw`UPDATE "EngagementInvoiceLine" SET "amount" = "amount" + 1 WHERE "invoiceId" = ${invoice.id}::uuid`, /Issued commercial records are immutable/);

      const voidResult = asRecord(await voidInvoice(billingId, engagementId, invoice.id, { idempotencyKey: key(), reason: 'Superseded duplicate billing preview.' }));
      assert.equal(voidResult.status, 'VOID');
      assert.equal((await db.engagementInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, 'VOID');
      const reversal = await db.practiceJournal.findUniqueOrThrow({ where: { reversalOf: recognition.journalId }, include: { lines: true } });
      assert.equal(reversal.status, 'POSTED');
      assert.deepEqual(new Map(reversal.lines.map(line => [line.accountId, { debit: line.debit.toString(), credit: line.credit.toString() }])), new Map([
        [receivableAccount.id, { debit: '0', credit: '60000.01' }],
        [deferredFeeAccount.id, { debit: '60000.01', credit: '0' }],
      ]), 'voiding creates an exact posted reversal of the recognition journal');
      await assert.rejects(db.$executeRaw`UPDATE "EngagementInvoice" SET "status" = 'ISSUED' WHERE id = ${invoice.id}::uuid`, /invoice status transition is not permitted/i);
      await assert.rejects(db.$executeRaw`DELETE FROM "InvoiceVoid" WHERE "invoiceId" = ${invoice.id}::uuid`, /Issued commercial records are immutable/);
      const reissueRequest = { idempotencyKey: key(), kind: 'ADVANCE_50' as const, dueOn: '2025-12-31' };
      const reissued = asRecord(await issueInvoice(billingId, engagementId, reissueRequest));
      assert.equal(reissued.revision, 2); assert.equal(reissued.number, (invoice.number ?? 0) + 1); assert.equal(reissued.amount, '60000.01');

      // INV-002: the portal stays inactive until the active advance is fully paid and receipted.
      await assert.rejects(lifecycle('ACTIVATE_PORTAL', billingId), /full 50% advance payment/);
      await assert.rejects(recordInvoicePayment(billingId, engagementId, reissued.id, { idempotencyKey: key(), amount: '0.00', reference: 'TRF-ZERO' }), /amount: must be positive/);
      await assert.rejects(db.$executeRaw`INSERT INTO "InvoicePayment" ("firmId", "invoiceId", "engagementId", "amount", "reference", "recordedBy") VALUES (${firmId}::uuid, ${reissued.id}::uuid, ${engagementId}::uuid, 60000.02, 'TRF-OVERPAY', ${billingId}::uuid)`, /Payment exceeds outstanding invoice balance/);
      const journalsBeforeMissingCash = await db.practiceJournal.count({ where: { firmId } });
      await assert.rejects(
        recordInvoicePayment(billingId, engagementId, reissued.id, { idempotencyKey: key(), amount: '25000.01', reference: 'TRF-MISSING-CASH' }),
        /Active posting accounts 100 \(cash\/bank\) and 120 \(receivables\)/,
      );
      assert.equal(await db.invoicePayment.count({ where: { invoiceId: reissued.id } }), 0, 'a missing cash account leaves no payment behind');
      assert.equal(await db.practiceJournal.count({ where: { firmId } }), journalsBeforeMissingCash, 'a refused payment leaves no cash journal behind');
      await assert.rejects(
        db.$transaction(tx => tx.invoicePayment.create({ data: { firmId, invoiceId: reissued.id, engagementId, amount: '1.00', reference: 'TRF-DIRECT-BYPASS', recordedBy: billingId } })),
        /Invoice payment must commit with one posted cash-receipt journal/,
        'the database rejects an unposted direct payment insert',
      );
      const cashAccount = await db.practiceAccount.create({ data: { firmId, code: '100', name: 'Cash and bank', kind: 'ASSET' } });
      await recordInvoicePayment(billingId, engagementId, reissued.id, { idempotencyKey: key(), amount: '25000.01', reference: 'TRF-001' });
      const firstPayment = await db.invoicePayment.findFirstOrThrow({ where: { invoiceId: reissued.id, reference: 'TRF-001' }, include: { ledgerPosting: { include: { journal: { include: { lines: true } } } } } });
      assert.equal(firstPayment.ledgerPosting?.journal.status, 'POSTED');
      assert.equal(firstPayment.ledgerPosting?.journal.reference, `PAY-${firstPayment.id}`);
      assert.equal(firstPayment.ledgerPosting?.journal.accountingDate.toISOString().slice(0, 10), firstPayment.recordedAt.toISOString().slice(0, 10));
      const firstPaymentLines = new Map(firstPayment.ledgerPosting?.journal.lines.map(line => [line.accountId, { debit: line.debit.toString(), credit: line.credit.toString() }]));
      assert.deepEqual(firstPaymentLines.get(cashAccount.id), { debit: '25000.01', credit: '0' });
      assert.deepEqual(firstPaymentLines.get(receivableAccount.id), { debit: '0', credit: '25000.01' });
      assert.equal(firstPayment.ledgerPosting?.journal.lines.length, 2, 'the cash receipt is a balanced two-line journal');
      const invoiceJournal = await db.invoiceLedgerPosting.findFirstOrThrow({ where: { invoiceId: reissued.id }, select: { journalId: true } });
      await assert.rejects(
        db.$transaction(async tx => {
          const unlinkedPayment = await tx.invoicePayment.create({ data: { firmId, invoiceId: reissued.id, engagementId, amount: '1.00', reference: 'TRF-WRONG-JOURNAL', recordedBy: billingId } });
          await tx.invoicePaymentLedgerPosting.create({ data: { firmId, engagementId, paymentId: unlinkedPayment.id, journalId: invoiceJournal.journalId, createdBy: billingId } });
        }),
        /Invoice payment journal reference does not match the payment/,
        'the database rejects linking a payment to another posted journal',
      );
      assert.equal(await db.invoicePayment.count({ where: { invoiceId: reissued.id } }), 1, 'a journal mismatch rolls back the attempted payment');
      await assert.rejects(db.invoicePaymentLedgerPosting.delete({ where: { paymentId_firmId_engagementId: { paymentId: firstPayment.id, firmId, engagementId } } }), /Invoice payment ledger posting links are immutable/);
      assert.equal((await listInvoices(engagementId)).find(row => row.id === reissued.id)?.paidToDate, '25000.01');
      await recordInvoicePayment(billingId, engagementId, reissued.id, { idempotencyKey: key(), amount: '34999.99', reference: 'TRF-002' });
      assert.equal((await listInvoices(engagementId)).find(row => row.id === reissued.id)?.paidToDate, '60000.00');
      await assert.rejects(lifecycle('ACTIVATE_PORTAL', billingId), /full 50% advance payment/);
      await recordInvoicePayment(billingId, engagementId, reissued.id, { idempotencyKey: key(), amount: '0.01', reference: 'TRF-003' });
      assert.equal((await listInvoices(engagementId)).find(row => row.id === reissued.id)?.paidToDate, '60000.01');
      assert.equal((await db.engagementInvoice.findUnique({ where: { id: reissued.id } }))?.status, 'PAID');
      assert.equal(await db.invoicePaymentLedgerPosting.count({ where: { engagementId } }), 3, 'every partial payment has one immutable cash journal link');
      await assert.rejects(voidInvoice(billingId, engagementId, reissued.id, { idempotencyKey: key(), reason: 'Cannot void a settled invoice.' }), /only an issued, unpaid invoice/i);
      await assert.rejects(lifecycle('ACTIVATE_PORTAL', billingId), /official advance receipt/);
      await issueInvoiceReceipt(billingId, engagementId, reissued.id, key());
      await lifecycle('ACTIVATE_PORTAL', billingId);
      assert.equal((await db.engagement.findUnique({ where: { id: engagementId } }))?.state, 'PORTAL_ACTIVE_PLANNING');

      // Final amount is the remaining half; same-key retries replay and different keys conflict.
      const finalInvoiceRequest = { idempotencyKey: key(), kind: 'FINAL_50' as const, dueOn: '2026-01-31' };
      const [secondValue, replayValue] = await Promise.all([
        issueInvoice(billingId, engagementId, finalInvoiceRequest),
        issueInvoice(billingId, engagementId, finalInvoiceRequest),
      ]);
      const second = asRecord(secondValue);
      assert.equal(asRecord(replayValue).id, second.id, 'concurrent retry must return the original invoice');
      assert.equal(second.amount, '60000.01');
      assert.equal(second.number, (reissued.number ?? 0) + 1);
      await assert.rejects(db.$transaction(async tx => {
        await tx.invoiceVoid.create({ data: { invoiceId: second.id, firmId, engagementId, reason: 'Direct database bypass attempt.', voidedBy: billingId } });
        await tx.engagementInvoice.update({ where: { id: second.id }, data: { status: 'VOID' } });
      }), /exact posted reversal of its ledger recognition/i, 'the database rejects a reasoned void without its journal reversal');
      assert.equal((await db.engagementInvoice.findUniqueOrThrow({ where: { id: second.id } })).status, 'ISSUED', 'the failed bypass leaves the invoice issued');
      assert.equal(await db.invoiceVoid.count({ where: { invoiceId: second.id } }), 0, 'the failed bypass leaves no void record');
      await assert.rejects(issueInvoice(billingId, engagementId, { ...finalInvoiceRequest, idempotencyKey: key() }), /active invoice already exists/i);
      await assert.rejects(db.$executeRawUnsafe(`DELETE FROM "InvoicePayment"`), /Issued commercial records are immutable/);
      await assert.rejects(issueInvoiceReceipt(billingId, engagementId, reissued.id, key()), /already settled|requires a settled/);
      // Idempotent replay of the settled command returns the stored outcome.
      const replayKey = key();
      const first = asRecord(await recordInvoicePayment(billingId, engagementId, second.id, { idempotencyKey: replayKey, amount: '1000.00', reference: 'TRF-004' }));
      const replay = asRecord(await recordInvoicePayment(billingId, engagementId, second.id, { idempotencyKey: replayKey, amount: '1000.00', reference: 'TRF-004' }));
      assert.deepEqual(replay, first);
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
