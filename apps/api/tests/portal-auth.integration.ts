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

test('client portal invitation, first reset, session isolation and payment gate use real PostgreSQL and Fastify', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_portal_auth').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, DEV_AUTH_ENABLED: 'true', DEV_AUTH_TOKEN: 'portal-staff-token' };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, env);
    const { db, InternalIdentityController, InternalIdentityGuard, PortalAuthController } = await import('@auditsphere/server');
    const {
      assertPortalUploadAllowed, completePortalPasswordReset, issuePortalInvitation, issuePortalPasswordReset,
    } = await import('../../../packages/server/src/platform/portal-auth.js');
    disconnect = () => db.$disconnect();

    const firmId = randomUUID();
    const clientId = randomUUID();
    const engagementId = randomUUID();
    const portalUserId = randomUUID();
    await db.firm.create({ data: { id: firmId, name: 'Portal fixture firm' } });
    await db.client.create({ data: { id: clientId, firmId, name: 'Portal fixture client' } });
    await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Portal fixture engagement' } });
    await db.portalUser.create({ data: { id: portalUserId, email: 'client@example.test' } });
    const membership = await db.portalMembership.create({ data: { portalUserId, firmId, clientId, engagementId } });
    await assert.rejects(issuePortalInvitation(membership.id), /invalid or expired/, 'an unpaid engagement cannot receive an active invitation');
    await assert.rejects(assertPortalUploadAllowed(portalUserId, engagementId), /not available/);
    await db.portalMembership.update({ where: { id: membership.id }, data: { advanceClearedAt: new Date() } });
    const invite = await issuePortalInvitation(membership.id);
    const invitationRow = await db.portalCredentialToken.findUniqueOrThrow({ where: { tokenHash: await (async () => {
      const { createHash } = await import('node:crypto');
      return createHash('sha256').update(invite.token).digest('hex');
    })() } });
    assert.equal(invitationRow.tokenHash, invitationRow.tokenHash.toLowerCase());
    assert.notEqual(invitationRow.tokenHash, invite.token, 'only the token digest is stored');

    class PortalBoundaryModule {}
    Module({ controllers: [PortalAuthController, InternalIdentityController], providers: [InternalIdentityGuard] })(PortalBoundaryModule);
    app = await NestFactory.create(PortalBoundaryModule, new FastifyAdapter(), { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    process.env.WEB_ORIGIN = origin;

    const invalidRedeem = await fetch(`${origin}/api/v1/portal/auth/invitations/redeem`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token: 'malformed' }) });
    assert.equal(invalidRedeem.status, 400, 'the shared request contract rejects malformed credential payloads at the HTTP boundary');
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let redeem: Response;
    try {
      redeem = await fetch(`${origin}/api/v1/portal/auth/invitations/redeem`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token: invite.token, passwordHash: 'untrusted-persistence-field' }) });
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
    assert.equal(redeem.status, 201);
    assert.deepEqual(await redeem.json(), { mustChangePassword: true });
    const cookieHeaders = redeem.headers.getSetCookie();
    const sessionCookie = cookieHeaders.find((value) => value.startsWith('auditsphere_portal_session='));
    const csrfCookie = cookieHeaders.find((value) => value.startsWith('auditsphere_portal_csrf='));
    assert.ok(sessionCookie?.includes('HttpOnly'));
    assert.ok(sessionCookie?.includes('Secure'), 'the session cookie is Secure under the production setting');
    assert.ok(csrfCookie && !csrfCookie.includes('HttpOnly'));
    assert.ok(csrfCookie.includes('Secure'), 'the CSRF cookie is Secure under the production setting');
    const session = `auditsphere_portal_session=${sessionCookie?.split(';', 1)[0].split('=', 2)[1]}`;
    const csrf = csrfCookie?.split(';', 1)[0].split('=', 2)[1] ?? '';
    const replay = await fetch(`${origin}/api/v1/portal/auth/invitations/redeem`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token: invite.token }) });
    assert.equal(replay.status, 401, 'a consumed invitation cannot be replayed');
    const firstIdentity = await fetch(`${origin}/api/v1/portal/auth/me`, { headers: { cookie: session } });
    assert.equal(firstIdentity.status, 200);
    assert.deepEqual(await firstIdentity.json(), { id: portalUserId, email: 'client@example.test', mustChangePassword: true });
    await assert.rejects(assertPortalUploadAllowed(portalUserId, engagementId), /not available/, 'first login blocks uploads until a password is established');
    const wrongOrigin = await fetch(`${origin}/api/v1/portal/auth/first-password`, { method: 'POST', headers: { origin: 'https://attacker.invalid', cookie: `${session}; ${csrfCookie?.split(';', 1)[0]}`, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'LongEnoughPass123' }) });
    assert.equal(wrongOrigin.status, 401);
    const missingCsrf = await fetch(`${origin}/api/v1/portal/auth/first-password`, { method: 'POST', headers: { origin, cookie: session, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'LongEnoughPass123' }) });
    assert.equal(missingCsrf.status, 401);
    const reset = await fetch(`${origin}/api/v1/portal/auth/first-password`, { method: 'POST', headers: { origin, cookie: `${session}; ${csrfCookie?.split(';', 1)[0]}`, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'LongEnoughPass123' }) });
    assert.equal(reset.status, 201);
    const passwordRecord = await db.portalUser.findUniqueOrThrow({ where: { id: portalUserId }, select: { passwordHash: true, mustChangePassword: true } });
    assert.match(passwordRecord.passwordHash ?? '', /^[a-f0-9]{32}:[a-f0-9]{128}$/, 'only salted scrypt output is persisted');
    assert.notEqual(passwordRecord.passwordHash, 'LongEnoughPass123');
    assert.equal(passwordRecord.mustChangePassword, false);
    const newCookies = reset.headers.getSetCookie();
    const newSessionCookie = newCookies.find((value) => value.startsWith('auditsphere_portal_session='));
    assert.ok(newSessionCookie?.includes('HttpOnly'));
    const newSession = `auditsphere_portal_session=${newSessionCookie?.split(';', 1)[0].split('=', 2)[1]}`;
    assert.equal((await fetch(`${origin}/api/v1/portal/auth/me`, { headers: { cookie: session } })).status, 401, 'first-password changes rotate and revoke the old session');
    const staffRouteWithPortalCookie = await fetch(`${origin}/api/v1/me`, { headers: { cookie: newSession } });
    assert.equal(staffRouteWithPortalCookie.status, 401, 'portal cookies cannot authenticate internal identity routes');
    await assert.doesNotReject(assertPortalUploadAllowed(portalUserId, engagementId), 'uploads unlock only after the paid advance and first reset');

    const resetToken = await issuePortalPasswordReset('CLIENT@example.test');
    assert.ok(resetToken);
    const resetHash = (await import('node:crypto')).createHash('sha256').update(resetToken.token).digest('hex');
    await db.portalCredentialToken.update({ where: { tokenHash: resetHash }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(completePortalPasswordReset(resetToken.token, 'AnotherLongPassword123'), /invalid or expired/, 'an expired reset token fails');
    const expiredHttp = await fetch(`${origin}/api/v1/portal/auth/password-reset/complete`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token: resetToken.token, password: 'AnotherLongPassword123' }) });
    assert.equal(expiredHttp.status, 401, 'expired reset tokens are rejected through the HTTP boundary');
    const validReset = await issuePortalPasswordReset('client@example.test');
    assert.ok(validReset);
    const validResetHttp = await fetch(`${origin}/api/v1/portal/auth/password-reset/complete`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token: validReset.token, password: 'AnotherLongPassword123' }) });
    assert.equal(validResetHttp.status, 201);
    assert.deepEqual(await validResetHttp.json(), { passwordReset: true, signedOut: true });
    const replayHttp = await fetch(`${origin}/api/v1/portal/auth/password-reset/complete`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token: validReset.token, password: 'ThirdLongPassword123' }) });
    assert.equal(replayHttp.status, 401, 'a consumed reset token cannot be replayed through HTTP');
    await db.portalMembership.update({ where: { id: membership.id }, data: { releasedAt: new Date(), version: { increment: 1 } } });
    await assert.rejects(assertPortalUploadAllowed(portalUserId, engagementId), /not available/, 'release freezes uploads');
    await assert.rejects(issuePortalInvitation(membership.id), /invalid or expired/, 'released engagements cannot issue new portal invitations');
    await db.portalMembership.update({ where: { id: membership.id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
    const staleReset = await issuePortalPasswordReset('client@example.test');
    assert.ok(staleReset);
    await completePortalPasswordReset(staleReset.token, 'FourthLongPassword123');
    const login = await fetch(`${origin}/api/v1/portal/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'CLIENT@example.test', password: 'FourthLongPassword123' }) });
    assert.equal(login.status, 201, 'email matching is case-normalized');
    const loginSession = login.headers.getSetCookie().find((value) => value.startsWith('auditsphere_portal_session='));
    assert.ok(loginSession?.includes('HttpOnly'));
    const unknownAccountLogin = await fetch(`${origin}/api/v1/portal/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'unknown@example.test', password: 'FourthLongPassword123' }) });
    const wrongPasswordLogin = await fetch(`${origin}/api/v1/portal/auth/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'client@example.test', password: 'WrongPassword123' }) });
    assert.equal(unknownAccountLogin.status, 401);
    assert.equal(wrongPasswordLogin.status, 401);
    const unknownBody = await unknownAccountLogin.json();
    const wrongPasswordBody = await wrongPasswordLogin.json();
    assert.deepEqual(unknownBody, wrongPasswordBody, 'login errors do not disclose whether the portal account exists');
    assert.equal(JSON.stringify(unknownBody).includes('FourthLongPassword123'), false, 'password values are not echoed in auth failures');
    assert.equal(JSON.stringify(wrongPasswordBody).includes('client@example.test'), false, 'account identifiers are not echoed in auth failures');

    await db.portalMembership.update({ where: { id: membership.id }, data: { releasedAt: null, archivedAt: null, revokedAt: new Date(), version: { increment: 1 } } });
    await assert.rejects(assertPortalUploadAllowed(portalUserId, engagementId), /not available/, 'revoked portal memberships cannot upload');
    await assert.rejects(issuePortalInvitation(membership.id), /invalid or expired/, 'revoked memberships cannot receive replacement invitations');
    await db.portalMembership.update({ where: { id: membership.id }, data: { revokedAt: null, version: { increment: 1 } } });
    await db.portalUser.update({ where: { id: portalUserId }, data: { active: false } });
    await assert.rejects(assertPortalUploadAllowed(portalUserId, engagementId), /not available/, 'inactive portal users cannot upload');
    await assert.rejects(issuePortalInvitation(membership.id), /invalid or expired/, 'inactive portal users cannot receive invitations');
    console.log('Portal auth enforces single-use tokens, first-password rotation, CSRF/origin, payment and release gates, and staff/client session isolation');
  } finally {
    if (app) await app.close();
    await disconnect?.();
    await container.stop();
  }
});
