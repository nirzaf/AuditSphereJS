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
const reviewer = '19191919-1919-4919-8919-191919191919';
const partner = '20202020-2020-4020-8020-202020202020';
const billing = '21212121-2121-4121-8121-212121212121';
const admin = '22222222-2222-4222-8222-222222222222';

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
      await db.user.createMany({ data: [
        { id: user, email: 'grantee@example.test', role: 'PREPARER' },
        { id: grantedBy, email: 'granter@example.test', role: 'ADMIN' },
        // The same staff identity can hold different per-engagement roles; the membership is authoritative.
        { id: reviewer, email: 'reviewer@example.test', role: 'PREPARER' },
        { id: partner, email: 'partner@example.test', role: 'APPROVER' },
        { id: billing, email: 'billing@example.test', role: 'BILLING' },
        { id: admin, email: 'admin@example.test', role: 'ADMIN' },
      ] });
      await db.membership.createMany({ data: [
        { userId: user, firmId: firmA, clientId: clientA, engagementId: engagementA, role: 'PREPARER' },
        { userId: reviewer, firmId: firmA, clientId: clientA, engagementId: engagementA, role: 'REVIEWER' },
        { userId: partner, firmId: firmA, clientId: clientA, engagementId: engagementA, role: 'APPROVER' },
        { userId: billing, firmId: firmA, clientId: clientA, engagementId: engagementA, role: 'BILLING' },
        // Even a business-role membership cannot elevate a global operational administrator.
        { userId: admin, firmId: firmA, clientId: clientA, engagementId: engagementA, role: 'APPROVER' },
      ] });
      const scopeA = { firmId: firmA, clientId: clientA, engagementId: engagementA };
      const scopeB = { firmId: firmB, clientId: clientB, engagementId: engagementB };
      const grantFor = (userId: string, data: { capability?: string; firmId?: string; clientId?: string; engagementId?: string; expiresAt?: Date }) =>
        db.roleGrant.create({ data: { userId, capability: 'ENGAGEMENT_READ', grantedBy, ...data } });
      const grant = (data: { capability?: string; firmId?: string; clientId?: string; engagementId?: string; expiresAt?: Date }) => grantFor(user, data);

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
      await assert.rejects(grantFor(reviewer, { capability: 'FIELDWORK_FINALIZE', firmId: firmA, clientId: clientA, expiresAt: new Date(Date.now() - 60_000) }), /role_grant_window_check/);
      await grantFor(reviewer, { capability: 'FIELDWORK_FINALIZE', firmId: firmA, clientId: clientA, expiresAt: new Date(Date.now() + 60_000) });
      assert.equal(await hasCapability(db, reviewer, 'FIELDWORK_FINALIZE', scopeA), true, 'a live grant within the reviewer matrix authorizes now');
      assert.equal(await hasCapability(db, reviewer, 'FIELDWORK_FINALIZE', scopeA, new Date(Date.now() + 120_000)), false, 'a grant past its expiry must not authorize');

      // A capability the user does not hold is denied even when another capability is granted.
      assert.equal(await hasCapability(db, user, 'LIFECYCLE_COMMAND', scopeA), false);

      // A grant is necessary but a principal role is also a hard ceiling; UI visibility cannot grant authority.
      await grant({ capability: 'COMMERCIAL_MANAGE', firmId: firmA, clientId: clientA, engagementId: engagementA });
      await grant({ capability: 'PRACTICE_POST', firmId: firmA });
      assert.equal(await hasCapability(db, user, 'COMMERCIAL_MANAGE', scopeA), false, 'a preparer cannot send or manage external proposals');
      assert.equal(await hasCapability(db, user, 'PRACTICE_POST', scopeA), false, 'a preparer cannot inherit billing authority');
      await grantFor(reviewer, { capability: 'MATERIALITY_APPROVE', firmId: firmA, clientId: clientA, engagementId: engagementA });
      assert.equal(await hasCapability(db, reviewer, 'MATERIALITY_APPROVE', scopeA), false, 'reviewers prepare materiality but cannot approve it');
      await grantFor(admin, { capability: 'RISK_PARTNER_CLEAR', firmId: firmA, clientId: clientA, engagementId: engagementA });
      assert.equal(await hasCapability(db, admin, 'RISK_PARTNER_CLEAR', scopeA), false, 'operational administrators do not inherit partner authority');
      await grantFor(partner, { capability: 'RISK_PARTNER_CLEAR', firmId: firmA, clientId: clientA, engagementId: engagementA });
      assert.equal(await hasCapability(db, partner, 'RISK_PARTNER_CLEAR', scopeA), true, 'a partner role with an explicit scoped grant may clear risk');
      await grantFor(billing, { capability: 'PRACTICE_POST', firmId: firmA });
      assert.equal(await hasCapability(db, billing, 'PRACTICE_POST', scopeA), true, 'billing authority is separately assigned by firm-scoped grant');
      assert.equal(await hasCapability(db, partner, 'RISK_PARTNER_CLEAR', scopeB), false, 'a partner assigned to one engagement cannot cross into an unassigned engagement');
      await assert.rejects(requireCapability(db, partner, 'RISK_PARTNER_CLEAR', scopeB), /not granted/i);

      // The same rule is reapplied inside a write: revoking between admission and the write denies it.
      await grant({ firmId: firmA, clientId: clientA, capability: 'FIELDWORK_WRITE' });
      await requireCapability(db, user, 'FIELDWORK_WRITE', scopeA);
      await db.roleGrant.updateMany({ where: { userId: user, capability: 'FIELDWORK_WRITE', revokedAt: null }, data: { revokedAt: new Date(), revokedBy: grantedBy } });
      await assert.rejects(requireCapability(db, user, 'FIELDWORK_WRITE', scopeA), /not granted/);

      // Database invariants: ambiguous scope, half revocation and an inverted window are rejected.
      await assert.rejects(db.$executeRaw`INSERT INTO "RoleGrant" (id,"userId",capability,"clientId","grantedBy") VALUES (gen_random_uuid(), ${user}::uuid, 'ENGAGEMENT_READ', ${clientA}::uuid, ${grantedBy}::uuid)`, /role_grant_scope_check/);
      await assert.rejects(db.$executeRaw`INSERT INTO "RoleGrant" (id,"userId",capability,"firmId","clientId","grantedBy") VALUES (gen_random_uuid(), ${user}::uuid, 'ENGAGEMENT_READ', ${firmB}::uuid, ${clientA}::uuid, ${grantedBy}::uuid)`, /RoleGrant_firmId_clientId_fkey/);
      await assert.rejects(db.$executeRaw`INSERT INTO "RoleGrant" (id,"userId",capability,"firmId","clientId","engagementId","grantedBy") VALUES (gen_random_uuid(), ${user}::uuid, 'ENGAGEMENT_READ', ${firmA}::uuid, ${clientA}::uuid, ${engagementB}::uuid, ${grantedBy}::uuid)`, /RoleGrant_firmId_clientId_engagementId_fkey/);
      await assert.rejects(db.$executeRaw`INSERT INTO "RoleGrant" (id,"userId",capability,"revokedAt","grantedBy") VALUES (gen_random_uuid(), ${user}::uuid, 'ENGAGEMENT_READ', now(), ${grantedBy}::uuid)`, /role_grant_revocation_check/);

      await db.user.update({ where: { id: billing }, data: { active: false } });
      assert.equal(await hasCapability(db, billing, 'PRACTICE_POST', scopeA), false, 'inactive billing identities lose grants immediately');
      await assert.rejects(requireCapability(db, billing, 'PRACTICE_POST', scopeA), /not granted/i);

      console.log('permission matrix enforced: active role, engagement assignment, capability scope, expiry and revocation');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
