import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { raiseReviewNoteSchema, resolveReviewNoteSchema } from '@auditsphere/contracts';
import { runUnitOfWork, lockForUpdate, type TransactionClient } from '../../platform/unit-of-work.js';

/**
 * Anchored review notes (C26).
 *
 * Review authority is grant-based: raising needs `REVIEW_RAISE`, resolving needs `REVIEW_RESOLVE`.
 * A note always names the workpackage it is anchored to, and the person who raised a note can never
 * resolve it — the database enforces that as well. A resolved note is frozen and never deleted.
 */
const firmScope = (engagement: { firmId: string; clientId: string; id: string }): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });
const reviewStatuses = ['OPEN', 'RESOLVED'];
const editableReviewStates = ['PORTAL_ACTIVE_PLANNING', 'FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW', 'PARTNER_APPROVAL'];

async function authorizeReviewWrite(tx: TransactionClient, actorId: string, engagementId: string, capability: 'REVIEW_RAISE' | 'REVIEW_RESOLVE') {
  await lockForUpdate(tx, 'Engagement', engagementId);
  const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  await requireCapability(tx, actorId, capability, firmScope(engagement));
  if (!editableReviewStates.includes(engagement.state)) throw new ConflictException('Review notes cannot change outside planning, fieldwork or review');
  return engagement;
}

async function loadEngagement(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  return engagement;
}

export async function raiseReviewNote(actorId: string, engagementId: string, input: unknown) {
  const parsed = raiseReviewNoteSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  return runUnitOfWork(async ({ client: tx }) => {
    const engagement = await authorizeReviewWrite(tx, actorId, engagementId, 'REVIEW_RAISE');
    const note = await tx.reviewNote.create({ data: { firmId: engagement.firmId, clientId: engagement.clientId, engagementId, workpackage: parsed.data.workpackage, body: parsed.data.body, raisedBy: actorId } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'REVIEW_NOTE_RAISED', payload: { noteId: note.id, workpackage: note.workpackage } } });
    return { noteId: note.id, status: note.status, workpackage: note.workpackage, raisedBy: actorId, raisedAt: note.raisedAt };
  });
}

export async function resolveReviewNote(actorId: string, engagementId: string, noteId: string, input: unknown) {
  const parsed = resolveReviewNoteSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  return runUnitOfWork(async ({ client: tx }) => {
    const engagement = await authorizeReviewWrite(tx, actorId, engagementId, 'REVIEW_RESOLVE');
    const note = await tx.reviewNote.findFirst({ where: { id: noteId, engagementId, firmId: engagement.firmId, clientId: engagement.clientId } });
    if (!note) throw new NotFoundException('Review note not found');
    if (note.status !== 'OPEN') throw new ConflictException('Only an open review note can be resolved');
    if (note.raisedBy === actorId) throw new ForbiddenException('A reviewer cannot resolve their own review note');
    const changed = await tx.reviewNote.updateMany({ where: { id: noteId, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedBy: actorId, resolution: parsed.data.resolution, resolvedAt: new Date() } });
    if (changed.count !== 1) throw new ConflictException('Review note changed; reload before resolving');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'REVIEW_NOTE_RESOLVED', payload: { noteId, workpackage: note.workpackage } } });
    return { noteId, status: 'RESOLVED', resolvedBy: actorId, workpackage: note.workpackage };
  });
}

export async function listReviewNotes(engagementId: string, options: { status?: string } = {}) {
  await loadEngagement(engagementId);
  if (options.status && !reviewStatuses.includes(options.status)) throw new BadRequestException('Unknown status filter');
  return db.reviewNote.findMany({ where: { engagementId, ...(options.status ? { status: options.status } : {}) }, orderBy: { raisedAt: 'asc' } });
}

export async function reviewSummary(engagementId: string) {
  await loadEngagement(engagementId);
  const [open, resolved] = await Promise.all([
    db.reviewNote.count({ where: { engagementId, status: 'OPEN' } }),
    db.reviewNote.count({ where: { engagementId, status: 'RESOLVED' } }),
  ]);
  return { engagementId, open, resolved, total: open + resolved };
}
