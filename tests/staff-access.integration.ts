import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);

test('engagement staff assignment is partner-authorized, scoped, expiring, audited and idempotent', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_staff_access').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 60_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, assignEngagementStaff, revokeEngagementStaff, hasCapability } = await import('@auditsphere/server');
    const firmId = randomUUID();
    const clientId = randomUUID();
    const engagementId = randomUUID();
    const otherEngagementId = randomUUID();
    const partnerId = randomUUID();
    const reviewerId = randomUUID();
    const adminId = randomUUID();
    const targetId = randomUUID();
    try {
      await db.firm.create({ data: { id: firmId, name: 'Staff assignment firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Staff assignment client' } });
      await db.engagement.createMany({ data: [
        { id: engagementId, firmId, clientId, name: 'Assigned engagement' },
        { id: otherEngagementId, firmId, clientId, name: 'Unassigned engagement' },
      ] });
      await db.user.createMany({ data: [
        { id: partnerId, email: `${partnerId}@assignment.test`, role: 'APPROVER' },
        { id: reviewerId, email: `${reviewerId}@assignment.test`, role: 'REVIEWER' },
        { id: adminId, email: `${adminId}@assignment.test`, role: 'ADMIN' },
        { id: targetId, email: `${targetId}@assignment.test`, role: 'PREPARER' },
      ] });
      await db.membership.createMany({ data: [
        { userId: partnerId, firmId, clientId, engagementId, role: 'APPROVER' },
        { userId: reviewerId, firmId, clientId, engagementId, role: 'REVIEWER' },
        { userId: adminId, firmId, clientId, engagementId, role: 'ADMIN' },
        { userId: targetId, firmId, clientId, engagementId, role: 'REVIEWER' },
      ] });
      for (const capability of ['ENGAGEMENT_READ', 'TEAM_ASSIGNMENT_MANAGE'] as const) {
        await db.roleGrant.create({ data: { userId: partnerId, capability, firmId, clientId, engagementId, grantedBy: partnerId } });
      }
      await db.roleGrant.create({ data: { userId: adminId, capability: 'TEAM_ASSIGNMENT_MANAGE', firmId, clientId, engagementId, grantedBy: adminId } });
      await db.roleGrant.create({ data: { userId: reviewerId, capability: 'TEAM_ASSIGNMENT_MANAGE', firmId, clientId, engagementId, grantedBy: partnerId } });
      await db.roleGrant.create({ data: { userId: targetId, capability: 'REVIEW_RESOLVE', firmId, clientId, engagementId, grantedBy: partnerId } });

      const body = {
        idempotencyKey: randomUUID(),
        expectedVersion: 1,
        userId: targetId,
        role: 'PREPARER',
        capabilities: ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'REVIEW_RAISE', 'ADJUSTMENT_MANAGE'],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        reason: 'Assign synthetic preparer to engagement work',
      };
      const first = await assignEngagementStaff(partnerId, engagementId, body);
      const replay = await assignEngagementStaff(partnerId, engagementId, body);
      assert.deepEqual(replay, first, 'a retry returns the committed assignment result');
      assert.equal((first as { version: number }).version, 2, 'the engagement revision advances with the assignment');
      assert.equal(await db.commandReceipt.count({ where: { key: body.idempotencyKey } }), 1);
      assert.equal(await db.membership.findUnique({ where: { userId_engagementId: { userId: targetId, engagementId } }, select: { role: true } }).then((row) => row?.role), 'PREPARER');
      assert.equal(await db.roleGrant.count({ where: { userId: targetId, firmId, clientId, engagementId, revokedAt: null } }), body.capabilities.length);
      assert.equal(await hasCapability(db, targetId, 'FIELDWORK_WRITE', { firmId, clientId, engagementId }), true);
      assert.equal(await hasCapability(db, targetId, 'TEAM_ASSIGNMENT_MANAGE', { firmId, clientId, engagementId }), false);
      assert.equal(await db.roleGrant.findFirst({ where: { userId: targetId, capability: 'REVIEW_RESOLVE' } }).then((row) => row?.revokedAt instanceof Date), true, 'reassignment revokes grants from the prior direct assignment');
      assert.equal(await db.auditEvent.count({ where: { engagementId, actorId: partnerId, action: 'ENGAGEMENT_STAFF_ASSIGNED' } }), 1);

      await assert.rejects(assignEngagementStaff(partnerId, engagementId, { ...body, expectedVersion: 2, idempotencyKey: randomUUID(), capabilities: [...body.capabilities, 'MATERIALITY_APPROVE'] }), /outside the PREPARER role ceiling/);
      assert.equal(await db.membership.findUnique({ where: { userId_engagementId: { userId: targetId, engagementId } }, select: { role: true } }).then((row) => row?.role), 'PREPARER', 'invalid grants make no partial role change');
      await assert.rejects(assignEngagementStaff(partnerId, engagementId, { ...body, expectedVersion: 2, idempotencyKey: randomUUID(), userId: adminId, role: 'APPROVER' }), /outside the APPROVER role ceiling/);
      await assert.rejects(assignEngagementStaff(reviewerId, engagementId, { ...body, expectedVersion: 2, idempotencyKey: randomUUID(), userId: randomUUID() }), /not granted/i);
      await assert.rejects(assignEngagementStaff(adminId, engagementId, { ...body, expectedVersion: 2, idempotencyKey: randomUUID(), userId: randomUUID() }), /not granted/i);
      await assert.rejects(assignEngagementStaff(partnerId, otherEngagementId, { ...body, idempotencyKey: randomUUID(), userId: randomUUID() }), /not granted/i);
      await assert.rejects(assignEngagementStaff(partnerId, engagementId, { ...body, role: 'PREPARER', capabilities: ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'REVIEW_RAISE', 'ADJUSTMENT_MANAGE', 'MATERIALITY_APPROVE'] }), /Idempotency key reused/);
      await assert.rejects(assignEngagementStaff(partnerId, engagementId, { ...body, idempotencyKey: randomUUID(), expectedVersion: 1 }), /Engagement changed; reload before changing staff assignments/);

      const revoke = { idempotencyKey: randomUUID(), expectedVersion: 2, reason: 'Assignment ended for synthetic acceptance' };
      const revoked = await revokeEngagementStaff(partnerId, engagementId, targetId, revoke);
      assert.deepEqual(await revokeEngagementStaff(partnerId, engagementId, targetId, revoke), revoked, 'revocation is also idempotent');
      assert.equal((revoked as { version: number }).version, 3, 'revocation advances the engagement revision');
      assert.equal(await db.membership.findUnique({ where: { userId_engagementId: { userId: targetId, engagementId } } }), null);
      assert.equal(await db.roleGrant.count({ where: { userId: targetId, firmId, clientId, engagementId, revokedAt: null } }), 0);
      assert.equal(await hasCapability(db, targetId, 'ENGAGEMENT_READ', { firmId, clientId, engagementId }), false);
      assert.equal(await db.auditEvent.count({ where: { engagementId, actorId: partnerId, action: 'ENGAGEMENT_STAFF_REVOKED' } }), 1);
      await assert.rejects(revokeEngagementStaff(partnerId, otherEngagementId, targetId, { idempotencyKey: randomUUID(), expectedVersion: 1, reason: 'Attempt cross-engagement revocation' }), /not granted/i);
      await assert.rejects(revokeEngagementStaff(partnerId, engagementId, partnerId, { idempotencyKey: randomUUID(), expectedVersion: 3, reason: 'Attempt self revocation' }), /cannot revoke their own/i);
    } finally {
      await db.$disconnect();
    }
  } finally {
    await container.stop();
  }
});
