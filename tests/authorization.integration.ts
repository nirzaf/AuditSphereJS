import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmA = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const firmB = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const clientA = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
const clientB = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
const engagementA = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5';
const engagementB = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6';
const user = '17171717-1717-4717-8717-171717171717';
const grantedBy = '18181818-1818-4818-8818-181818181818';

test('scoped grants decide authorization: expiry, revocation, wrong scope and no implicit role', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_authz').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    const { db, hasCapability, requireCapability, revokeGrant } = await import('@auditsphere/server');
    try {
      await db.firm.createMany({ data: [{ id: firmA, name: 'Firm A' }, { id: firmB, name: 'Firm B' }] });
      await db.client.createMany({ data: [{ id: clientA, firmId: firmA, name: 'Client A' }, { id: clientB, firmId: firmB, name: 'Client B' }] });
      await db.engagement.createMany({ data: [
        { id: engagementA, firmId: firmA, clientId: clientA, name: 'Engagement A' },
        { id: engagementB, firmId: firmB, clientId: clientB, name: 'Engagement B' },
      ] });
      await db.user.createMany({ data: [{ id: user, email: 'grantee@example.test', role: 'PREPARER' }, { id: grantedBy, email: 'granter@example.test', role: 'ADMIN' }] });
      const scopeA = { firmId: firmA, clientId: clientA, engagementId: engagementA };
      const scopeB = { firmId: firmB, clientId: clientB, engagementId: engagementB };
      const grant = (data: { capability?: string; firmId?: string; clientId?: string; engagementId?: string; expiresAt?: Date }) =>
        db.roleGrant.create({ data: { userId: user, capability: 'ENGAGEMENT_READ', grantedBy, ...data } });

      // The legacy role string grants nothing by itself.
      assert.equal(await hasCapability(db, user, 'ENGAGEMENT_READ', scopeA), false);
      await assert.rejects(requireCapability(db, user, 'ENGAGEMENT_READ', scopeA), /not granted/);

      // An engagement-scoped grant covers only that engagement.
      const engagementGrant = await grant({ firmId: firmA, clientId: clientA, engagementId: engagementA });
      assert.equal(await hasCapability(db, user, 'ENGAGEMENT_READ', scopeA), true);
      assert.equal(await hasCapability(db, user, 'ENGAGEMENT_READ', scopeB), false);

      // Revocation is immediate for new checks and the row is preserved as history.
      assert.equal((await revokeGrant(engagementGrant.id, grantedBy, 'Access review')).count, 1);
      assert.equal(await hasCapability(db, user, 'ENGAGEMENT_READ', scopeA), false);
      assert.equal(await db.roleGrant.count({ where: { id: engagementGrant.id } }), 1);
      assert.equal(await db.roleGrant.count({ where: { id: engagementGrant.id, revokedAt: null } }), 0);

      // A client-scoped grant covers every engagement of that client, but no other firm's client.
      await grant({ firmId: firmA, clientId: clientA });
      assert.equal(await hasCapability(db, user, 'ENGAGEMENT_READ', scopeA), true);
      assert.equal(await hasCapability(db, user, 'ENGAGEMENT_READ', scopeB), false);

      // A firm-scoped grant covers the firm only.
      await grant({ firmId: firmA });
      assert.equal(await hasCapability(db, user, 'ENGAGEMENT_READ', scopeB), false);

      // A grant can never be created already expired, and it stops authorizing at its expiry instant.
      // FIELDWORK_FINALIZE is used here because no other grant in this test carries it.
      await assert.rejects(grant({ capability: 'FIELDWORK_FINALIZE', firmId: firmA, clientId: clientA, expiresAt: new Date(Date.now() - 60_000) }), /role_grant_window_check/);
      await grant({ capability: 'FIELDWORK_FINALIZE', firmId: firmA, clientId: clientA, expiresAt: new Date(Date.now() + 60_000) });
      assert.equal(await hasCapability(db, user, 'FIELDWORK_FINALIZE', scopeA), true, 'a live grant authorizes now');
      assert.equal(await hasCapability(db, user, 'FIELDWORK_FINALIZE', scopeA, new Date(Date.now() + 120_000)), false, 'a grant past its expiry must not authorize');

      // A capability the user does not hold is denied even when another capability is granted.
      assert.equal(await hasCapability(db, user, 'LIFECYCLE_COMMAND', scopeA), false);

      // The same rule is reapplied inside a write: revoking between admission and the write denies it.
      await grant({ firmId: firmA, clientId: clientA, capability: 'FIELDWORK_WRITE' });
      await requireCapability(db, user, 'FIELDWORK_WRITE', scopeA);
      await db.roleGrant.updateMany({ where: { userId: user, capability: 'FIELDWORK_WRITE', revokedAt: null }, data: { revokedAt: new Date(), revokedBy: grantedBy } });
      await assert.rejects(requireCapability(db, user, 'FIELDWORK_WRITE', scopeA), /not granted/);

      // Database invariants: ambiguous scope, half revocation and an inverted window are rejected.
      await assert.rejects(db.$executeRaw`INSERT INTO "RoleGrant" (id,"userId",capability,"clientId","grantedBy") VALUES (gen_random_uuid(), ${user}::uuid, 'ENGAGEMENT_READ', ${clientA}::uuid, ${grantedBy}::uuid)`, /role_grant_scope_check/);
      await assert.rejects(db.$executeRaw`INSERT INTO "RoleGrant" (id,"userId",capability,"revokedAt","grantedBy") VALUES (gen_random_uuid(), ${user}::uuid, 'ENGAGEMENT_READ', now(), ${grantedBy}::uuid)`, /role_grant_revocation_check/);

      console.log('scoped grants enforced: expiry, revocation, wrong scope and no implicit role');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
