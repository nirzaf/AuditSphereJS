import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { withUnitOfWork, type UnitOfWork } from '../../platform/unit-of-work.js';
import { completeOperation, normalizedRequestHash, startOperation } from '../../platform/idempotency.js';
import { Decimal6 } from '../../platform/decimal6.js';
import { AccountingDate } from '../../platform/clock.js';
import { acceptedInvoiceContract } from '../commercial/public.js';
import { createPracticeJournal, postPracticeJournal, reversePracticeJournal } from './ledger.js';
import { invoiceReceiptSchema, issueInvoiceSchema, recordPaymentSchema, voidInvoiceSchema } from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';

/**
 * Canonical engagement invoices (T069 foundation, C07/C32 boundary): Practice owns billing
 * records; commercial lifecycle gates read them as evidence. Numbering is a strict per-firm
 * sequence assigned under the engagement lock; issued invoices and payments are immutable
 * apart from the single ISSUED → PAID transition.
 */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return parsed.data;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type LegacyInvoiceAction = 'ISSUE_INVOICE' | 'INVOICE_PAYMENT' | 'INVOICE_RECEIPT' | 'INVOICE_VOID';
function legacyInvoiceAction(value: unknown): LegacyInvoiceAction | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = value as Record<string, unknown>;
  if (typeof result.receiptId === 'string' && typeof result.invoiceId === 'string') return 'INVOICE_RECEIPT';
  if (result.status === 'VOID' && typeof result.invoiceId === 'string') return 'INVOICE_VOID';
  if (typeof result.invoiceId === 'string' && typeof result.settled === 'boolean') return 'INVOICE_PAYMENT';
  if (typeof result.id === 'string' && typeof result.number === 'number' && typeof result.kind === 'string') return 'ISSUE_INVOICE';
  return undefined;
}
async function legacyInvoiceReplay(
  tx: Prisma.TransactionClient,
  actorId: string,
  engagementId: string,
  callerKey: string,
  action: LegacyInvoiceAction,
  legacyHash: string,
): Promise<{ found: false } | { found: true; result: Prisma.JsonValue }> {
  const receipt = await tx.commandReceipt.findUnique({ where: { key: callerKey } });
  if (!receipt || legacyInvoiceAction(receipt.result) !== action) return { found: false };
  if (receipt.hash !== legacyHash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) {
    throw new ConflictException('Idempotency key reused');
  }
  return { found: true, result: receipt.result };
}
async function loadEngagement(tx: typeof db | Prisma.TransactionClient, engagementId: string): Promise<EngagementRow> {
  const engagement = await tx.engagement.findUnique({ where: { id: engagementId }, select: { firmId: true, clientId: true, id: true } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  return engagement;
}
type EngagementRow = { firmId: string; clientId: string; id: string };
const scopeOf = (engagement: EngagementRow): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

/** The minimal chart approved with T066; billing fails closed if the firm has not provisioned it. */
const RECEIVABLE_ACCOUNT_CODE = '120';
const DEFERRED_ENGAGEMENT_FEE_ACCOUNT_CODE = '200';

async function postInvoiceRecognition(actorId: string, engagementId: string, engagement: EngagementRow, invoice: { id: string; number: number; revision: number; amount: { toString(): string }; issuedAt: Date }, scope: UnitOfWork) {
  const tx = scope.client;
  const policy = await tx.firmPostingPolicy.findUnique({ where: { firmId: engagement.firmId } });
  if (!policy || policy.revenueTreatment !== 'DEFERRED_UNTIL_RELEASE' || policy.taxTreatment !== 'NO_TAX') {
    throw new ConflictException('An approved deferred-fee, no-tax firm posting policy is required before issuing an invoice');
  }
  const accounts = await tx.practiceAccount.findMany({
    where: { firmId: engagement.firmId, code: { in: [RECEIVABLE_ACCOUNT_CODE, DEFERRED_ENGAGEMENT_FEE_ACCOUNT_CODE] }, active: true, posting: true },
  });
  const receivable = accounts.find(account => account.code === RECEIVABLE_ACCOUNT_CODE && account.kind === 'ASSET');
  const deferredFees = accounts.find(account => account.code === DEFERRED_ENGAGEMENT_FEE_ACCOUNT_CODE && account.kind === 'LIABILITY');
  if (!receivable || !deferredFees) {
    throw new ConflictException('Active posting accounts 120 (receivables) and 200 (deferred engagement fees) are required for invoice issuance');
  }

  const accountingDate = invoice.issuedAt.toISOString().slice(0, 10);
  const day = AccountingDate.fromISO(accountingDate).startOfUtcDay();
  const period = await tx.practicePeriod.findFirst({
    where: { firmId: engagement.firmId, closed: false, startsOn: { lte: day }, endsOn: { gte: day } },
    select: { id: true },
  });
  if (!period) throw new ConflictException('An open accounting period containing the invoice date is required');

  const amount = Decimal6.from(invoice.amount.toString()).roundQar().toFixed(2);
  const reference = `INV-${String(invoice.number).padStart(6, '0')}-R${String(invoice.revision).padStart(2, '0')}`;
  const draft = await createPracticeJournal(actorId, engagementId, {
    periodId: period.id,
    accountingDate,
    reference,
    memo: `Deferred-fee recognition for invoice ${invoice.number}, revision ${invoice.revision}`,
    idempotencyKey: randomUUID(),
    lines: [
      { accountId: receivable.id, debit: amount, credit: '0.000000' },
      { accountId: deferredFees.id, debit: '0.000000', credit: amount },
    ],
  }, scope);
  const posted = await postPracticeJournal(actorId, engagementId, draft.id, { expectedVersion: draft.version, idempotencyKey: randomUUID() }, scope);
  await tx.invoiceLedgerPosting.create({ data: { firmId: engagement.firmId, engagementId, invoiceId: invoice.id, journalId: posted.id, createdBy: actorId } });
}

export async function listInvoices(engagementId: string, page: PaginationQuery = { offset: 0, limit: 50 }) {
  const engagement = await loadEngagement(db, engagementId);
  const rows = await db.engagementInvoice.findMany({ where: { engagementId: engagement.id }, orderBy: { number: 'asc' }, skip: page.offset, take: page.limit, include: { payments: true, receipt: true, lines: { orderBy: { position: 'asc' } }, void: true } });
  return rows.map(({ payments, receipt, lines, void: voidRecord, ...row }) => ({
    ...row,
    paidToDate: Decimal6.sum(payments.map(payment => Decimal6.from(payment.amount.toString()))).toFixed(2),
    receiptIssued: Boolean(receipt),
    lines,
    voidReason: voidRecord?.reason ?? null,
  }));
}

export async function issueInvoice(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(issueInvoiceSchema, input);
  const legacyHash = digest(JSON.stringify({ engagementId, operation: 'ISSUE_INVOICE', body }));
  return withUnitOfWork(unitOfWork, async scope => {
    const tx = scope.client;
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const engagement = await loadEngagement(tx, engagementId);
    await requireCapability(tx, actorId, 'PRACTICE_MANAGE', scopeOf(engagement));
    const legacy = await legacyInvoiceReplay(tx, actorId, engagementId, body.idempotencyKey, 'ISSUE_INVOICE', legacyHash);
    if (legacy.found) return legacy.result;
    if (!body.dueOn) throw new BadRequestException('dueOn: required when issuing a new invoice');
    const proposal = await acceptedInvoiceContract(tx, scopeOf(engagement));
    if (!proposal) {
      throw new ConflictException('An invoice requires the exact client-accepted proposal secured by the issued engagement letter');
    }
    const contractFee = Decimal6.from(proposal.totalAmount).roundQar();
    const halfFee = contractFee.multiplyRound2(Decimal6.from('0.5')).roundQar();
    const amount = body.kind === 'ADVANCE_50' ? halfFee : contractFee.subtract(halfFee).roundQar();
    if (!amount.isPositive()) throw new BadRequestException('The accepted contract fee is too small to invoice in two milestones');
    const operation = await startOperation(tx, {
      ...scopeOf(engagement), actorId, action: 'PRACTICE.INVOICE.ISSUE', callerKey: body.idempotencyKey,
      requestHash: normalizedRequestHash({ kind: body.kind, dueOn: body.dueOn, proposalId: proposal.proposalId, proposalRevision: proposal.proposalRevision }),
    });
    if (operation.kind === 'replay') return operation.result;
    const activeMilestone = await tx.engagementInvoice.findFirst({
      where: { firmId: engagement.firmId, engagementId, proposalId: proposal.proposalId, kind: body.kind, status: { not: 'VOID' } },
      select: { id: true },
    });
    if (activeMilestone) throw new ConflictException('An active invoice already exists for this contract milestone');
    const priorRevision = await tx.engagementInvoice.findFirst({
      where: { firmId: engagement.firmId, engagementId, proposalId: proposal.proposalId, kind: body.kind },
      orderBy: { revision: 'desc' }, select: { revision: true },
    });
    const revision = (priorRevision?.revision ?? 0) + 1;
    const sequence = await tx.$queryRaw<Array<{ number: number }>>`
      INSERT INTO "InvoiceNumberSequence" ("firmId", "nextNumber", "updatedAt")
      VALUES (${engagement.firmId}::uuid, 2, now())
      ON CONFLICT ("firmId") DO UPDATE
        SET "nextNumber" = "InvoiceNumberSequence"."nextNumber" + 1, "updatedAt" = now()
      RETURNING ("nextNumber" - 1)::integer AS number
    `;
    const number = sequence[0]?.number;
    if (!number || !Number.isSafeInteger(number)) throw new ConflictException('The firm invoice number could not be allocated');
    const invoice = await tx.engagementInvoice.create({ data: {
      firmId: engagement.firmId, clientId: engagement.clientId, engagementId, proposalId: proposal.proposalId,
      proposalRevision: proposal.proposalRevision, contractFee: contractFee.toFixed(2), revision, number, kind: body.kind,
      amount: amount.toFixed(2), currency: proposal.currency, dueOn: new Date(`${body.dueOn}T00:00:00.000Z`), issuedBy: actorId,
      lines: { create: { position: 1, description: proposal.service, amount: amount.toFixed(2) } },
    } });
    await postInvoiceRecognition(actorId, engagementId, engagement, invoice, scope);
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'INVOICE_ISSUED', payload: { invoiceId: invoice.id, number, kind: body.kind, amount: amount.toFixed(2), contractFee: contractFee.toFixed(2), proposalId: proposal.proposalId, proposalRevision: proposal.proposalRevision, dueOn: body.dueOn } } });
    const result = { id: invoice.id, number, revision, kind: body.kind, proposalId: proposal.proposalId, proposalRevision: proposal.proposalRevision, contractFee: contractFee.toFixed(2), dueOn: body.dueOn, amount: amount.toFixed(2), status: 'ISSUED' };
    await completeOperation(tx, operation.operationId, result);
    return result;
  });
}

