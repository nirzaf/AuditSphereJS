import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { configuredEntraIdentity } from './entra.js';
import { requireCapability } from './authorization.js';
import { sessionRevocationCutoff, wasSessionRevoked } from './session-revocation.js';
import type { EntraIdentity } from './entra.js';
export const fixtureUser = '00000000-0000-4000-8000-000000000001';

export async function authenticateEntraActor(identity: Pick<EntraIdentity, 'authenticate'>, received: string): Promise<string> {
  const verified = await identity.authenticate(received);
  const user = await db.user.findUnique({ where: { tenantId_entraObjectId: { tenantId: verified.tenantId, entraObjectId: verified.objectId } }, select: { id: true, active: true } });
  if (!user?.active) throw new Error('Active local identity assignment missing');
  const revocation = await db.identitySessionRevocation.findFirst({ where: { userId: user.id }, orderBy: { revokedBefore: 'desc' }, select: { revokedBefore: true } });
  if (revocation && wasSessionRevoked(verified.issuedAt, revocation.revokedBefore)) throw new Error('Entra session was revoked');
  return user.id;
}

async function authenticateInternalActor(received: string): Promise<string> {
  let userId: string;
  if (process.env.AUTH_PROVIDER === 'entra' || process.env.NODE_ENV === 'production') {
    try {
      userId = await authenticateEntraActor(configuredEntraIdentity(), received);
    } catch { throw new UnauthorizedException('Internal authentication required'); }
  } else {
    const configured = process.env.DEV_AUTH_TOKEN;
    if (process.env.DEV_AUTH_ENABLED !== 'true' || !configured || Buffer.byteLength(received) !== Buffer.byteLength(configured) || !timingSafeEqual(Buffer.from(received), Buffer.from(configured))) throw new UnauthorizedException('Internal authentication required');
    const user = await db.user.findUnique({ where: { id: fixtureUser }, select: { id: true, active: true } });
    if (!user?.active) throw new UnauthorizedException('Internal authentication required');
    userId = user.id;
  }
  return userId;
}

export async function revokeCurrentUserSessions(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, active: true } });
  if (!user?.active) throw new UnauthorizedException('Internal authentication required');
  const revokedBefore = sessionRevocationCutoff();
  const event = await db.identitySessionRevocation.create({ data: { userId, revokedBefore }, select: { id: true, revokedBefore: true } });
  return { revokedBefore: event.revokedBefore.toISOString() };
}

export async function currentInternalIdentity(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, active: true } });
  if (!user?.active) throw new UnauthorizedException('Internal authentication required');
  return user;
}

@Injectable()
export class InternalIdentityGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.actorId = await authenticateInternalActor(req.headers.authorization?.replace(/^Bearer /, '') || '');
    return true;
  }
}

@Injectable()
export class InternalGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const received = req.headers.authorization?.replace(/^Bearer /, '') || '';
    const actorId = await authenticateInternalActor(received);
    const membership = await db.membership.findUnique({ where: { userId_engagementId: { userId: actorId, engagementId: req.params.engagementId } }, include: { engagement: true } });
    if (!membership) throw new ForbiddenException('Engagement access denied');
    // Membership alone is not authorization. An explicit, current, in-scope grant is required,
    // and the same rule is reapplied inside each write transaction.
    const scope = { firmId: membership.engagement.firmId, clientId: membership.engagement.clientId, engagementId: membership.engagement.id };
    await requireCapability(db, actorId, 'ENGAGEMENT_READ', scope);
    req.actorId = actorId;
    req.scope = scope;
    return true;
  }
}
