import { UnauthorizedException } from '@nestjs/common';
import type { RealtimeJoinRequest, RealtimeJoinSnapshot } from '@auditsphere/contracts';
import { db } from '../db.js';
import { requireCapability } from '../authorization.js';
import { authenticateRealtimeInternalActor } from '../auth.js';
import { portalSessionTokenFromCookieHeader, portalSocketSessionTokenFromCookieHeader, resolvePortalSession } from '../portal-auth.js';
import { internalEngagementRoom, internalImportRoom, portalEngagementRoom } from './rooms.js';

export type RealtimePrincipal =
  | { kind: 'internal'; userId: string }
  | { kind: 'portal'; userId: string };

export type AuthorizedRealtimeJoin = {
  principal: RealtimePrincipal;
  snapshot: RealtimeJoinSnapshot;
  room: string;
};

function socketAuth(value: unknown): { kind?: string; accessToken?: string } {
  if (!value || typeof value !== 'object') return {};
  const auth = value as Record<string, unknown>;
  return {
    kind: typeof auth.kind === 'string' ? auth.kind : undefined,
    accessToken: typeof auth.accessToken === 'string' ? auth.accessToken : undefined,
  };
}

function originMatches(origin: string | undefined): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(process.env.WEB_ORIGIN ?? '').origin; } catch { return false; }
}

export async function resolveRealtimePrincipal(input: {
  auth: unknown;
  cookie?: string;
  origin?: string;
}): Promise<RealtimePrincipal> {
  if (!originMatches(input.origin)) throw new UnauthorizedException('Realtime origin denied');
  const auth = socketAuth(input.auth);
  if (auth.kind === 'internal' && auth.accessToken) {
    return { kind: 'internal', userId: await authenticateRealtimeInternalActor(auth.accessToken) };
  }
  if (auth.kind === 'portal') {
    const sessionToken = portalSessionTokenFromCookieHeader(input.cookie) ?? portalSocketSessionTokenFromCookieHeader(input.cookie);
    if (!sessionToken) throw new UnauthorizedException('Portal realtime session required');
    const session = await resolvePortalSession(sessionToken);
    return { kind: 'portal', userId: session.identity.id };
  }
  throw new UnauthorizedException('Realtime authentication required');
}

export async function authorizeRealtimeJoin(principal: RealtimePrincipal, request: RealtimeJoinRequest): Promise<AuthorizedRealtimeJoin> {
  const engagement = await db.engagement.findUnique({ where: { id: request.engagementId }, select: { id: true, firmId: true, clientId: true, version: true } });
  if (!engagement) throw new UnauthorizedException('Realtime room access denied');

  if (principal.kind === 'internal') {
    await requireCapability(db, principal.userId, 'ENGAGEMENT_READ', { firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });
    let resourceVersion = engagement.version;
    let room = internalEngagementRoom(engagement.id);
    if (request.resource.type === 'trial-balance-import') {
      const imported = await db.tbImport.findFirst({ where: { id: request.resource.id, engagementId: engagement.id }, select: { id: true, version: true } });
      if (!imported) throw new UnauthorizedException('Realtime room access denied');
      resourceVersion = imported.version;
      room = internalImportRoom(engagement.id, imported.id);
    }
    return {
      principal,
      room,
      snapshot: { engagementId: engagement.id, engagementVersion: engagement.version, resource: request.resource, resourceVersion },
    };
  }

  if (request.resource.type !== 'engagement') throw new UnauthorizedException('Realtime room access denied');
  const membership = await db.portalMembership.findUnique({
    where: { portalUserId_engagementId: { portalUserId: principal.userId, engagementId: engagement.id } },
    include: { portalUser: { select: { active: true, mustChangePassword: true } } },
  });
  if (!membership?.portalUser.active || membership.portalUser.mustChangePassword || !membership.advanceClearedAt || membership.revokedAt || membership.releasedAt || membership.archivedAt) {
    throw new UnauthorizedException('Realtime room access denied');
  }
  return {
    principal,
    room: portalEngagementRoom(engagement.id),
    snapshot: { engagementId: engagement.id, engagementVersion: engagement.version, resource: request.resource, resourceVersion: engagement.version },
  };
}
