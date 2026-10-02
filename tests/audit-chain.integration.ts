import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
test('audit chains serialize concurrent writes, roll back, and detect event/checkpoint tampering', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('audit_chain').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, captureAuditCheckpoint, verifyAuditChain } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), otherEngagementId = randomUUID(), actorId = randomUUID();
      const orphanEngagementId = randomUUID();
      await db.firm.create({ data: { id: firmId, name: 'Audit-chain firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Audit-chain client' } });
      await db.engagement.createMany({ data: [
        { id: engagementId, firmId, clientId, name: 'Audit-chain engagement' },
        { id: otherEngagementId, firmId, clientId, name: 'Other audit-chain engagement' },
      ] });
      await assert.rejects(db.auditEvent.create({ data: { engagementId: orphanEngagementId, actorId, action: 'ORPHAN', payload: {} } }), /AuditEvent_engagementId_fkey/);
      await assert.rejects(db.$executeRaw`INSERT INTO "AuditChainHead" ("engagementId",sequence,digest) VALUES (${orphanEngagementId}::uuid, 0, ${'0'.repeat(64)})`, /AuditChainHead_engagementId_fkey/);
      await Promise.all(Array.from({ length: 20 }, (_, n) => db.auditEvent.create({ data: { engagementId, actorId, action: `EVENT_${n}`, payload: { amount: '0.10', nested: { z: n, a: 'é' } } } })));
      const checkpoint = await captureAuditCheckpoint(engagementId);
      assert.equal(checkpoint.sequence, '20');
      assert.deepEqual(await verifyAuditChain(engagementId, checkpoint), { valid: true });
      await assert.rejects(db.$transaction(async tx => {
        await tx.auditEvent.create({ data: { engagementId, actorId, action: 'ROLLBACK', payload: {} } });
        throw new Error('rollback');
      }), /rollback/);
      assert.deepEqual(await captureAuditCheckpoint(engagementId), checkpoint);
      assert.equal((await verifyAuditChain(engagementId, { ...checkpoint, digest: 'f'.repeat(64) })).valid, false);
      await db.auditEvent.create({ data: { engagementId, actorId, action: 'AFTER_CHECKPOINT', payload: {} } });
      assert.equal((await verifyAuditChain(engagementId, checkpoint)).valid, true, 'independent historical checkpoints remain verifiable');

      // Application grants cannot rewrite the head, sidecar, or event.
      await db.$executeRawUnsafe('CREATE ROLE audit_reader');
      await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO audit_reader');
      await db.$executeRawUnsafe('GRANT SELECT, INSERT ON "AuditEvent" TO audit_reader');
      await assert.rejects(db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE audit_reader');
        await tx.$executeRawUnsafe('UPDATE "AuditChainHead" SET digest = repeat(\'f\', 64)');
      }), /permission denied/);
      // Owner-only sabotage in this disposable database proves independent detection.
      await db.$executeRawUnsafe('ALTER TABLE "AuditEvent" DISABLE TRIGGER USER');
      await db.$executeRaw`UPDATE "AuditEvent" SET payload = '{"changed":true}'::jsonb WHERE "engagementId" = ${engagementId}::uuid AND action = 'EVENT_0'`;
      await db.$executeRawUnsafe('ALTER TABLE "AuditEvent" ENABLE TRIGGER USER');
      assert.match((await verifyAuditChain(engagementId, checkpoint)).reason ?? '', /Event changed/);
      await assert.rejects(db.$executeRawUnsafe('DELETE FROM "AuditChainRecord"'), /immutable/);
      const deletionScope = otherEngagementId;
      await db.auditEvent.create({ data: { engagementId: deletionScope, actorId, action: 'REMOVAL_TEST', payload: {} } });
      const deletionCheckpoint = await captureAuditCheckpoint(deletionScope);
      await db.$executeRawUnsafe('ALTER TABLE "AuditEvent" DISABLE TRIGGER USER');
      const unchainedEvent = await db.auditEvent.create({ data: { engagementId: deletionScope, actorId, action: 'UNCHAINED_SCOPE_TEST', payload: {} } });
      await db.$executeRawUnsafe('ALTER TABLE "AuditEvent" ENABLE TRIGGER USER');
      await assert.rejects(db.$executeRaw`INSERT INTO "AuditChainRecord" ("eventId","engagementId",sequence,"formatVersion","previousDigest",digest,"canonicalText") VALUES (${unchainedEvent.id}::uuid, ${engagementId}::uuid, 999, 1, ${'0'.repeat(64)}, ${'1'.repeat(64)}, '{}')`, /AuditChainRecord_event_scope_fkey/);
      await db.$executeRawUnsafe('ALTER TABLE "AuditChainRecord" DISABLE TRIGGER USER');
      await db.$executeRaw`DELETE FROM "AuditChainRecord" WHERE "engagementId" = ${deletionScope}::uuid`;
      await db.$executeRawUnsafe('ALTER TABLE "AuditChainRecord" ENABLE TRIGGER USER');
      await db.$executeRawUnsafe('ALTER TABLE "AuditEvent" DISABLE TRIGGER USER');
      await db.$executeRaw`DELETE FROM "AuditEvent" WHERE "engagementId" = ${deletionScope}::uuid`;
      await db.$executeRawUnsafe('ALTER TABLE "AuditEvent" ENABLE TRIGGER USER');
      assert.match((await verifyAuditChain(deletionScope, deletionCheckpoint)).reason ?? '', /missing events/);
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
