import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { db } from '../../platform/db.js';
import { Decimal6 } from '../../platform/decimal6.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { createAdjustmentJournalSchema, postAdjustmentJournalSchema, reverseAdjustmentJournalSchema } from '@auditsphere/contracts';

/**
 * Client audit adjustment journals (C15).
 *
 * A draft is editable; posting needs `ADJUSTMENT_POST`, a balanced set of at least two lines and a
 * preparer different from the poster. A posted journal is immutable and is corrected only by a
 * reversal journal that swaps the sides. The database independently enforces balance at posting and
 * freezes posted journals and their lines.
 */
const scopeOf = (engagement: { firmId: string; clientId: string; id: string }): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

async function loadEngagement(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  return engagement;
}

function validateLines(lines: Array<{ accountCode: string; fsli?: string; debit: string; credit: string }>) {
  const parsed = lines.map((line, index) => {
    const debit = Decimal6.from(line.debit ?? '0');
    const credit = Decimal6.from(line.credit ?? '0');
    if (debit.compare(Decimal6.zero()) < 0 || credit.compare(Decimal6.zero()) < 0) throw new BadRequestException(`Line ${index + 1} cannot use a negative amount`);
    if (debit.isPositive() === credit.isPositive()) throw new BadRequestException(`Line ${index + 1} must carry exactly one of debit or credit`);
    return { position: index, accountCode: line.accountCode, fsli: line.fsli ?? null, debit, credit };
  });
  const totalDebit = Decimal6.sum(parsed.map((line) => line.debit));
  const totalCredit = Decimal6.sum(parsed.map((line) => line.credit));
  if (!totalDebit.equals(totalCredit)) throw new BadRequestException('The adjustment must balance: total debit must equal total credit');
  if (!totalDebit.isPositive()) throw new BadRequestException('The adjustment must not be zero');
  return parsed;
}

const lineTotals = (lines: Array<{ debit: { toFixed: (n: number) => string }; credit: { toFixed: (n: number) => string } }>) => ({
  debit: Decimal6.sum(lines.map((line) => Decimal6.from(line.debit.toFixed(6)))),
  credit: Decimal6.sum(lines.map((line) => Decimal6.from(line.credit.toFixed(6)))),
});

export async function createAdjustmentJournal(actorId: string, engagementId: string, input: unknown) {
  const parsed = createAdjustmentJournalSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const engagement = await loadEngagement(engagementId);
  await requireCapability(db, actorId, 'ADJUSTMENT_MANAGE', scopeOf(engagement));
  const lines = validateLines(parsed.data.lines);
  return db.$transaction(async (tx) => {
    const existing = await tx.adjustmentJournal.findUnique({ where: { engagementId_reference: { engagementId, reference: parsed.data.reference } } });
    if (existing) throw new ConflictException('An adjustment with this reference already exists');
    const journal = await tx.adjustmentJournal.create({ data: { firmId: engagement.firmId, clientId: engagement.clientId, engagementId, reference: parsed.data.reference, memo: parsed.data.memo, createdBy: actorId } });
    await tx.adjustmentJournalLine.createMany({ data: lines.map((line) => ({ journalId: journal.id, position: line.position, accountCode: line.accountCode, fsli: line.fsli, debit: line.debit.toFixed(6), credit: line.credit.toFixed(6) })) });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'ADJUSTMENT_DRAFTED', payload: { journalId: journal.id, reference: journal.reference, lines: lines.length } } });
    return { journalId: journal.id, status: journal.status, version: journal.version, reference: journal.reference, lineCount: lines.length };
  });
}

