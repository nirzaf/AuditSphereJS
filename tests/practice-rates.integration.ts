import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);

test('practice rates seed exact tiers, reject overlapping history and preserve saved time-value snapshots', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('practice_rates').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const {
      db, ensurePracticeRateDefaultsForFirm, listPracticeRateAdministration, schedulePracticeRateCard,
      assignPracticeStaffGrade, recordAuthorizedPracticeTimeEntrySnapshot,
    } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), actorId = randomUUID(), staffId = randomUUID();
      await db.firm.create({ data: { id: firmId, name: 'Rate firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Synthetic client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Synthetic rate engagement' } });
      await db.user.create({ data: { id: actorId, email: `billing-${actorId}@example.test`, role: 'BILLING' } });
      await db.user.create({ data: { id: staffId, email: `preparer-${staffId}@example.test`, role: 'PREPARER' } });
      await db.membership.create({ data: { userId: actorId, firmId, clientId, engagementId, role: 'BILLING' } });
      await db.membership.create({ data: { userId: staffId, firmId, clientId, engagementId, role: 'PREPARER' } });
      await db.roleGrant.create({ data: { userId: actorId, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: actorId, reason: 'Practice rate acceptance fixture' } });
      for (const capability of ['PRACTICE_READ', 'PRACTICE_MANAGE']) await db.roleGrant.create({ data: { userId: actorId, capability, firmId, grantedBy: actorId, reason: 'Practice rate acceptance fixture' } });

      await ensurePracticeRateDefaultsForFirm(firmId);
      await ensurePracticeRateDefaultsForFirm(firmId);
      const defaults = await db.practiceRateCard.findMany({ where: { firmId }, orderBy: { grade: 'asc' } });
      assert.equal(defaults.length, 6, 'six professional grades should be mapped to the four source rates');
      const rateByGrade = Object.fromEntries(defaults.map(rate => [rate.grade, rate.hourlyRate.toFixed(6)]));
      assert.equal(rateByGrade['ENGAGEMENT_PARTNER'], '1000.000000');
      assert.equal(rateByGrade['AUDIT_MANAGER'], '750.000000');
      assert.equal(rateByGrade['AUDIT_SUPERVISOR'], '500.000000');
      assert.equal(rateByGrade['AUDIT_SENIOR'], '500.000000');
      assert.equal(rateByGrade['AUDIT_ASSOCIATE'], '200.000000');
      assert.equal(rateByGrade['AUDIT_JUNIOR'], '200.000000');

      const beforeSchedule = await listPracticeRateAdministration(actorId, engagementId);
      assert.equal(beforeSchedule.rateCards.length, 6);
      const defaultPartner = defaults.find(rate => rate.grade === 'ENGAGEMENT_PARTNER')!;
      const initialAssignment = await assignPracticeStaffGrade(actorId, engagementId, {
        idempotencyKey: randomUUID(), userId: staffId, grade: 'ENGAGEMENT_PARTNER', effectiveFrom: '2026-01-01', expectedPreviousVersion: 0,
      });
      const historical = await db.$transaction(tx => recordAuthorizedPracticeTimeEntrySnapshot(tx, {
        firmId, clientId, engagementId, staffUserId: staffId, workDate: '2026-10-01', minutes: 120,
      }));
      assert.equal(historical.gradeAssignmentId, initialAssignment.id);
      assert.equal(historical.rateCardId, defaultPartner.id);
      assert.equal(historical.hourlyRateSnapshot.toFixed(6), '1000.000000');
      assert.equal(historical.chargeOutValueSnapshot.toFixed(6), '2000.000000');

      const futureRate = {
        idempotencyKey: randomUUID(), grade: 'ENGAGEMENT_PARTNER' as const, hourlyRate: '1200.000000',
        effectiveFrom: '2027-01-01', expectedPreviousVersion: defaultPartner.version,
      };
      const firstRevision = await schedulePracticeRateCard(actorId, engagementId, futureRate);
      assert.equal(firstRevision.hourlyRate, '1200.000000');
      assert.deepEqual(await schedulePracticeRateCard(actorId, engagementId, futureRate), firstRevision, 'replaying an idempotency key returns its first result');
      const boundedRevision = await schedulePracticeRateCard(actorId, engagementId, {
        idempotencyKey: randomUUID(), grade: 'ENGAGEMENT_PARTNER', hourlyRate: '1300.000000',
        effectiveFrom: '2027-03-01', effectiveTo: '2027-08-01', expectedPreviousVersion: 1,
      });
      assert.equal(boundedRevision.effectiveFrom, '2027-03-01');
      await assert.rejects(schedulePracticeRateCard(actorId, engagementId, {
        idempotencyKey: randomUUID(), grade: 'ENGAGEMENT_PARTNER', hourlyRate: '1400.000000',
        effectiveFrom: '2027-06-01', effectiveTo: '2027-10-01', expectedPreviousVersion: 1,
      }), (error: any) => error.getStatus?.() === 409 && /overlap/.test(error.message));

      const persistedHistory = await db.practiceTimeEntry.findUniqueOrThrow({ where: { id: historical.id } });
      assert.equal(persistedHistory.hourlyRateSnapshot.toFixed(6), '1000.000000', 'future rate changes do not rewrite the prior hourly snapshot');
      assert.equal(persistedHistory.chargeOutValueSnapshot.toFixed(6), '2000.000000', 'future rate changes do not rewrite the prior value snapshot');
      const futureEntry = await db.$transaction(tx => recordAuthorizedPracticeTimeEntrySnapshot(tx, {
        firmId, clientId, engagementId, staffUserId: staffId, workDate: '2027-04-01', minutes: 120,
      }));
      assert.equal(futureEntry.hourlyRateSnapshot.toFixed(6), '1300.000000');
      assert.equal(futureEntry.chargeOutValueSnapshot.toFixed(6), '2600.000000');

      await assert.rejects(db.practiceRateCard.create({ data: {
        firmId, grade: 'ENGAGEMENT_PARTNER', currency: 'QAR', hourlyRate: '1400', effectiveFrom: new Date('2027-06-01T00:00:00Z'), effectiveTo: new Date('2027-10-01T00:00:00Z'),
      } }), /overlap/);
      await assert.rejects(db.practiceRateCard.update({ where: { id: defaultPartner.id }, data: { hourlyRate: '999' } }), /immutable/);
      await assert.rejects(db.practiceTimeEntry.update({ where: { id: historical.id }, data: { hourlyRateSnapshot: '999' } }), /immutable/);
      await assert.rejects(db.practiceTimeEntry.delete({ where: { id: historical.id } }), /immutable/);

      const notMemberEngagementId = randomUUID();
      await db.engagement.create({ data: { id: notMemberEngagementId, firmId, clientId, name: 'Unassigned time target' } });
      await assert.rejects(db.$transaction(tx => recordAuthorizedPracticeTimeEntrySnapshot(tx, {
        firmId, clientId, engagementId: notMemberEngagementId, staffUserId: staffId, workDate: '2026-10-01', minutes: 60,
      })), (error: any) => error.getStatus?.() === 403 && /not assigned/.test(error.message));

      const limitedActor = randomUUID();
      await db.user.create({ data: { id: limitedActor, email: `limited-${limitedActor}@example.test`, role: 'BILLING' } });
      await db.membership.create({ data: { userId: limitedActor, firmId, clientId, engagementId, role: 'BILLING' } });
      await db.roleGrant.create({ data: { userId: limitedActor, capability: 'PRACTICE_READ', firmId, clientId, engagementId, grantedBy: limitedActor } });
      await assert.rejects(listPracticeRateAdministration(limitedActor, engagementId), (error: any) => error.getStatus?.() === 403 && /firm-wide/.test(error.message));
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});