export async function recordInvoicePayment(actorId: string, engagementId: string, invoiceId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(recordPaymentSchema, input);
  const legacyHash = digest(JSON.stringify({ engagementId, operation: 'INVOICE_PAYMENT', invoiceId, body }));
  return withUnitOfWork(unitOfWork, async scope => {
    const tx = scope.client;
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const engagement = await loadEngagement(tx, engagementId);
    await requireCapability(tx, actorId, 'PRACTICE_MANAGE', scopeOf(engagement));
    const legacy = await legacyInvoiceReplay(tx, actorId, engagementId, body.idempotencyKey, 'INVOICE_PAYMENT', legacyHash);
    if (legacy.found) return legacy.result;
    const operation = await startOperation(tx, {
      ...scopeOf(engagement), actorId, action: 'PRACTICE.INVOICE.PAYMENT', callerKey: body.idempotencyKey,
      requestHash: normalizedRequestHash({ invoiceId, amount: body.amount, reference: body.reference }),
    });
    if (operation.kind === 'replay') return operation.result;
    const invoice = await tx.engagementInvoice.findFirst({ where: { id: invoiceId, engagementId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID') throw new ConflictException('The invoice is already settled');
    if (invoice.status === 'VOID') throw new ConflictException('A void invoice cannot receive a payment');
    if (!Decimal6.fromInput(body.amount).isPositive()) throw new BadRequestException('amount: must be positive');
    const existingPayments = await tx.invoicePayment.aggregate({ where: { invoiceId }, _sum: { amount: true } });
    const paidBefore = Decimal6.from(existingPayments._sum.amount?.toString() ?? '0');
    const paymentAmount = Decimal6.fromInput(body.amount).roundQar();
    if (paidBefore.add(paymentAmount).compare(Decimal6.from(invoice.amount.toString())) > 0) {
      throw new BadRequestException('Payment exceeds the outstanding invoice balance');
    }
    await tx.invoicePayment.create({ data: { firmId: engagement.firmId, invoiceId, engagementId, amount: body.amount, reference: body.reference, recordedBy: actorId } });
    const paidAmount = paidBefore.add(paymentAmount);
    const settled = paidAmount.compare(Decimal6.from(invoice.amount.toString())) >= 0;
    if (settled) {
      const changed = await tx.engagementInvoice.updateMany({ where: { id: invoiceId, status: 'ISSUED' }, data: { status: 'PAID' } });
      if (changed.count !== 1) throw new ConflictException('Invoice changed; reload before recording the payment');
    }
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'INVOICE_PAYMENT_RECORDED', payload: { invoiceId, amount: body.amount, reference: body.reference, settled } } });
    const result = { invoiceId, settled };
    await completeOperation(tx, operation.operationId, result);
    return result;
  });
}

