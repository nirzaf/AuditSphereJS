import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);

test('audit writes carry traceability, resist mutation and erasure, and denial evidence survives rollback', { timeout: 180_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('audit_write').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, recordAuditEvent, recordSecurityEvent, requireCapability, captureAuditCheckpoint, verifyAuditChain } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), actorId = randomUUID(), outsiderId = randomUUID();
      await db.firm.create({ data: { id: firmId, name: 'Audit-write firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Audit-write client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Audit-write engagement' } });
      const scope = { firmId, clientId, engagementId };

      // USER events name their actor and carry resource identity plus redacted before/after.
      await recordAuditEvent(db, {
        engagementId, action: 'ASSESSMENT_APPROVED', actorId, actorKind: 'USER',
        payload: { assessmentId: 'assessment-1', apiKey: 'must-not-be-stored' },
        resource: { type: 'MaterialityAssessment', id: 'assessment-1', version: 3 },
        correlationId: 'command-1',
        before: { status: 'CALCULATED', sessionToken: 'must-not-be-stored' },
        after: { status: 'APPROVED', approvedBy: actorId },
      });
      const userEvent = await db.auditEvent.findFirstOrThrow({ where: { engagementId, action: 'ASSESSMENT_APPROVED' } });
      assert.equal(userEvent.actorKind, 'USER');
      assert.equal(userEvent.resourceType, 'MaterialityAssessment');
      assert.equal(userEvent.resourceId, 'assessment-1');
      assert.equal(userEvent.resourceVersion, 3);
      assert.equal(userEvent.correlationId, 'command-1');
      assert.equal((userEvent.payload as Record<string, unknown>)['apiKey'], '[REDACTED]');
      assert.equal((userEvent.payload as Record<string, unknown>)['assessmentId'], 'assessment-1');
      assert.equal((userEvent.beforeState as Record<string, unknown> | null)?.['sessionToken'], '[REDACTED]');
      assert.equal((userEvent.beforeState as Record<string, unknown> | null)?.['status'], 'CALCULATED');
      assert.equal((userEvent.afterState as Record<string, unknown> | null)?.['approvedBy'], actorId);
      const firstCheckpoint = await captureAuditCheckpoint(engagementId);
      assert.equal(firstCheckpoint.sequence, '1');
      assert.deepEqual(await verifyAuditChain(engagementId, firstCheckpoint), { valid: true });

      // SERVICE events name the initiating operation instead of a fake user id, and chain normally.
      await recordAuditEvent(db, { engagementId, action: 'IMPORT_PARSED', actorKind: 'SERVICE', correlationId: 'outbox:job-9', payload: { importId: 'import-1' } });
      const serviceEvent = await db.auditEvent.findFirstOrThrow({ where: { engagementId, action: 'IMPORT_PARSED' } });
      assert.equal(serviceEvent.actorKind, 'SERVICE');
      assert.equal(serviceEvent.actorId, null);
      assert.equal(serviceEvent.correlationId, 'outbox:job-9');
      const secondCheckpoint = await captureAuditCheckpoint(engagementId);
      assert.equal(secondCheckpoint.sequence, '2');
      assert.deepEqual(await verifyAuditChain(engagementId, secondCheckpoint), { valid: true });

      // Traceability is enforced by the database, not only by the writer.
      await assert.rejects(recordAuditEvent(db, { engagementId, action: 'BAD_USER', actorKind: 'USER', actorId: null }), /audit_event_actor_traceability_check/);
      await assert.rejects(recordAuditEvent(db, { engagementId, action: 'BAD_SERVICE', actorKind: 'SERVICE' }), /audit_event_actor_traceability_check/);
      await assert.rejects(recordAuditEvent(db, { engagementId, action: 'BAD_RESOURCE', actorId, resource: { type: 'X', id: '' } }), /audit_event_resource_shape_check/);

      // Application-shaped credentials may append but never alter or erase audit or security rows.
      await db.$executeRawUnsafe('CREATE ROLE t025_app');
      await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO t025_app');
      await db.$executeRawUnsafe('GRANT SELECT, INSERT ON "AuditEvent", "SecurityEvent" TO t025_app');
      const asApp = async (statement: string) => db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE t025_app');
        await tx.$executeRawUnsafe(statement);
      });
      await assert.rejects(asApp(`UPDATE "AuditEvent" SET action = 'TAMPERED'`), /permission denied/);
      await assert.rejects(asApp('DELETE FROM "AuditEvent"'), /permission denied/);
      await assert.rejects(asApp('TRUNCATE "AuditEvent"'), /permission denied/);
      await assert.rejects(asApp(`UPDATE "SecurityEvent" SET action = 'TAMPERED'`), /permission denied/);
      await assert.rejects(asApp('DELETE FROM "SecurityEvent"'), /permission denied/);
      await assert.rejects(asApp('TRUNCATE "SecurityEvent"'), /permission denied/);

      // Even the table owner hits the immutability triggers. The sidecar foreign key rejects
      // TRUNCATE of the chained event table before the statement guard can fire; the guard
      // itself is exercised through SecurityEvent, which has no inbound foreign keys.
      await recordSecurityEvent(db, { action: 'PROBE_RECORDED', actorId: outsiderId, detail: {} });
      await assert.rejects(db.$executeRawUnsafe(`UPDATE "AuditEvent" SET action = 'TAMPERED'`), /Audit events are append-only/);
      await assert.rejects(db.$executeRawUnsafe('DELETE FROM "AuditEvent"'), /Audit events are append-only/);
      await assert.rejects(db.$executeRawUnsafe('TRUNCATE "AuditEvent"'), /referenced in a foreign key constraint/);
      await db.$executeRawUnsafe('ALTER TABLE "AuditEvent" DISABLE TRIGGER USER');
      await assert.rejects(db.$executeRawUnsafe('TRUNCATE "AuditEvent"'), /referenced in a foreign key constraint/);
      await db.$executeRawUnsafe('ALTER TABLE "AuditEvent" ENABLE TRIGGER USER');
      await assert.rejects(db.$executeRawUnsafe(`UPDATE "SecurityEvent" SET action = 'TAMPERED'`), /Security events are append-only/);
      await assert.rejects(db.$executeRawUnsafe('TRUNCATE "SecurityEvent"'), /append-only/);

      // A rolled-back business mutation leaves no false success event, and the capability denial
      // is still recorded in the separate security log because it is written outside the transaction.
      await recordSecurityEvent(db, { action: 'TOKEN_REJECTED', actorId: outsiderId, detail: { reason: 'expired' } });
      const beforeCheckpoint = await captureAuditCheckpoint(engagementId);
      const denial = await db.$transaction(async tx => {
        await recordAuditEvent(tx, { engagementId, action: 'FALSE_SUCCESS', actorId, payload: {} });
        await requireCapability(tx, outsiderId, 'PRACTICE_MANAGE', scope);
      }).then(() => null, (error: unknown) => error);
      assert.match(denial instanceof Error ? denial.message : String(denial), /not granted/);
      assert.equal(await db.auditEvent.count({ where: { engagementId, action: 'FALSE_SUCCESS' } }), 0);
      assert.deepEqual(await captureAuditCheckpoint(engagementId), beforeCheckpoint);
      const denials = await db.$queryRaw<Array<{ action: string; actorId: string | null; detail: Record<string, unknown> }>>`SELECT action, "actorId", detail FROM "SecurityEvent" WHERE action = 'CAPABILITY_DENIED' AND "actorId" = ${outsiderId}::uuid`;
      assert.equal(denials.length, 1);
      assert.equal(denials[0].detail['capability'], 'PRACTICE_MANAGE');
      assert.deepEqual(await verifyAuditChain(engagementId, await captureAuditCheckpoint(engagementId)), { valid: true });
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
