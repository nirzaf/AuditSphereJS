import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { createConnection } from 'node:net';
import type { AddressInfo, Socket as NetSocket } from 'node:net';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';

const postgresImage = 'postgres:18.6@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722';
const redisImage = 'redis:8.10@sha256:6f81e8915c60b065a524e6967e0ad1c639ba6efa84d669f823683ea04d9150ee';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

type Replica = { app: NestFastifyApplication; gateway: { revalidateActiveSockets(): Promise<void> }; port: number };

async function startSocketClient(address: string, auth: Record<string, string>, cookie?: string): Promise<Socket> {
  const socket = io(`${address}/realtime`, {
    path: '/socket.io', transports: ['websocket'], reconnection: true, reconnectionAttempts: 12,
    reconnectionDelay: 80, reconnectionDelayMax: 150, timeout: 4_000,
    auth, extraHeaders: { origin: process.env.WEB_ORIGIN!, ...(cookie ? { cookie } : {}) },
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket.IO connection timed out')), 8_000);
    socket.once('connect', () => { clearTimeout(timeout); resolve(); });
    socket.once('connect_error', error => { clearTimeout(timeout); reject(error); });
  });
  return socket;
}

function join(socket: Socket, request: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => socket.timeout(6_000).emit('join', request, (error: Error | null, result: unknown) => error ? reject(error) : resolve(result)));
}

function joinWithoutTimeout(socket: Socket, request: unknown): Promise<unknown> {
  return new Promise(resolve => socket.emit('join', request, resolve));
}

