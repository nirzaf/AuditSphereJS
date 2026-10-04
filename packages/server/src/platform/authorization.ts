import { ForbiddenException } from '@nestjs/common';
import { db } from './db.js';
import { recordSecurityEvent } from './audit.js';
import { capabilities, staffRoles } from '@auditsphere/contracts';

export type Capability = (typeof capabilities)[number];
/** The scope every grant is evaluated against: one engagement inside one client inside one firm. */
export type Scope = { firmId: string; clientId: string; engagementId: string };
type GrantRow = { capability: string; firmId: string | null; clientId: string | null; engagementId: string | null; revokedAt: Date | null; expiresAt: Date | null };
export type StaffRole = (typeof staffRoles)[number];

/** Role is a ceiling, never a source of authority: every allowed action still needs a scoped grant. */
const roleCapabilities: Readonly<Record<StaffRole, readonly Capability[]>> = Object.freeze({
  PREPARER: ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'REVIEW_RAISE', 'ADJUSTMENT_MANAGE', 'LIFECYCLE_COMMAND'],
  REVIEWER: ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'FIELDWORK_FINALIZE', 'TB_PUBLISH', 'MAPPING_APPROVE', 'TAXONOMY_MANAGE', 'MATERIALITY_MANAGE', 'RISK_MANAGE', 'REVIEW_RAISE', 'REVIEW_RESOLVE', 'ADJUSTMENT_MANAGE', 'ADJUSTMENT_POST', 'LIFECYCLE_COMMAND', 'EXTERNAL_COMMUNICATION_READ'],
  APPROVER: ['ENGAGEMENT_READ', 'FIELDWORK_WRITE', 'FIELDWORK_FINALIZE', 'TB_PUBLISH', 'MAPPING_APPROVE', 'TAXONOMY_MANAGE', 'MATERIALITY_MANAGE', 'MATERIALITY_APPROVE', 'RISK_MANAGE', 'RISK_PARTNER_CLEAR', 'REVIEW_RAISE', 'REVIEW_RESOLVE', 'ADJUSTMENT_MANAGE', 'ADJUSTMENT_POST', 'LIFECYCLE_COMMAND', 'COMMERCIAL_MANAGE', 'TEAM_ASSIGNMENT_MANAGE', 'DOCUMENT_TEMPLATE_MANAGE', 'EXTERNAL_COMMUNICATION_READ', 'EXTERNAL_COMMUNICATION_SEND', 'EXTERNAL_COMMUNICATION_RECONCILE'],
  BILLING: ['ENGAGEMENT_READ', 'LIFECYCLE_COMMAND', 'PRACTICE_READ', 'PRACTICE_MANAGE', 'PRACTICE_POST', 'PRACTICE_REOPEN_PERIOD', 'EXTERNAL_COMMUNICATION_READ', 'EXTERNAL_COMMUNICATION_SEND', 'EXTERNAL_COMMUNICATION_RECONCILE'],
  // Operational administrators do not inherit partner, billing or fieldwork authority.
  ADMIN: ['ENGAGEMENT_READ'],
});

/** Accepts either the pooled client or a transaction client so the same rule can be reapplied inside a write. */
export type AuthClient = Pick<typeof db, 'roleGrant' | 'user' | 'membership'>;

export function roleCapabilityAllowed(assignmentRole: string, capability: Capability, identityRole?: string): boolean {
  if (!staffRoles.includes(assignmentRole as StaffRole)) return false;
  if (identityRole !== undefined && !staffRoles.includes(identityRole as StaffRole)) return false;
  // A global operational administrator cannot be promoted into business authority by a grant.
  if (identityRole === 'ADMIN' && assignmentRole !== 'ADMIN') return false;
  return roleCapabilities[assignmentRole as StaffRole].includes(capability);
}

export async function roleAllowsCapability(client: AuthClient, userId: string, capability: Capability, scope: Scope): Promise<boolean> {
  const [user, membership] = await Promise.all([
    client.user.findUnique({ where: { id: userId }, select: { active: true, role: true } }),
    client.membership.findUnique({ where: { userId_engagementId: { userId, engagementId: scope.engagementId } }, select: { firmId: true, clientId: true, role: true } }),
  ]);
  if (!user?.active || membership?.firmId !== scope.firmId || membership.clientId !== scope.clientId) return false;
  return roleCapabilityAllowed(membership.role, capability, user.role);
}

/** Membership binds an internal principal to the exact firm/client/engagement tuple. */
export async function isAssignedToScope(client: AuthClient, userId: string, scope: Scope): Promise<boolean> {
  const membership = await client.membership.findUnique({
    where: { userId_engagementId: { userId, engagementId: scope.engagementId } },
    select: { firmId: true, clientId: true },
  });
  return membership?.firmId === scope.firmId && membership.clientId === scope.clientId;
}

/** State-dependent workflows use this after their scoped capability check. */
export async function requireStaffRole(client: AuthClient, userId: string, allowedRoles: readonly StaffRole[], action: string, scope: Scope): Promise<void> {
  const [user, membership] = await Promise.all([
    client.user.findUnique({ where: { id: userId }, select: { active: true, role: true } }),
    client.membership.findUnique({ where: { userId_engagementId: { userId, engagementId: scope.engagementId } }, select: { firmId: true, clientId: true, role: true } }),
  ]);
  if (!user?.active || membership?.firmId !== scope.firmId || membership.clientId !== scope.clientId ||
      !allowedRoles.includes(membership.role as StaffRole) || (user.role === 'ADMIN' && membership.role !== 'ADMIN')) {
    throw new ForbiddenException(`${action} requires an authorized staff role`);
  }
}

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
  if (!(await roleAllowsCapability(client, userId, capability, scope))) return false;
  const grants = await activeGrants(client, userId, capability, at);
  return grants.some((grant) => isActive(grant, at) && grantCoversScope(grant, scope));
}

export async function anyCapability(client: AuthClient, userId: string, scope: Scope, at: Date = new Date()): Promise<boolean> {
  if (!(await isAssignedToScope(client, userId, scope))) return false;
  const grants = (await client.roleGrant.findMany({
    where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: at } }] },
    select: { capability: true, firmId: true, clientId: true, engagementId: true, revokedAt: true, expiresAt: true },
  })) as GrantRow[];
  for (const grant of grants) {
    if (isActive(grant, at) && grantCoversScope(grant, scope) && capabilities.includes(grant.capability as Capability) && await roleAllowsCapability(client, userId, grant.capability as Capability, scope)) return true;
  }
  return false;
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
