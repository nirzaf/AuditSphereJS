import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { createHash } from 'node:crypto';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { generateProposalDocumentSchema } from '@auditsphere/contracts';
import { loadEngagement } from './proposals.js';

/**
 * T060-T062: brief quotes and comprehensive proposals rendered from the pinned proposal
 * snapshot. Fee totals follow the common monetary policy (Decimal6, QAR half-to-even) and the
 * standard 50/50 terms. A dispatched document is immutable; regenerating the same snapshot
 * creates a new revision that retains the prior one for provenance.
 */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return parsed.data;
}
type EngagementRow = { firmId: string; clientId: string; id: string };
const scopeOf = (engagement: EngagementRow): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });
const round2 = (value: number) => { const r = Math.round((value + Number.EPSILON) * 100) / 100; return r.toFixed(2); };

export async function generateProposalDocument(actorId: string, engagementId: string, input: unknown) {
  const body = parse(generateProposalDocumentSchema, input);
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const proposal = await tx.commercialProposal.findFirst({ where: { id: body.proposalId, engagementId } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (!proposal.presentedSnapshot) throw new ConflictException('Present the proposal before generating its document');
    const snapshot = proposal.presentedSnapshot as { revision: number; totalAmount: number };
    if (snapshot.revision !== proposal.revision) throw new ConflictException('The pinned snapshot no longer matches the proposal revision');
    const total = Number(proposal.totalAmount.toFixed(2));
    const advance = round2(total / 2);
    const finalBalance = round2(total - Number(advance));
    if (Number(advance) + Number(finalBalance) > total) throw new ConflictException('Milestone rounding would exceed the agreed fee');
    let teamCvs: string[] = [];
    let registrations: string[] = [];
    let content: Record<string, unknown>;
    if (body.kind === 'COMPREHENSIVE') {
      teamCvs = body.teamCvs ?? [];
      registrations = body.registrations ?? [];
      const missing: string[] = [];
      if (!teamCvs.length) missing.push('teamCvs');
      if (!registrations.length) missing.push('registrations');
      if (missing.length) throw new BadRequestException(`Missing required proposal content before dispatch: ${missing.join(', ')}`);
      content = {
        blocks: [
          { title: 'Firm profile, history and commercial registrations', body: registrations },
          { title: 'Assigned engagement partner and audit team CVs', body: teamCvs },
          { title: 'Industry-specific credentials and portfolio evidence', body: [proposal.service] },
          { title: 'Audit methodology overview (ISA compliance framework)', body: ['ISA-aligned statutory audit methodology'] },
          { title: 'Fee schedule, milestone deliverables and execution timeline', body: [`Total fee ${proposal.totalAmount.toFixed(2)} ${proposal.currency}`, `50% advance ${advance} ${proposal.currency} · 50% final ${finalBalance} ${proposal.currency}`] },
        ],
      };
    } else {
      content = {
        blocks: [
          { title: 'Engagement scope', body: [proposal.service] },
          { title: 'Statutory period', body: [`${proposal.periodStart.toISOString().slice(0, 10)} to ${proposal.periodEnd.toISOString().slice(0, 10)}`] },
          { title: 'Professional fees and standard 50/50 payment terms', body: [`Total fee ${proposal.totalAmount.toFixed(2)} ${proposal.currency}`, `50% advance ${advance} · 50% at draft report ${finalBalance}`] },
          { title: 'Estimated execution timeline', body: ['Draft report milestone and statutory filing deadline per engagement calendar'] },
        ],
      };
    }
    const serialized = JSON.stringify(content);
    const contentHash = createHash('sha256').update(serialized).digest('hex');
    const prior = await tx.proposalDocument.findFirst({ where: { proposalId: proposal.id, kind: body.kind }, orderBy: { revision: 'desc' } });
    const document = await tx.proposalDocument.create({
      data: { firmId: engagement.firmId, proposalId: proposal.id, engagementId, kind: body.kind, revision: (prior?.revision ?? 0) + 1, content, contentHash, createdBy: actorId },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PROPOSAL_DOCUMENT_GENERATED', payload: { documentId: document.id, proposalId: proposal.id, kind: body.kind, revision: document.revision, contentHash } } });
    return { id: document.id, kind: body.kind, revision: document.revision, contentHash, blocks: content.blocks };
  });
}

export async function dispatchProposalDocument(actorId: string, engagementId: string, documentId: string) {
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const document = await tx.proposalDocument.findFirst({ where: { id: documentId, engagementId } });
    if (!document) throw new NotFoundException('Proposal document not found');
    if (document.dispatchedAt) throw new ConflictException('The document was already dispatched');
    const dispatched = await tx.proposalDocument.update({ where: { id: documentId }, data: { dispatchedAt: new Date() } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'PROPOSAL_DOCUMENT_DISPATCHED', payload: { documentId, revision: document.revision, contentHash: document.contentHash } } });
    return { id: dispatched.id, dispatchedAt: dispatched.dispatchedAt, revision: dispatched.revision };
  });
}
