import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import {
  practiceAccountSchema, practicePeriodSchema, practiceJournalSchema, practiceVersionSchema,
  practicePeriodTransitionSchema, practicePostingPolicySchema, practiceReverseJournalSchema, practiceExpenseDraftSchema,
  practiceExpenseSettlementSchema,
} from '@auditsphere/contracts';
import { db } from '../../platform/db.js';
import { AccountingDate } from '../../platform/clock.js';
import { runUnitOfWork, withUnitOfWork, lockForUpdate, type TransactionClient, type UnitOfWork } from '../../platform/unit-of-work.js';
import { activeGrants, isAssignedToScope, roleAllowsCapability, type Capability } from '../../platform/authorization.js';
import { Decimal6 } from '../../platform/decimal6.js';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const value = schema.safeParse(input);
  if (!value.success) throw new BadRequestException(value.error.issues);
  return value.data;
}
function practiceFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  for (const guard of ['Approved firm posting policy is required', 'Posting date must belong to an open accounting period', 'Practice journal must contain balanced nonzero double-entry lines', 'Inactive or nonposting accounts cannot post', 'Reversal lines must exactly invert the original', 'Accounting periods must not overlap', 'Period transition requires an actor, reason and next version', 'Period identity and closed periods are immutable']) {
    if (message.includes(guard)) throw new ConflictException(guard);
  }
  const code = error && typeof error === 'object' ? (error as { code?: string }).code : undefined;
  if (code === 'P2002') throw new ConflictException('The account code, journal reference, policy or operation identifier already exists');
  if (code === 'P2003') throw new BadRequestException('Referenced accounting records must belong to this firm');
  throw error;
}
async function firmScope(tx: TransactionClient, actorId: string, engagementId: string, capability: Capability) {
  const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  const scope = { firmId: engagement.firmId, clientId: engagement.clientId, engagementId };
  if (!(await isAssignedToScope(tx, actorId, scope))) throw new ForbiddenException('Engagement assignment is required for this operation');
  if (!(await roleAllowsCapability(tx, actorId, capability, scope))) throw new ForbiddenException(`${capability} is not granted for this engagement`);
  const grants = await activeGrants(tx, actorId, capability, new Date());
  if (!grants.some(g => g.firmId === engagement.firmId && g.clientId === null && g.engagementId === null))
    throw new ForbiddenException('A firm-wide practice grant is required');
  return engagement.firmId;
}
/** Shared engagement-plus-firm Practice authorization for other Practice-owned commands. */
export async function practiceFirmScope(tx: TransactionClient, actorId: string, engagementId: string, capability: Capability) {
  return firmScope(tx, actorId, engagementId, capability);
}
async function lockPracticePeriod(tx: TransactionClient, periodId: string) {
  await tx.$queryRaw`SELECT id FROM "PracticePeriod" WHERE id = ${periodId}::uuid FOR UPDATE`;
}
async function command<T>(actorId: string, engagementId: string, capability: Capability, body: { idempotencyKey: string }, operation: string, work: (tx: TransactionClient, firmId: string) => Promise<T>, unitOfWork?: UnitOfWork) {
  const hash = createHash('sha256').update(JSON.stringify({ engagementId, operation, body })).digest('hex');
  return withUnitOfWork(unitOfWork, async scope => {
    const tx = scope.client;
    await lockForUpdate(tx, 'Engagement', engagementId);
    const firmId = await firmScope(tx, actorId, engagementId, capability);
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.actorId !== actorId || receipt.engagementId !== engagementId || receipt.hash !== hash) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    const value = await work(tx, firmId);
    const result = JSON.parse(JSON.stringify(value));
    await tx.auditEvent.create({ data: { engagementId, actorId, action: operation, payload: { firmId, result } } });
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  }).catch(practiceFailure);
}
export async function approveFirmPostingPolicy(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(practicePostingPolicySchema, input);
  return command(actorId, engagementId, 'PRACTICE_POST', body, 'PRACTICE_POLICY_APPROVED', async (tx, firmId) => tx.firmPostingPolicy.create({ data: { firmId, policyVersion: body.policyVersion, revenueTreatment: body.revenueTreatment, taxTreatment: body.taxTreatment, approvedBy: actorId } }), unitOfWork);
}
export async function createPracticeAccount(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(practiceAccountSchema, input);
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const firmId = await firmScope(tx, actorId, engagementId, 'PRACTICE_MANAGE');
    const account = await tx.practiceAccount.create({ data: { ...body, firmId } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PRACTICE_ACCOUNT_CREATED', payload: { accountId: account.id, firmId } } });
    return account;
  }).catch(practiceFailure);
}
export async function createPracticePeriod(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(practicePeriodSchema, input);
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const firmId = await firmScope(tx, actorId, engagementId, 'PRACTICE_MANAGE');
    const period = await tx.practicePeriod.create({ data: { firmId, startsOn: AccountingDate.fromISO(body.startsOn).startOfUtcDay(), endsOn: AccountingDate.fromISO(body.endsOn).startOfUtcDay() } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PRACTICE_PERIOD_CREATED', payload: { periodId: period.id, firmId } } });
    return period;
  }).catch(practiceFailure);
}
export async function createPracticeJournal(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(practiceJournalSchema, input);
  return command(actorId, engagementId, 'PRACTICE_MANAGE', body, 'PRACTICE_JOURNAL_CREATED', async (tx, firmId) => {
    await lockPracticePeriod(tx, body.periodId);
    const period = await tx.practicePeriod.findFirst({ where: { id: body.periodId, firmId, closed: false } });
    if (!period) throw new ConflictException('An open period in this firm is required');
    const day = AccountingDate.fromISO(body.accountingDate).startOfUtcDay();
    if (day < period.startsOn || day > period.endsOn) throw new BadRequestException('Accounting date is outside this period');
    const accountIds = [...new Set(body.lines.map(l => l.accountId))];
    if (await tx.practiceAccount.count({ where: { firmId, id: { in: accountIds }, active: true, posting: true } }) !== accountIds.length) throw new BadRequestException('Unknown, inactive, nonposting or cross-firm account');
    return tx.practiceJournal.create({ data: { firmId, periodId: period.id, accountingDate: day, reference: body.reference, memo: body.memo, createdBy: actorId, lines: { create: body.lines.map((l, position) => ({ ...l, position })) } }, include: { lines: true } });
  }, unitOfWork);
}
/** Create a classified expense/withdrawal draft through the canonical firm journal engine. */
export async function createPracticeExpenseDraft(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(practiceExpenseDraftSchema, input);
  return command(actorId, engagementId, 'PRACTICE_MANAGE', body, 'PRACTICE_EXPENSE_DRAFT_CREATED', async (tx, firmId) => {
    const amount = Decimal6.from(body.amount);
    if (!amount.isPositive()) throw new BadRequestException('Expense amount must be greater than zero');
    await lockPracticePeriod(tx, body.periodId);
    const period = await tx.practicePeriod.findFirst({ where: { id: body.periodId, firmId, closed: false } });
    if (!period) throw new ConflictException('An open period in this firm is required');
    const day = AccountingDate.fromISO(body.accountingDate).startOfUtcDay();
    if (day < period.startsOn || day > period.endsOn) throw new BadRequestException('Accounting date is outside this period');
    const accounts = await tx.practiceAccount.findMany({ where: { firmId, id: { in: [body.debitAccountId, body.creditAccountId] }, active: true, posting: true }, select: { id: true, kind: true } });
    if (accounts.length !== 2) throw new BadRequestException('Expense accounts must be active posting accounts in this firm');
    const debit = accounts.find(account => account.id === body.debitAccountId)!;
    const credit = accounts.find(account => account.id === body.creditAccountId)!;
    if (body.category === 'PARTNER_WITHDRAWAL') {
      if (!['EQUITY', 'LIABILITY'].includes(debit.kind) || credit.kind !== 'ASSET') throw new BadRequestException('Partner withdrawals require an explicitly selected partner equity/current account and an asset counterpart; they are not operating expenses');
    } else if (debit.kind !== 'EXPENSE' || !['ASSET', 'LIABILITY'].includes(credit.kind)) {
      throw new BadRequestException('Operating expenses require an expense debit and an explicitly selected asset or liability counterpart');
    }
    const categoryLabel = body.category.replaceAll('_', ' ').toLowerCase();
    const journal = await tx.practiceJournal.create({ data: {
      firmId, periodId: period.id, accountingDate: day, reference: body.reference,
      memo: `[${body.category}] ${body.description}`, createdBy: actorId,
      lines: { create: [
        { accountId: body.debitAccountId, position: 0, debit: amount.toFixed(), credit: '0' },
        { accountId: body.creditAccountId, position: 1, debit: '0', credit: amount.toFixed() },
      ] },
    }, include: { lines: true }});
    await tx.practiceExpense.create({ data: {
      firmId, journalId: journal.id, category: body.category, amount: amount.toFixed(),
      debitAccountId: body.debitAccountId, creditAccountId: body.creditAccountId, createdBy: actorId,
    } });
    return { ...journal, category: body.category, categoryLabel };
  }, unitOfWork);
}
/** Create a separate balanced payment journal against a posted expense obligation. */
export async function settlePracticeExpense(actorId: string, engagementId: string, expenseJournalId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(practiceExpenseSettlementSchema, input);
  return command(actorId, engagementId, 'PRACTICE_POST', body, 'PRACTICE_EXPENSE_SETTLED', async (tx, firmId) => {
    if (await firmScope(tx, actorId, engagementId, 'PRACTICE_MANAGE') !== firmId) throw new ForbiddenException('A firm-wide practice management grant is required');
    const amount = Decimal6.from(body.amount);
    if (!amount.isPositive()) throw new BadRequestException('Settlement amount must be greater than zero');
    await tx.$queryRaw`SELECT id FROM "PracticeJournal" WHERE "firmId" = ${firmId}::uuid AND id = ${expenseJournalId}::uuid FOR UPDATE`;
    const expense = await tx.practiceExpense.findUnique({
      where: { firmId_journalId: { firmId, journalId: expenseJournalId } },
      include: {
        journal: { include: { reversedJournals: { select: { id: true } } } },
        settlements: { include: { journal: { include: { reversedJournals: { select: { id: true } } } } } },
      },
    });
    if (!expense || expense.category === 'PARTNER_WITHDRAWAL' || expense.journal.status !== 'POSTED' || expense.journal.reversedJournals.length > 0) {
      throw new ConflictException('A current, posted operating expense is required for settlement');
    }
    const liability = await tx.practiceAccount.findFirst({ where: { firmId, id: expense.creditAccountId, kind: 'LIABILITY', active: true, posting: true } });
    if (!liability) throw new BadRequestException('Only an expense recognized to a liability can be settled later');
    const settled = Decimal6.sum(expense.settlements
      .filter(item => item.journal.reversedJournals.length === 0)
      .map(item => Decimal6.from(item.amount.toString())));
    const outstanding = Decimal6.from(expense.amount.toString()).subtract(settled);
    if (amount.compare(outstanding) > 0) throw new ConflictException('Settlement exceeds the outstanding expense obligation');
    await lockPracticePeriod(tx, body.periodId);
    const period = await tx.practicePeriod.findFirst({ where: { id: body.periodId, firmId, closed: false } });
    if (!period) throw new ConflictException('An open period in this firm is required');
    const day = AccountingDate.fromISO(body.accountingDate).startOfUtcDay();
    if (day < period.startsOn || day > period.endsOn) throw new BadRequestException('Settlement date is outside this period');
    const asset = await tx.practiceAccount.findFirst({ where: { firmId, id: body.assetAccountId, kind: 'ASSET', active: true, posting: true } });
    if (!asset) throw new BadRequestException('Settlement must use an active posting asset account');
    const journal = await tx.practiceJournal.create({ data: {
      firmId, periodId: period.id, accountingDate: day, reference: body.reference,
      memo: `[EXPENSE_SETTLEMENT] ${expense.journal.reference}`, createdBy: actorId,
      lines: { create: [
        { accountId: liability.id, position: 0, debit: amount.toFixed(), credit: '0' },
        { accountId: asset.id, position: 1, debit: '0', credit: amount.toFixed() },
      ] },
    }, include: { lines: true } });
    await tx.practiceExpenseSettlement.create({ data: {
      firmId, expenseJournalId: expense.journalId, journalId: journal.id, amount: amount.toFixed(), createdBy: actorId,
    } });
    return postPracticeJournalInTransaction(tx, firmId, actorId, journal.id, journal.version);
  }, unitOfWork);
}
async function postPracticeJournalInTransaction(tx: TransactionClient, firmId: string, actorId: string, journalId: string, expectedVersion: number) {
  const updated = await tx.practiceJournal.updateMany({ where: { id: journalId, firmId, status: 'DRAFT', version: expectedVersion }, data: { status: 'POSTED', version: { increment: 1 }, postedBy: actorId, postedAt: new Date() } });
  if (updated.count !== 1) throw new ConflictException('Journal changed, was posted, or is outside this firm');
  return tx.practiceJournal.findUniqueOrThrow({ where: { id: journalId } });
}
export async function postPracticeJournal(actorId: string, engagementId: string, journalId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(practiceVersionSchema, input);
  return command(actorId, engagementId, 'PRACTICE_POST', body, `PRACTICE_JOURNAL_POSTED:${journalId}`, (tx, firmId) => postPracticeJournalInTransaction(tx, firmId, actorId, journalId, body.expectedVersion), unitOfWork);
}
export async function reversePracticeJournal(actorId: string, engagementId: string, journalId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(practiceReverseJournalSchema, input);
  return command(actorId, engagementId, 'PRACTICE_POST', body, `PRACTICE_JOURNAL_REVERSED:${journalId}`, async (tx, firmId) => {
    await tx.$queryRaw`SELECT id FROM "PracticeJournal" WHERE id = ${journalId}::uuid FOR UPDATE`;
    const original = await tx.practiceJournal.findFirst({ where: { id: journalId, firmId, status: 'POSTED', version: body.expectedVersion }, include: { lines: { orderBy: { position: 'asc' } } } });
    if (!original) throw new ConflictException('A current posted journal in this firm is required');
    if (await tx.practiceJournal.findUnique({ where: { reversalOf: journalId } })) throw new ConflictException('Journal was already reversed');
    const expense = await tx.practiceExpense.findUnique({ where: { firmId_journalId: { firmId, journalId } }, include: { settlements: { include: { journal: { include: { reversedJournals: { select: { id: true } } } } } } } });
    if (expense?.settlements.some(item => item.journal.reversedJournals.length === 0)) throw new ConflictException('Reverse expense settlements before reversing the original expense');
    await lockPracticePeriod(tx, body.periodId);
    const period = await tx.practicePeriod.findFirst({ where: { id: body.periodId, firmId, closed: false } });
    if (!period) throw new ConflictException('A reversal must use an open accounting period in this firm');
    const accountingDate = AccountingDate.fromISO(body.accountingDate).startOfUtcDay();
    if (accountingDate < period.startsOn || accountingDate > period.endsOn) throw new BadRequestException('Reversal date is outside the selected period');
    const reversal = await tx.practiceJournal.create({ data: { firmId, periodId: period.id, accountingDate, reference: body.reference, memo: `Reverse ${original.reference}`, createdBy: actorId, reversalOf: journalId, lines: { create: original.lines.map(l => ({ accountId: l.accountId, position: l.position, debit: l.credit, credit: l.debit })) } } });
    return tx.practiceJournal.update({ where: { id: reversal.id }, data: { status: 'POSTED', version: { increment: 1 }, postedBy: actorId, postedAt: new Date() } });
  }, unitOfWork);
}
export async function closePracticePeriod(actorId: string, engagementId: string, periodId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(practicePeriodTransitionSchema, input);
  return command(actorId, engagementId, 'PRACTICE_MANAGE', body, `PRACTICE_PERIOD_CLOSED:${periodId}`, async (tx, firmId) => {
    await lockPracticePeriod(tx, periodId);
    const period = await tx.practicePeriod.findFirst({ where: { id: periodId, firmId, closed: false, version: body.expectedVersion } });
    if (!period) throw new ConflictException('Period changed or is outside this firm');
    const drafts = await tx.practiceJournal.count({ where: { firmId, periodId, status: 'DRAFT' } });
    if (drafts !== 0) throw new ConflictException('All journals in the period must be posted before closing it');
    const changed = await tx.practicePeriod.updateMany({ where: { id: periodId, firmId, closed: false, version: body.expectedVersion }, data: { closed: true, version: { increment: 1 }, lastTransitionReason: body.reason, lastTransitionBy: actorId } });
    if (changed.count !== 1) throw new ConflictException('Period changed or is outside this firm');
    return { id: periodId, closed: true, version: body.expectedVersion + 1, reason: body.reason };
  }, unitOfWork);
}
export async function reopenPracticePeriod(actorId: string, engagementId: string, periodId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(practicePeriodTransitionSchema, input);
  return command(actorId, engagementId, 'PRACTICE_REOPEN_PERIOD', body, `PRACTICE_PERIOD_REOPENED:${periodId}`, async (tx, firmId) => {
    await lockPracticePeriod(tx, periodId);
    const period = await tx.practicePeriod.findFirst({ where: { id: periodId, firmId, closed: true, version: body.expectedVersion } });
    if (!period) throw new ConflictException('A current closed period in this firm is required');
    const changed = await tx.practicePeriod.updateMany({ where: { id: periodId, firmId, closed: true, version: body.expectedVersion }, data: { closed: false, version: { increment: 1 }, lastTransitionReason: body.reason, lastTransitionBy: actorId } });
    if (changed.count !== 1) throw new ConflictException('Period changed or is outside this firm');
    return { id: periodId, closed: false, version: body.expectedVersion + 1, reason: body.reason };
  }, unitOfWork);
}
export async function practiceLedger(actorId: string, engagementId: string) {
  return runUnitOfWork(async ({ client: tx }) => {
    const firmId = await firmScope(tx, actorId, engagementId, 'PRACTICE_READ');
    const [accounts, periods, journals, expenses, balances] = await Promise.all([
      tx.practiceAccount.findMany({ where: { firmId }, orderBy: { code: 'asc' } }),
      tx.practicePeriod.findMany({ where: { firmId }, orderBy: { startsOn: 'desc' } }),
      tx.practiceJournal.findMany({ where: { firmId }, include: { lines: { orderBy: { position: 'asc' } } }, orderBy: { accountingDate: 'desc' }, take: 100 }),
      tx.practiceExpense.findMany({ where: { firmId }, include: { receipts: { select: { id: true, sequence: true, filename: true, contentType: true, sizeBytes: true, createdAt: true }, orderBy: { sequence: 'asc' } }, creditAccount: { select: { kind: true, active: true, posting: true } }, journal: { include: { reversedJournals: { select: { id: true } } } }, settlements: { include: { journal: { include: { reversedJournals: { select: { id: true } } } } } }, }, orderBy: { createdAt: 'desc' }, take: 500 }),
      tx.$queryRaw<Array<{ accountId: string; code: string; name: string; kind: string; debit: string; credit: string; balance: string }>>`SELECT a.id AS "accountId", a.code, a.name, a.kind, coalesce(sum(l.debit),0)::text AS debit, coalesce(sum(l.credit),0)::text AS credit, coalesce(sum(l.debit-l.credit),0)::text AS balance FROM "PracticeAccount" a LEFT JOIN ("PracticeJournalLine" l JOIN "PracticeJournal" j ON j.id = l."journalId" AND j.status = 'POSTED') ON l."accountId" = a.id WHERE a."firmId" = ${firmId}::uuid GROUP BY a.id ORDER BY a.code`,
    ]);
    return { firmId, currency: 'QAR', accounts, periods, journals, expenses: expenses.map(expense => {
      const settledAmount = Decimal6.sum(expense.settlements.filter(item => item.journal.reversedJournals.length === 0).map(item => Decimal6.from(item.amount.toString())));
      const amount = Decimal6.from(expense.amount.toString());
      return { id: expense.id, journalId: expense.journalId, reference: expense.journal.reference, category: expense.category, amount: amount.toFixed(), creditAccountId: expense.creditAccountId, journalStatus: expense.journal.status, journalVersion: expense.journal.version, settledAmount: settledAmount.toFixed(), outstandingAmount: amount.subtract(settledAmount).toFixed(), settlementAllowed: expense.creditAccount.kind === 'LIABILITY' && expense.creditAccount.active && expense.creditAccount.posting && expense.category !== 'PARTNER_WITHDRAWAL' && expense.journal.status === 'POSTED' && expense.journal.reversedJournals.length === 0 && settledAmount.compare(amount) < 0, receipts: expense.receipts.map(receipt => ({ ...receipt, createdAt: receipt.createdAt.toISOString() })), receiptAttachable: (expense.journal.status === 'DRAFT' || expense.journal.status === 'POSTED') && expense.journal.reversedJournals.length === 0 };
    }), balances };
  }, { isolationLevel: 'RepeatableRead' });
}
