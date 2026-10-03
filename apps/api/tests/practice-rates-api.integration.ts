import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const fixtureUser = '00000000-0000-4000-8000-000000000001';
const token = 'practice-rate-local-test-token';

test('Practice rate routes validate contracts, enforce grants and replay stable results', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('practice_rates_api').withUsername('owner').withPassword(randomBytes(24).toString('hex')).start();
  let app: NestFastifyApplication | undefined;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const uri = container.getConnectionUri();
    const env = {
      ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', AUTH_PROVIDER: 'development',
      DEV_AUTH_ENABLED: 'true', DEV_AUTH_TOKEN: token, DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri,
    };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);

    const { db, PracticeRatesController, InternalGuard, ensurePracticeRateDefaultsForFirm } = await import('@auditsphere/server');
    disconnect = () => db.$disconnect();

    const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID(), staffId = randomUUID();
    await db.firm.create({ data: { id: firmId, name: 'Practice API test firm' } });
    await db.client.create({ data: { id: clientId, firmId, name: 'Synthetic API client' } });
    await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Synthetic API rate engagement' } });
    await db.user.create({ data: { id: fixtureUser, email: 'billing@example.test', role: 'BILLING' } });
    await db.user.create({ data: { id: staffId, email: 'preparer@example.test', role: 'PREPARER' } });
    await db.membership.createMany({ data: [
      { userId: fixtureUser, firmId, clientId, engagementId, role: 'BILLING' },
      { userId: staffId, firmId, clientId, engagementId, role: 'PREPARER' },
    ] });
    await db.roleGrant.create({ data: { userId: fixtureUser, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: fixtureUser } });
    for (const capability of ['PRACTICE_READ', 'PRACTICE_MANAGE']) {
      await db.roleGrant.create({ data: { userId: fixtureUser, capability, firmId, grantedBy: fixtureUser, reason: 'Isolated Practice API acceptance' } });
    }
    await ensurePracticeRateDefaultsForFirm(firmId);

    @Module({ controllers: [PracticeRatesController], providers: [InternalGuard] })
    class PracticeRatesApiModule {}
    app = await NestFactory.create<NestFastifyApplication>(PracticeRatesApiModule, new FastifyAdapter(), { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    const headers = { authorization: `Bearer ${token}` };
    const rateUrl = `${origin}/api/v1/engagements/${engagementId}/practice/rate-cards`;

    const read = await fetch(rateUrl, { headers });
    assert.equal(read.status, 200);
    const admin = await read.json() as { currency: string; rateCards: Array<{ grade: string; hourlyRate: string }>; staff: Array<{ accessRole: string }>; jobGrades: string[] };
    assert.equal(admin.currency, 'QAR');
    assert.equal(admin.rateCards.length, 6);
    assert.deepEqual(Object.fromEntries(admin.rateCards.map(row => [row.grade, row.hourlyRate])), {
      ENGAGEMENT_PARTNER: '1000.000000', AUDIT_MANAGER: '750.000000', AUDIT_SUPERVISOR: '500.000000',
      AUDIT_SENIOR: '500.000000', AUDIT_ASSOCIATE: '200.000000', AUDIT_JUNIOR: '200.000000',
    });
    assert.deepEqual(admin.jobGrades, ['ENGAGEMENT_PARTNER', 'AUDIT_MANAGER', 'AUDIT_SUPERVISOR', 'AUDIT_SENIOR', 'AUDIT_ASSOCIATE', 'AUDIT_JUNIOR']);
    assert.equal(admin.staff[0]?.accessRole, 'BILLING');

    const firstRevision = {
      idempotencyKey: randomUUID(), grade: 'AUDIT_MANAGER', hourlyRate: '825.250000', effectiveFrom: '2027-01-01',
      expectedPreviousVersion: 1,
    };
    const post = async (body: object) => fetch(rateUrl, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const created = await post(firstRevision);
    assert.equal(created.status, 201);
    const createdView = await created.json();
    assert.deepEqual(await (await post(firstRevision)).json(), createdView, 'replayed HTTP responses preserve the original serialized result');
    assert.deepEqual({
      hourlyRate: (createdView as { hourlyRate: string }).hourlyRate,
      effectiveFrom: (createdView as { effectiveFrom: string }).effectiveFrom,
      grade: (createdView as { grade: string }).grade,
    }, { hourlyRate: '825.250000', effectiveFrom: '2027-01-01', grade: 'AUDIT_MANAGER' });

    const bounded = await post({
      idempotencyKey: randomUUID(), grade: 'AUDIT_MANAGER', hourlyRate: '850.000000', effectiveFrom: '2027-03-01',
      effectiveTo: '2027-08-01', expectedPreviousVersion: 1,
    });
    assert.equal(bounded.status, 201);
    const overlap = await post({
      idempotencyKey: randomUUID(), grade: 'AUDIT_MANAGER', hourlyRate: '900.000000', effectiveFrom: '2027-06-01',
      effectiveTo: '2027-09-01', expectedPreviousVersion: 1,
    });
    assert.equal(overlap.status, 409, 'the protected route rejects overlapping effective intervals');

    const assignmentResponse = await fetch(`${origin}/api/v1/engagements/${engagementId}/practice/staff-grade-assignments`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({
        idempotencyKey: randomUUID(), userId: staffId, grade: 'AUDIT_SENIOR', effectiveFrom: '2026-01-01', expectedPreviousVersion: 0,
      }),
    });
    assert.equal(assignmentResponse.status, 201);
    const assigned = await assignmentResponse.json() as { userId: string; grade: string; accessRole: string; effectiveFrom: string };
    assert.deepEqual({ userId: assigned.userId, grade: assigned.grade, accessRole: assigned.accessRole, effectiveFrom: assigned.effectiveFrom }, {
      userId: staffId, grade: 'AUDIT_SENIOR', accessRole: 'PREPARER', effectiveFrom: '2026-01-01',
    });

    await db.roleGrant.updateMany({ where: { userId: fixtureUser, capability: 'PRACTICE_MANAGE', firmId }, data: { revokedAt: new Date(), revokedBy: fixtureUser, reason: 'Verify least-privilege route denial' } });
    const deniedMutation = await post({
      idempotencyKey: randomUUID(), grade: 'AUDIT_MANAGER', hourlyRate: '875.000000', effectiveFrom: '2028-01-01', expectedPreviousVersion: 1,
    });
    assert.equal(deniedMutation.status, 403, 'read access does not imply rate-management authority');
    assert.equal(await db.practiceRateCard.count({ where: { firmId, grade: 'AUDIT_MANAGER', effectiveFrom: new Date('2028-01-01T00:00:00Z') } }), 0);
  } finally {
    if (app) await app.close();
    await disconnect?.();
    await container.stop();
  }
});
