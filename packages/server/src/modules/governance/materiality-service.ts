import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { db } from '../../platform/db.js';
import { Decimal6 } from '../../platform/decimal6.js';
import { hasCapability, requireCapability, type Scope } from '../../platform/authorization.js';
import { withUnitOfWork, type UnitOfWork } from '../../platform/unit-of-work.js';
import { calculateMaterialitySchema, approveMaterialitySchema } from '@auditsphere/contracts';
import type { PaginationQuery } from '@auditsphere/contracts';
import { calculateMateriality, deriveBenchmark, materialityInputHash, materialityPolicyVersion, roundingPolicyMessage, validateMateriality, type MappedBenchmarkLine, type NormalizationAdjustment } from './materiality.js';

/**
 * Persisted planning materiality bound to an exact published accounting version and taxonomy.
 *
 * The calculator is pure; this records its inputs and result so an approval binds a version, a new
 * accepted balance version makes a prior assessment stale, and the calculator cannot approve their
 * own assessment (segregation of duties).
 */
const digestOf = (value: string) => createHash('sha256').update(value).digest('hex');
const firmScope = (engagement: { firmId: string; clientId: string; id: string }): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

/** Builds the benchmark lines from one published version using the taxonomy recorded at publication. */
async function publishedBenchmarkLines(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], publicationId: string, mappingApprovalId: string | null) {
  if (!mappingApprovalId) throw new ConflictException('This published version does not record the mapping approval it bound');
  const approval = await tx.mappingApproval.findUnique({ where: { id: mappingApprovalId }, include: { taxonomyVersion: { include: { lines: true } } } });
  if (!approval) throw new ConflictException('The recorded mapping approval is missing');
  const sections = new Map(approval.taxonomyVersion.lines.map((line) => [line.code, line.statementSection]));
  const rows = await tx.publishedBalanceRow.findMany({ where: { publicationId }, orderBy: { position: 'asc' } });
  const lines: MappedBenchmarkLine[] = rows.map((row) => {
    const statementSection = sections.get(row.fsli);
    if (!statementSection) throw new ConflictException(`Published line '${row.fsli}' is not in ${approval.taxonomyVersion.name} v${approval.taxonomyVersion.version}`);
    return { sourceAccountCode: row.code, destinationCode: row.fsli, statementSection, amount: Decimal6.from(row.current.toString()) };
  });
  return { approval, lines };
}

