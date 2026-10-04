import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { acceptanceTemplates, clearAcceptanceCaseSchema, createAcceptanceCaseSchema, recordAcceptanceAnswerSchema } from '@auditsphere/contracts';
import { loadEngagement } from './proposals.js';

/**
 * T056-T059: the acceptance/continuance questionnaire feeding the dual-key gate's Key 2.
 * A case pins the exact template version it answers; completing the review requires every
 * required answer (with evidence where the template demands it); the Partner clearance cites
 * the reviewed version; and any post-clearance edit bumps the review version so a stale
 * approval can never satisfy the gate. The completer can never self-clear (T057 AC2).
 */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return parsed.data;
}
type EngagementRow = { firmId: string; clientId: string; id: string };
const scopeOf = (engagement: EngagementRow): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

export async function createAcceptanceCase(actorId: string, engagementId: string, input: unknown) {
  const body = parse(createAcceptanceCaseSchema, input);
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const existing = await tx.acceptanceCase.findUnique({ where: { engagementId } });
    if (existing) throw new ConflictException('An acceptance case already exists for this engagement');
    const created = await tx.acceptanceCase.create({
      data: {
        firmId: engagement.firmId, clientId: engagement.clientId, engagementId,
        track: body.track, templateVersion: acceptanceTemplates[body.track].version,
      },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'ACCEPTANCE_CASE_CREATED', payload: { caseId: created.id, track: body.track, templateVersion: created.templateVersion } } });
    return { id: created.id, track: created.track, templateVersion: created.templateVersion, status: created.status };
  });
}

export async function recordAcceptanceAnswer(actorId: string, engagementId: string, input: unknown) {
  const body = parse(recordAcceptanceAnswerSchema, input);
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const acceptanceCase = await tx.acceptanceCase.findUnique({ where: { engagementId } });
    if (!acceptanceCase) throw new NotFoundException('No acceptance case exists for this engagement');
    const template = acceptanceTemplates[acceptanceCase.track as keyof typeof acceptanceTemplates];
    if (template.version !== acceptanceCase.templateVersion || !template.required.some(question => question.id === body.questionId)) {
      throw new BadRequestException(`questionId: '${body.questionId}' is not part of template ${acceptanceCase.templateVersion}`);
    }
    const answers = { ...(acceptanceCase.answers as Record<string, { answer: string; evidenceRef?: string }>), [body.questionId]: { answer: body.answer, evidenceRef: body.evidenceRef } };
    const wasCleared = acceptanceCase.status === 'CLEARED';
    const updated = await tx.acceptanceCase.update({
      where: { engagementId },
      data: {
        answers,
        status: 'REVIEW_COMPLETE',
        reviewVersion: wasCleared ? acceptanceCase.reviewVersion + 1 : acceptanceCase.reviewVersion,
        clearedBy: null, clearedAt: null,
      },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: wasCleared ? 'ACCEPTANCE_ANSWER_RECORDED_REVIEW_VERSION_BUMPED' : 'ACCEPTANCE_ANSWER_RECORDED', payload: { caseId: acceptanceCase.id, questionId: body.questionId, reviewVersion: updated.reviewVersion } } });
    return { id: updated.id, status: updated.status, reviewVersion: updated.reviewVersion };
  });
}

export async function completeAcceptanceReview(actorId: string, engagementId: string) {
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'COMMERCIAL_MANAGE', scopeOf(engagement));
    const acceptanceCase = await tx.acceptanceCase.findUnique({ where: { engagementId } });
    if (!acceptanceCase) throw new NotFoundException('No acceptance case exists for this engagement');
    const template = acceptanceTemplates[acceptanceCase.track as keyof typeof acceptanceTemplates];
    const answers = acceptanceCase.answers as Record<string, { answer: string; evidenceRef?: string }>;
    const missing = template.required
      .filter(question => {
        const answer = answers[question.id];
        return !answer?.answer || (question.evidenceRequired && !answer.evidenceRef);
      })
      .map(question => question.id);
    if (missing.length) throw new ConflictException(`Required answers are missing: ${missing.join(', ')}`);
    const updated = await tx.acceptanceCase.update({
      where: { engagementId },
      data: { status: 'REVIEW_COMPLETE', completedBy: actorId, completedAt: new Date() },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'ACCEPTANCE_REVIEW_COMPLETE', payload: { caseId: acceptanceCase.id, reviewVersion: updated.reviewVersion } } });
    return { id: updated.id, status: updated.status, reviewVersion: updated.reviewVersion };
  });
}

/** T059: the Partner clearance that the dual-key gate's Key 2 reads. */
export async function clearAcceptanceCase(actorId: string, engagementId: string, input: unknown) {
  const body = parse(clearAcceptanceCaseSchema, input);
  const engagement = await loadEngagement(db, engagementId);
  return db.$transaction(async tx => {
    await requireCapability(tx, actorId, 'RISK_PARTNER_CLEAR', scopeOf(engagement));
    const acceptanceCase = await tx.acceptanceCase.findUnique({ where: { engagementId } });
    if (!acceptanceCase) throw new NotFoundException('No acceptance case exists for this engagement');
    if (acceptanceCase.status !== 'REVIEW_COMPLETE') throw new ConflictException('The acceptance review must be complete before Partner clearance');
    if (acceptanceCase.completedBy === actorId) throw new ConflictException('The preparer of the acceptance review cannot self-clear it');
    const clearance = await tx.riskClearance.create({
      data: {
        firmId: engagement.firmId, clientId: engagement.clientId, engagementId,
        reason: body.reason, clearedBy: actorId,
        acceptanceCaseId: acceptanceCase.id, reviewVersion: acceptanceCase.reviewVersion,
      },
    });
    const updated = await tx.acceptanceCase.update({
      where: { engagementId },
      data: { status: 'CLEARED', clearedBy: actorId, clearedAt: new Date() },
    });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'ACCEPTANCE_CASE_CLEARED', payload: { caseId: acceptanceCase.id, clearanceId: clearance.id, reviewVersion: acceptanceCase.reviewVersion } } });
    return { id: updated.id, status: updated.status, reviewVersion: updated.reviewVersion, clearanceId: clearance.id };
  });
}
