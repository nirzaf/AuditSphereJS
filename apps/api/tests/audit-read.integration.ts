import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const fixtureUser = '00000000-0000-4000-8000-000000000001';

test('HTTP audit read routes serialize and require current scoped engagement access', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_audit_read').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const uri = container.getConnectionUri();
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      SERVICE_NAME: 'integration',
      AUTH_PROVIDER: 'development',
      DATABASE_URL: uri,
      MIGRATION_DATABASE_URL: uri,
      DEV_AUTH_ENABLED: 'true',
      DEV_AUTH_TOKEN: 't025-audit-read-test-token',
    };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, AuditController, InternalGuard, recordAuditEvent } = await import('@auditsphere/server');
    disconnect = () => db.$disconnect();
    const firmId = randomUUID();
    const clientId = randomUUID();
    const engagementId = randomUUID();
    const grantorId = randomUUID();
    await db.firm.create({ data: { id: firmId, name: 'Audit API firm' } });
    await db.client.create({ data: { id: clientId, firmId, name: 'Audit API client' } });
    await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Audit API engagement' } });
    await db.user.createMany({ data: [
      { id: fixtureUser, email: 'audit-api-reader@example.test', role: 'REVIEWER' },
      { id: grantorId, email: 'audit-api-grantor@example.test', role: 'APPROVER' },
    ] });
    await db.membership.create({ data: { userId: fixtureUser, firmId, clientId, engagementId, role: 'REVIEWER' } });
    await db.roleGrant.create({ data: { userId: fixtureUser, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: grantorId } });
    await recordAuditEvent(db, {
      engagementId,
      action: 'ASSESSMENT_APPROVED',
      actorId: fixtureUser,
      actorKind: 'USER',
      resource: { type: 'MaterialityAssessment', id: 'assessment-1', version: 3 },
      correlationId: 'command-1',
      before: { status: 'CALCULATED' },
      after: { status: 'APPROVED' },
    });

    @Module({ controllers: [AuditController], providers: [InternalGuard] })
    class AuditReadModule {}

    app = await NestFactory.create(AuditReadModule, new FastifyAdapter(), { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    const headers = { authorization: 'Bearer t025-audit-read-test-token' };

    const checkpoint = await fetch(`${origin}/api/v1/engagements/${engagementId}/audit/checkpoint`, { headers });
    assert.equal(checkpoint.status, 200);
    assert.deepEqual(await checkpoint.json(), {
      formatVersion: 1,
      engagementId,
      sequence: '1',
      digest: (await db.auditChainRecord.findFirstOrThrow({ where: { engagementId }, select: { digest: true } })).digest,
    });

    const verification = await fetch(`${origin}/api/v1/engagements/${engagementId}/audit/verify`, { headers });
    assert.equal(verification.status, 200);
    assert.deepEqual(await verification.json(), { valid: true });

    const history = await fetch(`${origin}/api/v1/engagements/${engagementId}/audit/events`, { headers });
    assert.equal(history.status, 200);
    const events = await history.json() as Array<Record<string, unknown>>;
    assert.equal(events.length, 1);
    assert.equal(events[0].correlationId, 'command-1');
    assert.equal(events[0].resourceVersion, 3);
    assert.equal(events[0].actorId, fixtureUser);
    assert.equal(typeof events[0].createdAt, 'string', 'the API serializes audit timestamps as ISO strings');

    await db.roleGrant.updateMany({ where: { userId: fixtureUser, capability: 'ENGAGEMENT_READ' }, data: { revokedAt: new Date(), revokedBy: grantorId, reason: 'Verify audit API denial after grant revocation' } });
    for (const route of ['checkpoint', 'verify', 'events']) {
      const denied = await fetch(`${origin}/api/v1/engagements/${engagementId}/audit/${route}`, { headers });
      assert.equal(denied.status, 403, `the HTTP ${route} route denies a revoked ENGAGEMENT_READ grant`);
    }
  } finally {
    if (app) await app.close();
    await disconnect?.();
    await container.stop();
  }
});
