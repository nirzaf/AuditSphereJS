import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a8a8a8a8-a8a8-48a8-88a8-a8a8a8a8a8a8';
const clientId = 'b9b9b9b9-b9b9-49b9-89b9-b9b9b9b9b9b9';
const engagementId = 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c1';
const preparerId = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1';
const reviewerId = 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e3';
const bothId = 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f3f3';

const balanced = [
  { accountCode: '5000', fsli: 'Operating expenses', debit: '150.000000' },
  { accountCode: '2000', fsli: 'Trade payables', credit: '150.000000' },
];

test('adjustment journals stay balanced, separate from the firm ledger, and post/reverse without edits', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_adjustments').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, createAdjustmentJournal, postAdjustmentJournal, reverseAdjustmentJournal, adjustmentJournalDetail, listAdjustmentJournals } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Adjustment firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Adjustment client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Adjustment engagement', state: 'FIELDWORK_EXECUTION' } });
      await db.user.createMany({ data: [
        { id: preparerId, email: 'preparer@adjust.test', role: 'PREPARER' },
        { id: reviewerId, email: 'reviewer@adjust.test', role: 'REVIEWER' },
        { id: bothId, email: 'both@adjust.test', role: 'APPROVER' },
      ] });
      const grant = (userId: string, capability: string) => db.roleGrant.create({ data: { userId, capability, firmId, clientId, engagementId, grantedBy: userId } });
      await grant(preparerId, 'ENGAGEMENT_READ'); await grant(preparerId, 'ADJUSTMENT_MANAGE');
      await grant(reviewerId, 'ENGAGEMENT_READ'); await grant(reviewerId, 'ADJUSTMENT_POST');
      for (const capability of ['ENGAGEMENT_READ', 'ADJUSTMENT_MANAGE', 'ADJUSTMENT_POST'] as const) await grant(bothId, capability);

      // Capability and shape validation.
      await assert.rejects(createAdjustmentJournal(reviewerId, engagementId, { reference: 'ADJ-1', memo: 'Accrual', lines: balanced }), /not granted/i);
      await assert.rejects(createAdjustmentJournal(preparerId, engagementId, { reference: 'ADJ-1', memo: 'Accrual', lines: [{ accountCode: '5000', debit: '150.000000' }, { accountCode: '2000', credit: '100.000000' }] }), /must balance/);
      await assert.rejects(createAdjustmentJournal(preparerId, engagementId, { reference: 'ADJ-1', memo: 'Accrual', lines: [{ accountCode: '5000', debit: '5.000000', credit: '5.000000' }, { accountCode: '2000', credit: '5.000000' }] }), /exactly one of debit or credit/);
      await assert.rejects(createAdjustmentJournal(preparerId, engagementId, { reference: 'ADJ-1', memo: 'Accrual', lines: [{ accountCode: '5000' }, { accountCode: '2000', credit: '0' }] }), /exactly one of debit or credit/);

      const draft = await createAdjustmentJournal(preparerId, engagementId, { reference: 'ADJ-1', memo: 'Accrue the unbilled supplier invoice', lines: balanced }) as { journalId: string; status: string; lineCount: number };
      assert.equal(draft.status, 'DRAFT');
      assert.equal(draft.lineCount, 2);

      // Posting needs the post capability, and the preparer cannot post their own adjustment.
      await assert.rejects(postAdjustmentJournal(preparerId, engagementId, draft.journalId, { expectedVersion: 1 }), /not granted/i);
      const selfDraft = await createAdjustmentJournal(bothId, engagementId, { reference: 'ADJ-2', memo: 'Self-posted attempt', lines: balanced }) as { journalId: string };
      await assert.rejects(postAdjustmentJournal(bothId, engagementId, selfDraft.journalId, { expectedVersion: 1 }), /cannot post their own/);
      await assert.rejects(postAdjustmentJournal(reviewerId, engagementId, draft.journalId, { expectedVersion: 99 }), /changed; reload/);

      const posted = await postAdjustmentJournal(reviewerId, engagementId, draft.journalId, { expectedVersion: 1 }) as { status: string; version: number };
      assert.equal(posted.status, 'POSTED');
      assert.equal(posted.version, 2);

      // A posted journal and its lines are immutable; corrections go through a reversal.
      await assert.rejects(db.$executeRaw`UPDATE "AdjustmentJournal" SET memo = 'changed' WHERE id = ${draft.journalId}::uuid`, /immutable/);
      await assert.rejects(db.$executeRaw`DELETE FROM "AdjustmentJournal" WHERE id = ${draft.journalId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`INSERT INTO "AdjustmentJournalLine" (id,"journalId",position,"accountCode",debit,credit) VALUES (gen_random_uuid(), ${draft.journalId}::uuid, 2, '9999', 1, 0)`, /editable only while the journal is a draft/);
      await assert.rejects(db.$executeRaw`UPDATE "AdjustmentJournalLine" SET debit = 1 WHERE "journalId" = ${draft.journalId}::uuid`, /editable only while the journal is a draft/);

      // The database independently refuses an unbalanced or single-line posting.
      const rawJournal = '19191919-1919-4919-8919-191919191919';
      await db.adjustmentJournal.create({ data: { id: rawJournal, firmId, clientId, engagementId, reference: 'RAW-1', memo: 'Bypass attempt', createdBy: preparerId } });
      await db.adjustmentJournalLine.createMany({ data: [
        { journalId: rawJournal, position: 0, accountCode: '5000', debit: '5.000000', credit: '0' },
        { journalId: rawJournal, position: 1, accountCode: '2000', debit: '0', credit: '3.000000' },
      ] });
      await assert.rejects(db.$executeRaw`UPDATE "AdjustmentJournal" SET status = 'POSTED', "postedBy" = ${reviewerId}::uuid, "postedAt" = now() WHERE id = ${rawJournal}::uuid`, /must balance/);
      await db.adjustmentJournalLine.updateMany({ where: { journalId: rawJournal, position: 1 }, data: { credit: '5.000000' } });
      await db.adjustmentJournalLine.deleteMany({ where: { journalId: rawJournal, position: 1 } });
      await assert.rejects(db.$executeRaw`UPDATE "AdjustmentJournal" SET status = 'POSTED', "postedBy" = ${reviewerId}::uuid, "postedAt" = now() WHERE id = ${rawJournal}::uuid`, /at least two lines/);

      // Reversal swaps the sides and never edits the original.
      const reversal = await reverseAdjustmentJournal(reviewerId, engagementId, draft.journalId, { expectedVersion: 2 }) as { status: string; reversalJournalId: string; reversalReference: string };
      assert.equal(reversal.status, 'REVERSED');
      assert.equal(reversal.reversalReference, 'ADJ-1-REV');
      const original = await adjustmentJournalDetail(engagementId, draft.journalId);
      assert.equal(original.status, 'REVERSED');
      assert.equal(original.memo, 'Accrue the unbilled supplier invoice');
      assert.equal(original.lines[0].debit, '150.000000');
      const reversalDetail = await adjustmentJournalDetail(engagementId, reversal.reversalJournalId);
      assert.equal(reversalDetail.status, 'POSTED');
      assert.equal(reversalDetail.reversesJournalId, draft.journalId);
      assert.equal(reversalDetail.lines[0].credit, '150.000000', 'the reversal swaps debit for credit');
      assert.equal(reversalDetail.lines[1].debit, '150.000000');
      await assert.rejects(reverseAdjustmentJournal(reviewerId, engagementId, draft.journalId, { expectedVersion: 3 }), /already been reversed/);

      const all = await listAdjustmentJournals(engagementId);
      assert.equal(all.length, 4);
      assert.equal((await listAdjustmentJournals(engagementId, { status: 'POSTED' })).length, 1);
      assert.equal((await listAdjustmentJournals(engagementId, { status: 'DRAFT' })).length, 2);
      assert.equal((await listAdjustmentJournals(engagementId, { status: 'REVERSED' })).length, 1);
      await assert.rejects(listAdjustmentJournals(engagementId, { status: 'UNKNOWN' }), /Unknown status filter/);

      console.log('adjustment journals balanced, immutable when posted and reversed rather than edited');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
