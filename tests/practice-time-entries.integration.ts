import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);

test('T140 daily hours: assignment, exact conversion, rate snapshots, idempotent saves, closed periods and append-only corrections', { timeout: 300_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_practice_time').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const {
      db, ensurePracticeRateDefaultsForFirm, assignPracticeStaffGrade, schedulePracticeRateCard, recordPracticeTimeEntry, correctPracticeTimeEntry,
      listPracticeTimeEntries, minutesFrom,
    } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID();
      const managerId = randomUUID(), staffId = randomUUID(), outsiderId = randomUUID();
      await db.firm.create({ data: { id: firmId, name: 'Time firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Time client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Time engagement', state: 'FIELDWORK_EXECUTION', period: 'FY2026' } });
      await db.user.createMany({ data: [
        { id: managerId, email: 'time-manager@example.test', role: 'BILLING' },
        { id: staffId, email: 'time-staff@example.test', role: 'PREPARER' },
        { id: outsiderId, email: 'time-outsider@example.test', role: 'PREPARER' },
      ] });
      await db.membership.createMany({ data: [
        { userId: managerId, firmId, clientId, engagementId, role: 'BILLING' },
        { userId: staffId, firmId, clientId, engagementId, role: 'PREPARER' },
      ] });
      for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE'] as const) {
        await db.roleGrant.create({ data: { userId: staffId, capability, firmId, clientId, engagementId, grantedBy: managerId } });
      }
      await db.roleGrant.create({ data: { userId: managerId, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: managerId } });
      for (const capability of ['PRACTICE_READ', 'PRACTICE_MANAGE'] as const) {
        await db.roleGrant.create({ data: { userId: managerId, capability, firmId, grantedBy: managerId, reason: 'Time entry acceptance fixture' } });
      }

      // Approved taxonomy: the FSLI of a time entry must be one of its lines (D22).
      // Lines are written while the version is a draft; approval then freezes them (the taxonomy freeze trigger).
      const taxonomy = await db.taxonomyVersion.create({ data: {
        firmId, name: 'STE-STATUTORY', version: 1, status: 'DRAFT', createdBy: managerId,
        lines: { create: [
          { code: 'Revenue', label: 'Revenue', statementSection: 'INCOME', sortOrder: 1 },
          { code: 'Cash and equivalents', label: 'Cash and equivalents', statementSection: 'ASSETS', sortOrder: 2 },
        ] },
      } });
      await db.taxonomyVersion.update({ where: { id: taxonomy.id }, data: { status: 'APPROVED', approvedBy: managerId, approvedAt: new Date() } });

      // Rates: the engagement partner's default rate, then the staff member's grade effective from 2026-01-01.
      await ensurePracticeRateDefaultsForFirm(firmId);
      await assignPracticeStaffGrade(managerId, engagementId, { idempotencyKey: randomUUID(), userId: staffId, grade: 'ENGAGEMENT_PARTNER', effectiveFrom: '2026-01-01', expectedPreviousVersion: 0 });
      const defaultPartner = await db.practiceRateCard.findFirstOrThrow({ where: { firmId, grade: 'ENGAGEMENT_PARTNER', currency: 'QAR', effectiveTo: null } });
      const entry = (overrides: Record<string, unknown>) => ({
        idempotencyKey: randomUUID(), workDate: '2026-10-01', phase: 'FIELDWORK' as const, fsli: 'Revenue', description: 'Revenue cut-off testing', ...overrides,
      });

      // AC1: an engagement the staff member is not assigned to refuses time entry.
      await assert.rejects(recordPracticeTimeEntry(outsiderId, engagementId, entry({ minutes: 60 })), (error: any) => error.getStatus?.() === 403);

      // AC2: decimal hours convert once to whole minutes, half-even, and the value follows the minutes exactly.
      assert.equal(minutesFrom(undefined, '1.25'), 75);
      assert.equal(minutesFrom(undefined, '0.1'), 6);
      assert.equal(minutesFrom(undefined, '0.125'), 8, '7.5 minutes rounds half-even to 8');
      assert.equal(minutesFrom(undefined, '24.001'), 1440);
      assert.throws(() => minutesFrom(undefined, '25'), /1–1440 whole minutes/);
      const ninety = await recordPracticeTimeEntry(staffId, engagementId, entry({ hours: '1.25' }));
      assert.equal(ninety.minutes, 75);
      assert.equal(ninety.hourlyRate, '1000.000000');
      assert.equal(ninety.chargeOutValue, '1250.000000');
      const tenth = await recordPracticeTimeEntry(staffId, engagementId, entry({ hours: '0.1', description: 'Tenth of an hour' }));
      assert.equal(tenth.minutes, 6);
      assert.equal(tenth.chargeOutValue, '100.000000');
      const oneMinute = await recordPracticeTimeEntry(staffId, engagementId, entry({ minutes: 1, description: 'One minute' }));
      assert.equal(oneMinute.chargeOutValue, '16.666667');
      await assert.rejects(recordPracticeTimeEntry(staffId, engagementId, entry({ hours: '0.1255' })), (error: any) => error.getStatus?.() === 400, 'hours take at most three decimal places');

      // Idempotent saves: the same key and body return the first entry; the same key with a different body is refused.
      const key = randomUUID();
      const first = await recordPracticeTimeEntry(staffId, engagementId, entry({ idempotencyKey: key, minutes: 30, description: 'Replayed save' }));
      assert.deepEqual(await recordPracticeTimeEntry(staffId, engagementId, entry({ idempotencyKey: key, minutes: 30, description: 'Replayed save' })), first);
      await assert.rejects(recordPracticeTimeEntry(staffId, engagementId, entry({ idempotencyKey: key, minutes: 31, description: 'Replayed save' })), (error: any) => error.getStatus?.() === 409);

      // Assignment of the FSLI and the period: an FSLI outside the approved taxonomy and a closed accounting period are both refused.
      await assert.rejects(recordPracticeTimeEntry(staffId, engagementId, entry({ minutes: 30, fsli: 'Inventory' })), (error: any) => error.getStatus?.() === 400);
      await db.practicePeriod.create({ data: { firmId, startsOn: new Date('2025-01-01'), endsOn: new Date('2025-12-31'), closed: true, version: 2, lastTransitionReason: 'closed for the time entry fixture', lastTransitionBy: managerId } });
      await assert.rejects(recordPracticeTimeEntry(staffId, engagementId, entry({ minutes: 30, workDate: '2025-06-01' })), (error: any) => error.getStatus?.() === 409 && /closed/.test(error.message));

      // AC3: a later rate change does not change the value of earlier time.
      const beforeChange = await db.practiceTimeEntry.findUniqueOrThrow({ where: { id: ninety.id } });
      await schedulePracticeRateCard(managerId, engagementId, {
        idempotencyKey: randomUUID(), grade: 'ENGAGEMENT_PARTNER', hourlyRate: '1200.000000', effectiveFrom: '2027-01-01', expectedPreviousVersion: defaultPartner.version,
      });
      const afterChange = await db.practiceTimeEntry.findUniqueOrThrow({ where: { id: ninety.id } });
      assert.equal(afterChange.hourlyRateSnapshot.toFixed(6), beforeChange.hourlyRateSnapshot.toFixed(6));
      assert.equal(afterChange.chargeOutValueSnapshot.toFixed(6), '1250.000000');
      const future = await recordPracticeTimeEntry(staffId, engagementId, entry({ workDate: '2027-02-01', minutes: 60, description: 'Time after the change' }));
      assert.equal(future.hourlyRate, '1200.000000');
      assert.equal(future.chargeOutValue, '1200.000000');

      // Corrections append a replacement and link it to the original; the original is never edited.
      const corrected = await correctPracticeTimeEntry(staffId, engagementId, ninety.id, entry({
        reason: 'Client meeting ran longer than first recorded', minutes: 90, idempotencyKey: randomUUID(),
      }));
      assert.equal(corrected.original.supersededByEntryId, corrected.replacement.id);
      assert.equal(corrected.replacement.correctsEntryId, ninety.id);
      assert.equal(corrected.replacement.minutes, 90);
      assert.equal(corrected.replacement.chargeOutValue, '1500.000000');
      assert.equal((await db.practiceTimeEntry.findUniqueOrThrow({ where: { id: ninety.id } })).minutes, 75, 'the original keeps its recorded minutes');
      await assert.rejects(correctPracticeTimeEntry(staffId, engagementId, ninety.id, entry({
        reason: 'A second correction of the same entry', minutes: 45, idempotencyKey: randomUUID(),
      })), (error: any) => error.getStatus?.() === 409, 'an entry can be corrected once');
      await assert.rejects(correctPracticeTimeEntry(managerId, engagementId, corrected.replacement.id, entry({
        reason: 'Someone else trying to correct staff time', minutes: 60, idempotencyKey: randomUUID(),
      })), (error: any) => error.getStatus?.() === 403, 'only the staff member who recorded the time can correct it');
      await assert.rejects(db.$executeRaw`UPDATE "PracticeTimeEntry" SET minutes = 1 WHERE id = ${ninety.id}::uuid`, /immutable/);
      await assert.rejects(db.$executeRaw`UPDATE "PracticeTimeEntryCorrection" SET reason = 'Rewritten correction reason' WHERE "originalEntryId" = ${ninety.id}::uuid`, /append-only/);

      // Totals: the superseded original stays listed for history but never counts; the week and day totals agree with the total.
      const listing = await listPracticeTimeEntries(staffId, engagementId, {});
      assert.ok(listing.entries.some(item => item.id === ninety.id && item.supersededByEntryId === corrected.replacement.id), 'the superseded original remains listed');
      const counted = listing.entries.filter(item => item.supersededByEntryId === null);
      const expectedMinutes = counted.reduce((sum, item) => sum + item.minutes, 0);
      assert.equal(listing.totals.minutes, expectedMinutes);
      assert.equal(listing.days.reduce((sum, day) => sum + day.minutes, 0), expectedMinutes);
      assert.equal(listing.weeks.reduce((sum, week) => sum + week.minutes, 0), expectedMinutes);
      assert.ok(listing.weeks.some(week => week.weekStart === '2026-09-28'), 'work on 2026-10-01 falls in the week that starts on Monday 2026-09-28');
      assert.ok(first && future, 'every saved entry exists');
      console.log('T140 practice time: assignment, exact conversion, rate snapshots, idempotent saves, closed periods and append-only corrections verified on PostgreSQL 18.6');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
