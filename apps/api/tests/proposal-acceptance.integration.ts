import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { proposalClientFixture } from '../../../tests/factories/proposal-client.js';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);

test('client-only exact-terms proposal acceptance is scoped, expiring, atomic and single-use', { timeout: 240_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('proposal_acceptance').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  try {
    const uri = container.getConnectionUri();
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri });
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: process.env, stdio: 'pipe', timeout: 60_000 });
    const { db, createProposal, presentProposal, acceptProposal, issueProposalAcceptance, readPortalProposal, acceptPortalProposal, dualKeyStatus, PortalProposalController, redeemPortalInvitation, issuePortalInvitation, completePortalFirstLogin, assertPortalUploadAllowed, lifecycleGates } = await import('@auditsphere/server');
    try {
      const firm = await db.firm.create({ data: { name: 'Acceptance test firm' } });
      const client = await db.client.create({ data: { firmId: firm.id, name: 'Synthetic proposal client' } });
      const engagement = await db.engagement.create({ data: { firmId: firm.id, clientId: client.id, name: 'Synthetic client acceptance', state: 'DUAL_KEY_PENDING' } });
      const partner = await db.user.create({ data: { email: 'partner@example.test', role: 'APPROVER' } });
      await db.membership.create({ data: { userId: partner.id, firmId: firm.id, clientId: client.id, engagementId: engagement.id, role: 'APPROVER' } });
      await db.roleGrant.create({ data: { userId: partner.id, firmId: firm.id, capability: 'COMMERCIAL_MANAGE', grantedBy: partner.id } });
      await db.commercialProposal.create({ data: { firmId: firm.id, clientId: client.id, engagementId: engagement.id,
        service: 'Legacy staff-recorded proposal', periodStart: new Date('2024-01-01'), periodEnd: new Date('2024-12-31'), totalAmount: '100.00',
        status: 'ACCEPTED', createdBy: partner.id, createdAt: new Date('2020-01-01'), presentedSnapshot: { revision: 1 }, clientResponse: { revision: 1, acceptedByActorId: partner.id } } });
      const target = await proposalClientFixture(engagement.id, true);
      const other = await proposalClientFixture(engagement.id);
      const preparer = await db.user.create({ data: { email: 'preparer@example.test', role: 'PREPARER' } });
      await db.membership.create({ data: { userId: preparer.id, firmId: firm.id, clientId: client.id, engagementId: engagement.id, role: 'PREPARER' } });
      await db.roleGrant.create({ data: { userId: preparer.id, firmId: firm.id, capability: 'COMMERCIAL_MANAGE', grantedBy: partner.id } });
      const proposal = await createProposal(partner.id, engagement.id, { idempotencyKey: randomUUID(), service: 'Statutory audit', periodStart: '2025-01-01', periodEnd: '2025-12-31', totalAmount: '12500.25' }) as { id: string };
      const issue = (idempotencyKey = randomUUID()) => issueProposalAcceptance(partner.id, engagement.id, proposal.id, { idempotencyKey, expectedVersion: 1, portalMembershipId: target.membership.id });
      await assert.rejects(issue(), /Present the current complete/);
      await assert.rejects(issuePortalInvitation(target.membership.id), /invalid or expired/);
      await presentProposal(partner.id, engagement.id, proposal.id, { expectedVersion: 1, idempotencyKey: randomUUID() });
      await assert.rejects(issueProposalAcceptance(preparer.id, engagement.id, proposal.id, { idempotencyKey: randomUUID(), expectedVersion: 1, portalMembershipId: target.membership.id }), error => (error as { getStatus?: () => number }).getStatus?.() === 403);
      await assert.rejects(issueProposalAcceptance(partner.id, engagement.id, proposal.id, { idempotencyKey: randomUUID(), expectedVersion: 1, portalMembershipId: other.membership.id }), /primary Managing Director/);
      await assert.rejects(acceptProposal(partner.id, engagement.id, proposal.id, {}), /Only the authenticated client/);
      const issueKey = randomUUID();
      const first = await issue(issueKey);
      assert.ok(first.invitationToken, 'a new client receives a separate first-login invitation');
      const invited = await redeemPortalInvitation(first.invitationToken);
      await assert.rejects(readPortalProposal(invited.sessionToken, proposal.id), /unavailable or the credential is invalid/);
      const activated = await completePortalFirstLogin(invited.sessionToken, invited.csrfToken, 'SyntheticClientPass123');
      target.sessionToken = activated.sessionToken; target.csrfToken = activated.csrfToken;
      await assert.rejects(assertPortalUploadAllowed(target.user.id, engagement.id), /not available/);
      await assert.rejects(issue(issueKey), /already issued for this command/);
      assert.equal(JSON.stringify((await db.commandReceipt.findUniqueOrThrow({ where: { key: issueKey } })).result).includes(first.token), false);
      const tokenRecord = await db.portalCredentialToken.findUniqueOrThrow({ where: { tokenHash: createHash('sha256').update(first.token).digest('hex') } });
      assert.notEqual(tokenRecord.tokenHash, first.token);
      assert.equal(tokenRecord.expiresAt.getTime() - tokenRecord.createdAt.getTime() >= 604_790_000, true);
      const body = { idempotencyKey: randomUUID(), token: first.token, expectedVersion: 1 };
      await assert.rejects(redeemPortalInvitation(first.token), /invalid or expired/);
      assert.equal((await dualKeyStatus(engagement.id)).key1Status, 'PENDING');
      assert.equal((await readPortalProposal(target.sessionToken, proposal.id)).totalAmount, '12500.25');
      await assert.rejects(acceptPortalProposal(other.sessionToken, other.csrfToken, proposal.id, body), /unavailable or the credential is invalid/);
      await assert.rejects(acceptPortalProposal(target.sessionToken, 'invalid-csrf', proposal.id, body), /unavailable or the credential is invalid/);
      await assert.rejects(acceptPortalProposal(target.sessionToken, target.csrfToken, proposal.id, { ...body, expectedVersion: 2 }), /unavailable or the credential is invalid/);
      const wrongClient = await db.client.create({ data: { firmId: firm.id, name: 'Other synthetic client' } });
      const otherEngagement = await db.engagement.create({ data: { firmId: firm.id, clientId: wrongClient.id, name: 'Other client', state: 'DUAL_KEY_PENDING' } });
      const otherClient = await proposalClientFixture(otherEngagement.id);
      await assert.rejects(issueProposalAcceptance(partner.id, engagement.id, proposal.id, { idempotencyKey: randomUUID(), expectedVersion: 1, portalMembershipId: otherClient.membership.id }), /unavailable or the credential is invalid/);
      await assert.rejects(readPortalProposal(otherClient.sessionToken, proposal.id), /unavailable or the credential is invalid/);
      const expiredToken = randomBytes(32).toString('hex');
      await db.portalCredentialToken.create({ data: { portalUserId: target.user.id, portalMembershipId: target.membership.id, proposalId: proposal.id,
        proposalRevision: 1, termsDigest: tokenRecord.termsDigest, purpose: 'PROPOSAL_ACCEPTANCE', tokenHash: createHash('sha256').update(expiredToken).digest('hex'), expiresAt: new Date(Date.now() - 1000) } });
      await assert.rejects(acceptPortalProposal(target.sessionToken, target.csrfToken, proposal.id, { idempotencyKey: randomUUID(), token: expiredToken, expectedVersion: 1 }), /unavailable or the credential is invalid/);
      await db.portalMembership.update({ where: { id: target.membership.id }, data: { revokedAt: new Date() } });
      await assert.rejects(acceptPortalProposal(target.sessionToken, target.csrfToken, proposal.id, body), /unavailable or the credential is invalid/);
      await db.portalMembership.update({ where: { id: target.membership.id }, data: { revokedAt: null } });
      await db.portalUser.update({ where: { id: target.user.id }, data: { mustChangePassword: true } });
      await assert.rejects(readPortalProposal(target.sessionToken, proposal.id), /unavailable or the credential is invalid/);
      await db.portalUser.update({ where: { id: target.user.id }, data: { mustChangePassword: false } });
      class AcceptanceApiModule {}
      Module({ controllers: [PortalProposalController] })(AcceptanceApiModule);
      const app = await NestFactory.create(AcceptanceApiModule, new FastifyAdapter(), { logger: false });
      process.env.WEB_ORIGIN = 'http://127.0.0.1:4200'; app.setGlobalPrefix('api/v1'); await app.init();
      try {
        const api = app.getHttpAdapter().getInstance();
        const url = `/api/v1/portal/proposals/${proposal.id}`;
        assert.equal((await api.inject({ method: 'GET', url })).statusCode, 403);
        const read = await api.inject({ method: 'GET', url, headers: { cookie: `auditsphere_portal_session=${target.sessionToken}` } });
        assert.equal(read.statusCode, 200); assert.equal(read.json().totalAmount, '12500.25');
        assert.equal(read.headers['cache-control'], 'no-store');
        assert.equal((await api.inject({ method: 'POST', url: url + '/accept', headers: { origin: 'https://wrong.example', cookie: `auditsphere_portal_session=${target.sessionToken}` }, payload: body })).statusCode, 403);
        assert.equal((await api.inject({ method: 'POST', url: url + '/accept', headers: { origin: process.env.WEB_ORIGIN, cookie: `auditsphere_portal_session=${target.sessionToken}` }, payload: body })).statusCode, 403);
      } finally { await app.close(); }
      await db.portalCredentialToken.update({ where: { id: tokenRecord.id }, data: { consumedAt: new Date() } });
      await assert.rejects(acceptPortalProposal(target.sessionToken, target.csrfToken, proposal.id, body), /unavailable or the credential is invalid/);
      const valid = await issue();
      await assert.rejects(acceptPortalProposal(target.sessionToken, target.csrfToken, proposal.id, body), /unavailable or the credential is invalid/);
      await db.$executeRawUnsafe(`CREATE FUNCTION test_reject_proposal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'PROPOSAL_ACCEPTED' THEN RAISE EXCEPTION 'Injected acceptance audit failure'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe('CREATE TRIGGER test_reject_proposal_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_proposal_audit()');
      const validBody = { idempotencyKey: randomUUID(), token: valid.token, expectedVersion: 1 };
      await db.commercialProposal.update({ where: { id: proposal.id }, data: { totalAmount: '13000.00' } });
      await assert.rejects(acceptPortalProposal(target.sessionToken, target.csrfToken, proposal.id, validBody), /unavailable or the credential is invalid/);
      await db.commercialProposal.update({ where: { id: proposal.id }, data: { totalAmount: '12500.25' } });
      await assert.rejects(acceptPortalProposal(target.sessionToken, target.csrfToken, proposal.id, validBody), /Injected acceptance audit failure/);
      assert.equal((await db.portalCredentialToken.findUniqueOrThrow({ where: { tokenHash: createHash('sha256').update(valid.token).digest('hex') } })).consumedAt, null);
      await db.$executeRawUnsafe('DROP TRIGGER test_reject_proposal_audit ON "AuditEvent"');
      const commands = [0, 1].map(() => ({ ...validBody, idempotencyKey: randomUUID() }));
      const results = await Promise.allSettled(commands.map(command => acceptPortalProposal(target.sessionToken, target.csrfToken, proposal.id, command)));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter(result => result.status === 'rejected').length, 1);
      const winning = results.findIndex(result => result.status === 'fulfilled');
      const replay = await acceptPortalProposal(target.sessionToken, target.csrfToken, proposal.id, commands[winning]);
      assert.equal(replay.status, 'ACCEPTED');
      await assert.rejects(acceptPortalProposal(target.sessionToken, target.csrfToken, proposal.id, { ...validBody, idempotencyKey: randomUUID() }), /unavailable or the credential is invalid/);
      assert.equal(await db.auditEvent.count({ where: { action: 'PROPOSAL_ACCEPTED' } }), 1);
      assert.equal((await dualKeyStatus(engagement.id)).key1Status, 'RECORDED');
      const gates = await lifecycleGates(engagement.id);
      const letter = gates.commands.find(command => command.command === 'ISSUE_ENGAGEMENT_LETTER');
      assert.ok(letter);
      assert.equal(letter.unmet.some(reason => reason.code === 'CLIENT_ACCEPTANCE_MISSING' || reason.code === 'CLIENT_ACCEPTANCE_STALE'), false,
        'the letter gate uses the same newest valid proposal as the status screen, not the older legacy record');
      const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'PROPOSAL_ACCEPTED' } });
      assert.equal(audit.actorKind, 'PORTAL'); assert.equal(audit.actorId, target.user.id);
      assert.equal(JSON.stringify(audit.payload).includes(valid.token), false);
      await assert.rejects(db.commercialProposal.update({ where: { id: proposal.id }, data: { totalAmount: '13000.00' } }), /Accepted proposal terms are immutable/);
      assert.equal((await dualKeyStatus(engagement.id)).key1Status, 'RECORDED');
    } finally { await db.$disconnect(); }
  } finally { await container.stop(); }
});
