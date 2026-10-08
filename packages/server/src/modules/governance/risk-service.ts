import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { db } from '../../platform/db.js';
import { Decimal6 } from '../../platform/decimal6.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { withUnitOfWork, lockForUpdate, type UnitOfWork } from '../../platform/unit-of-work.js';
import { assessRiskSchema, assignRiskOwnerSchema, clearRiskSchema, createRiskSchema } from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';
import { minimumRiskOwnerRank, riskBand, riskBandRuleVersion } from './materiality.js';

/** Staffing ranks used for the band's minimum-owner rule. */
export const riskStaffingRanks: Record<string, number> = { StaffAssociate: 1, SeniorAuditor: 2, AuditManager: 3, EngagementPartner: 4 };

/**
 * Engagement risk register with an append-only band-assessment series and mandatory Partner
 * clearance of red bands. The band is always derived from the recorded inputs; the database
 * independently rejects a stored band that does not follow from them.
 *
 * The current assessment is the one with the greatest assessedAt. Ties (the same millisecond) are
 * broken by id, not by insertion order; a future sequence column would remove that ambiguity.
 */
const firmScope = (engagement: { firmId: string; clientId: string; id: string }): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

async function loadEngagement(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  return engagement;
}

const currentOrder = [{ assessedAt: 'desc' as const }, { id: 'desc' as const }];

export async function createRisk(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = createRiskSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'RISK_MANAGE', firmScope(engagement));
    const risk = await tx.riskItem.create({ data: { firmId: engagement.firmId, clientId: engagement.clientId, engagementId, title: parsed.data.title, description: parsed.data.description ?? null, createdBy: actorId } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'RISK_CREATED', payload: { riskId: risk.id, title: risk.title } } });
    return { riskId: risk.id, title: risk.title, currentBand: null, requiresPartnerClearance: false };
  });
}

export async function assessRiskBand(actorId: string, engagementId: string, riskId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = assessRiskSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'RISK_MANAGE', firmScope(engagement));
    const risk = await tx.riskItem.findFirst({ where: { id: riskId, engagementId } });
    if (!risk) throw new NotFoundException('Risk not found');
    // The colour is taken from the approved materiality and the published balance it was calculated from. A stale or invalidated materiality is refused, never reused.
    const materiality = await tx.materialityAssessment.findFirst({ where: { engagementId, status: 'APPROVED' }, orderBy: { calculatedAt: 'desc' }, include: { invalidation: true } });
    if (!materiality) throw new ConflictException('Approve materiality before assessing risk colours');
    if (materiality.invalidation) throw new ConflictException('The approved materiality is invalidated; recalculate and approve it first');
    const latestPublication = await tx.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } });
    if (!latestPublication || latestPublication.id !== materiality.publicationId) throw new ConflictException('The approved materiality is stale; recalculate and approve it against the current balances');
    const row = await tx.tbRow.findUnique({ where: { importId_code: { importId: latestPublication.importId, code: body.accountCode } } });
    if (!row) throw new NotFoundException('Account is not in the published trial balance');
    const balance = Decimal6.from(row.current.toFixed(6));
    const tolerableError = Decimal6.from(materiality.tolerableError.toFixed(6));
    const planningMateriality = Decimal6.from(materiality.planningMateriality.toFixed(6));
    const band = riskBand({ balance, tolerableError, planningMateriality }, body.significant, body.fraudRisk);
    const figures = { absoluteBalance: balance.abs().toFixed(6), tolerableError: tolerableError.toFixed(6), planningMateriality: planningMateriality.toFixed(6) };
    const assessment = await tx.riskBandAssessment.create({ data: { riskId, accountCode: body.accountCode, ...figures, materialityAssessmentId: materiality.id, significant: body.significant, fraudRisk: body.fraudRisk, band, ruleVersion: riskBandRuleVersion, assessedBy: actorId } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'RISK_BAND_ASSESSED', payload: { riskId, assessmentId: assessment.id, band, ruleVersion: riskBandRuleVersion, accountCode: body.accountCode, materialityAssessmentId: materiality.id, publicationId: latestPublication.id } } });
    return { assessmentId: assessment.id, riskId, band, accountCode: body.accountCode, ...figures, significant: body.significant, fraudRisk: body.fraudRisk, requiresPartnerClearance: band === 'RED', cleared: false, ruleVersion: riskBandRuleVersion };
  });
}

