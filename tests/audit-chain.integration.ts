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
      const engagementId = randomUUID(), actorId = randomUUID();
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
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
