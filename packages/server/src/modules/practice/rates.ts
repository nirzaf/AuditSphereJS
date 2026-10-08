import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  createPracticeRateCardSchema,
  createPracticeStaffGradeAssignmentSchema,
  practiceJobGrades,
} from '@auditsphere/contracts';
import type { z } from 'zod';
import { AccountingDate } from '../../platform/clock.js';
import { Decimal6, roundHalfEvenDiv } from '../../platform/decimal6.js';
import { db } from '../../platform/db.js';
import { lockForUpdate, runUnitOfWork, withUnitOfWork, type TransactionClient, type UnitOfWork } from '../../platform/unit-of-work.js';
import { practiceFirmScope } from './ledger.js';
import { firmForActor } from './firm-authority.js';

const RATE_DEFAULTS = [
  { grade: 'ENGAGEMENT_PARTNER', hourlyRate: '1000.000000' },
  { grade: 'AUDIT_MANAGER', hourlyRate: '750.000000' },
  { grade: 'AUDIT_SUPERVISOR', hourlyRate: '500.000000' },
  { grade: 'AUDIT_SENIOR', hourlyRate: '500.000000' },
  { grade: 'AUDIT_ASSOCIATE', hourlyRate: '200.000000' },
  { grade: 'AUDIT_JUNIOR', hourlyRate: '200.000000' },
] as const;
const DEFAULT_EFFECTIVE_FROM = AccountingDate.fromISO('2000-01-01').startOfUtcDay();

type RateInput = z.infer<typeof createPracticeRateCardSchema>;
type GradeInput = z.infer<typeof createPracticeStaffGradeAssignmentSchema>;
type PracticeRateCardResult = { id: string; grade: string; currency: string; hourlyRate: string; effectiveFrom: string; effectiveTo: string | null; version: number; createdAt: string };
type PracticeGradeAssignmentResult = { id: string; userId: string; email: string; accessRole: string; grade: string; effectiveFrom: string; effectiveTo: string | null; version: number; createdAt: string };

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(result.error.issues);
  return result.data;
}

function rangeOverlaps(start: string, end: string | null, otherStart: string, otherEnd: string | null) {
  return (otherEnd === null || start < otherEnd) && (end === null || otherStart < end);
}

function toDate(value: string) { return AccountingDate.fromISO(value).startOfUtcDay(); }
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function mapWriteFailure(error: unknown): never {
  if (error instanceof ConflictException || error instanceof ForbiddenException || error instanceof NotFoundException || error instanceof BadRequestException) throw error;
  const candidate = error && typeof error === 'object' ? error as { code?: string; meta?: { code?: string }; message?: string } : {};
  if (candidate.meta?.code === '23P01' || candidate.message?.includes('may not overlap')) throw new ConflictException('Effective practice date ranges cannot overlap');
  if (candidate.code === 'P2002') throw new ConflictException('This effective practice record already exists');
  if (candidate.code === 'P2003') throw new BadRequestException('The referenced staff or engagement is outside this firm');
  throw error;
}

async function replay<T>(tx: TransactionClient, idempotencyKey: string, actorId: string, engagementId: string, hash: string): Promise<T | null> {
  const prior = await tx.commandReceipt.findUnique({ where: { key: idempotencyKey } });
  if (!prior) return null;
  if (prior.actorId !== actorId || prior.engagementId !== engagementId || prior.hash !== hash) throw new ConflictException('Idempotency key reused for a different Practice command');
  return prior.result as T;
}

