import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PracticeFirmProfitLoss, PracticeFirmProfitLossDetail, PracticeFirmProfitLossDetailQuery, PracticeFirmProfitLossQuery, PracticeFirmProfitLossRow, PracticeFirmProfitLossTotals } from '@auditsphere/contracts';
import { db } from '../../platform/db.js';
import { Decimal6 } from '../../platform/decimal6.js';
import { runUnitOfWork, type TransactionClient } from '../../platform/unit-of-work.js';
import { practiceFirmScope } from './ledger.js';
import { firmForActor } from './firm-authority.js';

type RawMovement = {
  accountId: string; code: string; name: string; kind: 'INCOME' | 'EXPENSE';
  currentDebit: string; currentCredit: string; currentEntryCount: bigint;
  comparisonDebit: string; comparisonCredit: string; comparisonEntryCount: bigint;
};
type RawEntry = {
  id: string; journalId: string; accountingDate: Date; reference: string; memo: string; position: number;
  debit: string; credit: string; reversalOf: string | null; reversedBy: boolean;
};
type AccountingMonth = { start: string };
const zero = () => Decimal6.zero();
const fixed = (value: Decimal6) => value.toFixed(6);
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const monthBounds = (month: string): AccountingMonth => ({ start: `${month}-01` });
const plus = (left: Decimal6, right: Decimal6) => left.add(right);

function periodAmount(kind: RawMovement['kind'], debit: string, credit: string) {
  const debits = Decimal6.from(debit), credits = Decimal6.from(credit);
  return kind === 'INCOME' ? credits.subtract(debits) : debits.subtract(credits);
}

function totals(rows: PracticeFirmProfitLossRow[], field: 'currentAmount' | 'comparisonAmount', hasComparison = false): PracticeFirmProfitLossTotals | null {
  if (field === 'comparisonAmount' && !hasComparison) return null;
  const income = rows.filter(row => row.section === 'INCOME').reduce((sum, row) => plus(sum, Decimal6.from(row[field] ?? '0')), zero());
  const expenses = rows.filter(row => row.section === 'EXPENSE').reduce((sum, row) => plus(sum, Decimal6.from(row[field] ?? '0')), zero());
  return { income: fixed(income), expenses: fixed(expenses), net: fixed(income.subtract(expenses)) };
}