export async function issueInvoiceReceipt(actorId: string, engagementId: string, invoiceId: string, idempotencyKey: string, unitOfWork?: UnitOfWork) {
  const receiptRequest = parse(invoiceReceiptSchema, { idempotencyKey });
  const legacyHash = digest(JSON.stringify({ engagementId, operation: 'INVOICE_RECEIPT', invoiceId }));
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const engagement = await loadEngagement(tx, engagementId);
    await requireCapability(tx, actorId, 'PRACTICE_MANAGE', scopeOf(engagement));
    const legacy = await legacyInvoiceReplay(tx, actorId, engagementId, receiptRequest.idempotencyKey, 'INVOICE_RECEIPT', legacyHash);
    if (legacy.found) return legacy.result;
    const operation = await startOperation(tx, {
      ...scopeOf(engagement), actorId, action: 'PRACTICE.INVOICE.RECEIPT', callerKey: receiptRequest.idempotencyKey,
      requestHash: normalizedRequestHash({ invoiceId }),
    });
    if (operation.kind === 'replay') return operation.result;
    const invoice = await tx.engagementInvoice.findFirst({ where: { id: invoiceId, engagementId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'PAID') throw new ConflictException('An official receipt requires a settled invoice');
    const issued = await tx.invoiceReceipt.create({ data: { firmId: engagement.firmId, invoiceId, engagementId, issuedBy: actorId } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'INVOICE_RECEIPT_ISSUED', payload: { invoiceId, receiptId: issued.id } } });
    const result = { receiptId: issued.id, invoiceId };
    await completeOperation(tx, operation.operationId, result);
    return result;
  });
}

