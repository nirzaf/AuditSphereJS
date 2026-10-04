import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';

const postgresImage = 'postgres:18.6@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722';
const redisImage = 'redis:8.10@sha256:6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee';

test('T039 scopes row leases, rejects stale owners, and keeps PostgreSQL versions authoritative offline', { timeout: 180_000 }, async () => {
  const postgres = await new PostgreSqlContainer(postgresImage).withDatabase('auditsphere_leases').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  const redis = await new GenericContainer(redisImage).withExposedPorts(6379)
    .withCommand(['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'])
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections', 1)).start();
  const databaseUrl = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const devToken = randomBytes(32).toString('hex');
  Object.assign(process.env, {
    NODE_ENV: 'test', SERVICE_NAME: 'lease-integration', DATABASE_URL: databaseUrl, MIGRATION_DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl, DEV_AUTH_ENABLED: 'true', DEV_AUTH_TOKEN: devToken, AUTH_PROVIDER: 'development',
    WEB_ORIGIN: 'http://127.0.0.1:4200',
  });

  let db: typeof import('@auditsphere/server').db | undefined;
  let app: NestFastifyApplication | undefined;
  try {
    const prismaCli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { env: process.env, timeout: 60_000, stdio: 'pipe' });
    const server = await import('@auditsphere/server');
    db = server.db;
    const { AppModule, configureApiHttp, createFastifyAdapter } = await import('../dist/main.js');
    app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), { logger: false });
    await configureApiHttp(app);
    await app.listen(0, '127.0.0.1');
    const address = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    const ids = {
      firmId: randomUUID(), clientId: randomUUID(), engagementId: randomUUID(), importId: randomUUID(), documentId: randomUUID(),
      rowA: randomUUID(), rowB: randomUUID(), ownerA: server.fixtureUser, ownerB: randomUUID(), readOnly: randomUUID(),
    };
    await db.firm.create({ data: { id: ids.firmId, name: 'Synthetic lease firm' } });
    await db.client.create({ data: { id: ids.clientId, firmId: ids.firmId, name: 'Synthetic lease client' } });
    await db.engagement.create({ data: { id: ids.engagementId, firmId: ids.firmId, clientId: ids.clientId, name: 'Synthetic lease engagement', state: 'FIELDWORK_EXECUTION' } });
    await db.user.createMany({ data: [
      { id: ids.ownerA, email: `lease-a-${ids.ownerA}@fixture.test`, role: 'PREPARER' },
      { id: ids.ownerB, email: `lease-b-${ids.ownerB}@fixture.test`, role: 'PREPARER' },
      { id: ids.readOnly, email: `lease-read-${ids.readOnly}@fixture.test`, role: 'PREPARER' },
    ] });
    await db.membership.createMany({ data: [ids.ownerA, ids.ownerB, ids.readOnly].map(userId => ({ userId, firmId: ids.firmId, clientId: ids.clientId, engagementId: ids.engagementId, role: 'PREPARER' })) });
    await db.roleGrant.createMany({ data: [ids.ownerA, ids.ownerB].flatMap(userId => ['ENGAGEMENT_READ', 'FIELDWORK_WRITE'].map(capability => ({ userId, capability, firmId: ids.firmId, clientId: ids.clientId, engagementId: ids.engagementId, grantedBy: ids.ownerA }))).concat([{ userId: ids.readOnly, capability: 'ENGAGEMENT_READ', firmId: ids.firmId, clientId: ids.clientId, engagementId: ids.engagementId, grantedBy: ids.ownerA }]) });
    await db.document.create({ data: { id: ids.documentId, engagementId: ids.engagementId, key: `synthetic/${ids.documentId}.csv`, sha256: 'a'.repeat(64), filename: 'synthetic.csv' } });
    await db.tbImport.create({ data: { id: ids.importId, firmId: ids.firmId, clientId: ids.clientId, engagementId: ids.engagementId, documentId: ids.documentId, sha256: 'b'.repeat(64), status: 'MAPPING_REQUIRED' } });
    await db.tbRow.createMany({ data: [
      { id: ids.rowA, importId: ids.importId, position: 0, code: '4000', name: 'Synthetic revenue', current: '10.000000', prior: '9.000000', version: 1 },
      { id: ids.rowB, importId: ids.importId, position: 1, code: '1500', name: 'Synthetic assets', current: '8.000000', prior: '7.000000', version: 1 },
    ] });

    const fieldwork = app.get(server.FieldworkController);
    await assert.rejects(fieldwork.leaseStatus(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.readOnly }), /FIELDWORK_WRITE is not granted/);
    const first = await fieldwork.lease(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerA }, { action: 'acquire' }) as { available: true; lease: { leaseToken: string; expiresAt: string } };
    const parallel = await fieldwork.lease(ids.engagementId, ids.importId, ids.rowB, { actorId: ids.ownerB }, { action: 'acquire' }) as { available: true; lease: { leaseToken: string } };
    assert.ok(parallel.lease.leaseToken, 'a second row in the same import is independently editable');
    assert.ok(Date.parse(first.lease.expiresAt) > Date.now());
    await assert.rejects(fieldwork.lease(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerB }, { action: 'acquire' }), /Another editor currently holds this row lease/);

    await fieldwork.lease(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerA }, { action: 'release', token: first.lease.leaseToken });
    const replacement = await fieldwork.lease(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerB }, { action: 'acquire' }) as { available: true; lease: { leaseToken: string } };
    await assert.rejects(fieldwork.lease(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerA }, { action: 'release', token: first.lease.leaseToken }), /ownership token differs/);
    const ownerView = await fieldwork.leaseStatus(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerA }) as { available: true; lease: { userId: string; displayName: string; leaseToken?: string; ownedByCurrentUser: boolean } };
    assert.equal(ownerView.lease.userId, ids.ownerB);
    assert.match(ownerView.lease.displayName, /lease-b-/);
    assert.equal(ownerView.lease.ownedByCurrentUser, false);
    assert.equal(ownerView.lease.leaseToken, undefined, "readers never receive another user's secret ownership token");
    await fieldwork.lease(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerB }, { action: 'release', token: replacement.lease.leaseToken });
    await fieldwork.lease(ids.engagementId, ids.importId, ids.rowB, { actorId: ids.ownerB }, { action: 'release', token: parallel.lease.leaseToken });

    const leaseUrl = `${address}/api/v1/engagements/${ids.engagementId}/imports/${ids.importId}/rows/${ids.rowA}/lease`;
    const acquired = await fetch(leaseUrl, { method: 'POST', headers: { authorization: `Bearer ${devToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'acquire' }) });
    assert.equal(acquired.status, 201, 'the Fastify route returns a validated lease contract');
    const routeResult = await acquired.json() as { available: true; lease: { leaseToken: string } };
    const status = await fetch(leaseUrl, { headers: { authorization: `Bearer ${devToken}` } });
    assert.equal(status.status, 200);
    assert.equal((await status.json() as { lease: { ownedByCurrentUser: boolean } }).lease.ownedByCurrentUser, true);
    const released = await fetch(leaseUrl, { method: 'POST', headers: { authorization: `Bearer ${devToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'release', token: routeResult.lease.leaseToken }) });
    assert.equal(released.status, 201);

    const expiring = await fieldwork.lease(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerA }, { action: 'acquire' }) as { available: true; lease: { leaseToken: string } };
    const leaseKey = `audit:edit:tb:${ids.engagementId}:${ids.importId}:${ids.rowA}`;
    assert.equal(execFileSync('docker', ['exec', redis.getId(), 'redis-cli', 'PEXPIRE', leaseKey, '1'], { encoding: 'utf8' }).trim(), '1');
    await new Promise(resolve => setTimeout(resolve, 25));
    const expired = await fieldwork.leaseStatus(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerA }) as { available: true; lease: null };
    assert.equal(expired.lease, null, 'expired leases stop reporting editing presence');
    await assert.rejects(fieldwork.lease(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerA }, { action: 'release', token: expiring.lease.leaseToken }), /Lease expired or ownership token differs/);

    await server.mapBatch(ids.engagementId, ids.importId, ids.ownerA, { idempotencyKey: randomUUID(), changes: [{ rowId: ids.rowA, expectedVersion: 1, fsli: 'Revenue' }] });
    await assert.rejects(server.mapBatch(ids.engagementId, ids.importId, ids.ownerA, { idempotencyKey: randomUUID(), changes: [{ rowId: ids.rowA, expectedVersion: 1, fsli: 'Operating expenses' }] }), /rows changed/);
    await redis.stop();
    const offline = await fieldwork.leaseStatus(ids.engagementId, ids.importId, ids.rowA, { actorId: ids.ownerA }) as { available: boolean; reason?: string };
    assert.equal(offline.available, false, 'an unavailable Redis lease service must not fail the API operation');
    assert.equal(offline.reason, 'REDIS_UNAVAILABLE');
    await assert.rejects(server.mapBatch(ids.engagementId, ids.importId, ids.ownerA, { idempotencyKey: randomUUID(), changes: [{ rowId: ids.rowA, expectedVersion: 1, fsli: 'Operating expenses' }] }), /rows changed/);
  } finally {
    await app?.close().catch(() => undefined);
    await db?.$disconnect();
    await Promise.all([postgres.stop(), redis.stop().catch(() => undefined)]);
  }
});
