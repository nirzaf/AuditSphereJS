import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { assignEngagementStaffSchema, revokeEngagementStaffSchema } from '@auditsphere/contracts';
import { db } from './db.js';
import { requireCapability, requireStaffRole, roleCapabilityAllowed, type Scope } from './authorization.js';

type AssignmentResult = {
  userId: string;
  engagementId: string;
  role: string;
  capabilities: string[];
  expiresAt: string;
  version: number;
};

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function loadEngagementForUpdate(tx: Prisma.TransactionClient, engagementId: string) {
  await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
  const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  return engagement;
}

async function authorizeTeamChange(tx: Prisma.TransactionClient, actorId: string, scope: Scope) {
  await requireCapability(tx, actorId, 'ENGAGEMENT_READ', scope);
  await requireCapability(tx, actorId, 'TEAM_ASSIGNMENT_MANAGE', scope);
  await requireStaffRole(tx, actorId, ['APPROVER'], 'Team assignment changes', scope);
}

function replayReceipt(receipt: { actorId: string; engagementId: string; hash: string; result: Prisma.JsonValue }, actorId: string, engagementId: string, hash: string) {
  if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) {
    throw new ConflictException('Idempotency key reused');
  }
  return receipt.result;
}

/**
 * Replace an engagement membership role and its direct engagement-scoped grants atomically.
 * Only the assigned engagement approver can manage a team, and every grant is finite, reasoned,
 * and constrained by the target membership role's capability ceiling.
 */
export async function assignEngagementStaff(actorId: string, engagementId: string, input: unknown) {
  const parsed = assignEngagementStaffSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  if (body.userId === actorId) throw new ForbiddenException('A partner cannot change their own engagement assignment');
  const expiresAt = new Date(body.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) throw new BadRequestException('Grant expiry must be in the future');
  const sortedCapabilities = [...body.capabilities].sort();
  const requestHash = digest({ ...body, capabilities: sortedCapabilities, expiresAt: expiresAt.toISOString() });

  try {
    return await db.$transaction(async (tx) => {
      const engagement = await loadEngagementForUpdate(tx, engagementId);
      const scope = { firmId: engagement.firmId, clientId: engagement.clientId, engagementId };
      await authorizeTeamChange(tx, actorId, scope);

      const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
      if (receipt) return replayReceipt(receipt, actorId, engagementId, requestHash);
      if (engagement.version !== body.expectedVersion) throw new ConflictException('Engagement changed; reload before changing staff assignments');

      const target = await tx.user.findUnique({ where: { id: body.userId }, select: { id: true, role: true, active: true } });
      if (!target?.active) throw new NotFoundException('Active internal staff identity not found');
      const forbidden = sortedCapabilities.find((capability) => !roleCapabilityAllowed(body.role, capability, target.role));
      if (forbidden) throw new BadRequestException(`${forbidden} is outside the ${body.role} role ceiling`);

      const existing = await tx.membership.findUnique({
        where: { userId_engagementId: { userId: body.userId, engagementId } },
        select: { role: true },
      });
      await tx.membership.upsert({
        where: { userId_engagementId: { userId: body.userId, engagementId } },
        create: { userId: body.userId, firmId: engagement.firmId, clientId: engagement.clientId, engagementId, role: body.role },
        update: { role: body.role },
      });

      const now = new Date();
      const replaced = await tx.roleGrant.updateMany({
        where: {
          userId: body.userId,
          firmId: engagement.firmId,
          clientId: engagement.clientId,
          engagementId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { revokedAt: now, revokedBy: actorId, reason: `Replaced by engagement assignment: ${body.reason}` },
      });
      await tx.roleGrant.createMany({
        data: sortedCapabilities.map((capability) => ({
          userId: body.userId,
          capability,
          firmId: engagement.firmId,
          clientId: engagement.clientId,
          engagementId,
          grantedBy: actorId,
          expiresAt,
          reason: body.reason,
        })),
      });

      const updatedEngagement = await tx.engagement.updateMany({
        where: { id: engagementId, version: body.expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (updatedEngagement.count !== 1) throw new ConflictException('Engagement changed; reload before changing staff assignments');

      const result: AssignmentResult = {
        userId: body.userId,
        engagementId,
        role: body.role,
        capabilities: sortedCapabilities,
        expiresAt: expiresAt.toISOString(),
        version: body.expectedVersion + 1,
      };
      await tx.auditEvent.create({
        data: {
          engagementId,
          actorId,
          action: 'ENGAGEMENT_STAFF_ASSIGNED',
          payload: { ...result, previousRole: existing?.role ?? null, replacedGrantCount: replaced.count, reason: body.reason },
        },
      });
      await tx.commandReceipt.create({
        data: { key: body.idempotencyKey, engagementId, actorId, hash: requestHash, result: result as Prisma.InputJsonValue },
      });
      return result;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const receipt = await db.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
      if (receipt) return replayReceipt(receipt, actorId, engagementId, requestHash) as AssignmentResult;
    }
    throw error;
  }
}

/** Revoke one user's complete engagement assignment without deleting its grant or audit history. */
export async function revokeEngagementStaff(actorId: string, engagementId: string, userId: string, input: unknown) {
  const parsed = revokeEngagementStaffSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  if (userId === actorId) throw new ForbiddenException('A partner cannot revoke their own engagement assignment');
  const requestHash = digest({ engagementId, userId, ...body });

  try {
    return await db.$transaction(async (tx) => {
      const engagement = await loadEngagementForUpdate(tx, engagementId);
      const scope = { firmId: engagement.firmId, clientId: engagement.clientId, engagementId };
      await authorizeTeamChange(tx, actorId, scope);

      const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
      if (receipt) return replayReceipt(receipt, actorId, engagementId, requestHash);
      if (engagement.version !== body.expectedVersion) throw new ConflictException('Engagement changed; reload before changing staff assignments');

      const membership = await tx.membership.findUnique({
        where: { userId_engagementId: { userId, engagementId } },
        select: { role: true, firmId: true, clientId: true },
      });
      if (!membership || membership.firmId !== engagement.firmId || membership.clientId !== engagement.clientId) {
        throw new NotFoundException('Engagement staff assignment not found');
      }

      const now = new Date();
      const revoked = await tx.roleGrant.updateMany({
        where: { userId, firmId: engagement.firmId, clientId: engagement.clientId, engagementId, revokedAt: null },
        data: { revokedAt: now, revokedBy: actorId, reason: body.reason },
      });
      await tx.membership.delete({ where: { userId_engagementId: { userId, engagementId } } });
      const updatedEngagement = await tx.engagement.updateMany({
        where: { id: engagementId, version: body.expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (updatedEngagement.count !== 1) throw new ConflictException('Engagement changed; reload before changing staff assignments');
      const result = { userId, engagementId, revoked: true as const, revokedGrantCount: revoked.count, version: body.expectedVersion + 1 };
      await tx.auditEvent.create({
        data: { engagementId, actorId, action: 'ENGAGEMENT_STAFF_REVOKED', payload: { ...result, previousRole: membership.role, reason: body.reason } },
      });
      await tx.commandReceipt.create({
        data: { key: body.idempotencyKey, engagementId, actorId, hash: requestHash, result: result as Prisma.InputJsonValue },
      });
      return result;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const receipt = await db.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
      if (receipt) return replayReceipt(receipt, actorId, engagementId, requestHash) as { userId: string; engagementId: string; revoked: true; revokedGrantCount: number; version: number };
    }
    throw error;
  }
}