/** Idempotently install the baseline tiers for a newly provisioned or seeded firm. */
export async function ensurePracticeRateDefaultsForFirm(firmId: string, unitOfWork?: UnitOfWork) {
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    for (const { grade } of RATE_DEFAULTS) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${firmId} || ':' || ${grade}, 0)) IS NULL AS locked`;
    }
    const existing = await tx.practiceRateCard.findMany({ where: { firmId, effectiveFrom: DEFAULT_EFFECTIVE_FROM }, select: { grade: true } });
    const existingGrades = new Set(existing.map(rate => rate.grade));
    const missing = RATE_DEFAULTS.filter(rate => !existingGrades.has(rate.grade));
    if (!missing.length) return;
    await tx.practiceRateCard.createMany({
      data: missing.map(({ grade, hourlyRate }) => ({
        firmId, grade, currency: 'QAR', hourlyRate, effectiveFrom: DEFAULT_EFFECTIVE_FROM, createdBy: null,
      })),
    });
  });
}

export async function listPracticeRateAdministration(actorId: string, engagementId: string) {
  return runUnitOfWork(async ({ client: tx }) => listPracticeRateAdministrationIn(tx, await practiceFirmScope(tx, actorId, engagementId, 'PRACTICE_READ'), ), { isolationLevel: 'RepeatableRead' });
}

async function listPracticeRateAdministrationIn(tx: TransactionClient, firmId: string) {
  const [rateCards, assignments, memberships] = await Promise.all([
    tx.practiceRateCard.findMany({ where: { firmId }, orderBy: [{ grade: 'asc' }, { effectiveFrom: 'desc' }] }),
    tx.practiceStaffGradeAssignment.findMany({ where: { firmId }, include: { user: { select: { email: true, role: true } } }, orderBy: [{ userId: 'asc' }, { effectiveFrom: 'desc' }] }),
    tx.membership.findMany({ where: { firmId }, distinct: ['userId'], select: { user: { select: { id: true, email: true, role: true, active: true } } }, orderBy: { userId: 'asc' } }),
  ]);
  return {
    currency: 'QAR' as const,
    jobGrades: practiceJobGrades,
    rateCards: rateCards.map(rate => ({ ...rate, hourlyRate: rate.hourlyRate.toFixed(6) })),
    assignments: assignments.map(assignment => ({ ...assignment, email: assignment.user.email, accessRole: assignment.user.role, user: undefined })),
    staff: memberships.map(({ user }) => ({ id: user.id, email: user.email, accessRole: user.role, active: user.active })),
  };
}

/** D24 (DN-11): the same report on the firm route. The firm comes from the actor's firm-wide grant, and no engagement is named. */
export async function listPracticeRateAdministrationForActor(actorId: string) {
  return runUnitOfWork(async ({ client: tx }) => listPracticeRateAdministrationIn(tx, await firmForActor(tx, actorId, 'PRACTICE_READ'), ), { isolationLevel: 'RepeatableRead' });
}

export async function schedulePracticeRateCard(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body: RateInput = parse(createPracticeRateCardSchema, input);
  const rate = Decimal6.from(body.hourlyRate);
  if (!rate.isPositive()) throw new BadRequestException('A charge-out rate must be greater than zero');
  const effectiveFrom = toDate(body.effectiveFrom);
  const effectiveTo = body.effectiveTo ? toDate(body.effectiveTo) : null;
  const hash = createHash('sha256').update(JSON.stringify({ engagementId, action: 'PRACTICE_RATE_CARD_SCHEDULED', body })).digest('hex');
  try {
    return await withUnitOfWork(unitOfWork, async ({ client: tx }) => {
      await lockForUpdate(tx, 'Engagement', engagementId);
      const firmId = await practiceFirmScope(tx, actorId, engagementId, 'PRACTICE_MANAGE');
      const priorResult = await replay<PracticeRateCardResult>(tx, body.idempotencyKey, actorId, engagementId, hash);
      if (priorResult) return priorResult;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${firmId} || ':' || ${body.grade}, 0)) IS NULL AS locked`;
      const history = await tx.practiceRateCard.findMany({ where: { firmId, grade: body.grade }, orderBy: { effectiveFrom: 'desc' } });
      const previous = history[0];
      const previousWasOpenEnded = previous?.effectiveTo === null;
      if ((previous?.version ?? 0) !== body.expectedPreviousVersion) throw new ConflictException('Rate-card history changed; reload the current rates before scheduling a revision');
      if (previous && previous.effectiveFrom >= effectiveFrom) throw new ConflictException('Rate revisions must be scheduled after the latest effective start date');
      if (previous?.effectiveTo === null) {
        const closed = await tx.practiceRateCard.updateMany({ where: { id: previous.id, firmId, version: previous.version, effectiveTo: null }, data: { effectiveTo: effectiveFrom, version: { increment: 1 } } });
        if (closed.count !== 1) throw new ConflictException('The current rate changed; reload before scheduling a revision');
      }
      const startText = body.effectiveFrom;
      const endText = body.effectiveTo ?? null;
      const overlaps = history.some(item => rangeOverlaps(startText, endText, isoDate(item.effectiveFrom), item.id === previous?.id && previousWasOpenEnded ? startText : item.effectiveTo ? isoDate(item.effectiveTo) : null));
      if (overlaps) throw new ConflictException('Effective practice rate-card ranges cannot overlap');
      const created = await tx.practiceRateCard.create({ data: {
        firmId, grade: body.grade, currency: 'QAR', hourlyRate: rate.toString(), effectiveFrom, effectiveTo, createdBy: actorId,
      } });
      const result: PracticeRateCardResult = { id: created.id, grade: created.grade, currency: created.currency, hourlyRate: created.hourlyRate.toFixed(6), effectiveFrom: isoDate(created.effectiveFrom), effectiveTo: created.effectiveTo ? isoDate(created.effectiveTo) : null, version: created.version, createdAt: created.createdAt.toISOString() };
      await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PRACTICE_RATE_CARD_SCHEDULED', payload: { firmId, id: created.id, grade: created.grade, currency: created.currency, hourlyRate: result.hourlyRate, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo ?? null } } });
      await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
      return result;
    });
  } catch (error) { mapWriteFailure(error); }
}