export async function postAdjustmentJournal(actorId: string, engagementId: string, journalId: string, input: unknown) {
  const parsed = postAdjustmentJournalSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const engagement = await loadEngagement(engagementId);
  await requireCapability(db, actorId, 'ADJUSTMENT_POST', scopeOf(engagement));
  return db.$transaction(async (tx) => {
    const journal = await tx.adjustmentJournal.findFirst({ where: { id: journalId, engagementId, firmId: engagement.firmId, clientId: engagement.clientId }, include: { lines: true } });
    if (!journal) throw new NotFoundException('Adjustment journal not found');
    if (journal.status !== 'DRAFT') throw new ConflictException('Only a draft adjustment can be posted');
    if (journal.createdBy === actorId) throw new ForbiddenException('The preparer cannot post their own adjustment');
    const totals = lineTotals(journal.lines);
    if (!totals.debit.equals(totals.credit) || !totals.debit.isPositive()) throw new BadRequestException('The adjustment must balance and be non-zero');
    const changed = await tx.adjustmentJournal.updateMany({ where: { id: journalId, status: 'DRAFT', version: parsed.data.expectedVersion }, data: { status: 'POSTED', postedBy: actorId, postedAt: new Date(), version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException('Adjustment changed; reload before posting');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'ADJUSTMENT_POSTED', payload: { journalId, reference: journal.reference } } });
    return { journalId, status: 'POSTED', version: journal.version + 1 };
  });
}

export async function reverseAdjustmentJournal(actorId: string, engagementId: string, journalId: string, input: unknown) {
  const parsed = reverseAdjustmentJournalSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const engagement = await loadEngagement(engagementId);
  await requireCapability(db, actorId, 'ADJUSTMENT_POST', scopeOf(engagement));
  return db.$transaction(async (tx) => {
    const original = await tx.adjustmentJournal.findFirst({ where: { id: journalId, engagementId, firmId: engagement.firmId, clientId: engagement.clientId }, include: { lines: { orderBy: { position: 'asc' } }, reversedBy: true } });
    if (!original) throw new NotFoundException('Adjustment journal not found');
    if (original.reversedBy) throw new ConflictException('This adjustment has already been reversed');
    if (original.status !== 'POSTED') throw new ConflictException('Only a posted adjustment can be reversed');
    if (original.createdBy === actorId) throw new ForbiddenException('The preparer cannot reverse their own adjustment');
    const now = new Date();
    // The reversal is drafted, balanced and then posted inside the same transaction so the database
    // balance rule applies to it as well.
    const reversal = await tx.adjustmentJournal.create({ data: { firmId: engagement.firmId, clientId: engagement.clientId, engagementId, reference: `${original.reference}-REV`, memo: `Reversal of ${original.reference}`, createdBy: original.createdBy, reversesJournalId: original.id } });
    await tx.adjustmentJournalLine.createMany({ data: original.lines.map((line) => ({ journalId: reversal.id, position: line.position, accountCode: line.accountCode, fsli: line.fsli, debit: line.credit, credit: line.debit })) });
    const postedReversal = await tx.adjustmentJournal.updateMany({ where: { id: reversal.id, status: 'DRAFT', version: reversal.version }, data: { status: 'POSTED', postedBy: actorId, postedAt: now, version: { increment: 1 } } });
    if (postedReversal.count !== 1) throw new ConflictException('The reversal could not be posted');
    const changed = await tx.adjustmentJournal.updateMany({ where: { id: original.id, status: 'POSTED', version: parsed.data.expectedVersion }, data: { status: 'REVERSED', version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException('Adjustment changed; reload before reversing');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'ADJUSTMENT_REVERSED', payload: { journalId: original.id, reversalJournalId: reversal.id, reference: original.reference } } });
    return { journalId: original.id, status: 'REVERSED', reversalJournalId: reversal.id, reversalReference: reversal.reference };
  });
}

export async function listAdjustmentJournals(engagementId: string, options: { status?: string } = {}) {
  await loadEngagement(engagementId);
  const statuses = ['DRAFT', 'POSTED', 'REVERSED'];
  if (options.status && !statuses.includes(options.status)) throw new BadRequestException('Unknown status filter');
  return db.adjustmentJournal.findMany({ where: { engagementId, ...(options.status ? { status: options.status } : {}) }, orderBy: { createdAt: 'asc' } });
}

export async function adjustmentJournalDetail(engagementId: string, journalId: string) {
  await loadEngagement(engagementId);
  const journal = await db.adjustmentJournal.findFirst({ where: { id: journalId, engagementId }, include: { lines: { orderBy: { position: 'asc' } } } });
  if (!journal) throw new NotFoundException('Adjustment journal not found');
  return { ...journal, lines: journal.lines.map((line) => ({ ...line, debit: line.debit.toFixed(6), credit: line.credit.toFixed(6) })) };
}
