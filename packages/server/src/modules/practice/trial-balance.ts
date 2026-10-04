import { createHash } from 'node:crypto';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { PracticeFirmTrialBalance, PracticeFirmTrialBalanceDetail, PracticeFirmTrialBalanceDetailQuery, PracticeFirmTrialBalanceQuery } from '@auditsphere/contracts';
import { db } from '../../platform/db.js';
import { Decimal6 } from '../../platform/decimal6.js';
import { runUnitOfWork, type TransactionClient } from '../../platform/unit-of-work.js';
import { practiceFirmScope } from './ledger.js';

type Period = { id: string; startsOn: Date; endsOn: Date; closed: boolean; version: number; lastTransitionReason: string };
type RawBalance = { accountId: string; code: string; name: string; kind: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'; openingBalance: string; periodDebit: string; periodCredit: string };
const zero = () => Decimal6.zero();
const fixed = (value: Decimal6) => value.toFixed(6);
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
function sides(value: Decimal6) {
  return value.compare(zero()) >= 0
    ? { debit: value, credit: zero() }
    : { debit: zero(), credit: value.negate() };
}

async function readReport(tx: TransactionClient, firmId: string, requestedPeriodId?: string): Promise<PracticeFirmTrialBalance> {
  const periods = await tx.practicePeriod.findMany({
    where: { firmId }, orderBy: [{ startsOn: 'desc' }, { id: 'asc' }],
    select: { id: true, startsOn: true, endsOn: true, closed: true, version: true, lastTransitionReason: true },
  }) as Period[];
  const period = requestedPeriodId ? periods.find(item => item.id === requestedPeriodId) : periods[0];
  if (!period) throw new NotFoundException(requestedPeriodId ? 'Accounting period not found in this firm' : 'No Practice accounting period exists for this firm');

  const raw = await tx.$queryRaw<RawBalance[]>`
    SELECT a.id AS "accountId", a.code, a.name, a.kind,
      COALESCE(m."openingBalance", 0::numeric)::text AS "openingBalance",
      COALESCE(m."periodDebit", 0::numeric)::text AS "periodDebit",
      COALESCE(m."periodCredit", 0::numeric)::text AS "periodCredit"
    FROM "PracticeAccount" a
    LEFT JOIN (
      SELECT l."firmId", l."accountId",
        SUM(CASE WHEN j."accountingDate" < ${period.startsOn}::date THEN l.debit - l.credit ELSE 0::numeric END) AS "openingBalance",
        SUM(CASE WHEN j."accountingDate" >= ${period.startsOn}::date THEN l.debit ELSE 0::numeric END) AS "periodDebit",
        SUM(CASE WHEN j."accountingDate" >= ${period.startsOn}::date THEN l.credit ELSE 0::numeric END) AS "periodCredit"
      FROM "PracticeJournal" j
      JOIN "PracticeJournalLine" l ON l."firmId" = j."firmId" AND l."journalId" = j.id
      WHERE j."firmId" = ${firmId}::uuid AND j.status = 'POSTED' AND j."accountingDate" <= ${period.endsOn}::date
      GROUP BY l."firmId", l."accountId"
    ) m ON m."firmId" = a."firmId" AND m."accountId" = a.id
    WHERE a."firmId" = ${firmId}::uuid
    ORDER BY a.code, a.id`;

  const rows = raw.map(item => {
    const opening = Decimal6.from(item.openingBalance);
    const periodDebit = Decimal6.from(item.periodDebit);
    const periodCredit = Decimal6.from(item.periodCredit);
    const closing = opening.add(periodDebit).subtract(periodCredit);
    const openingSides = sides(opening);
    const closingSides = sides(closing);
    return {
      accountId: item.accountId, code: item.code, name: item.name, kind: item.kind,
      openingBalance: fixed(opening), openingDebit: fixed(openingSides.debit), openingCredit: fixed(openingSides.credit),
      periodDebit: fixed(periodDebit), periodCredit: fixed(periodCredit), closingBalance: fixed(closing),
      closingDebit: fixed(closingSides.debit), closingCredit: fixed(closingSides.credit),
    };
  });
  const totals = rows.reduce((sum, row) => ({
    openingDebit: sum.openingDebit.add(Decimal6.from(row.openingDebit)), openingCredit: sum.openingCredit.add(Decimal6.from(row.openingCredit)),
    periodDebit: sum.periodDebit.add(Decimal6.from(row.periodDebit)), periodCredit: sum.periodCredit.add(Decimal6.from(row.periodCredit)),
    closingDebit: sum.closingDebit.add(Decimal6.from(row.closingDebit)), closingCredit: sum.closingCredit.add(Decimal6.from(row.closingCredit)),
  }), { openingDebit: zero(), openingCredit: zero(), periodDebit: zero(), periodCredit: zero(), closingDebit: zero(), closingCredit: zero() });

  if (totals.openingDebit.compare(totals.openingCredit) !== 0 || totals.periodDebit.compare(totals.periodCredit) !== 0 || totals.closingDebit.compare(totals.closingCredit) !== 0) {
    throw new InternalServerErrorException('Posted firm ledger is out of balance; the trial balance cannot be certified.');
  }
  const snapshot = {
    currency: 'QAR' as const, periodId: period.id, startsOn: dateOnly(period.startsOn), endsOn: dateOnly(period.endsOn), rows,
    totals: Object.fromEntries(Object.entries(totals).map(([key, amount]) => [key, fixed(amount)])) as Record<keyof typeof totals, string>,
  };
  const snapshotHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return {
    ...snapshot,
    periods: periods.map(item => ({ ...item, startsOn: dateOnly(item.startsOn), endsOn: dateOnly(item.endsOn) })),
    snapshotHash,
  };
}

/** Firm-wide posted-journal trial balance from one repeatable PostgreSQL snapshot. */
export async function firmTrialBalance(actorId: string, engagementId: string, query: PracticeFirmTrialBalanceQuery): Promise<PracticeFirmTrialBalance> {
  return runUnitOfWork(async ({ client: tx }) => {
    const firmId = await practiceFirmScope(tx, actorId, engagementId, 'PRACTICE_READ');
    return readReport(tx, firmId, query.periodId);
  }, { isolationLevel: 'RepeatableRead' });
}

/** Paged posted journal-line drill-down with the same complete account totals as the report row. */
export async function firmTrialBalanceAccount(actorId: string, engagementId: string, accountId: string, query: PracticeFirmTrialBalanceDetailQuery): Promise<PracticeFirmTrialBalanceDetail> {
  return runUnitOfWork(async ({ client: tx }) => {
    const firmId = await practiceFirmScope(tx, actorId, engagementId, 'PRACTICE_READ');
    const report = await readReport(tx, firmId, query.periodId);
    const account = report.rows.find(item => item.accountId === accountId);
    if (!account) throw new NotFoundException('Account not found in this firm');
    const period = await tx.practicePeriod.findFirst({ where: { id: report.periodId, firmId }, select: { startsOn: true, endsOn: true } });
    if (!period) throw new NotFoundException('Accounting period not found in this firm');
    const where = {
      firmId, accountId,
      journal: { is: { firmId, status: 'POSTED', accountingDate: { lte: period.endsOn } } },
    } as const;
    const [totalCount, lines] = await Promise.all([
      tx.practiceJournalLine.count({ where }),
      tx.practiceJournalLine.findMany({
        where, orderBy: [{ journal: { accountingDate: 'asc' } }, { journalId: 'asc' }, { position: 'asc' }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        select: {
          id: true, journalId: true, position: true, debit: true, credit: true,
          journal: { select: { accountingDate: true, reference: true, memo: true, reversalOf: true, reversedJournals: { select: { id: true }, take: 1 } } },
        },
      }),
    ]);
    return {
      periodId: report.periodId, account, page: query.page, pageSize: query.pageSize, totalCount,
      entries: lines.map(line => ({
        id: line.id, journalId: line.journalId, accountingDate: dateOnly(line.journal.accountingDate),
        reference: line.journal.reference, memo: line.journal.memo, position: line.position,
        debit: line.debit.toFixed(6), credit: line.credit.toFixed(6), isOpeningBalance: line.journal.accountingDate < period.startsOn,
        reversalOf: line.journal.reversalOf,
        reversedBy: line.journal.reversedJournals.length > 0,
      })),
    };
  }, { isolationLevel: 'RepeatableRead' });
}