async function readReport(tx: TransactionClient, firmId: string, query: PracticeFirmProfitLossQuery): Promise<PracticeFirmProfitLoss> {
  // This first statement starts the REPEATABLE READ snapshot. The timestamp is retained in
  // the report/export as its database as-of context; accounting month bounds remain DATEs.
  const clock = await tx.$queryRaw<Array<{ asOf: Date }>>`SELECT transaction_timestamp() AS "asOf"`;
  const current = monthBounds(query.month), comparison = monthBounds(query.compareMonth ?? '0001-01');
  const movements = await tx.$queryRaw<RawMovement[]>`
    SELECT a.id AS "accountId", a.code, a.name, a.kind,
      COALESCE(SUM(m.debit) FILTER (WHERE m."accountingDate" >= ${current.start}::date AND m."accountingDate" < ${current.start}::date + INTERVAL '1 month'), 0::numeric)::text AS "currentDebit",
      COALESCE(SUM(m.credit) FILTER (WHERE m."accountingDate" >= ${current.start}::date AND m."accountingDate" < ${current.start}::date + INTERVAL '1 month'), 0::numeric)::text AS "currentCredit",
      COUNT(m.id) FILTER (WHERE m."accountingDate" >= ${current.start}::date AND m."accountingDate" < ${current.start}::date + INTERVAL '1 month') AS "currentEntryCount",
      COALESCE(SUM(m.debit) FILTER (WHERE ${query.compareMonth !== undefined} AND m."accountingDate" >= ${comparison.start}::date AND m."accountingDate" < ${comparison.start}::date + INTERVAL '1 month'), 0::numeric)::text AS "comparisonDebit",
      COALESCE(SUM(m.credit) FILTER (WHERE ${query.compareMonth !== undefined} AND m."accountingDate" >= ${comparison.start}::date AND m."accountingDate" < ${comparison.start}::date + INTERVAL '1 month'), 0::numeric)::text AS "comparisonCredit",
      COUNT(m.id) FILTER (WHERE ${query.compareMonth !== undefined} AND m."accountingDate" >= ${comparison.start}::date AND m."accountingDate" < ${comparison.start}::date + INTERVAL '1 month') AS "comparisonEntryCount"
    FROM "PracticeAccount" a
    LEFT JOIN (
      SELECT l."firmId", l."accountId", l.id, l.debit, l.credit, j."accountingDate"
      FROM "PracticeJournalLine" l
      JOIN "PracticeJournal" j ON j."firmId" = l."firmId" AND j.id = l."journalId"
      WHERE j."firmId" = ${firmId}::uuid AND j.status = 'POSTED'
        AND ((j."accountingDate" >= ${current.start}::date AND j."accountingDate" < ${current.start}::date + INTERVAL '1 month')
          OR (${query.compareMonth !== undefined} AND j."accountingDate" >= ${comparison.start}::date AND j."accountingDate" < ${comparison.start}::date + INTERVAL '1 month'))
    ) m ON m."firmId" = a."firmId" AND m."accountId" = a.id
    WHERE a."firmId" = ${firmId}::uuid AND a.kind IN ('INCOME', 'EXPENSE')
    GROUP BY a.id, a.code, a.name, a.kind
    ORDER BY CASE a.kind WHEN 'INCOME' THEN 0 ELSE 1 END, a.code, a.id`;

  const rows: PracticeFirmProfitLossRow[] = movements.map(item => ({
    accountId: item.accountId, code: item.code, name: item.name, section: item.kind,
    currentAmount: fixed(periodAmount(item.kind, item.currentDebit, item.currentCredit)),
    currentEntryCount: Number(item.currentEntryCount),
    comparisonAmount: query.compareMonth === undefined ? null : fixed(periodAmount(item.kind, item.comparisonDebit, item.comparisonCredit)),
    comparisonEntryCount: query.compareMonth === undefined ? null : Number(item.comparisonEntryCount),
  }));
  const currentTotals = totals(rows, 'currentAmount');
  const comparisonTotals = totals(rows, 'comparisonAmount', query.compareMonth !== undefined);
  if (!currentTotals) throw new Error('Current Profit and Loss totals were not calculated');
  const parameters = { month: query.month, compareMonth: query.compareMonth ?? null };
  const snapshotHash = createHash('sha256').update(JSON.stringify({ currency: 'QAR', parameters, rows, currentTotals, comparisonTotals })).digest('hex');
  return {
    currency: 'QAR', parameters, asOf: clock[0]!.asOf.toISOString(), rows, currentTotals, comparisonTotals, snapshotHash,
  };
}

/** Posted firm income and expense movement by accounting month; chart kind is the approved statement mapping. */
export async function firmProfitLoss(actorId: string, engagementId: string, query: PracticeFirmProfitLossQuery): Promise<PracticeFirmProfitLoss> {
  return runUnitOfWork(async ({ client: tx }) => firmProfitLossIn(tx, await practiceFirmScope(tx, actorId, engagementId, 'PRACTICE_READ'), query), { isolationLevel: 'RepeatableRead' });
}

async function firmProfitLossIn(tx: TransactionClient, firmId: string, query: PracticeFirmProfitLossQuery): Promise<PracticeFirmProfitLoss> {
  return readReport(tx, firmId, query);
}

/** D24 (DN-11): the same report on the firm route. The firm comes from the actor's firm-wide grant, and no engagement is named. */
export async function firmProfitLossForActor(actorId: string, query: PracticeFirmProfitLossQuery): Promise<PracticeFirmProfitLoss> {
  return runUnitOfWork(async ({ client: tx }) => firmProfitLossIn(tx, await firmForActor(tx, actorId, 'PRACTICE_READ'), query), { isolationLevel: 'RepeatableRead' });
}

