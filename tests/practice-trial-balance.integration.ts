import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);

test('firm trial balance reconciles prior/current periods, excludes drafts and drills down through reversals', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('practice_trial_balance').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, Decimal6, approveFirmPostingPolicy, createPracticeAccount, createPracticePeriod, createPracticeJournal, postPracticeJournal, reversePracticeJournal, firmTrialBalance, firmTrialBalanceAccount, firmTrialBalanceForActor, firmTrialBalanceAccountForActor } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), actorId = randomUUID(), unassignedId = randomUUID();
      await db.firm.create({ data: { id: firmId, name: 'Trial balance firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Synthetic client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Trial balance acceptance' } });
      await db.user.createMany({ data: [
        { id: actorId, email: 'trial-balance@example.test', role: 'BILLING' },
        { id: unassignedId, email: 'unassigned@example.test', role: 'BILLING' },
      ] });
      await db.membership.create({ data: { userId: actorId, firmId, clientId, engagementId, role: 'BILLING' } });
      for (const capability of ['PRACTICE_READ', 'PRACTICE_MANAGE', 'PRACTICE_POST'] as const) {
        await db.roleGrant.create({ data: { userId: actorId, capability, firmId, grantedBy: actorId } });
      }
      const cash = await createPracticeAccount(actorId, engagementId, { code: '100', name: 'Cash', kind: 'ASSET' });
      const capital = await createPracticeAccount(actorId, engagementId, { code: '300', name: 'Capital', kind: 'EQUITY' });
      const revenue = await createPracticeAccount(actorId, engagementId, { code: '400', name: 'Revenue', kind: 'INCOME' });
      const expense = await createPracticeAccount(actorId, engagementId, { code: '500', name: 'Office expense', kind: 'EXPENSE' });
      const prior = await createPracticePeriod(actorId, engagementId, { startsOn: '2025-01-01', endsOn: '2025-12-31' });
      const current = await createPracticePeriod(actorId, engagementId, { startsOn: '2026-01-01', endsOn: '2026-12-31' });
      await approveFirmPostingPolicy(actorId, engagementId, { policyVersion: 'TB-TEST-1', revenueTreatment: 'DEFERRED_UNTIL_RELEASE', taxTreatment: 'NO_TAX', idempotencyKey: randomUUID() });

      const post = async (periodId: string, date: string, reference: string, debitAccountId: string, creditAccountId: string, amount: string) => {
        const draft = await createPracticeJournal(actorId, engagementId, {
          periodId, accountingDate: date, reference, memo: reference, idempotencyKey: randomUUID(),
          lines: [{ accountId: debitAccountId, debit: amount, credit: '0' }, { accountId: creditAccountId, debit: '0', credit: amount }],
        });
        return postPracticeJournal(actorId, engagementId, draft.id, { expectedVersion: 1, idempotencyKey: randomUUID() });
      };
      await post(prior.id, '2025-12-31', 'OPENING-POSTED', cash.id, capital.id, '100');
      await post(current.id, '2026-04-03', 'CURRENT-POSTED', cash.id, revenue.id, '25');
      const source = await post(current.id, '2026-04-05', 'REVERSED-SOURCE', expense.id, cash.id, '7.5');
      const reversal = await reversePracticeJournal(actorId, engagementId, source.id, {
        expectedVersion: 2, idempotencyKey: randomUUID(), periodId: current.id, accountingDate: '2026-04-06', reference: 'CURRENT-REVERSAL',
      });
      assert.equal(reversal.reversalOf, source.id);
      const draft = await createPracticeJournal(actorId, engagementId, {
        periodId: current.id, accountingDate: '2026-04-07', reference: 'DRAFT-EXCLUDED', memo: 'Must not affect report', idempotencyKey: randomUUID(),
        lines: [{ accountId: cash.id, debit: '900', credit: '0' }, { accountId: revenue.id, debit: '0', credit: '900' }],
      });
      assert.equal(draft.status, 'DRAFT');

      await assert.rejects(firmTrialBalance(unassignedId, engagementId, { periodId: current.id }), /Engagement assignment is required/);
      const report = await firmTrialBalance(actorId, engagementId, { periodId: current.id });
      // D24 (DN-11): the firm route serves the same ledger snapshot without naming an engagement, and refuses an actor with no firm-wide grant.
      assert.deepEqual(await firmTrialBalanceForActor(actorId, { periodId: current.id }), report, 'the firm route serves the same ledger snapshot');
      await assert.rejects(firmTrialBalanceForActor(unassignedId, { periodId: current.id }), /requires an active firm-wide grant/);
      assert.equal(report.startsOn, '2026-01-01');
      assert.equal(report.snapshotHash, (await firmTrialBalance(actorId, engagementId, { periodId: current.id })).snapshotHash, 'same ledger snapshot must hash deterministically');
      assert.equal(report.totals.openingDebit, '100.000000');
      assert.equal(report.totals.openingCredit, '100.000000');
      assert.equal(report.totals.periodDebit, '40.000000');
      assert.equal(report.totals.periodCredit, '40.000000');
      assert.equal(report.totals.closingDebit, '125.000000');
      assert.equal(report.totals.closingCredit, '125.000000');
      const cashRow = report.rows.find(row => row.accountId === cash.id);
      assert.deepEqual(cashRow && [cashRow.openingDebit, cashRow.periodDebit, cashRow.periodCredit, cashRow.closingDebit], ['100.000000', '32.500000', '7.500000', '125.000000']);
      const expenseRow = report.rows.find(row => row.accountId === expense.id);
      assert.deepEqual(expenseRow && [expenseRow.periodDebit, expenseRow.periodCredit, expenseRow.closingBalance], ['7.500000', '7.500000', '0.000000'], 'a posted reversal remains visible and nets to zero');

      const firstPage = await firmTrialBalanceAccount(actorId, engagementId, cash.id, { periodId: current.id, page: 1, pageSize: 2 });
      assert.deepEqual(await firmTrialBalanceAccountForActor(actorId, cash.id, { periodId: current.id, page: 1, pageSize: 2 }), firstPage, 'the firm drill-down matches the engagement drill-down');
      assert.equal(firstPage.totalCount, 4, 'the detail includes posted opening history through period end and excludes the draft');
      assert.equal(firstPage.account.closingBalance, cashRow?.closingBalance);
      const secondPage = await firmTrialBalanceAccount(actorId, engagementId, cash.id, { periodId: current.id, page: 2, pageSize: 2 });
      const entries = [...firstPage.entries, ...secondPage.entries];
      assert.equal(entries.length, 4);
      assert.ok(entries.some(entry => entry.reference === 'OPENING-POSTED' && entry.isOpeningBalance));
      assert.ok(entries.some(entry => entry.reference === 'REVERSED-SOURCE' && entry.reversedBy));
      assert.ok(entries.some(entry => entry.reference === 'CURRENT-REVERSAL' && entry.reversalOf === source.id));
      assert.deepEqual(Object.fromEntries(entries.map(entry => [entry.reference, [entry.debit, entry.credit]])), {
        'OPENING-POSTED': ['100.000000', '0.000000'],
        'CURRENT-POSTED': ['25.000000', '0.000000'],
        'REVERSED-SOURCE': ['0.000000', '7.500000'],
        'CURRENT-REVERSAL': ['7.500000', '0.000000'],
      });
      const cashClosingBalance = entries.reduce((balance, entry) => balance.add(Decimal6.from(entry.debit)).subtract(Decimal6.from(entry.credit)), Decimal6.zero());
      assert.equal(cashClosingBalance.toFixed(6), cashRow?.closingBalance, 'complete posted account history through period end reconciles to its closing balance');
      await assert.rejects(firmTrialBalanceAccount(actorId, engagementId, randomUUID(), { periodId: current.id, page: 1, pageSize: 50 }), (error: unknown) => {
        const candidate = error as { getStatus?: () => number };
        return candidate.getStatus?.() === 404;
      });
      const indexes = await db.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('PracticePeriod_firm_starts_on_idx', 'PracticeJournal_firm_status_date_idx', 'PracticeJournalLine_firm_journal_account_idx')`;
      assert.equal(indexes.length, 3, 'period and posted-account report access paths are indexed');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
