import { ForbiddenException } from '@nestjs/common';
import { db } from './db.js';
import { recordSecurityEvent } from './audit.js';
import type { capabilities } from '@auditsphere/contracts';

export type Capability = (typeof capabilities)[number];
/** The scope every grant is evaluated against: one engagement inside one client inside one firm. */
export type Scope = { firmId: string; clientId: string; engagementId: string };
type GrantRow = { capability: string; firmId: string | null; clientId: string | null; engagementId: string | null; revokedAt: Date | null; expiresAt: Date | null };

/** Accepts either the pooled client or a transaction client so the same rule can be reapplied inside a write. */
export type AuthClient = Pick<typeof db, 'roleGrant'>;

/**
 * A grant covers a scope when its narrowest scope key matches:
 * engagement grant -> that engagement; client grant -> that client in that firm;
 * firm grant -> that firm. A grant with no scope at all is deliberately not a wildcard.
 */
export function grantCoversScope(grant: Pick<GrantRow, 'firmId' | 'clientId' | 'engagementId'>, scope: Scope): boolean {
  if (grant.engagementId) return grant.engagementId === scope.engagementId;
  if (grant.clientId) return grant.clientId === scope.clientId && grant.firmId === scope.firmId;
  if (grant.firmId) return grant.firmId === scope.firmId;
  return false;
}

export function isActive(grant: Pick<GrantRow, 'revokedAt' | 'expiresAt'>, at: Date): boolean {
  if (grant.revokedAt) return false;
  return grant.expiresAt === null || grant.expiresAt > at;
}

export async function activeGrants(client: AuthClient, userId: string, capability: Capability, at: Date): Promise<GrantRow[]> {
  return client.roleGrant.findMany({
    where: { userId, capability, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: at } }] },
    select: { capability: true, firmId: true, clientId: true, engagementId: true, revokedAt: true, expiresAt: true },
  }) as Promise<GrantRow[]>;
}

export async function hasCapability(client: AuthClient, userId: string, capability: Capability, scope: Scope, at: Date = new Date()): Promise<boolean> {
  const grants = await activeGrants(client, userId, capability, at);
  return grants.some((grant) => isActive(grant, at) && grantCoversScope(grant, scope));
}

export async function anyCapability(client: AuthClient, userId: string, scope: Scope, at: Date = new Date()): Promise<boolean> {
  const grants = (await client.roleGrant.findMany({
    where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: at } }] },
    select: { capability: true, firmId: true, clientId: true, engagementId: true, revokedAt: true, expiresAt: true },
  })) as GrantRow[];
  return grants.some((grant) => isActive(grant, at) && grantCoversScope(grant, scope));
}

/** Authoritative check. Call this inside the write transaction, not only in the HTTP guard. */
export async function requireCapability(client: AuthClient, userId: string, capability: Capability, scope: Scope, at: Date = new Date()): Promise<void> {
  if (!(await hasCapability(client, userId, capability, scope, at))) {
    // A denial inside a business transaction would roll back with it, so the security log is
    // written on the pooled client. Best-effort: the original denial still throws if the log
    // write itself fails.
    try {
      await recordSecurityEvent(db, { action: 'CAPABILITY_DENIED', engagementId: scope.engagementId, actorId: userId, detail: { capability } });
    } catch {
      // Do not echo a database error or parameters into logs while preserving the original denial.
      console.error('Security event recording failed; authorization denial preserved');
    }
    throw new ForbiddenException(`${capability} is not granted for this engagement`);
  }
}

export async function revokeGrant(id: string, revokedBy: string, reason: string) {
  return db.roleGrant.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedBy, reason } });
}