export async function clearRiskBand(actorId: string, engagementId: string, assessmentId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = clearRiskSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'RISK_PARTNER_CLEAR', firmScope(engagement));
    const assessment = await tx.riskBandAssessment.findUnique({ where: { id: assessmentId }, include: { risk: true } });
    if (!assessment || assessment.risk.engagementId !== engagementId) throw new NotFoundException('Risk band assessment not found');
    if (assessment.band !== 'RED') throw new ConflictException('Partner clearance applies only to a red band assessment');
    const current = await tx.riskBandAssessment.findFirst({ where: { riskId: assessment.riskId }, orderBy: currentOrder });
    if (current?.id !== assessmentId) throw new ConflictException('A newer band assessment supersedes this one; clear the current assessment');
    const existing = await tx.riskPartnerClearance.findUnique({ where: { assessmentId } });
    if (existing) throw new ConflictException('This band assessment is already cleared');
    const clearance = await tx.riskPartnerClearance.create({ data: { assessmentId, partnerId: actorId, note: parsed.data.note } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'RISK_BAND_CLEARED', payload: { riskId: assessment.riskId, assessmentId, clearanceId: clearance.id } } });
    return { clearanceId: clearance.id, assessmentId, riskId: assessment.riskId, band: assessment.band };
  });
}

/**
 * Assigns the response owner, constrained by the assessed band and by clearance of a red band.
 * A user cannot assign a risk to themselves, and an assignment always binds the current assessment.
 */
export async function assignRiskOwner(actorId: string, engagementId: string, riskId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = assignRiskOwnerSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'RISK_MANAGE', firmScope(engagement));
    const risk = await tx.riskItem.findFirst({ where: { id: riskId, engagementId } });
    if (!risk) throw new NotFoundException('Risk not found');
    const current = await tx.riskBandAssessment.findFirst({ where: { riskId }, orderBy: currentOrder });
    if (!current) throw new ConflictException('Assess the risk band before assigning an owner');
    if (body.ownerUserId === actorId) throw new ConflictException('A user cannot assign a risk to themselves');
    const ownerRank = riskStaffingRanks[body.ownerStaffingLevel];
    const requiredRank = minimumRiskOwnerRank(current.band);
    if (ownerRank < requiredRank) throw new ConflictException(`A ${current.band} risk needs an owner at rank ${requiredRank} or above`);
    if (current.band === 'RED') {
      const clearance = await tx.riskPartnerClearance.findUnique({ where: { assessmentId: current.id } });
      if (!clearance) throw new ConflictException('A red band must be cleared by a Partner before it is assigned');
    }
    const assignment = await tx.riskOwnerAssignment.create({ data: { riskId, assessmentId: current.id, ownerUserId: body.ownerUserId, ownerStaffingLevel: body.ownerStaffingLevel, assignedBy: actorId } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'RISK_OWNER_ASSIGNED', payload: { riskId, assessmentId: current.id, band: current.band, ownerUserId: body.ownerUserId, ownerStaffingLevel: body.ownerStaffingLevel, assignmentId: assignment.id } } });
    return { assignmentId: assignment.id, riskId, assessmentId: current.id, band: current.band, ownerUserId: body.ownerUserId, ownerStaffingLevel: body.ownerStaffingLevel };
  });
}

export async function currentRisks(engagementId: string, page: PaginationQuery = { offset: 0, limit: 50 }) {
  await loadEngagement(engagementId);
  const risks = await db.riskItem.findMany({ where: { engagementId }, orderBy: { createdAt: 'asc' }, skip: page.offset, take: page.limit, include: {
    assessments: { orderBy: currentOrder, include: { clearances: true } },
    assignments: { orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }] },
  } });
  return risks.map((risk) => {
    const current = risk.assessments[0] ?? null;
    const owner = risk.assignments[0] ?? null;
    return {
      riskId: risk.id, title: risk.title, description: risk.description, createdAt: risk.createdAt,
      currentBand: current?.band ?? null, currentAssessmentId: current?.id ?? null,
      requiresPartnerClearance: current?.band === 'RED', cleared: Boolean(current?.clearances.length),
      assessmentCount: risk.assessments.length,
      owner: owner && owner.assessmentId === current?.id ? { ownerUserId: owner.ownerUserId, ownerStaffingLevel: owner.ownerStaffingLevel, assignedAt: owner.assignedAt } : null,
    };
  });
}
