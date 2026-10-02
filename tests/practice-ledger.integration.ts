import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
test('firm practice ledger enforces scope, balanced posting, period locks, immutable lines and exact reversals', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('practice_ledger').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, approveFirmPostingPolicy, createPracticeAccount, createPracticePeriod, createPracticeJournal, postPracticeJournal, reversePracticeJournal, closePracticePeriod, reopenPracticePeriod, practiceLedger } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), actorId = randomUUID();
      await db.firm.create({ data: { id: firmId, name: 'Ledger firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Audit engagement' } });
      await db.user.create({ data: { id: actorId, email: 'ledger@example.test', role: 'PREPARER' } });
      await db.roleGrant.create({ data: { userId: actorId, capability: 'PRACTICE_MANAGE', firmId, clientId, engagementId, grantedBy: actorId } });
      await assert.rejects(createPracticeAccount(actorId, engagementId, { code: '100', name: 'Cash', kind: 'ASSET' }), /firm-wide/);
      for (const capability of ['PRACTICE_MANAGE','PRACTICE_POST','PRACTICE_READ']) await db.roleGrant.create({ data: { userId: actorId, capability, firmId, grantedBy: actorId } });
      const cash = await createPracticeAccount(actorId, engagementId, { code: '100', name: 'Cash', kind: 'ASSET' });
      await assert.rejects(createPracticeAccount(actorId, engagementId, { code: '100', name: 'Duplicate cash', kind: 'ASSET' }), (error: any) => error.getStatus?.() === 409 && /already exists/.test(error.message));
      const rent = await createPracticeAccount(actorId, engagementId, { code: '500', name: 'Rent', kind: 'EXPENSE' });
      const period = await createPracticePeriod(actorId, engagementId, { startsOn: '2026-01-01', endsOn: '2026-12-31' });
      await assert.rejects(createPracticePeriod(actorId, engagementId, { startsOn: '2026-06-01', endsOn: '2027-05-31' }), (error: any) => error.getStatus?.() === 409 && /overlap/.test(error.message));
      const create = (reference: string, debit = '0.30', credit = '0.30') => createPracticeJournal(actorId, engagementId, { periodId: period.id, accountingDate: '2026-10-02', reference, memo: 'Rent payment', idempotencyKey: randomUUID(), lines: [{ accountId: rent.id, debit, credit: '0' }, { accountId: cash.id, debit: '0', credit }] });
      const unbalanced = await create('BAD', '0.31', '0.30');
      await assert.rejects(postPracticeJournal(actorId, engagementId, unbalanced.id, { expectedVersion: 1, idempotencyKey: randomUUID() }), /Approved firm posting policy/);
      await approveFirmPostingPolicy(actorId, engagementId, { policyVersion: 'TEST-D07-1', revenueTreatment: 'DEFERRED_UNTIL_RELEASE', taxTreatment: 'NO_TAX', idempotencyKey: randomUUID() });
      await assert.rejects(postPracticeJournal(actorId, engagementId, unbalanced.id, { expectedVersion: 1, idempotencyKey: randomUUID() }), /balanced/);
      assert.equal((await db.practiceJournal.findUniqueOrThrow({ where: { id: unbalanced.id } })).status, 'DRAFT');
      const journal = await create('RENT');
      const header = await createPracticeAccount(actorId, engagementId, { code: '999', name: 'Nonposting heading', kind: 'EXPENSE', posting: false });
      await assert.rejects(createPracticeJournal(actorId, engagementId, { periodId: period.id, accountingDate: '2026-10-02', reference: 'HEADER', memo: 'Invalid heading', idempotencyKey: randomUUID(), lines: [{ accountId: header.id, debit: '1', credit: '0' }, { accountId: cash.id, debit: '0', credit: '1' }] }), /nonposting/);
      const racing = await create('RACE');
      await Promise.allSettled([
        db.practiceJournalLine.update({ where: { id: racing.lines[0].id }, data: { debit: '0.31' } }),
        postPracticeJournal(actorId, engagementId, racing.id, { expectedVersion: 1, idempotencyKey: randomUUID() }),
      ]);
      const raced = await db.practiceJournal.findUniqueOrThrow({ where: { id: racing.id }, include: { lines: true } });
      if (raced.status === 'POSTED') assert.equal(raced.lines[0].debit.toString(), '0.3', 'a concurrent edit cannot invalidate a posted balance');
      // Neutralize any successful RACE posting with a genuine reversal, keeping report assertions isolated.
      if (raced.status === 'POSTED') await reversePracticeJournal(actorId, engagementId, racing.id, { expectedVersion: 2, idempotencyKey: randomUUID(), periodId: period.id, accountingDate: '2026-10-02', reference: 'REV-RACE' });
      const key = randomUUID();
      const posted = await postPracticeJournal(actorId, engagementId, journal.id, { expectedVersion: 1, idempotencyKey: key });
      assert.deepEqual(await postPracticeJournal(actorId, engagementId, journal.id, { expectedVersion: 1, idempotencyKey: key }), posted);
      await assert.rejects(db.practiceJournalLine.update({ where: { id: journal.lines[0].id }, data: { debit: '0.31' } }), /immutable/);
      await assert.rejects(db.practiceJournal.update({ where: { id: journal.id }, data: { memo: 'Change posted memo' } }), /immutable/);
      const before = await practiceLedger(actorId, engagementId);
      assert.equal(before.balances.find(a => a.code === '500')?.balance, '0.300000');
      const reversal = await reversePracticeJournal(actorId, engagementId, journal.id, { expectedVersion: 2, idempotencyKey: randomUUID(), periodId: period.id, accountingDate: '2026-10-02', reference: 'REV-RENT' });
      assert.equal(reversal.status, 'POSTED');
      assert.equal((await practiceLedger(actorId, engagementId)).balances.find(a => a.code === '500')?.balance, '0.000000');
      await assert.rejects(reversePracticeJournal(actorId, engagementId, journal.id, { expectedVersion: 2, idempotencyKey: randomUUID(), periodId: period.id, accountingDate: '2026-10-02', reference: 'REV-RENT-2' }), /already reversed/);
      const closingPeriod = await createPracticePeriod(actorId, engagementId, { startsOn: '2027-01-01', endsOn: '2027-12-31' });
      const createClosing = (reference: string) => createPracticeJournal(actorId, engagementId, { periodId: closingPeriod.id, accountingDate: '2027-02-10', reference, memo: 'Year-end correction', idempotencyKey: randomUUID(), lines: [{ accountId: rent.id, debit: '0.30', credit: '0' }, { accountId: cash.id, debit: '0', credit: '0.30' }] });
      const closeDraft = await createClosing('CLOSE-DRAFT');
      const closeCommand = { expectedVersion: 1, idempotencyKey: randomUUID(), reason: 'Month-end review is complete.' };
      await assert.rejects(closePracticePeriod(actorId, engagementId, closingPeriod.id, closeCommand), /All journals in the period must be posted/);
      assert.equal((await db.practicePeriod.findUniqueOrThrow({ where: { id: closingPeriod.id } })).closed, false, 'a failed close leaves the period open');
      await postPracticeJournal(actorId, engagementId, closeDraft.id, { expectedVersion: 1, idempotencyKey: randomUUID() });
      const closing = await createClosing('CLOSE-READY');
      await postPracticeJournal(actorId, engagementId, closing.id, { expectedVersion: 1, idempotencyKey: randomUUID() });
      // Reversal into a closed period is rejected before a reversal header or lines are written.
      const closeKey = randomUUID();
      const closeBody = { expectedVersion: 1, idempotencyKey: closeKey, reason: 'All draft journals have been reviewed.' };
      const closed = await closePracticePeriod(actorId, engagementId, closingPeriod.id, closeBody);
      assert.deepEqual(await closePracticePeriod(actorId, engagementId, closingPeriod.id, closeBody), closed, 'idempotent close must not advance the version twice');
      assert.equal(closed.version, 2);
      await assert.rejects(reversePracticeJournal(actorId, engagementId, closing.id, { expectedVersion: 2, idempotencyKey: randomUUID(), periodId: closingPeriod.id, accountingDate: '2027-02-10', reference: 'REV-CLOSED' }), /reversal must use an open accounting period/);
      await assert.rejects(createPracticeJournal(actorId, engagementId, { periodId: closingPeriod.id, accountingDate: '2027-02-10', reference: 'CLOSED-DRAFT', memo: 'Must fail', idempotencyKey: randomUUID(), lines: [{ accountId: rent.id, debit: '1', credit: '0' }, { accountId: cash.id, debit: '0', credit: '1' }] }), /open period/);
      await assert.rejects(db.practiceJournal.create({ data: { firmId, periodId: closingPeriod.id, accountingDate: new Date('2027-02-10T00:00:00.000Z'), reference: 'DIRECT-CLOSED', memo: 'Database guard', createdBy: actorId } }), /open accounting period/);
      // A caller-controlled search path and fake open period cannot bypass the database guard.
      await assert.rejects(db.$transaction(async tx => {
        await tx.$executeRawUnsafe('CREATE TEMP TABLE "PracticePeriod" AS SELECT * FROM public."PracticePeriod"');
        await tx.$executeRawUnsafe('UPDATE pg_temp."PracticePeriod" SET closed = false');
        await tx.$executeRawUnsafe('SET LOCAL search_path TO pg_temp, public');
        await tx.$executeRaw`INSERT INTO public."PracticeJournal" (id, "firmId", "periodId", "accountingDate", reference, memo, "createdBy") VALUES (${randomUUID()}::uuid, ${firmId}::uuid, ${closingPeriod.id}::uuid, DATE '2027-02-10', 'SEARCH-PATH-CLOSED', 'Must resolve actual period', ${actorId}::uuid)`;
      }), /open accounting period/);
      await assert.rejects(reopenPracticePeriod(actorId, engagementId, closingPeriod.id, { expectedVersion: 2, idempotencyKey: randomUUID(), reason: 'Approved correction period.' }), (error: any) => error.getStatus?.() === 403 && /firm-wide/.test(error.message));
      await db.roleGrant.create({ data: { userId: actorId, capability: 'PRACTICE_REOPEN_PERIOD', firmId, grantedBy: actorId, reason: 'Privileged period-reopen test grant' } });
      await assert.rejects(reopenPracticePeriod(actorId, engagementId, closingPeriod.id, { expectedVersion: 2, idempotencyKey: randomUUID(), reason: 'too short' }), (error: any) => error.getStatus?.() === 400);
      const reopenBody = { expectedVersion: 2, idempotencyKey: randomUUID(), reason: 'Approved correction journal requires this period.' };
      const reopened = await reopenPracticePeriod(actorId, engagementId, closingPeriod.id, reopenBody);
      assert.deepEqual(await reopenPracticePeriod(actorId, engagementId, closingPeriod.id, reopenBody), reopened, 'replayed reopen must not advance the version twice');
      assert.equal(reopened.closed, false);
      assert.equal(reopened.version, 3);
      assert.equal((await db.practicePeriod.findUniqueOrThrow({ where: { id: closingPeriod.id } })).lastTransitionReason, reopenBody.reason);
      const reopenAudit = await db.auditEvent.findFirst({ where: { engagementId, action: `PRACTICE_PERIOD_REOPENED:${closingPeriod.id}` } });
      assert.equal((reopenAudit?.payload as any).result.reason, reopenBody.reason, 'the immutable audit event records the reason');
      const reopenedPeriodDraft = await createClosing('REOPENED-POST');
      const reopenedPosting = await postPracticeJournal(actorId, engagementId, reopenedPeriodDraft.id, { expectedVersion: 1, idempotencyKey: randomUUID() });
      assert.equal(reopenedPosting.status, 'POSTED', 'an authorized reopen permits a new posted correction');
      const foreignFirm = await db.firm.create({ data: { name: 'Other firm' } });
      const foreign = await db.practiceAccount.create({ data: { firmId: foreignFirm.id, code: '100', name: 'Other cash', kind: 'ASSET' } });
      await assert.rejects(db.practiceJournalLine.create({ data: { firmId, journalId: unbalanced.id, accountId: foreign.id, position: 2, debit: '1', credit: '0' } }), /foreign key/i);
      assert.equal(await db.adjustmentJournal.count(), 0, 'firm postings must never create client audit adjustments');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
