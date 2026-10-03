import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../../platform/db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { withUnitOfWork, type UnitOfWork } from '../../platform/unit-of-work.js';
import { acceptProposalSchema, createProposalSchema, proposalActionSchema, recordRiskClearanceSchema } from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';

/**
 * Real commercial onboarding records (C05/C06): versioned proposals, the Key 1 client
 * acceptance evidence and the Key 2 Partner risk clearance. The dual-key invariant itself is
 * enforced by the lifecycle kernel's ISSUE_ENGAGEMENT_LETTER evidence predicate; this module
 * owns the records that predicate reads.
 */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return parsed.data;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type EngagementRow = { firmId: string; clientId: string; id: string };
const scopeOf = (engagement: EngagementRow): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

export async function loadEngagement(tx: Prisma.TransactionClient | typeof db, engagementId: string): Promise<EngagementRow> {
  const engagement = await tx.engagement.findUnique({ where: { id: engagementId }, select: { firmId: true, clientId: true, id: true } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  return engagement;
}

export async function listProposals(engagementId: string, page: PaginationQuery = { offset: 0, limit: 50 }) {
  const engagement = await loadEngagement(db, engagementId);
  return db.commercialProposal.findMany({ where: { engagementId: engagement.id }, orderBy: { createdAt: 'asc' }, skip: page.offset, take: page.limit });
}

export async function createProposal(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(createProposalSchema, input);
  const hash = digest(JSON.stringify({ engagementId, operation: 'CREATE_PROPOSAL', body }));
  const engagement = await loadEngagement(db, engagementId);
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const proposal = await tx.commercialProposal.create({ data: {
      firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id,
      service: body.service, periodStart: new Date(`${body.periodStart}T00:00:00Z`), periodEnd: new Date(`${body.periodEnd}T00:00:00Z`),
      totalAmount: body.totalAmount, createdBy: actorId,
    } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PROPOSAL_CREATED', payload: { proposalId: proposal.id, totalAmount: body.totalAmount, service: body.service } } });
    const result = { id: proposal.id, status: proposal.status, revision: proposal.revision, totalAmount: body.totalAmount };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function presentProposal(actorId: string, engagementId: string, proposalId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(proposalActionSchema, input);
  const hash = digest(JSON.stringify({ engagementId, operation: 'PRESENT_PROPOSAL', proposalId, body }));
  const engagement = await loadEngagement(db, engagementId);
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const proposal = await tx.commercialProposal.findFirst({ where: { id: proposalId, engagementId } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'DRAFT') throw new ConflictException('Only a draft proposal can be presented');
    if (body.expectedVersion !== proposal.revision) throw new ConflictException('Proposal changed; reload before presenting');
    const revision = proposal.revision;
    const changed = await tx.commercialProposal.updateMany({
      where: { id: proposalId, status: 'DRAFT', revision },
      data: { status: 'PRESENTED', presentedSnapshot: { revision, totalAmount: proposal.totalAmount, service: proposal.service } },
    });
    if (changed.count !== 1) throw new ConflictException('Proposal changed; reload before presenting');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PROPOSAL_PRESENTED', payload: { proposalId, revision } } });
    const result = { id: proposalId, status: 'PRESENTED', revision };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function acceptProposal(actorId: string, engagementId: string, proposalId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(acceptProposalSchema, input);
  const hash = digest(JSON.stringify({ engagementId, operation: 'ACCEPT_PROPOSAL', proposalId, body }));
  const engagement = await loadEngagement(db, engagementId);
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const proposal = await tx.commercialProposal.findFirst({ where: { id: proposalId, engagementId } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'PRESENTED' || !proposal.presentedSnapshot) throw new ConflictException('Only a presented proposal can be accepted');
    if (body.expectedVersion !== proposal.revision) throw new ConflictException('Proposal changed; reload before accepting');
    const snapshot = proposal.presentedSnapshot as { revision: number };
    if (snapshot.revision !== proposal.revision) throw new ConflictException('The presented revision no longer matches the proposal');
    const changed = await tx.commercialProposal.updateMany({
      where: { id: proposalId, status: 'PRESENTED', revision: proposal.revision },
      data: { status: 'ACCEPTED', clientResponse: { revision: proposal.revision, evidenceRef: body.evidenceRef, acceptedByActorId: actorId } },
    });
    if (changed.count !== 1) throw new ConflictException('Proposal changed; reload before accepting');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PROPOSAL_ACCEPTED', payload: { proposalId, revision: proposal.revision, evidenceRef: body.evidenceRef } } });
    const result = { id: proposalId, status: 'ACCEPTED', revision: proposal.revision };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function recordRiskClearance(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = parse(recordRiskClearanceSchema, input);
  const hash = digest(JSON.stringify({ engagementId, operation: 'RISK_CLEARANCE', body }));
  const engagement = await loadEngagement(db, engagementId);
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    // Key 2 is a Partner-only decision; the existing RISK_PARTNER_CLEAR capability is the authority.
    await requireCapability(tx, actorId, 'RISK_PARTNER_CLEAR', scopeOf(engagement));
    const clearance = await tx.riskClearance.create({ data: { firmId: engagement.firmId, clientId: engagement.clientId, engagementId, reason: body.reason, clearedBy: actorId } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'RISK_CLEARANCE_RECORDED', payload: { clearanceId: clearance.id } } });
    const result = { id: clearance.id, clearedAt: clearance.clearedAt };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

/** The dual-key status the lifecycle gate reads and the UI renders. */
export async function dualKeyStatus(engagementId: string) {
  const engagement = await loadEngagement(db, engagementId);
  const [accepted, clearances, letter] = await Promise.all([
    db.commercialProposal.findFirst({ where: { engagementId, status: 'ACCEPTED' }, orderBy: { createdAt: 'desc' } }),
    db.riskClearance.findMany({ where: { engagementId }, orderBy: { clearedAt: 'desc' }, take: 5 }),
    db.engagementLetterRecord.findUnique({ where: { engagementId } }),
  ]);
  return {
    key1Status: accepted ? 'RECORDED' : 'PENDING',
    key1ProposalId: accepted?.id ?? null,
    key2Status: clearances.length ? 'RECORDED' : 'PENDING',
    key2Reason: clearances[0]?.reason ?? null,
    letterIssued: Boolean(letter),
    letterText: letter?.letterText ?? null,
    letterIssuedAt: letter?.issuedAt ?? null,
    clearances,
  };
}
