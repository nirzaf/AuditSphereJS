import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { correctPracticeTimeEntrySchema, practiceTimeEntriesQuerySchema, recordPracticeTimeEntrySchema } from '@auditsphere/contracts';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { Decimal6, roundHalfEvenDiv } from '../../platform/decimal6.js';
import { lockForUpdate, runUnitOfWork, withUnitOfWork, type TransactionClient, type UnitOfWork } from '../../platform/unit-of-work.js';
import { recordAuthorizedPracticeTimeEntrySnapshot } from './rates.js';

/** The shape of a stored time entry that the views read. Money is a Prisma Decimal, which formats itself with toFixed. */
type EntryRow = {
  id: string; workDate: Date; minutes: number; phase: string | null; fsli: string | null; description: string | null; currency: string;
  hourlyRateSnapshot: { toFixed(digits: number): string }; chargeOutValueSnapshot: { toFixed(digits: number): string }; createdAt: Date;
};

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** The view a save returns. A replayed save returns the stored receipt, which holds this same shape as JSON. */
export type PracticeTimeEntryView = ReturnType<typeof entryView>;
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const scopeOf = (engagement: { firmId: string; clientId: string; id: string }): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

/**
 * T140 / R074: hours convert once to whole minutes. Minutes are exact. Hours take at most three decimal places, so the
 * product hours × 60 is a multiple of 0.06 minutes and rounds half-even to the nearest whole minute (1.25 h = 75 min,
 * 0.125 h = 7.5 min = 8 min). The result must still fall in the 1–1440 minute range the T139 snapshot enforces.
 */
export function minutesFrom(minutes: number | undefined, hours: string | undefined): number {
  if (minutes !== undefined) return minutes;
  const [whole, fraction = ''] = (hours ?? '0').split('.');
  const thousandths = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  const converted = Number(roundHalfEvenDiv(thousandths * 60n, 1000n));
  if (converted < 1 || converted > 1440) throw new BadRequestException('Time entry duration must be 1–1440 whole minutes');
  return converted;
}

