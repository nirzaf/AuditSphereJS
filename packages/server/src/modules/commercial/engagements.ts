import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { createEngagementSchema } from '@auditsphere/contracts';
import { dualKeyStatus, loadEngagement } from './proposals.js';

/**
 * T055: engagement identity and reusable lifecycle queries. The identity view distinguishes
 * commercial, planning and fieldwork readiness from the same authoritative evidence the
 * lifecycle kernel uses, and every lookup is composite-scoped so a foreign engagement
 * identifier can never be substituted.
 */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return parsed.data;
}
type EngagementRow = { firmId: string; clientId: string; id: string };
const scopeOf = (engagement: EngagementRow): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

export async function createEngagement(actorId: string, actingEngagementId: string, input: unknown) {
  const body = parse(createEngagementSchema, input);
  const acting = await loadEngagement(db, actingEngagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(acting));
    const client = await tx.client.findFirst({ where: { id: body.clientId, firmId: acting.firmId } });
    if (!client) throw new NotFoundException('Client not found in this firm');
    // Explicit duplicate policy (T055 AC2): one active engagement per client, service and
    // period. A second one must be a deliberate, separately justified record.
    const duplicate = await tx.engagement.findFirst({
      where: { firmId: acting.firmId, clientId: body.clientId, name: body.name, period: body.period },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException(`An engagement already exists for this client with the same name and period (engagement ${duplicate.id}); extend or reopen it instead of creating a duplicate`);
    const created = await tx.engagement.create({ data: { firmId: acting.firmId, clientId: body.clientId, name: body.name, period: body.period, currency: 'QAR' } });
    await tx.auditEvent.create({ data: { engagementId: actingEngagementId, actorId, action: 'ENGAGEMENT_CREATED', payload: { engagementId: created.id, clientId: body.clientId, service: body.service, period: body.period } } });
    return { id: created.id, name: created.name, state: created.state, service: body.service, period: body.period };
  });
}

export async function engagementIdentity(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId }, include: { client: { select: { name: true, legalName: true, status: true } } } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  const [letter, invoices, finalized, publication, assessment] = await Promise.all([
    db.engagementLetterRecord.findUnique({ where: { engagementId } }),
    db.engagementInvoice.findFirst({ where: { engagementId, status: { in: ['ISSUED', 'PAID'] } } }),
    db.tbImport.count({ where: { engagementId, status: 'FINALIZED' } }),
    db.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } }),
    db.materialityAssessment.findFirst({ where: { engagementId, status: 'APPROVED' }, orderBy: { calculatedAt: 'desc' } }),
  ]);
  const dualKey = await dualKeyStatus(engagementId);
  const commercialReady = dualKey.key1Status === 'RECORDED' && dualKey.key2Status === 'RECORDED' && dualKey.letterIssued;
  const planningReady = finalized > 0 && !!publication && !!assessment && assessment.publicationId === publication.id;
  return {
    engagement: { id: engagement.id, name: engagement.name, state: engagement.state, version: engagement.version, service: (engagement as unknown as { service?: string }).service ?? null },
    client: { id: engagement.clientId, name: engagement.client.name, legalName: engagement.client.legalName, status: engagement.client.status },
    readiness: {
      commercial: { ready: commercialReady, letterIssued: dualKey.letterIssued, key1: dualKey.key1Status, key2: dualKey.key2Status, advanceInvoiced: Boolean(invoices) },
      planning: { ready: planningReady, finalizedImports: finalized, published: Boolean(publication), approvedMateriality: Boolean(assessment), staleMateriality: Boolean(assessment && publication && assessment.publicationId !== publication.id) },
      fieldwork: { ready: engagement.state === 'FIELDWORK_EXECUTION' || ['MANAGERIAL_REVIEW', 'PARTNER_APPROVAL', 'DELIVERABLE_RELEASE'].includes(engagement.state) },
    },
  };
}
