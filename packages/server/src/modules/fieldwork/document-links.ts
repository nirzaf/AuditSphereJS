import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { documentLinkCreateSchema, documentLinkRevokeSchema } from '@auditsphere/contracts';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { lockForUpdate, withUnitOfWork, type UnitOfWork } from '../../platform/unit-of-work.js';

const hashOf = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scopeOf = (value: { id: string; firmId: string; clientId: string }): Scope => ({ firmId: value.firmId, clientId: value.clientId, engagementId: value.id });
const EDITABLE_STATES = new Set(['FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW']);

async function engagementFor(tx: UnitOfWork['client'], engagementId: string) {
  const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  return engagement;
}

function sameReceipt(receipt: { hash: string; actorId: string; engagementId: string; result: unknown }, hash: string, actorId: string, engagementId: string) {
  if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
  return receipt.result;
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } };
  return candidate?.code === 'P2002' || candidate?.meta?.driverAdapterError?.cause?.originalCode === '23505' || /unique constraint|duplicate key/i.test(candidate?.message ?? '');
}

export async function listDocumentLinks(engagementId: string, actorId: string, targetImportId?: string) {
  const engagement = await engagementFor(db, engagementId);
  await requireCapability(db, actorId, 'ENGAGEMENT_READ', scopeOf(engagement));
  const links = await db.documentLink.findMany({
    where: { engagementId, ...(targetImportId ? { targetType: 'TRIAL_BALANCE_IMPORT', targetImportId } : {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1000,
    include: { document: { select: { id: true, filename: true, category: true } }, documentVersion: { select: { sha256: true, sizeBytes: true, sequence: true } } },
  });
  return links.map(({ documentVersion, ...link }) => ({
    id: link.id, version: link.version, targetType: link.targetType as 'ENGAGEMENT' | 'TRIAL_BALANCE_IMPORT',
    targetImportId: link.targetImportId, label: link.label, createdAt: link.createdAt.toISOString(),
    revokedAt: link.revokedAt?.toISOString() ?? null, revokeReason: link.revokeReason,
    document: { ...link.document, sha256: documentVersion.sha256, sizeBytes: documentVersion.sizeBytes, sequence: documentVersion.sequence },
  }));
}

export async function linkDocument(engagementId: string, actorId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = documentLinkCreateSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const hash = hashOf({ action: 'DOCUMENT_LINK', engagementId, body });
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) return sameReceipt(receipt, hash, actorId, engagementId);
    const engagement = await engagementFor(tx, engagementId);
    await requireCapability(tx, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
    if (!EDITABLE_STATES.has(engagement.state)) throw new ConflictException('Engagement does not permit evidence-link changes in its current state');
    const document = await tx.document.findFirst({ where: { id: body.documentId, engagementId }, select: { id: true } });
    if (!document) throw new NotFoundException('Document not found');
    const version = await tx.documentVersion.findFirst({ where: { id: body.documentVersionId, documentId: body.documentId, engagementId }, select: { id: true } });
    if (!version) throw new NotFoundException('Document version not found');
    if (body.targetType === 'TRIAL_BALANCE_IMPORT') {
      const target = await tx.tbImport.findFirst({ where: { id: body.targetImportId, engagementId }, select: { id: true } });
      if (!target) throw new NotFoundException('Trial Balance import not found');
    }
    let link: { id: string; version: number };
    try {
      link = await tx.documentLink.create({ data: {
        engagementId, documentId: body.documentId, documentVersionId: body.documentVersionId,
        targetType: body.targetType, targetImportId: body.targetImportId ?? null, label: body.label, createdBy: actorId,
      }, select: { id: true, version: true } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('This document version is already linked to that target');
      throw error;
    }
    const result = { id: link.id, version: link.version, created: true };
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'DOCUMENT_LINKED', resourceType: 'DocumentLink', resourceId: link.id, resourceVersion: link.version, payload: { documentId: body.documentId, documentVersionId: body.documentVersionId, targetType: body.targetType, targetImportId: body.targetImportId ?? null } } });
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function revokeDocumentLink(engagementId: string, linkId: string, actorId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = documentLinkRevokeSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const hash = hashOf({ action: 'DOCUMENT_LINK_REVOKE', engagementId, linkId, body });
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) return sameReceipt(receipt, hash, actorId, engagementId);
    const engagement = await engagementFor(tx, engagementId);
    await requireCapability(tx, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
    if (!EDITABLE_STATES.has(engagement.state)) throw new ConflictException('Engagement does not permit evidence-link changes in its current state');
    const link = await tx.documentLink.findFirst({ where: { id: linkId, engagementId } });
    if (!link) throw new NotFoundException('Document link not found');
    if (link.revokedAt) throw new ConflictException('Document link is already revoked');
    if (link.version !== body.expectedVersion) throw new ConflictException('Document link changed; reload before revoking');
    const changed = await tx.documentLink.updateMany({ where: { id: link.id, engagementId, version: body.expectedVersion, revokedAt: null }, data: { version: { increment: 1 }, revokedAt: new Date(), revokedBy: actorId, revokeReason: body.reason } });
    if (changed.count !== 1) throw new ConflictException('Document link changed; reload before revoking');
    const result = { id: link.id, version: body.expectedVersion + 1, revoked: true as const };
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'DOCUMENT_LINK_REVOKED', resourceType: 'DocumentLink', resourceId: link.id, resourceVersion: result.version, payload: { reason: body.reason } } });
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}