export async function calculateMaterialityAssessment(actorId: string, engagementId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = calculateMaterialitySchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const hash = digestOf(JSON.stringify({ engagementId, body }));
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'MATERIALITY_MANAGE', firmScope(engagement));
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    const publication = await tx.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } });
    if (!publication) throw new ConflictException('Publish an accepted balance version before calculating materiality');
    // D18: a superseded version cannot carry a new assessment.
    const source = await tx.tbImport.findUnique({ where: { id: publication.importId }, select: { status: true } });
    if (source?.status === 'SUPERSEDED') throw new ConflictException('The latest balance version was superseded; publish the active trial balance before calculating materiality');
    const { approval, lines } = await publishedBenchmarkLines(tx, publication.id, publication.mappingApprovalId);
    const ratePercent = Decimal6.from(body.ratePercent);
    const performancePercent = Decimal6.from(body.performancePercent);
    const trivialPercent = Decimal6.from(body.trivialPercent);
    const policyMessage = validateMateriality(body.benchmarkKind, ratePercent, performancePercent, trivialPercent);
    if (policyMessage) throw new BadRequestException(policyMessage);
    // D19: normalization is recorded per adjustment, for profit before tax only, and approved by someone other than the calculator.
    const adjustments = body.normalizationAdjustments ?? [];
    if (adjustments.length > 0 && body.benchmarkKind !== 'PROFIT_BEFORE_TAX') throw new BadRequestException('Only profit before tax can be normalized');
    for (const adjustment of adjustments) {
      if (adjustment.approvedBy === actorId) throw new ForbiddenException(`The calculator cannot approve the adjustment "${adjustment.description}"`);
      if (!(await hasCapability(tx, adjustment.approvedBy, 'MATERIALITY_APPROVE', firmScope(engagement)))) {
        throw new BadRequestException(`The approver of "${adjustment.description}" does not hold materiality approval authority on this engagement`);
      }
    }
    const normalization: Array<NormalizationAdjustment & { reason: string; approvedBy: string }> = adjustments.map((adjustment) => ({
      description: adjustment.description, amount: Decimal6.from(adjustment.amount), reason: adjustment.reason, approvedBy: adjustment.approvedBy,
    }));
    const derived = deriveBenchmark(body.benchmarkKind, lines, normalization);
    if (!derived) throw new ConflictException('The requested benchmark is not available from the published balances');
    if (!derived.amount.isPositive()) throw new BadRequestException('The benchmark is not positive after normalization; a loss benchmark fails closed');
    const roundedPlanningMateriality = body.roundedPlanningMateriality ? Decimal6.from(body.roundedPlanningMateriality) : undefined;
    if (roundedPlanningMateriality) {
      const problem = roundingPolicyMessage(Decimal6.percentOf(derived.amount, ratePercent), roundedPlanningMateriality);
      if (problem) throw new BadRequestException(problem);
    }
    const figures = calculateMateriality(derived.amount, derived.lineCount, ratePercent, performancePercent, trivialPercent, roundedPlanningMateriality);
    const inputHash = materialityInputHash({
      mappingVersionId: approval.taxonomyVersionId, datasetDigest: publication.digest, kind: body.benchmarkKind,
      benchmarkAmount: figures.benchmarkAmount, normalization, rawPlanningMateriality: figures.rawPlanningMateriality,
      planningMateriality: figures.planningMateriality, ratePercent, performancePercent, trivialPercent,
    });
    const assessment = await tx.materialityAssessment.create({ data: {
      firmId: engagement.firmId, clientId: engagement.clientId, engagementId,
      publicationId: publication.id, taxonomyVersionId: approval.taxonomyVersionId,
      benchmarkKind: body.benchmarkKind, destinationCode: null, sourceLineCount: figures.sourceLineCount, currency: publication.currency,
      benchmarkAmount: figures.benchmarkAmount.toFixed(6), rawPlanningMateriality: figures.rawPlanningMateriality.toFixed(6),
      planningMateriality: figures.planningMateriality.toFixed(6),
      tolerableError: figures.tolerableError.toFixed(6), sadThreshold: figures.sadThreshold.toFixed(6),
      ratePercent: ratePercent.toFixed(6), performancePercent: performancePercent.toFixed(6), trivialPercent: trivialPercent.toFixed(6),
      policyVersion: materialityPolicyVersion, inputHash, calculatedBy: actorId,
      ...(normalization.length > 0 ? { normalizationAdjustments: normalization.map((adjustment) => ({ description: adjustment.description, amount: adjustment.amount.toFixed(6), reason: adjustment.reason, approvedBy: adjustment.approvedBy })) } : {}),
    } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'MATERIALITY_CALCULATED', payload: { assessmentId: assessment.id, benchmarkKind: body.benchmarkKind, publicationId: publication.id, inputHash } } });
    const result = {
      assessmentId: assessment.id, status: 'DRAFT', benchmarkKind: body.benchmarkKind, currency: publication.currency,
      benchmarkAmount: figures.benchmarkAmount.toFixed(6), rawPlanningMateriality: figures.rawPlanningMateriality.toFixed(6),
      planningMateriality: figures.planningMateriality.toFixed(6),
      tolerableError: figures.tolerableError.toFixed(6), sadThreshold: figures.sadThreshold.toFixed(6),
      inputHash, publicationId: publication.id, publicationSequence: publication.sequence,
    };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function approveMaterialityAssessment(actorId: string, engagementId: string, assessmentId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const parsed = approveMaterialitySchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const hash = digestOf(JSON.stringify({ engagementId, assessmentId, body }));
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'MATERIALITY_APPROVE', firmScope(engagement));
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    const assessment = await tx.materialityAssessment.findFirst({ where: { id: assessmentId, engagementId } });
    if (!assessment) throw new NotFoundException('Materiality assessment not found');
    if (assessment.status !== 'DRAFT') throw new ConflictException('Only a draft materiality assessment can be approved');
    if (assessment.calculatedBy === actorId) throw new ForbiddenException('The calculator cannot approve their own materiality assessment');
    const latest = await tx.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } });
    if (!latest || latest.id !== assessment.publicationId) throw new ConflictException('A newer accepted balance version exists; recalculate materiality before approving');
    const cited = await tx.tbImport.findUnique({ where: { id: latest.importId }, select: { status: true } });
    if (cited?.status === 'SUPERSEDED') throw new ConflictException('The balance version this assessment cites was superseded; recalculate on the active version');
    const changed = await tx.materialityAssessment.updateMany({ where: { id: assessmentId, status: 'DRAFT' }, data: { status: 'APPROVED', approvedBy: actorId, approvedAt: new Date() } });
    if (changed.count !== 1) throw new ConflictException('Materiality assessment changed; reload before approving');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'MATERIALITY_APPROVED', payload: { assessmentId, publicationId: assessment.publicationId, inputHash: assessment.inputHash } } });
    const result = { assessmentId, status: 'APPROVED', publicationId: assessment.publicationId, inputHash: assessment.inputHash };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function latestMaterialityAssessment(engagementId: string) {
  const assessment = await db.materialityAssessment.findFirst({ where: { engagementId }, orderBy: { calculatedAt: 'desc' }, include: { invalidation: { select: { id: true } } } });
  if (!assessment) throw new NotFoundException('No materiality assessment has been calculated for this engagement');
  const latest = await db.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } });
  const decimal = (value: { toFixed: (n: number) => string }) => value.toFixed(6);
  return {
    ...assessment,
    benchmarkAmount: decimal(assessment.benchmarkAmount), planningMateriality: decimal(assessment.planningMateriality),
    tolerableError: decimal(assessment.tolerableError), sadThreshold: decimal(assessment.sadThreshold),
    stale: !latest || latest.id !== assessment.publicationId,
    invalidated: assessment.invalidation !== null,
    currentPublicationId: latest?.id ?? null,
  };
}

export async function listMaterialityAssessments(engagementId: string, page: PaginationQuery = { offset: 0, limit: 50 }) {
  const assessments = await db.materialityAssessment.findMany({ where: { engagementId }, orderBy: { calculatedAt: 'desc' }, skip: page.offset, take: page.limit, include: { invalidation: { select: { id: true } } } });
  const latest = await db.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } });
  return assessments.map((assessment) => ({ ...assessment, stale: !latest || latest.id !== assessment.publicationId, invalidated: assessment.invalidation !== null }));
}
