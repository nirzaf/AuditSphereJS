import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { createLeadSchema, profileLeadSchema } from '@auditsphere/contracts';
import { loadEngagement } from './proposals.js';

/**
 * T054: multi-channel lead intake (phone/WhatsApp/email/web/referral) with a manual profile
 * form and a gated progression to proposal entry. Creating a lead is a pure intake record: it
 * assigns no privileges, creates no engagement and moves no engagement state. Duplicate legal
 * names stay visible as distinct leads linked by `duplicateOfId` — never implicit merges.
 */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return parsed.data;
}
type EngagementRow = { firmId: string; clientId: string; id: string };
const scopeOf = (engagement: EngagementRow): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

const normalizedLegalName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export async function createLead(actorId: string, engagementId: string, input: unknown) {
  const body = parse(createLeadSchema, input);
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const duplicate = await tx.lead.findFirst({
      where: { firmId: engagement.firmId, legalName: body.legalName.trim().replace(/\s+/g, ' '), status: { notIn: ['REJECTED', 'CONVERTED'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const lead = await tx.lead.create({
      data: {
        firmId: engagement.firmId, source: body.source, legalName: body.legalName.trim(),
        contactName: body.contactName ?? null, contactEmail: body.contactEmail ?? null, scope: body.scope ?? null,
        duplicateOfId: duplicate?.id ?? null, createdBy: actorId,
      },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'LEAD_CREATED', payload: { leadId: lead.id, source: lead.source, duplicateOfId: lead.duplicateOfId } } });
    return { id: lead.id, source: lead.source, status: lead.status, duplicateOfId: lead.duplicateOfId };
  });
}

export async function listLeads(engagementId: string) {
  const engagement = await loadEngagement(db, engagementId);
  return db.lead.findMany({ where: { firmId: engagement.firmId }, orderBy: { createdAt: 'asc' } });
}

export async function profileLead(actorId: string, engagementId: string, leadId: string, input: unknown) {
  const body = parse(profileLeadSchema, input);
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const lead = await tx.lead.findFirst({ where: { id: leadId, firmId: engagement.firmId } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.status !== 'NEW' && lead.status !== 'PROFILED') throw new ConflictException('Only a new or profiled lead can be re-profiled');
    const updated = await tx.lead.update({
      where: { id: leadId },
      data: { contactName: body.contactName, contactEmail: body.contactEmail, scope: body.scope, status: 'PROFILED' },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'LEAD_PROFILED', payload: { leadId } } });
    return { id: updated.id, status: updated.status, contactName: updated.contactName, scope: updated.scope };
  });
}

/** AC1: an incomplete profile cannot advance to proposal generation. */
export async function advanceLeadToProposal(actorId: string, engagementId: string, leadId: string) {
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const lead = await tx.lead.findFirst({ where: { id: leadId, firmId: engagement.firmId } });
    if (!lead) throw new NotFoundException('Lead not found');
    const missing: string[] = [];
    if (!lead.contactName?.trim()) missing.push('contactName');
    if (!lead.contactEmail?.trim()) missing.push('contactEmail');
    if (!lead.scope?.trim()) missing.push('scope');
    if (missing.length) throw new ConflictException(`The lead profile is incomplete; required fields missing: ${missing.join(', ')}`);
    if (lead.status === 'PROPOSAL_ENTRY') throw new ConflictException('The lead is already in proposal entry');
    if (lead.status !== 'PROFILED') throw new ConflictException('Profile the lead before advancing it to proposal generation');
    const updated = await tx.lead.update({ where: { id: leadId }, data: { status: 'PROPOSAL_ENTRY' } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'LEAD_ADVANCED_TO_PROPOSAL', payload: { leadId } } });
    return { id: updated.id, status: updated.status };
  });
}
