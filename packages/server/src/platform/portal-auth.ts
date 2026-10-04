import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { db } from './db.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_BYTES = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export type PortalCredentialPurpose = 'INVITATION' | 'PASSWORD_RESET';
export type PortalSessionCredentials = { sessionToken: string; csrfToken: string; expiresAt: Date; mustChangePassword: boolean };
export type PortalIdentity = { id: string; email: string; mustChangePassword: boolean };
export const PORTAL_SESSION_COOKIE = 'auditsphere_portal_session';
export const PORTAL_SOCKET_SESSION_COOKIE = 'auditsphere_portal_socket';

/** Parse only the opaque portal-session cookie; the token itself is never logged or returned. */
export function portalSessionTokenFromCookieHeader(header?: string): string | null {
  for (const item of header?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== PORTAL_SESSION_COOKIE) continue;
    try { return decodeURIComponent(item.slice(separator + 1).trim()) || null; } catch { return null; }
  }
  return null;
}

/** The duplicate HttpOnly cookie is scoped only to the Socket.IO endpoint. */
export function portalSocketSessionTokenFromCookieHeader(header?: string): string | null {
  for (const item of header?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== PORTAL_SOCKET_SESSION_COOKIE) continue;
    try { return decodeURIComponent(item.slice(separator + 1).trim()) || null; } catch { return null; }
  }
  return null;
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => nodeScrypt(password, salt, PASSWORD_BYTES, SCRYPT_OPTIONS, (error, key) => error ? reject(error) : resolve(key)));
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function equalHex(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

function credentialError(): UnauthorizedException {
  return new UnauthorizedException('Portal credentials are invalid or expired');
}

function validatePassword(password: string): void {
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 256 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
    throw new ForbiddenException('Password must be at least 12 characters and include a number');
  }
}