async function startUpgradeProxy(target: () => number): Promise<{ address: string; close(): Promise<void> }> {
  const proxy = createServer();
  proxy.on('upgrade', (request: IncomingMessage, downstream: NetSocket, head: Buffer) => {
    const upstream = createConnection({ host: '127.0.0.1', port: target() });
    upstream.on('connect', () => {
      const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
      for (let index = 0; index < request.rawHeaders.length; index += 2) lines.push(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`);
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      downstream.pipe(upstream).pipe(downstream);
    });
    upstream.on('error', () => downstream.destroy());
    downstream.on('error', () => upstream.destroy());
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const address = proxy.address() as AddressInfo;
  return { address: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve())) };
}

test('T038 scopes rooms, emits post-commit hints, reauthorizes and reconnects across API replicas', { timeout: 240_000 }, async () => {
  const postgres = await new PostgreSqlContainer(postgresImage).withDatabase('auditsphere_realtime').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  const redis = await new GenericContainer(redisImage).withExposedPorts(6379)
    .withCommand(['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'])
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections', 1)).start();
  const databaseUrl = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const devToken = randomBytes(32).toString('hex');
  Object.assign(process.env, {
    NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: databaseUrl, MIGRATION_DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl, DEV_AUTH_ENABLED: 'true', DEV_AUTH_TOKEN: devToken, AUTH_PROVIDER: 'development',
    WEB_ORIGIN: 'http://127.0.0.1:4200',
  });
  let db: typeof import('@auditsphere/server').db | undefined;
  let replicaA: Replica | undefined;
  let replicaB: Replica | undefined;
  let proxy: Awaited<ReturnType<typeof startUpgradeProxy>> | undefined;
  const sockets: Socket[] = [];
  try {
    const prismaCli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { env: process.env, timeout: 60_000, stdio: 'pipe' });
    const server = await import('@auditsphere/server');
    db = server.db;
    const { AppModule, configureApiHttp, createFastifyAdapter } = await import('../dist/main.js');
    const { NestFactory } = await import('@nestjs/core');
    const { installRealtimeRedisAdapter, readConfiguration, RealtimeGateway, mapBatch } = server;
    const createReplica = async (): Promise<Replica> => {
      const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), { logger: false });
      await installRealtimeRedisAdapter(app, redisUrl);
      await configureApiHttp(app, readConfiguration());
      await app.listen(0, '127.0.0.1');
      const port = (app.getHttpServer().address() as AddressInfo).port;
      return { app, port, gateway: app.get(RealtimeGateway) };
    };
    replicaA = await createReplica();
    replicaB = await createReplica();
    const addressA = `http://127.0.0.1:${replicaA.port}`;
    const addressB = `http://127.0.0.1:${replicaB.port}`;

    const ids = { firmId: randomUUID(), clientId: randomUUID(), engagementId: randomUUID(), deniedEngagementId: randomUUID(), userId: server.fixtureUser, leaseOwnerId: randomUUID(), portalUserId: randomUUID(), documentId: randomUUID(), importId: randomUUID(), rowId: randomUUID() };
    await db.firm.create({ data: { id: ids.firmId, name: 'Synthetic realtime firm' } });
    await db.client.create({ data: { id: ids.clientId, firmId: ids.firmId, name: 'Synthetic realtime client' } });
    await db.engagement.createMany({ data: [
      { id: ids.engagementId, firmId: ids.firmId, clientId: ids.clientId, name: 'Synthetic realtime engagement', state: 'FIELDWORK_EXECUTION' },
      { id: ids.deniedEngagementId, firmId: ids.firmId, clientId: ids.clientId, name: 'Synthetic denied engagement' },
    ] });
    await db.user.createMany({ data: [
      { id: ids.userId, email: `realtime-${ids.userId}@fixture.test`, role: 'PREPARER' },
      { id: ids.leaseOwnerId, email: `lease-owner-${ids.leaseOwnerId}@fixture.test`, role: 'PREPARER' },
    ] });
    await db.membership.createMany({ data: [ids.userId, ids.leaseOwnerId].map(userId => ({ userId, firmId: ids.firmId, clientId: ids.clientId, engagementId: ids.engagementId, role: 'PREPARER' })) });
    await db.roleGrant.createMany({ data: ['ENGAGEMENT_READ', 'FIELDWORK_WRITE'].map(capability => ({ userId: ids.userId, capability, firmId: ids.firmId, clientId: ids.clientId, engagementId: ids.engagementId, grantedBy: ids.userId })) });
    await db.document.create({ data: { id: ids.documentId, engagementId: ids.engagementId, key: `synthetic/${ids.documentId}.csv`, sha256: 'a'.repeat(64), filename: 'synthetic.csv' } });
    await db.tbImport.create({ data: { id: ids.importId, firmId: ids.firmId, clientId: ids.clientId, engagementId: ids.engagementId, documentId: ids.documentId, sha256: 'b'.repeat(64), status: 'MAPPING_REQUIRED' } });
    await db.tbRow.create({ data: { id: ids.rowId, importId: ids.importId, position: 0, code: '4000', name: 'Synthetic revenue', current: '10.000000', prior: '-10.000000', fsli: null, version: 1 } });
    await db.portalUser.create({ data: { id: ids.portalUserId, email: `portal-${ids.portalUserId}@fixture.test`, mustChangePassword: false } });
    await db.portalMembership.create({ data: { portalUserId: ids.portalUserId, firmId: ids.firmId, clientId: ids.clientId, engagementId: ids.engagementId, advanceClearedAt: new Date() } });
    const portalToken = randomBytes(32).toString('hex');
    await db.portalSession.create({ data: { portalUserId: ids.portalUserId, tokenHash: digest(portalToken), csrfHash: digest(randomBytes(32).toString('hex')), mustChangePassword: false, expiresAt: new Date(Date.now() + 60_000) } });

    const staff = await startSocketClient(addressA, { kind: 'internal', accessToken: devToken });
    const portal = await startSocketClient(addressB, { kind: 'portal' }, `auditsphere_portal_socket=${portalToken}`);
    sockets.push(staff, portal);
    const engagementJoin = await join(staff, { engagementId: ids.engagementId, resource: { type: 'engagement' } }) as { ok: boolean; snapshot?: { engagementVersion: number } };
    assert.equal(engagementJoin.ok, true, 'staff room requires an active identity and scoped read grant');
    assert.ok(engagementJoin.snapshot?.engagementVersion);
    assert.deepEqual(await join(staff, { engagementId: ids.deniedEngagementId, resource: { type: 'engagement' } }), { ok: false, error: 'Room access denied' });
    assert.deepEqual(await join(portal, { engagementId: ids.deniedEngagementId, resource: { type: 'engagement' } }), { ok: false, error: 'Room access denied' });
    assert.deepEqual(await join(portal, { engagementId: ids.engagementId, resource: { type: 'trial-balance-import', id: ids.importId } }), { ok: false, error: 'Room access denied' }, 'portal sessions cannot subscribe to internal accounting resources');
    assert.equal((await join(portal, { engagementId: ids.engagementId, resource: { type: 'engagement' } }) as { ok: boolean }).ok, true, 'portal membership is checked independently from staff grants');

    const importClient = await startSocketClient(addressB, { kind: 'internal', accessToken: devToken });
    sockets.push(importClient);
    const importJoin = await join(importClient, { engagementId: ids.engagementId, resource: { type: 'trial-balance-import', id: ids.importId } }) as { ok: boolean; snapshot?: { resourceVersion: number } };
    assert.equal(importJoin.ok, true);
    assert.equal(importJoin.snapshot?.resourceVersion, 1);
    const switchingClient = await startSocketClient(addressA, { kind: 'internal', accessToken: devToken });
    sockets.push(switchingClient);
    const switchingEvents: unknown[] = [];
    switchingClient.on('invalidate', value => switchingEvents.push(value));
    const authorizedSwitch = joinWithoutTimeout(switchingClient, { engagementId: ids.engagementId, resource: { type: 'trial-balance-import', id: ids.importId } });
    const deniedSwitch = joinWithoutTimeout(switchingClient, { engagementId: ids.deniedEngagementId, resource: { type: 'trial-balance-import', id: ids.importId } });
    const [authorizedSwitchAck, deniedSwitchAck] = await Promise.all([authorizedSwitch, deniedSwitch]);
    assert.equal((authorizedSwitchAck as { ok: boolean }).ok, true);
    assert.deepEqual(deniedSwitchAck, { ok: false, error: 'Room access denied' });
    server.publishRealtimeInvalidation({ schemaVersion: 1, engagementId: ids.engagementId, resourceType: 'trial-balance-import', resourceId: ids.importId, version: 2 });
    await sleep(150);
    assert.equal(switchingEvents.length, 0, 'a denied room switch removes the previous subscription immediately');

    const fieldwork = replicaA.app.get(server.FieldworkController);
    const firstLease = await fieldwork.lease(ids.engagementId, ids.importId, { actorId: ids.userId }, { action: 'acquire' }) as { leaseToken: string; fencingNumber: number };
    await assert.rejects(fieldwork.lease(ids.engagementId, ids.importId, { actorId: ids.leaseOwnerId }, { action: 'acquire' }), /Another editor holds this lease/);
    await assert.rejects(fieldwork.lease(ids.engagementId, ids.importId, { actorId: ids.leaseOwnerId }, { action: 'release', token: firstLease.leaseToken }), /ownership token differs/);
    await fieldwork.lease(ids.engagementId, ids.importId, { actorId: ids.userId }, { action: 'release', token: firstLease.leaseToken });
    const replacementLease = await fieldwork.lease(ids.engagementId, ids.importId, { actorId: ids.leaseOwnerId }, { action: 'acquire' }) as { leaseToken: string; fencingNumber: number };
    assert.ok(replacementLease.fencingNumber > firstLease.fencingNumber, 'a new lease receives a higher fencing number');
    await assert.rejects(fieldwork.lease(ids.engagementId, ids.importId, { actorId: ids.userId }, { action: 'release', token: firstLease.leaseToken }), /ownership token differs/);
    await assert.rejects(fieldwork.lease(ids.engagementId, ids.importId, { actorId: ids.userId }, { action: 'acquire' }), /Another editor holds this lease/);
    await fieldwork.lease(ids.engagementId, ids.importId, { actorId: ids.leaseOwnerId }, { action: 'release', token: replacementLease.leaseToken });

    const received: unknown[] = [];
    let firstInvalidation!: () => void;
    const invalidationArrived = new Promise<void>(resolve => { firstInvalidation = resolve; });
    importClient.on('invalidate', value => { received.push(value); firstInvalidation(); });
    const result = await mapBatch(ids.engagementId, ids.importId, ids.userId, {
      idempotencyKey: randomUUID(), changes: [{ rowId: ids.rowId, expectedVersion: 1, fsli: 'Revenue' }],
    });
    assert.deepEqual(result, { saved: 1 });
    await Promise.race([invalidationArrived, sleep(5_000).then(() => { throw new Error('Committed fieldwork mutation did not reach the other API replica'); })]);
    const invalidation = received[0] as Record<string, unknown>;
    assert.deepEqual(Object.keys(invalidation).sort(), ['engagementId', 'resourceId', 'resourceType', 'schemaVersion', 'version']);
    assert.equal(invalidation.engagementId, ids.engagementId);
    assert.equal(invalidation.resourceId, ids.importId);
    assert.equal(invalidation.version, 2);
    assert.equal('current' in invalidation || 'fsli' in invalidation || 'amount' in invalidation, false, 'financial values never travel in realtime hints');

    const failedEvent = { schemaVersion: 1 as const, engagementId: ids.engagementId, resourceType: 'trial-balance-import' as const, resourceId: ids.importId, version: 3 };
    await assert.rejects(server.runUnitOfWork(async scope => {
      scope.afterCommit(() => server.publishRealtimeInvalidation(failedEvent));
      throw new Error('synthetic rollback');
    }, { client: db }), /synthetic rollback/);
    await sleep(150);
    const deliveredCount = received.length;
    assert.ok(deliveredCount >= 1, 'the committed mutation emitted a room invalidation');
    assert.ok(received.every(value => JSON.stringify(value) === JSON.stringify(received[0])), 'replicas deliver the same version-only hint');
    assert.equal(received.length, deliveredCount, 'rolled-back work never emits an invalidation');

    let proxyTarget = replicaA.port;
    proxy = await startUpgradeProxy(() => proxyTarget);
    const reconnecting = io(`${proxy.address}/realtime`, {
      path: '/socket.io', transports: ['websocket'], reconnection: true, reconnectionAttempts: 20,
      reconnectionDelay: 100, reconnectionDelayMax: 250, timeout: 4_000,
      auth: { kind: 'internal', accessToken: devToken }, extraHeaders: { origin: process.env.WEB_ORIGIN! },
    });
    sockets.push(reconnecting);
    const snapshots: number[] = [];
    let reconnected!: () => void;
    const secondJoin = new Promise<void>(resolve => { reconnected = resolve; });
    reconnecting.on('connect', () => {
      void join(reconnecting, { engagementId: ids.engagementId, resource: { type: 'engagement' } }).then(value => {
        const ack = value as { ok: boolean; snapshot?: { engagementVersion: number } };
        if (ack.ok && ack.snapshot) { snapshots.push(ack.snapshot.engagementVersion); if (snapshots.length > 1) reconnected(); }
      });
    });
    const firstJoinDeadline = Date.now() + 8_000;
    while (snapshots.length < 1 && Date.now() < firstJoinDeadline) await sleep(20);
    assert.equal(snapshots.length, 1, 'initial connection selected replica one through the WebSocket proxy');
    proxyTarget = replicaB.port;
    await replicaA.app.close();
    replicaA = undefined;
    await Promise.race([secondJoin, sleep(15_000).then(() => { throw new Error('WebSocket client did not reconnect and reauthorize against replica two'); })]);
    assert.equal(snapshots.length, 2);
    assert.ok(snapshots[1]! >= snapshots[0]!, 'reconnect returns the current authoritative PostgreSQL version');

    const accessRevoked = new Promise<void>(resolve => importClient.once('access-revoked', resolve));
    await db.roleGrant.updateMany({ where: { userId: ids.userId, capability: 'ENGAGEMENT_READ', revokedAt: null }, data: { revokedAt: new Date(), revokedBy: ids.userId, reason: 'Synthetic realtime access review' } });
    await replicaB.gateway.revalidateActiveSockets();
    await Promise.race([accessRevoked, sleep(3_000).then(() => { throw new Error('Revoked engagement grant did not revoke the socket room'); })]);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await proxy?.close().catch(() => undefined);
    await replicaA?.app.close().catch(() => undefined);
    await replicaB?.app.close().catch(() => undefined);
    await db?.$disconnect();
    await Promise.all([postgres.stop(), redis.stop()]);
  }
});