export async function voidInvoice(actorId: string, engagementId: string, invoiceId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(voidInvoiceSchema, input);
  const legacyHash = digest(JSON.stringify({ engagementId, operation: 'INVOICE_VOID', invoiceId, body }));
  return withUnitOfWork(unitOfWork, async scope => {
    const tx = scope.client;
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const engagement = await loadEngagement(tx, engagementId);
    await requireCapability(tx, actorId, 'PRACTICE_MANAGE', scopeOf(engagement));
    const legacy = await legacyInvoiceReplay(tx, actorId, engagementId, body.idempotencyKey, 'INVOICE_VOID', legacyHash);
    if (legacy.found) return legacy.result;
    const operation = await startOperation(tx, {
      ...scopeOf(engagement), actorId, action: 'PRACTICE.INVOICE.VOID', callerKey: body.idempotencyKey,
      requestHash: normalizedRequestHash({ invoiceId, reason: body.reason }),
    });
    if (operation.kind === 'replay') return operation.result;
    const invoice = await tx.engagementInvoice.findFirst({ where: { id: invoiceId, firmId: engagement.firmId, engagementId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'ISSUED') throw new ConflictException('Only an issued, unpaid invoice can be voided; paid invoices require a credit-note workflow');
    const payments = await tx.invoicePayment.count({ where: { invoiceId } });
    if (payments > 0) throw new ConflictException('An invoice with any recorded payment cannot be voided');
    await tx.invoiceVoid.create({ data: { invoiceId, firmId: engagement.firmId, engagementId, reason: body.reason, voidedBy: actorId } });
    const ledgerPosting = await tx.invoiceLedgerPosting.findUnique({ where: { invoiceId_firmId_engagementId: { invoiceId, firmId: engagement.firmId, engagementId } }, include: { journal: true } });
    if (!ledgerPosting) throw new ConflictException('The invoice has no linked ledger journal and cannot be voided safely');
    const accountingDate = new Date().toISOString().slice(0, 10);
    const day = AccountingDate.fromISO(accountingDate).startOfUtcDay();
    const period = await tx.practicePeriod.findFirst({
      where: { firmId: engagement.firmId, closed: false, startsOn: { lte: day }, endsOn: { gte: day } },
      select: { id: true },
    });
    if (!period) throw new ConflictException('An open accounting period containing today is required to reverse an invoice before voiding it');
    await reversePracticeJournal(actorId, engagementId, ledgerPosting.journalId, {
      expectedVersion: ledgerPosting.journal.version,
      idempotencyKey: randomUUID(),
      periodId: period.id,
      accountingDate,
      reference: `VOID-INV-${String(invoice.number).padStart(6, '0')}-R${String(invoice.revision).padStart(2, '0')}`,
    }, scope);
    const changed = await tx.engagementInvoice.updateMany({ where: { id: invoiceId, status: 'ISSUED' }, data: { status: 'VOID' } });
    if (changed.count !== 1) throw new ConflictException('Invoice changed; reload before voiding');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'INVOICE_VOIDED', payload: { invoiceId, reason: body.reason, revision: invoice.revision } } });
    const result = { invoiceId, status: 'VOID', revision: invoice.revision };
    await completeOperation(tx, operation.operationId, result);
    return result;
  });
}