async function passwordHash(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

async function passwordMatches(password: string, encoded: string | null): Promise<boolean> {
  const [saltHex, hashHex] = encoded?.split(':') ?? [];
  if (!saltHex || !hashHex || !/^[a-f0-9]{32}$/.test(saltHex) || !/^[a-f0-9]{128}$/.test(hashHex)) {
    await deriveKey(password, randomBytes(16));
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await deriveKey(password, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(expected, actual);
}

async function createSession(portalUserId: string, mustChangePassword: boolean, now: Date): Promise<PortalSessionCredentials> {
  const sessionToken = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.portalSession.create({ data: { portalUserId, tokenHash: digest(sessionToken), csrfHash: digest(csrfToken), mustChangePassword, expiresAt } });
  return { sessionToken, csrfToken, expiresAt, mustChangePassword };
}

/** The only invitation issuer; callers must be the post-payment onboarding workflow. */
export async function issuePortalInvitation(portalMembershipId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const membership = await db.portalMembership.findUnique({
    where: { id: portalMembershipId },
    include: { portalUser: { select: { active: true } } },
  });
  if (!membership?.portalUser.active || !membership.advanceClearedAt || membership.releasedAt || membership.revokedAt || membership.archivedAt) throw credentialError();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  await db.$transaction(async (tx) => {
    await tx.portalCredentialToken.updateMany({
      where: { portalUserId: membership.portalUserId, portalMembershipId: membership.id, purpose: 'INVITATION', consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.portalCredentialToken.create({ data: { portalUserId: membership.portalUserId, portalMembershipId: membership.id, tokenHash: digest(token), purpose: 'INVITATION', expiresAt } });
  });
  return { token, expiresAt };
}

/** Reset delivery is an adapter boundary: the raw token is returned once and never persisted or logged. */
export async function issuePortalPasswordReset(email: string, now = new Date()): Promise<{ token: string; expiresAt: Date } | null> {
  const user = await db.portalUser.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, active: true } });
  if (!user?.active) return null;
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS);
  await db.$transaction(async (tx) => {
    await tx.portalCredentialToken.updateMany({ where: { portalUserId: user.id, purpose: 'PASSWORD_RESET', consumedAt: null }, data: { consumedAt: now } });
    await tx.portalCredentialToken.create({ data: { portalUserId: user.id, tokenHash: digest(token), purpose: 'PASSWORD_RESET', expiresAt } });
  });
  return { token, expiresAt };
}

export async function redeemPortalInvitation(token: string, now = new Date()): Promise<PortalSessionCredentials> {
  const tokenHash = digest(token);
  return db.$transaction(async (tx) => {
    const credential = await tx.portalCredentialToken.findFirst({
      where: {
        tokenHash, purpose: 'INVITATION', consumedAt: null, expiresAt: { gt: now }, portalMembershipId: { not: null },
        portalUser: { active: true },
        membership: { advanceClearedAt: { not: null }, releasedAt: null, archivedAt: null, revokedAt: null },
      },
      select: { id: true, portalUserId: true },
    });
    if (!credential) throw credentialError();
    const consumed = await tx.portalCredentialToken.updateMany({ where: { id: credential.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (consumed.count !== 1) throw credentialError();
    const sessionToken = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await tx.portalSession.create({ data: { portalUserId: credential.portalUserId, tokenHash: digest(sessionToken), csrfHash: digest(csrfToken), mustChangePassword: true, expiresAt } });
    await tx.portalUser.update({ where: { id: credential.portalUserId }, data: { mustChangePassword: true, lastLoginAt: now } });
    return { sessionToken, csrfToken, expiresAt, mustChangePassword: true };
  });
}

export async function loginPortalUser(email: string, password: string, now = new Date()): Promise<PortalSessionCredentials> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.portalUser.findUnique({ where: { email: normalizedEmail }, select: { id: true, active: true, passwordHash: true, mustChangePassword: true } });
  const matches = await passwordMatches(password, user?.passwordHash ?? null);
  if (!user?.active || !matches || user.mustChangePassword) throw credentialError();
  await db.portalUser.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  return createSession(user.id, false, now);
}

export async function completePortalPasswordReset(token: string, password: string, now = new Date()): Promise<void> {
  const tokenHash = digest(token);
  const eligible = await db.portalCredentialToken.findFirst({ where: { tokenHash, purpose: 'PASSWORD_RESET', consumedAt: null, expiresAt: { gt: now }, portalUser: { active: true } }, select: { id: true } });
  if (!eligible) throw credentialError();
  const encoded = await passwordHash(password);
  await db.$transaction(async (tx) => {
    const credential = await tx.portalCredentialToken.findFirst({ where: { tokenHash, purpose: 'PASSWORD_RESET', consumedAt: null, expiresAt: { gt: now }, portalUser: { active: true } }, select: { id: true, portalUserId: true } });
    if (!credential) throw credentialError();
    const consumed = await tx.portalCredentialToken.updateMany({ where: { id: credential.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (consumed.count !== 1) throw credentialError();
    await tx.portalUser.update({ where: { id: credential.portalUserId }, data: { passwordHash: encoded, mustChangePassword: false } });
    await tx.portalSession.updateMany({ where: { portalUserId: credential.portalUserId, revokedAt: null }, data: { revokedAt: now } });
  });
}

export async function completePortalFirstLogin(sessionToken: string, csrfToken: string, password: string, now = new Date()): Promise<PortalSessionCredentials> {
  const tokenHash = digest(sessionToken);
  const preflight = await db.portalSession.findFirst({
    where: { tokenHash, csrfHash: digest(csrfToken), revokedAt: null, expiresAt: { gt: now }, mustChangePassword: true, portalUser: { active: true, mustChangePassword: true } },
    select: { id: true },
  });
  if (!preflight) throw credentialError();
  const encoded = await passwordHash(password);
  return db.$transaction(async (tx) => {
    const current = await tx.portalSession.findFirst({
      where: { tokenHash, csrfHash: digest(csrfToken), revokedAt: null, expiresAt: { gt: now }, mustChangePassword: true, portalUser: { active: true, mustChangePassword: true } },
      select: { id: true, portalUserId: true },
    });
    if (!current) throw credentialError();
    const revoked = await tx.portalSession.updateMany({ where: { id: current.id, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } });
    if (revoked.count !== 1) throw credentialError();
    await tx.portalUser.update({ where: { id: current.portalUserId }, data: { passwordHash: encoded, mustChangePassword: false } });
    const sessionTokenNext = randomBytes(32).toString('hex');
    const csrfTokenNext = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await tx.portalSession.create({ data: { portalUserId: current.portalUserId, tokenHash: digest(sessionTokenNext), csrfHash: digest(csrfTokenNext), mustChangePassword: false, expiresAt } });
    return { sessionToken: sessionTokenNext, csrfToken: csrfTokenNext, expiresAt, mustChangePassword: false };
  });
}

export async function resolvePortalSession(sessionToken: string, allowFirstReset = false, now = new Date()): Promise<{ sessionId: string; identity: PortalIdentity; csrfHash: string }> {
  const session = await db.portalSession.findFirst({
    where: { tokenHash: digest(sessionToken), revokedAt: null, expiresAt: { gt: now }, portalUser: { active: true } },
    include: { portalUser: { select: { id: true, email: true, mustChangePassword: true } } },
  });
  if (!session || (!allowFirstReset && (session.mustChangePassword || session.portalUser.mustChangePassword))) throw credentialError();
  return { sessionId: session.id, identity: { id: session.portalUser.id, email: session.portalUser.email, mustChangePassword: session.mustChangePassword }, csrfHash: session.csrfHash };
}

export async function logoutPortalSession(sessionToken: string, csrfToken: string, now = new Date()): Promise<void> {
  const tokenHash = digest(sessionToken);
  const session = await db.portalSession.findFirst({ where: { tokenHash, revokedAt: null, expiresAt: { gt: now } }, select: { id: true, csrfHash: true } });
  if (!session || !equalHex(session.csrfHash, digest(csrfToken))) throw credentialError();
  await db.portalSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } });
}

export async function assertPortalUploadAllowed(portalUserId: string, engagementId: string): Promise<void> {
  const user = await db.portalUser.findUnique({ where: { id: portalUserId }, select: { active: true, mustChangePassword: true } });
  const membership = await db.portalMembership.findUnique({ where: { portalUserId_engagementId: { portalUserId, engagementId } }, select: { advanceClearedAt: true, releasedAt: true, archivedAt: true, revokedAt: true } });
  if (!user?.active || user.mustChangePassword || !membership?.advanceClearedAt || membership.releasedAt || membership.archivedAt || membership.revokedAt) throw new ForbiddenException('Portal uploads are not available for this engagement');
}