export async function assignPracticeStaffGrade(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body: GradeInput = parse(createPracticeStaffGradeAssignmentSchema, input);
  const effectiveFrom = toDate(body.effectiveFrom);
  const effectiveTo = body.effectiveTo ? toDate(body.effectiveTo) : null;
  const hash = createHash('sha256').update(JSON.stringify({ engagementId, action: 'PRACTICE_STAFF_GRADE_ASSIGNED', body })).digest('hex');
  try {
    return await withUnitOfWork(unitOfWork, async ({ client: tx }) => {
      await lockForUpdate(tx, 'Engagement', engagementId);
      const firmId = await practiceFirmScope(tx, actorId, engagementId, 'PRACTICE_MANAGE');
      const priorResult = await replay<PracticeGradeAssignmentResult>(tx, body.idempotencyKey, actorId, engagementId, hash);
      if (priorResult) return priorResult;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${firmId} || ':' || ${body.userId}, 0)) IS NULL AS locked`;
      const staff = await tx.user.findFirst({ where: { id: body.userId, active: true }, select: { id: true, email: true, role: true } });
      if (!staff) throw new NotFoundException('Active local staff identity not found');
      const membershipCount = await tx.membership.count({ where: { userId: staff.id, firmId } });
      if (!membershipCount) throw new ForbiddenException('Staff must be assigned to an engagement in this firm before receiving a practice grade');
      const history = await tx.practiceStaffGradeAssignment.findMany({ where: { firmId, userId: staff.id }, orderBy: { effectiveFrom: 'desc' } });
      const previous = history[0];
      const previousWasOpenEnded = previous?.effectiveTo === null;
      if ((previous?.version ?? 0) !== body.expectedPreviousVersion) throw new ConflictException('Staff-grade history changed; reload before scheduling a revision');
      if (previous && previous.effectiveFrom >= effectiveFrom) throw new ConflictException('Grade revisions must be scheduled after the latest effective start date');
      if (previous?.effectiveTo === null) {
        const closed = await tx.practiceStaffGradeAssignment.updateMany({ where: { id: previous.id, firmId, version: previous.version, effectiveTo: null }, data: { effectiveTo: effectiveFrom, version: { increment: 1 } } });
        if (closed.count !== 1) throw new ConflictException('The current staff grade changed; reload before scheduling a revision');
      }
      const startText = body.effectiveFrom;
      const endText = body.effectiveTo ?? null;
      if (history.some(item => rangeOverlaps(startText, endText, isoDate(item.effectiveFrom), item.id === previous?.id && previousWasOpenEnded ? startText : item.effectiveTo ? isoDate(item.effectiveTo) : null))) {
        throw new ConflictException('Effective staff-grade ranges cannot overlap');
      }
      const created = await tx.practiceStaffGradeAssignment.create({ data: {
        firmId, userId: staff.id, grade: body.grade, effectiveFrom, effectiveTo, assignedBy: actorId,
      }, include: { user: { select: { email: true, role: true } } } });
      const result: PracticeGradeAssignmentResult = { id: created.id, userId: created.userId, email: created.user.email, accessRole: created.user.role, grade: created.grade, effectiveFrom: isoDate(created.effectiveFrom), effectiveTo: created.effectiveTo ? isoDate(created.effectiveTo) : null, version: created.version, createdAt: created.createdAt.toISOString() };
      await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PRACTICE_STAFF_GRADE_ASSIGNED', payload: { firmId, assignmentId: created.id, userId: staff.id, grade: body.grade, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo ?? null } } });
      await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
      return result;
    });
  } catch (error) { mapWriteFailure(error); }
}

export type PracticeTimeSnapshotInput = {
  firmId: string;
  clientId: string;
  engagementId: string;
  staffUserId: string;
  workDate: string;
  minutes: number;
  /** T140: the phase, FSLI and description are written with the entry; the entry is immutable afterwards. */
  phase?: string | null;
  fsli?: string | null;
  description?: string | null;
};

function decimalFromMinor(minor: bigint) {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = absolute / 1_000_000n;
  const fraction = String(absolute % 1_000_000n).padStart(6, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Exact half-even calculation of the captured QAR value for a whole-minute time entry. */
export function calculatePracticeChargeOutValue(hourlyRate: string, minutes: number) {
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440) throw new BadRequestException('Time entry duration must be 1–1440 whole minutes');
  const rate = Decimal6.from(hourlyRate);
  if (!rate.isPositive()) throw new BadRequestException('A charge-out rate must be greater than zero');
  return decimalFromMinor(roundHalfEvenDiv(rate.minor * BigInt(minutes), 60n));
}

/**
 * Persist the immutable pricing snapshot used by T140's authorized time-entry command.
 * The caller must already have authenticated the actor and checked time-entry write authority;
 * this helper independently enforces firm membership, date-effective grade and rate.
 */
export async function recordAuthorizedPracticeTimeEntrySnapshot(tx: TransactionClient, input: PracticeTimeSnapshotInput) {
  if (!Number.isSafeInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440) throw new BadRequestException('Time entry duration must be 1–1440 whole minutes');
  const workDate = toDate(input.workDate);
  const [membership, staff] = await Promise.all([
    tx.membership.findUnique({ where: { userId_engagementId: { userId: input.staffUserId, engagementId: input.engagementId } }, select: { firmId: true, clientId: true } }),
    tx.user.findUnique({ where: { id: input.staffUserId }, select: { active: true } }),
  ]);
  if (!staff?.active || membership?.firmId !== input.firmId || membership.clientId !== input.clientId) throw new ForbiddenException('Staff member is not assigned to this engagement');
  const assignment = await tx.practiceStaffGradeAssignment.findFirst({ where: {
    firmId: input.firmId, userId: input.staffUserId, effectiveFrom: { lte: workDate },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: workDate } }],
  } });
  if (!assignment) throw new ConflictException('No job grade is effective for this staff member on the work date');
  const rateCard = await tx.practiceRateCard.findFirst({ where: {
    firmId: input.firmId, grade: assignment.grade, currency: 'QAR', effectiveFrom: { lte: workDate },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: workDate } }],
  } });
  if (!rateCard) throw new ConflictException('No charge-out rate is effective for this job grade on the work date');
  const hourlyRate = Decimal6.from(rateCard.hourlyRate.toString());
  const chargeOutValue = calculatePracticeChargeOutValue(hourlyRate.toString(), input.minutes);
  return tx.practiceTimeEntry.create({ data: {
    firmId: input.firmId, clientId: input.clientId, engagementId: input.engagementId, staffUserId: input.staffUserId,
    gradeAssignmentId: assignment.id, rateCardId: rateCard.id, workDate, minutes: input.minutes, grade: assignment.grade,
    currency: 'QAR', hourlyRateSnapshot: hourlyRate.toString(), chargeOutValueSnapshot: chargeOutValue,
    phase: input.phase ?? null, fsli: input.fsli ?? null, description: input.description ?? null,
  } });
}
