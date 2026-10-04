import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { createClientSchema, setClientParentSchema, updateClientProfileSchema } from '@auditsphere/contracts';
import { loadEngagement } from './proposals.js';

/**
 * T052: scoped client legal profiles and the organizational hierarchy. Similar legal names
 * never merge clients implicitly — every client is a distinct row. Profile edits never rewrite
 * issued-letter snapshots: the letter pins the client name at issuance and is immutable.
 */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return parsed.data;
}
type EngagementRow = { firmId: string; clientId: string; id: string };
const scopeOf = (engagement: EngagementRow): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

export async function createClient(actorId: string, engagementId: string, input: unknown) {
  const body = parse(createClientSchema, input);
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const client = await tx.client.create({
      data: {
        firmId: engagement.firmId,
        name: body.name,
        legalName: body.legalName ?? body.name,
        taxId: body.taxId ?? null,
        legalForm: body.legalForm ?? null,
        address: body.address ?? null,
        parentClientId: body.parentClientId ?? null,
      },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'CLIENT_CREATED', payload: { clientId: client.id, name: client.name, parentClientId: client.parentClientId } } });
    return { id: client.id, name: client.name, legalName: client.legalName, status: client.status, parentClientId: client.parentClientId };
  });
}

export async function updateClientProfile(actorId: string, engagementId: string, clientId: string, input: unknown) {
  const body = parse(updateClientProfileSchema, input);
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const client = await tx.client.findFirst({ where: { id: clientId, firmId: engagement.firmId } });
    if (!client) throw new NotFoundException('Client not found');
    if (!Object.keys(body).some(key => key !== 'idempotencyKey' && body[key as keyof typeof body] !== undefined)) {
      throw new BadRequestException('At least one profile field is required');
    }
    const updated = await tx.client.update({
      where: { id: clientId },
      data: {
        legalName: body.legalName ?? undefined,
        taxId: body.taxId ?? undefined,
        legalForm: body.legalForm ?? undefined,
        address: body.address ?? undefined,
        status: body.status ?? undefined,
      },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'CLIENT_PROFILE_UPDATED', payload: { clientId, fields: Object.keys(body).filter(k => k !== 'idempotencyKey') } } });
    return { id: updated.id, legalName: updated.legalName, taxId: updated.taxId, legalForm: updated.legalForm, address: updated.address, status: updated.status };
  });
}


export async function setClientParent(actorId: string, engagementId: string, clientId: string, input: unknown) {
  const body = parse(setClientParentSchema, input);
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const client = await tx.client.findFirst({ where: { id: clientId, firmId: engagement.firmId } });
    if (!client) throw new NotFoundException('Client not found');
    if (body.parentClientId) {
      const parent = await tx.client.findFirst({ where: { id: body.parentClientId, firmId: engagement.firmId } });
      if (!parent) throw new NotFoundException('Parent client not found in this firm');
      // Walk up from the proposed parent following parentClientId links; the walk is bounded
      // so a pre-existing cycle cannot loop forever either.
      let cursor: string | null = parent.id;
      for (let depth = 0; cursor && depth < 100; depth += 1) {
        if (cursor === clientId) throw new ConflictException('Setting this parent would create an organizational cycle');
        const row: { parentClientId: string | null } | null = await tx.client.findUnique({ where: { id: cursor }, select: { parentClientId: true } });
        cursor = row?.parentClientId ?? null;
      }
    }
    const updated = await tx.client.update({ where: { id: clientId }, data: { parentClientId: body.parentClientId } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'CLIENT_PARENT_SET', payload: { clientId, parentClientId: body.parentClientId } } });
    return { id: updated.id, parentClientId: updated.parentClientId };
  });
}

export async function listClientDirectory(engagementId: string) {
  const engagement = await loadEngagement(db, engagementId);
  return db.client.findMany({
    where: { firmId: engagement.firmId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, legalName: true, taxId: true, legalForm: true, address: true, status: true, parentClientId: true, contacts: true },
  });
}
