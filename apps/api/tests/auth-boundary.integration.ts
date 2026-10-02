import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmA = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const firmB = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const clientA = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
const clientB = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
const engagementA = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5';
const engagementB = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6';
const fixtureUser = '00000000-0000-4000-8000-000000000001';
const grantor = '18181818-1818-4818-8818-181818181818';

test('HTTP guard rejects a valid foreign engagement UUID without membership and scoped grant', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_auth_boundary').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, DEV_AUTH_ENABLED: 'true', DEV_AUTH_TOKEN: 'auth-boundary-local-test-token' });
    const { db, InternalGuard, InternalIdentityGuard, InternalIdentityController, GovernanceController } = await import('@auditsphere/server');
    disconnect = () => db.$disconnect();
    await db.firm.createMany({ data: [{ id: firmA, name: 'Firm A' }, { id: firmB, name: 'Firm B' }] });
    await db.client.createMany({ data: [{ id: clientA, firmId: firmA, name: 'Client A' }, { id: clientB, firmId: firmB, name: 'Client B' }] });
    await db.engagement.createMany({ data: [
      { id: engagementA, firmId: firmA, clientId: clientA, name: 'Engagement A' },
      { id: engagementB, firmId: firmB, clientId: clientB, name: 'Engagement B' },
    ] });
    await db.user.createMany({ data: [
      { id: fixtureUser, email: 'auth-fixture@example.test', role: 'PREPARER' },
      { id: grantor, email: 'auth-grantor@example.test', role: 'ADMIN' },
    ] });
    await db.membership.create({ data: { userId: fixtureUser, firmId: firmA, clientId: clientA, engagementId: engagementA } });
    await db.roleGrant.create({ data: { userId: fixtureUser, capability: 'ENGAGEMENT_READ', firmId: firmA, clientId: clientA, engagementId: engagementA, grantedBy: grantor } });

    @Module({ controllers: [GovernanceController, InternalIdentityController], providers: [InternalGuard, InternalIdentityGuard] })
    class BoundaryModule {}

    app = await NestFactory.create(BoundaryModule, new FastifyAdapter(), { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    const headers = { authorization: 'Bearer auth-boundary-local-test-token' };
    const identity = await fetch(`${origin}/api/v1/me`, { headers });
    assert.equal(identity.status, 200);
    assert.deepEqual(await identity.json(), { id: fixtureUser, email: 'auth-fixture@example.test', active: true });
    const revoked = await fetch(`${origin}/api/v1/me/revoke-sessions`, { method: 'POST', headers });
    assert.equal(revoked.status, 409, 'static development credentials cannot claim Entra session revocation');
    assert.equal(await db.identitySessionRevocation.count({ where: { userId: fixtureUser } }), 0);

    const own = await fetch(`${origin}/api/v1/engagements/${engagementA}/lifecycle`, { headers });
    assert.equal(own.status, 200);
    const ownHistory = await own.json() as { state: string; history: unknown[] };
    assert.equal(ownHistory.state, 'LEAD_INGESTION');
    assert.deepEqual(ownHistory.history, []);
    const identityOnlyCommand = await fetch(`${origin}/api/v1/engagements/${engagementA}/lifecycle`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: '21212121-2121-4121-8121-212121212121' }),
    });
    assert.equal(identityOnlyCommand.status, 403, 'successful authentication and read access do not grant a lifecycle command');
    assert.equal((await db.engagement.findUniqueOrThrow({ where: { id: engagementA } })).state, 'LEAD_INGESTION');
    const foreign = await fetch(`${origin}/api/v1/engagements/${engagementB}/lifecycle`, { headers });
    assert.equal(foreign.status, 403, 'a real foreign engagement UUID must not disclose lifecycle state');
    const foreignCommand = await fetch(`${origin}/api/v1/engagements/${engagementB}/lifecycle`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'START_FIELDWORK', expectedVersion: 1, idempotencyKey: '11111111-1111-4111-8111-111111111111' }),
    });
    assert.equal(foreignCommand.status, 403, 'a valid foreign engagement UUID cannot be mutated');
    assert.equal((await db.engagement.findUniqueOrThrow({ where: { id: engagementB } })).state, 'LEAD_INGESTION', 'denied command must not change foreign state');
    assert.equal(await db.engagementTransition.count({ where: { engagementId: engagementB } }), 0, 'denied command must not append transition history');
    await db.user.update({ where: { id: fixtureUser }, data: { active: false } });
    const disabledIdentity = await fetch(`${origin}/api/v1/me`, { headers });
    assert.equal(disabledIdentity.status, 401, 'disabled local users lose identity access');
    const disabledEngagement = await fetch(`${origin}/api/v1/engagements/${engagementA}/lifecycle`, { headers });
    assert.equal(disabledEngagement.status, 401, 'disabled local users lose business API access');
    console.log('Fastify identity route returns only the authenticated user and denies disabled or foreign identities');
  } finally {
    if (app) await app.close();
    await disconnect?.();
    await container.stop();
  }
});
