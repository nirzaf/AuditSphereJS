import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { db } from '../../platform/db.js';
import { lifecycleCommandSchema, lifecycleCommands } from '@auditsphere/contracts';
import { requireCapability } from '../../platform/authorization.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Guarded engagement lifecycle commands.
 *
 * The eleven primary state names are preserved, but state never advances by walking an array.
 * A caller names a command; the server derives the only permitted target state from the current
 * state, checks the command's evidence predicate, and writes the state change, the append-only
 * history row, the audit event and the idempotency receipt in one transaction.
 */
export type LifecycleCommand = typeof lifecycleCommands[number];

export type TransitionDefinition = {
  from: readonly string[];
  to: string;
  requiresReason: boolean;
  evidence: 'NONE' | 'FINALIZED_TRIAL_BALANCE' | 'FINALIZED_TRIAL_BALANCE_AND_APPROVED_MATERIALITY';
  description: string;
};

export const transitions: Readonly<Record<LifecycleCommand, TransitionDefinition>> = Object.freeze({
  START_FIELDWORK: {
    from: ['PORTAL_ACTIVE_PLANNING'],
    to: 'FIELDWORK_EXECUTION',
    requiresReason: false,
    evidence: 'FINALIZED_TRIAL_BALANCE_AND_APPROVED_MATERIALITY',
    description: 'Begin assigned testing once an accepted trial balance and a current approved plan exist.',
  },
  SUBMIT_FOR_REVIEW: {
    from: ['FIELDWORK_EXECUTION'],
    to: 'MANAGERIAL_REVIEW',
    requiresReason: false,
    evidence: 'FINALIZED_TRIAL_BALANCE',
    description: 'Submit the engagement for managerial review.',
  },
  RETURN_FOR_REWORK: {
    from: ['MANAGERIAL_REVIEW'],
    to: 'FIELDWORK_EXECUTION',
    requiresReason: true,
    evidence: 'NONE',
    description: 'Return managerial review work to fieldwork with a recorded reason.',
  },
});

export function permittedCommands(currentState: string): LifecycleCommand[] {
  return lifecycleCommands.filter((command) => transitions[command].from.includes(currentState));
}

/** Exported for boundary tests: a command whose source state does not currently apply is rejected. */
export function canApply(command: string, currentState: string): boolean {
  const definition = transitions[command as LifecycleCommand];
  return Boolean(definition) && definition.from.includes(currentState);
}

export async function applyLifecycleCommand(engagementId: string, actorId: string, input: unknown) {
  const parsed = lifecycleCommandSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const hash = digest(JSON.stringify({ engagementId, body }));
  return db.$transaction(async (tx) => {
    // Serialize commands for this engagement before reading its current state.
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    // Authorize before revealing whether the command applies to the current state.
    await requireCapability(tx, actorId, 'LIFECYCLE_COMMAND', { firmId: engagement.firmId, clientId: engagement.clientId, engagementId });
    const definition = transitions[body.command];
    if (!definition || !definition.from.includes(engagement.state)) {
      throw new ConflictException(`Command ${body.command} is not valid from ${engagement.state}`);
    }
    if (definition.requiresReason && !body.reason) throw new BadRequestException('A reason is required for this command');
    const evidence: Record<string, unknown> = {};
    if (definition.evidence === 'FINALIZED_TRIAL_BALANCE' || definition.evidence === 'FINALIZED_TRIAL_BALANCE_AND_APPROVED_MATERIALITY') {
      const finalized = await tx.tbImport.count({ where: { firmId: engagement.firmId, clientId: engagement.clientId, engagementId, status: 'FINALIZED' } });
      if (!finalized) throw new ConflictException('A finalized trial balance is required for this command');
      evidence.finalizedImports = finalized;
    }
    if (definition.evidence === 'FINALIZED_TRIAL_BALANCE_AND_APPROVED_MATERIALITY') {
      // Fieldwork cannot start from an unapproved or stale plan.
      const latestPublication = await tx.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } });
      const approved = await tx.materialityAssessment.findFirst({ where: { engagementId, status: 'APPROVED' }, orderBy: { calculatedAt: 'desc' } });
      if (!approved) throw new ConflictException('An approved materiality assessment is required before fieldwork can start');
      if (!latestPublication || approved.publicationId !== latestPublication.id) throw new ConflictException('The approved materiality assessment is stale; recalculate and approve it before fieldwork can start');
      evidence.approvedMaterialityAssessmentId = approved.id;
      evidence.publicationId = latestPublication.id;
    }
    const changed = await tx.engagement.updateMany({
      where: { id: engagementId, state: engagement.state, version: body.expectedVersion },
      data: { state: definition.to, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ConflictException('Engagement changed; reload before saving');
    await tx.engagementTransition.create({
      data: {
        engagementId,
        command: body.command,
        fromState: engagement.state,
        toState: definition.to,
        actorId,
        reason: body.reason ?? null,
        evidence: evidence as Prisma.InputJsonValue,
        version: engagement.version,
      },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: `LIFECYCLE_${body.command}`, payload: { from: engagement.state, to: definition.to, reason: body.reason ?? null, ...evidence } } });
    const result = { state: definition.to, version: engagement.version + 1 };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function lifecycleHistory(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  const [history, available] = await Promise.all([
    db.engagementTransition.findMany({ where: { engagementId }, orderBy: { createdAt: 'asc' } }),
    Promise.resolve(permittedCommands(engagement.state)),
  ]);
  return { state: engagement.state, version: engagement.version, permittedCommands: available, history };
}
