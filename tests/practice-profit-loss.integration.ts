import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);

test('monthly firm Profit and Loss reconciles to the Trial Balance and preserves posted-source context', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('practice_profit_loss').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, Decimal6, approveFirmPostingPolicy, createPracticeAccount, createPracticePeriod, createPracticeJournal, postPracticeJournal, reversePracticeJournal, firmTrialBalance, firmProfitLoss, firmProfitLossAccount, firmProfitLossForActor } = await import('@auditsphere/server');
    const { practiceFirmProfitLossQuerySchema } = await import('@auditsphere/contracts');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), actorId = randomUUID(), unassignedId = randomUUID();
      await db.firm.create({ data: { id: firmId, name: 'Profit and loss firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Synthetic client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Profit and loss acceptance' } });
      await db.user.createMany({ data: [
        { id: actorId, email: 'profit-loss@example.test', role: 'BILLING' },
        { id: unassignedId, email: 'unassigned-pl@example.test', role: 'BILLING' },
      ] });
      await db.membership.create({ data: { userId: actorId, firmId, clientId, engagementId, role: 'BILLING' } });
      await db.roleGrant.create({ data: { userId: actorId, capability: 'PRACTICE_READ', firmId, grantedBy: actorId } });
      for (const capability of ['PRACTICE_MANAGE', 'PRACTICE_POST'] as const) {
        await db.roleGrant.create({ data: { userId: actorId, capability, firmId, grantedBy: actorId } });
      }

      const cash = await createPracticeAccount(actorId, engagementId, { code: '100', name: 'Cash', kind: 'ASSET' });
      const capital = await createPracticeAccount(actorId, engagementId, { code: '300', name: 'Capital', kind: 'EQUITY' });
      const drawings = await createPracticeAccount(actorId, engagementId, { code: '310', name: 'Partner drawings', kind: 'EQUITY' });
      const payable = await createPracticeAccount(actorId, engagementId, { code: '210', name: 'Accrued expenses', kind: 'LIABILITY' });
      const income = await createPracticeAccount(actorId, engagementId, { code: '400', name: 'Audit fees', kind: 'INCOME' });
      const expense = await createPracticeAccount(actorId, engagementId, { code: '500', name: 'Office expense', kind: 'EXPENSE' });
      const prior = await createPracticePeriod(actorId, engagementId, { startsOn: '2025-01-01', endsOn: '2025-12-31' });
      const current = await createPracticePeriod(actorId, engagementId, { startsOn: '2026-04-01', endsOn: '2026-04-30' });
      await approveFirmPostingPolicy(actorId, engagementId, { policyVersion: 'PL-TEST-1', revenueTreatment: 'DEFERRED_UNTIL_RELEASE', taxTreatment: 'NO_TAX', idempotencyKey: randomUUID() });

      const post = async (periodId: string, accountingDate: string, reference: string, debitAccountId: string, creditAccountId: string, amount: string) => {
        const draft = await createPracticeJournal(actorId, engagementId, {
          periodId, accountingDate, reference, memo: reference, idempotencyKey: randomUUID(),
          lines: [{ accountId: debitAccountId, debit: amount, credit: '0' }, { accountId: creditAccountId, debit: '0', credit: amount }],
        });
        return postPracticeJournal(actorId, engagementId, draft.id, { expectedVersion: 1, idempotencyKey: randomUUID() });
      };
      await post(prior.id, '2025-04-01', 'PRIOR-REVENUE', cash.id, income.id, '80');
      await post(prior.id, '2025-04-02', 'PRIOR-EXPENSE', expense.id, cash.id, '30');
      await post(prior.id, '2025-04-03', 'PRIOR-WITHDRAWAL', drawings.id, cash.id, '12');
      await post(prior.id, '2025-04-04', 'PRIOR-BALANCE-MOVEMENT', cash.id, payable.id, '15');

      await post(current.id, '2026-04-03', 'CURRENT-REVENUE', cash.id, income.id, '25');
      await post(current.id, '2026-04-05', 'CURRENT-EXPENSE', expense.id, cash.id, '7.5');
      const reversed = await post(current.id, '2026-04-06', 'CURRENT-EXPENSE-REVERSED', expense.id, cash.id, '4');
      const reversal = await reversePracticeJournal(actorId, engagementId, reversed.id, {
        expectedVersion: 2, idempotencyKey: randomUUID(), periodId: current.id, accountingDate: '2026-04-07', reference: 'CURRENT-EXPENSE-REVERSAL',
      });
      assert.equal(reversal.reversalOf, reversed.id);
      await post(current.id, '2026-04-08', 'CURRENT-WITHDRAWAL', drawings.id, cash.id, '3');
      await post(current.id, '2026-04-09', 'CURRENT-BALANCE-MOVEMENT', payable.id, cash.id, '6');
      const draft = await createPracticeJournal(actorId, engagementId, {
        periodId: current.id, accountingDate: '2026-04-10', reference: 'DRAFT-EXCLUDED', memo: 'Not a posted journal', idempotencyKey: randomUUID(),
        lines: [{ accountId: cash.id, debit: '900', credit: '0' }, { accountId: income.id, debit: '0', credit: '900' }],
      });
      assert.equal(draft.status, 'DRAFT');

      const query = { month: '2026-04', compareMonth: '2025-04' } as const;
      assert.equal(practiceFirmProfitLossQuerySchema.safeParse({ month: '2026-04', compareMonth: '2026-04' }).success, false, 'a month cannot be compared with itself');
      assert.equal(practiceFirmProfitLossQuerySchema.safeParse({ month: '2026-13' }).success, false, 'invalid calendar months are rejected');
      await assert.rejects(firmProfitLoss(unassignedId, engagementId, query), /Engagement assignment is required/);

      const report = await firmProfitLoss(actorId, engagementId, query);
      // asOf is stamped per call; the figures, snapshot and rows must match exactly.
      const withoutClock = (view: object) => { const copy: Record<string, unknown> = { ...view }; delete copy.asOf; return copy; };
      assert.deepEqual(withoutClock(await firmProfitLossForActor(actorId, query)), withoutClock(report), 'the firm profit-and-loss route serves the same report without an engagement (D24)');
      const repeated = await firmProfitLoss(actorId, engagementId, query);
      assert.equal(report.snapshotHash, repeated.snapshotHash, 'same posted chart data and parameters produce a stable report hash');
      assert.equal(report.parameters.month, '2026-04');
      assert.equal(report.parameters.compareMonth, '2025-04');
      assert.ok(Number.isFinite(Date.parse(report.asOf)), 'report stores its PostgreSQL as-of timestamp');
      assert.deepEqual(report.currentTotals, { income: '25.000000', expenses: '7.500000', net: '17.500000' });
      assert.deepEqual(report.comparisonTotals, { income: '80.000000', expenses: '30.000000', net: '50.000000' });
      assert.ok(report.rows.every(row => row.section === 'INCOME' || row.section === 'EXPENSE'));
      assert.ok(!report.rows.some(row => row.accountId === drawings.id || row.accountId === payable.id || row.accountId === cash.id), 'withdrawals and balance-sheet accounts are outside the P&L mapping');
      assert.equal(report.rows.find(row => row.accountId === expense.id)?.currentEntryCount, 3, 'a source and its exact reversal remain visible without changing net expense');

      const currentTb = await firmTrialBalance(actorId, engagementId, { periodId: current.id });
      const priorTb = await firmTrialBalance(actorId, engagementId, { periodId: prior.id });
      const incomeRow = report.rows.find(row => row.accountId === income.id)!;
      const expenseRow = report.rows.find(row => row.accountId === expense.id)!;
      const currentIncome = currentTb.rows.find(row => row.accountId === income.id)!;
      const currentExpense = currentTb.rows.find(row => row.accountId === expense.id)!;
      const priorIncome = priorTb.rows.find(row => row.accountId === income.id)!;
      const priorExpense = priorTb.rows.find(row => row.accountId === expense.id)!;
      assert.equal(incomeRow.currentAmount, Decimal6.from(currentIncome.periodCredit).subtract(Decimal6.from(currentIncome.periodDebit)).toFixed(6), 'current month income reconciles to the matching Trial Balance movement');
      assert.equal(expenseRow.currentAmount, Decimal6.from(currentExpense.periodDebit).subtract(Decimal6.from(currentExpense.periodCredit)).toFixed(6), 'current month expense reconciles to the matching Trial Balance movement');
      assert.equal(incomeRow.comparisonAmount, Decimal6.from(priorIncome.periodCredit).subtract(Decimal6.from(priorIncome.periodDebit)).toFixed(6), 'comparison income reconciles to the prior Trial Balance movement');
      assert.equal(expenseRow.comparisonAmount, Decimal6.from(priorExpense.periodDebit).subtract(Decimal6.from(priorExpense.periodCredit)).toFixed(6), 'comparison expense reconciles to the prior Trial Balance movement');

      const currentDetail = await firmProfitLossAccount(actorId, engagementId, income.id, { ...query, period: 'CURRENT', snapshotHash: report.snapshotHash, page: 1, pageSize: 50 });
      assert.equal(currentDetail.totalCount, 1);
      assert.equal(currentDetail.entries[0]?.reference, 'CURRENT-REVENUE');
      assert.equal(currentDetail.entries[0]?.accountingDate, '2026-04-03');
      const comparisonDetail = await firmProfitLossAccount(actorId, engagementId, income.id, { ...query, period: 'COMPARISON', snapshotHash: report.snapshotHash, page: 1, pageSize: 50 });
      assert.equal(comparisonDetail.entries[0]?.reference, 'PRIOR-REVENUE');
      const expenseDetail = await firmProfitLossAccount(actorId, engagementId, expense.id, { ...query, period: 'CURRENT', snapshotHash: report.snapshotHash, page: 1, pageSize: 50 });
      assert.equal(expenseDetail.totalCount, 3);
      assert.ok(expenseDetail.entries.some(entry => entry.reference === 'CURRENT-EXPENSE-REVERSED' && entry.reversedBy));
      assert.ok(expenseDetail.entries.some(entry => entry.reversalOf === reversed.id));

      const timestamp = await db.$queryRaw<Array<{ postedAt: Date }>>`SELECT "postedAt" FROM "PracticeJournal" WHERE "firmId" = ${firmId}::uuid AND reference = 'CURRENT-REVENUE'`;
      assert.ok(timestamp[0]!.postedAt.getTime() > Date.parse('2026-04-30T23:59:59.000Z'), 'the journal was posted after the accounting month but remains in April P&L by accountingDate');

      await post(current.id, '2026-04-20', 'LATE-BACKDATED-REVENUE', cash.id, income.id, '1');
      await assert.rejects(firmProfitLossAccount(actorId, engagementId, income.id, { ...query, period: 'CURRENT', snapshotHash: report.snapshotHash, page: 1, pageSize: 50 }), (error: unknown) => {
        const candidate = error as { getStatus?: () => number };
        return candidate.getStatus?.() === 409;
      }, 'detail refuses a stale report rather than showing source lines that do not reconcile');
      const updated = await firmProfitLoss(actorId, engagementId, query);
      assert.notEqual(updated.snapshotHash, report.snapshotHash);
      assert.equal(updated.currentTotals.income, '26.000000');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
