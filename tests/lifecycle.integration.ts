import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const clientId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const engagementId = '12121212-1212-4212-8212-121212121212';
const documentId = '34343434-3434-4434-8434-343434343434';
const importId = '56565656-5656-4656-8656-565656565656';
const secondImportId = '67676767-6767-4767-8767-676767676767';
const actorId = '78787878-7878-4787-8787-787878787878';
const key = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;

test('guarded lifecycle commands reject invalid paths, enforce evidence and stay idempotent', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_lifecycle').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, applyLifecycleCommand, permittedCommands } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Lifecycle firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Lifecycle client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Lifecycle engagement', state: 'PORTAL_ACTIVE_PLANNING' } });
      // Membership and a legacy role string are not authorization: without a grant, no command runs.
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('09') }),
        /not granted/i,
      );
      await db.user.create({ data: { id: actorId, email: 'lifecycle@example.test', role: 'PREPARER' } });
      await db.roleGrant.create({ data: { userId: actorId, capability: 'LIFECYCLE_COMMAND', firmId, clientId, engagementId, grantedBy: actorId, reason: 'test grant' } });
      assert.deepEqual(permittedCommands('PORTAL_ACTIVE_PLANNING'), ['START_FIELDWORK']);
      assert.deepEqual(permittedCommands('ARCHIVED_READ_ONLY'), []);

      // Evidence predicate: fieldwork cannot start from an unaccepted balance.
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') }),
        /finalized trial balance/i,
      );

      await db.document.create({ data: { id: documentId, engagementId, key: 'lifecycle/dataset.csv', sha256: 'a'.repeat(64), filename: 'dataset.csv' } });
      await db.tbImport.createMany({ data: [
        { id: importId, firmId, clientId, engagementId, documentId, sha256: 'a'.repeat(64), status: 'FINALIZED', rowCount: 2 },
        { id: secondImportId, firmId, clientId, engagementId, documentId, sha256: 'b'.repeat(64), status: 'FINALIZED', rowCount: 2 },
      ] });

      // Fieldwork also needs a current approved plan, not only an accepted balance.
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') }),
        /approved materiality assessment is required/i,
      );

      // Direct fixture rows for the accepted versions and approved assessments. The full
      // publication/approval path is exercised in tests/materiality-persistence.integration.ts.
      const seedPublication = (sequence: number, importRef: string, digestChar: string) => db.balancePublication.create({ data: { firmId, clientId, engagementId, importId: importRef, sequence, currency: 'QAR', rowCount: 2, digest: digestChar.repeat(64), publishedBy: actorId } });
      const seedAssessment = async (publicationId: string, digestChar: string) => {
        const taxonomy = await db.taxonomyVersion.create({ data: { firmId, name: `STE-${publicationId.slice(0, 8)}`, version: 1, status: 'APPROVED', createdBy: actorId, approvedBy: actorId, approvedAt: new Date() } });
        return db.materialityAssessment.create({ data: {
          firmId, clientId, engagementId, publicationId, taxonomyVersionId: taxonomy.id,
          benchmarkKind: 'REVENUE', sourceLineCount: 1, currency: 'QAR',
          benchmarkAmount: '2000000.000000', planningMateriality: '20000.000000', tolerableError: '15000.000000', sadThreshold: '1000.000000',
          ratePercent: '1.000000', performancePercent: '75.000000', trivialPercent: '5.000000',
          policyVersion: 'STE-MATERIALITY-2026.1', inputHash: digestChar.repeat(64), status: 'APPROVED', calculatedBy: actorId, approvedBy: actorId, approvedAt: new Date(),
        } });
      };
      const publication1 = await seedPublication(1, importId, 'c');
      await seedAssessment(publication1.id, 'c');
      // A newer accepted version with no approved plan for it makes the plan stale and blocks fieldwork.
      const publication2 = await seedPublication(2, secondImportId, 'd');
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') }),
        /stale/i,
      );
      await seedAssessment(publication2.id, 'd');

      const started = await applyLifecycleCommand(engagementId, actorId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') });
      assert.deepEqual(started, { state: 'FIELDWORK_EXECUTION', version: 2 });

      // Replaying the same authorized command returns the stored outcome and writes nothing new.
      const replayed = await applyLifecycleCommand(engagementId, actorId, { command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: key('01') });
      assert.deepEqual(replayed, started);

      // Same key, different content is a conflict, not a silent second transition.
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'SUBMIT_FOR_REVIEW', expectedVersion: 2, idempotencyKey: key('01') }),
        /idempotency/i,
      );

      // nextState() order is not authorization: submitting from fieldwork is allowed, restarting is not.
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'START_FIELDWORK', expectedVersion: 2, idempotencyKey: key('02') }),
        /not valid from FIELDWORK_EXECUTION/,
      );

      const submitted = await applyLifecycleCommand(engagementId, actorId, { command: 'SUBMIT_FOR_REVIEW', expectedVersion: 2, idempotencyKey: key('03') });
      assert.deepEqual(submitted, { state: 'MANAGERIAL_REVIEW', version: 3 });

      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'RETURN_FOR_REWORK', expectedVersion: 3, idempotencyKey: key('04') }),
        /reason is required/i,
      );
      const returned = await applyLifecycleCommand(engagementId, actorId, { command: 'RETURN_FOR_REWORK', expectedVersion: 3, idempotencyKey: key('05'), reason: 'Bank confirmation still outstanding' });
      assert.deepEqual(returned, { state: 'FIELDWORK_EXECUTION', version: 4 });

      // A stale aggregate version cannot overwrite a newer decision.
      await assert.rejects(
        applyLifecycleCommand(engagementId, actorId, { command: 'SUBMIT_FOR_REVIEW', expectedVersion: 3, idempotencyKey: key('06') }),
        /changed; reload/,
      );

      const history = await db.engagementTransition.findMany({ where: { engagementId }, orderBy: { createdAt: 'asc' } });
      assert.equal(history.length, 3);
      assert.deepEqual(history.map((row) => row.command), ['START_FIELDWORK', 'SUBMIT_FOR_REVIEW', 'RETURN_FOR_REWORK']);
      assert.equal(await db.auditEvent.count({ where: { engagementId } }), 3);
      await db.roleGrant.updateMany({ where: { userId: actorId, capability: 'LIFECYCLE_COMMAND' }, data: { revokedAt: new Date(), revokedBy: actorId } });
      await assert.rejects(applyLifecycleCommand(engagementId, actorId, { command: 'SUBMIT_FOR_REVIEW', expectedVersion: 2, idempotencyKey: key('03') }), /not granted/i, 'revoked authority cannot replay an old receipt');

      // History and audit are append-only at the database level.
      await assert.rejects(db.$executeRaw`UPDATE "EngagementTransition" SET "toState" = 'ARCHIVED_READ_ONLY' WHERE "engagementId" = ${engagementId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`DELETE FROM "AuditEvent" WHERE "engagementId" = ${engagementId}::uuid`, /append-only/);

      console.log('lifecycle commands guarded, idempotent and append-only');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
