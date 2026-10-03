import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2';
const clientId = 'b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3';
const engagementId = 'c4c4c4c4-c4c4-44c4-84c4-c4c4c4c4c4c4';
const authorId = 'd5d5d5d5-d5d5-45d5-85d5-d5d5d5d5d5d5';
const reviewerId = 'e6e6e6e6-e6e6-46e6-86e6-e6e6e6e6e6e6';
const bothId = 'f7f7f7f7-f7f7-47f7-87f7-f7f7f7f7f7f7';

test('review notes need explicit authority, forbid self-review and freeze once resolved', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_reviews').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, raiseReviewNote, resolveReviewNote, listReviewNotes, reviewSummary } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Review firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Review client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Review engagement', state: 'MANAGERIAL_REVIEW' } });
      await db.user.createMany({ data: [
        { id: authorId, email: 'author@example.test', role: 'PREPARER' },
        { id: reviewerId, email: 'reviewer@example.test', role: 'REVIEWER' },
        { id: bothId, email: 'both@example.test', role: 'APPROVER' },
      ] });
      await db.membership.createMany({ data: [
        { userId: authorId, firmId, clientId, engagementId, role: 'PREPARER' },
        { userId: reviewerId, firmId, clientId, engagementId, role: 'REVIEWER' },
        { userId: bothId, firmId, clientId, engagementId, role: 'APPROVER' },
      ] });
      const grant = (userId: string, capability: string) => db.roleGrant.create({ data: { userId, capability, firmId, clientId, engagementId, grantedBy: userId } });
      await grant(authorId, 'ENGAGEMENT_READ'); await grant(authorId, 'REVIEW_RAISE');
      await grant(reviewerId, 'ENGAGEMENT_READ'); await grant(reviewerId, 'REVIEW_RESOLVE');
      for (const capability of ['ENGAGEMENT_READ', 'REVIEW_RAISE', 'REVIEW_RESOLVE'] as const) await grant(bothId, capability);

      // Raising needs REVIEW_RAISE; the reviewer without it is refused.
      await assert.rejects(raiseReviewNote(reviewerId, engagementId, { workpackage: 'TB:MAPPING', body: 'Check the cut-off adjustment' }), /not granted/i);
      await assert.rejects(raiseReviewNote(authorId, engagementId, { workpackage: '   ', body: 'x' }));
      const raised = await raiseReviewNote(authorId, engagementId, { workpackage: 'TB:MAPPING', body: 'Two accounts are mapped to the wrong FSLI' }) as { noteId: string; status: string };
      assert.equal(raised.status, 'OPEN');

      // Resolving needs REVIEW_RESOLVE, and the author cannot resolve their own note.
      await assert.rejects(resolveReviewNote(authorId, engagementId, raised.noteId, { resolution: 'Fixed' }), /not granted/i);

      // A user holding both capabilities still cannot clear their own note.
      const selfNote = await raiseReviewNote(bothId, engagementId, { workpackage: 'AUDIT:BANK', body: 'Confirm the bank letter' }) as { noteId: string };
      await assert.rejects(resolveReviewNote(bothId, engagementId, selfNote.noteId, { resolution: 'Confirmed' }), /cannot resolve their own/);

      const resolved = await resolveReviewNote(reviewerId, engagementId, raised.noteId, { resolution: 'Remapped both accounts and re-approved the mapping' }) as { status: string };
      assert.equal(resolved.status, 'RESOLVED');
      await assert.rejects(resolveReviewNote(reviewerId, engagementId, raised.noteId, { resolution: 'Again' }), /Only an open review note/);

      // The database independently refuses a self-resolved row and freezes resolved notes.
      await assert.rejects(db.$executeRaw`INSERT INTO "ReviewNote" (id,"firmId","clientId","engagementId",workpackage,body,status,"raisedBy","resolvedBy",resolution,"resolvedAt") VALUES (gen_random_uuid(), ${firmId}::uuid, ${clientId}::uuid, ${engagementId}::uuid, 'W', 'B', 'RESOLVED', ${bothId}::uuid, ${bothId}::uuid, 'x', now())`, /review_note_no_self_review_check/);
      await assert.rejects(db.$executeRaw`UPDATE "ReviewNote" SET resolution = 'changed' WHERE id = ${raised.noteId}::uuid`, /immutable/);
      await assert.rejects(db.$executeRaw`DELETE FROM "ReviewNote" WHERE id = ${raised.noteId}::uuid`, /append-only/);

      const all = await listReviewNotes(engagementId);
      assert.equal(all.length, 2);
      assert.equal((await listReviewNotes(engagementId, { status: 'OPEN' })).length, 1);
      assert.equal((await listReviewNotes(engagementId, { status: 'RESOLVED' })).length, 1);
      await assert.rejects(listReviewNotes(engagementId, { status: 'UNKNOWN' }), /Unknown status filter/);
      const summary = await reviewSummary(engagementId);
      assert.deepEqual({ open: summary.open, resolved: summary.resolved, total: summary.total }, { open: 1, resolved: 1, total: 2 });

      // Audit failure must roll back the note and chain head in the same command.
      const head = await db.auditChainHead.findUniqueOrThrow({ where: { engagementId } });
      await db.$executeRawUnsafe(`CREATE FUNCTION test_reject_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'REVIEW_NOTE_RAISED' THEN RAISE EXCEPTION 'Injected review audit failure'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER test_reject_review_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_review_audit()`);
      await assert.rejects(raiseReviewNote(authorId, engagementId, { workpackage: 'AUDIT:ROLLBACK', body: 'This note must not survive a failed audit write' }), /Injected review audit failure/);
      assert.equal(await db.reviewNote.count({ where: { engagementId } }), 2);
      assert.deepEqual(await db.auditChainHead.findUniqueOrThrow({ where: { engagementId } }), head);
      await db.$executeRawUnsafe(`DROP TRIGGER test_reject_review_audit ON "AuditEvent"`);
      await db.$executeRawUnsafe(`DROP FUNCTION test_reject_review_audit()`);

      await db.roleGrant.updateMany({ where: { userId: authorId, capability: 'REVIEW_RAISE' }, data: { revokedAt: new Date(), revokedBy: reviewerId, reason: 'Integration revocation fixture' } });
      await assert.rejects(raiseReviewNote(authorId, engagementId, { workpackage: 'AUDIT:REVOKED', body: 'Revoked authority' }), /not granted/);
      await db.engagement.update({ where: { id: engagementId }, data: { state: 'DELIVERABLE_RELEASE' } });
      await assert.rejects(raiseReviewNote(bothId, engagementId, { workpackage: 'AUDIT:LATE', body: 'Late edit' }), /cannot change outside/);
      await assert.rejects(resolveReviewNote(reviewerId, engagementId, selfNote.noteId, { resolution: 'Late resolution' }), /cannot change outside/);

      console.log('review notes authority, self-review refusal and freeze enforced');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