/** The Monday that starts the ISO week containing the given work date (YYYY-MM-DD). */
function weekStartOf(workDate: string) {
  const day = new Date(`${workDate}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

function entryView(entry: EntryRow, correctsEntryId: string | null, supersededByEntryId: string | null) {
  return {
    id: entry.id, workDate: dateOnly(entry.workDate), minutes: entry.minutes, phase: entry.phase as 'PLANNING' | 'FIELDWORK' | 'REVIEW' | 'REPORTING' | null,
    fsli: entry.fsli, description: entry.description, currency: entry.currency,
    hourlyRate: entry.hourlyRateSnapshot.toFixed(6), chargeOutValue: entry.chargeOutValueSnapshot.toFixed(6),
    createdAt: entry.createdAt.toISOString(), correctsEntryId, supersededByEntryId,
  };
}

/** A work date inside a closed firm accounting period is refused, so billed time cannot move after the period closes. */
async function assertPeriodOpen(tx: TransactionClient, firmId: string, workDate: string) {
  const day = new Date(`${workDate}T00:00:00.000Z`);
  const closed = await tx.practicePeriod.findFirst({ where: { firmId, closed: true, startsOn: { lte: day }, endsOn: { gte: day } }, select: { id: true } });
  if (closed) throw new ConflictException('The accounting period for this work date is closed; record the time in an open period');
}

/** The FSLI is a line of the firm's approved taxonomy (D22: the approved taxonomy is the only authority). */
async function assertFsliApproved(tx: TransactionClient, firmId: string, fsli: string) {
  const taxonomy = await tx.taxonomyVersion.findFirst({ where: { firmId, status: 'APPROVED' }, orderBy: { version: 'desc' }, include: { lines: { where: { code: fsli }, select: { id: true } } } });
  if (!taxonomy || taxonomy.lines.length === 0) throw new BadRequestException(`The FSLI '${fsli}' is not a line of the approved taxonomy`);
}

/** Records one day's time for the signed-in staff member. The pricing snapshot is written in the same insert. */
export async function recordPracticeTimeEntry(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = recordPracticeTimeEntrySchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const hash = digest(JSON.stringify({ engagementId, operation: 'record', body }));
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result as unknown as PracticeTimeEntryView;
    }
    const minutes = minutesFrom(body.minutes, body.hours);
    await assertPeriodOpen(tx, engagement.firmId, body.workDate);
    await assertFsliApproved(tx, engagement.firmId, body.fsli);
    const entry = await recordAuthorizedPracticeTimeEntrySnapshot(tx, {
      firmId: engagement.firmId, clientId: engagement.clientId, engagementId, staffUserId: actorId, workDate: body.workDate, minutes,
      phase: body.phase, fsli: body.fsli, description: body.description,
    });
    const result = entryView(entry, null, null);
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PRACTICE_TIME_RECORDED', payload: { entryId: entry.id, firmId: engagement.firmId, minutes, phase: body.phase, fsli: body.fsli } } });
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

/**
 * Corrects an entry by appending a replacement and linking it to the original. Time entries are immutable, so the
 * original and its earlier values remain in the record. The replacement is priced at the rate effective on its own work date.
 */
export async function correctPracticeTimeEntry(actorId: string, engagementId: string, entryId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = correctPracticeTimeEntrySchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const hash = digest(JSON.stringify({ engagementId, entryId, operation: 'correct', body }));
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result as unknown as { original: PracticeTimeEntryView; replacement: PracticeTimeEntryView };
    }
    const original = await tx.practiceTimeEntry.findFirst({
      where: { id: entryId, firmId: engagement.firmId, engagementId },
      include: { correctionOriginal: true, correctionReplacement: true },
    });
    if (!original) throw new NotFoundException('Time entry not found');
    if (original.staffUserId !== actorId) throw new ForbiddenException('Only the staff member who recorded a time entry can correct it');
    if (original.correctionOriginal) throw new ConflictException('This time entry has already been corrected; correct its replacement instead');
    const changes = [body.workDate, body.minutes, body.hours, body.phase, body.fsli, body.description].some(value => value !== undefined);
    if (!changes) throw new BadRequestException('The correction changes nothing');
    const workDate = body.workDate ?? dateOnly(original.workDate);
    const minutes = body.minutes !== undefined || body.hours !== undefined ? minutesFrom(body.minutes, body.hours) : original.minutes;
    const phase = body.phase ?? original.phase;
    const fsli = body.fsli ?? original.fsli;
    const description = body.description ?? original.description;
    if (!phase || !fsli || !description) throw new BadRequestException('An entry recorded before phase, FSLI and description existed must supply all three in its correction');
    await assertPeriodOpen(tx, engagement.firmId, workDate);
    if (body.fsli !== undefined) await assertFsliApproved(tx, engagement.firmId, fsli);
    const replacement = await recordAuthorizedPracticeTimeEntrySnapshot(tx, {
      firmId: engagement.firmId, clientId: engagement.clientId, engagementId, staffUserId: actorId, workDate, minutes, phase, fsli, description,
    });
    await tx.practiceTimeEntryCorrection.create({ data: {
      firmId: engagement.firmId, engagementId, staffUserId: actorId, originalEntryId: original.id, replacementEntryId: replacement.id,
      reason: body.reason, correctedBy: actorId,
    } });
    const result = {
      original: entryView(original, original.correctionReplacement?.originalEntryId ?? null, replacement.id),
      replacement: entryView(replacement, original.id, null),
    };
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PRACTICE_TIME_CORRECTED', payload: { originalEntryId: original.id, replacementEntryId: replacement.id, firmId: engagement.firmId } } });
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

/**
 * The signed-in staff member's entries for the engagement, with daily and weekly totals. A superseded original stays in
 * the list for its history but does not count toward any total, so a correction is never counted twice.
 */
export async function listPracticeTimeEntries(actorId: string, engagementId: string, input: unknown) {
  const parsed = practiceTimeEntriesQuerySchema.safeParse(input ?? {});
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const query = parsed.data;
  return runUnitOfWork(async ({ client: tx }) => {
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'ENGAGEMENT_READ', scopeOf(engagement));
    const rows = await tx.practiceTimeEntry.findMany({
      where: {
        firmId: engagement.firmId, engagementId, staffUserId: actorId,
        ...(query.from || query.to ? { workDate: { ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}), ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}) } } : {}),
      },
      orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
      take: 500,
      include: { correctionOriginal: true, correctionReplacement: true },
    });
    const entries = rows.map(row => entryView(row, row.correctionReplacement?.originalEntryId ?? null, row.correctionOriginal?.replacementEntryId ?? null));
    const counted = rows.filter(row => !row.correctionOriginal);
    const days = new Map<string, { minutes: number; value: Decimal6 }>();
    const weeks = new Map<string, { minutes: number; value: Decimal6 }>();
    let totalMinutes = 0;
    let totalValue = Decimal6.zero();
    for (const row of counted) {
      const day = dateOnly(row.workDate);
      const value = Decimal6.from(row.chargeOutValueSnapshot.toFixed(6));
      const accumulate = (map: Map<string, { minutes: number; value: Decimal6 }>, key: string) => {
        const current = map.get(key) ?? { minutes: 0, value: Decimal6.zero() };
        map.set(key, { minutes: current.minutes + row.minutes, value: current.value.add(value) });
      };
      accumulate(days, day);
      accumulate(weeks, weekStartOf(day));
      totalMinutes += row.minutes;
      totalValue = totalValue.add(value);
    }
    const sorted = <T>(map: Map<string, T>) => [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return {
      entries,
      days: sorted(days).map(([workDate, total]) => ({ workDate, minutes: total.minutes, chargeOutValue: total.value.toFixed(6) })),
      weeks: sorted(weeks).map(([weekStart, total]) => ({ weekStart, minutes: total.minutes, chargeOutValue: total.value.toFixed(6) })),
      totals: { minutes: totalMinutes, chargeOutValue: totalValue.toFixed(6) },
    };
  });
}
