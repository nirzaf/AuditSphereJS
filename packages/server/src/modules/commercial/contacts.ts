import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { createContactSchema, documentCategoryRole, type documentCategories } from '@auditsphere/contracts';
import { loadEngagement } from './proposals.js';

/**
 * T053: multiple contacts per entity with MD/GM, CFO/FD and audit-liaison routing roles.
 * Document categories map to exactly one contact role; dispatch resolution refuses when the
 * mandatory recipient role has no primary contact instead of falling back to any email.
 */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return parsed.data;
}
type EngagementRow = { firmId: string; clientId: string; id: string };
const scopeOf = (engagement: EngagementRow): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

export async function addContact(actorId: string, engagementId: string, input: unknown) {
  const body = parse(createContactSchema, input);
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const client = await tx.client.findFirst({ where: { id: body.clientId, firmId: engagement.firmId } });
    if (!client) throw new NotFoundException('Client not found in this firm');
    if (body.isPrimary) {
      const existing = await tx.clientContact.findFirst({ where: { clientId: body.clientId, role: body.role, isPrimary: true } });
      if (existing) throw new ConflictException(`A primary ${body.role} contact already exists for this client; demote it first`);
    }
    const contact = await tx.clientContact.create({
      data: { firmId: engagement.firmId, clientId: body.clientId, name: body.name, email: body.email, role: body.role, isPrimary: body.isPrimary, createdBy: actorId },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'CLIENT_CONTACT_ADDED', payload: { contactId: contact.id, clientId: body.clientId, role: body.role, isPrimary: body.isPrimary } } });
    return { id: contact.id, clientId: contact.clientId, name: contact.name, role: contact.role, isPrimary: contact.isPrimary };
  });
}

export async function listContacts(engagementId: string) {
  const engagement = await loadEngagement(db, engagementId);
  const contacts = await db.clientContact.findMany({
    where: { firmId: engagement.firmId }, orderBy: { createdAt: 'asc' },
    select: { id: true, clientId: true, name: true, email: true, role: true, isPrimary: true, createdAt: true },
  });
  return contacts.map(contact => ({ ...contact, createdAt: contact.createdAt.toISOString() }));
}

export type ContactSnapshot = { contactId: string; clientId: string; name: string; email: string; role: string; resolvedAt: string };

/**
 * Resolves the primary recipient snapshot for a document category. The returned snapshot is
 * the value outbound records should persist: later contact edits never rewrite a snapshot
 * that was already captured for a dispatch.
 */
export async function resolveRecipient(engagementId: string, category: (typeof documentCategories)[number]): Promise<ContactSnapshot> {
  const engagement = await loadEngagement(db, engagementId);
  const role = documentCategoryRole[category];
  const contact = await db.clientContact.findFirst({
    where: { firmId: engagement.firmId, clientId: engagement.clientId, role, isPrimary: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!contact) {
    throw new ConflictException(`Dispatch blocked: no primary ${role} contact is configured for this client (category ${category})`);
  }
  return { contactId: contact.id, clientId: contact.clientId, name: contact.name, email: contact.email, role: contact.role, resolvedAt: new Date().toISOString() };
}