/** Page through posted journal sources only when the report's mapped-account snapshot still matches. */
export async function firmProfitLossAccount(actorId: string, engagementId: string, accountId: string, query: PracticeFirmProfitLossDetailQuery): Promise<PracticeFirmProfitLossDetail> {
  return runUnitOfWork(async ({ client: tx }) => firmProfitLossAccountIn(tx, await practiceFirmScope(tx, actorId, engagementId, 'PRACTICE_READ'), accountId, query), { isolationLevel: 'RepeatableRead' });
}

async function firmProfitLossAccountIn(tx: TransactionClient, firmId: string, accountId: string, query: PracticeFirmProfitLossDetailQuery): Promise<PracticeFirmProfitLossDetail> {
  const report = await readReport(tx, firmId, query);
  if (report.snapshotHash !== query.snapshotHash) throw new ConflictException('Posted Profit and Loss sources changed since this report was loaded. Reload the report before opening journal detail.');
  const account = report.rows.find(row => row.accountId === accountId);
  if (!account) throw new NotFoundException('Mapped income or expense account not found in this firm');
  const month = query.period === 'CURRENT' ? query.month : query.compareMonth;
  if (!month) throw new BadRequestException('A comparison month is required to open comparison detail.');
  const bounds = monthBounds(month);
  const count = await tx.$queryRaw<Array<{ totalCount: bigint }>>`
    SELECT COUNT(*) AS "totalCount"
    FROM "PracticeJournalLine" l JOIN "PracticeJournal" j ON j."firmId" = l."firmId" AND j.id = l."journalId"
    WHERE l."firmId" = ${firmId}::uuid AND l."accountId" = ${accountId}::uuid AND j.status = 'POSTED'
      AND j."accountingDate" >= ${bounds.start}::date AND j."accountingDate" < ${bounds.start}::date + INTERVAL '1 month'`;
  const entries = await tx.$queryRaw<RawEntry[]>`
    SELECT l.id, l."journalId", j."accountingDate", j.reference, j.memo, l.position,
      l.debit::text AS debit, l.credit::text AS credit, j."reversalOf",
      EXISTS (SELECT 1 FROM "PracticeJournal" r WHERE r."firmId" = j."firmId" AND r."reversalOf" = j.id) AS "reversedBy"
    FROM "PracticeJournalLine" l JOIN "PracticeJournal" j ON j."firmId" = l."firmId" AND j.id = l."journalId"
    WHERE l."firmId" = ${firmId}::uuid AND l."accountId" = ${accountId}::uuid AND j.status = 'POSTED'
      AND j."accountingDate" >= ${bounds.start}::date AND j."accountingDate" < ${bounds.start}::date + INTERVAL '1 month'
    ORDER BY j."accountingDate", j.id, l.position OFFSET ${(query.page - 1) * query.pageSize} LIMIT ${query.pageSize}`;
  return {
    parameters: report.parameters, period: query.period, asOf: report.asOf, snapshotHash: report.snapshotHash, account,
    page: query.page, pageSize: query.pageSize, totalCount: Number(count[0]!.totalCount),
    entries: entries.map(entry => ({ ...entry, accountingDate: dateOnly(entry.accountingDate), debit: Decimal6.from(entry.debit).toFixed(6), credit: Decimal6.from(entry.credit).toFixed(6) })),
  };
}

/** D24 (DN-11): the same report on the firm route. The firm comes from the actor's firm-wide grant, and no engagement is named. */
export async function firmProfitLossAccountForActor(actorId: string, accountId: string, query: PracticeFirmProfitLossDetailQuery): Promise<PracticeFirmProfitLossDetail> {
  return runUnitOfWork(async ({ client: tx }) => firmProfitLossAccountIn(tx, await firmForActor(tx, actorId, 'PRACTICE_READ'), accountId, query), { isolationLevel: 'RepeatableRead' });
}
