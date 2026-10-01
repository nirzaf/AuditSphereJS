import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { db } from '../../platform/db.js';
import { Decimal6 } from '../../platform/decimal6.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { calculateMaterialitySchema, approveMaterialitySchema } from '@auditsphere/contracts';
import { calculateMateriality, deriveBenchmark, materialityInputHash, materialityPolicyVersion, validateMateriality, type MappedBenchmarkLine } from './materiality.js';

/**
 * Persisted planning materiality bound to an exact published accounting version and taxonomy.
 *
 * The calculator is pure; this records its inputs and result so an approval binds a version, a new
 * accepted balance version makes a prior assessment stale, and the calculator cannot approve their
 * own assessment (segregation of duties).
 */
const digestOf = (value: string) => createHash('sha256').update(value).digest('hex');
const firmScope = (engagement: { firmId: string; clientId: string; id: string }): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

async function loadEngagement(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  return engagement;
}

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

export async function calculateMaterialityAssessment(actorId: string, engagementId: string, input: unknown) {
  const parsed = calculateMaterialitySchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const engagement = await loadEngagement(engagementId);
  await requireCapability(db, actorId, 'MATERIALITY_MANAGE', firmScope(engagement));
  const hash = digestOf(JSON.stringify({ engagementId, body }));
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    const publication = await tx.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } });
    if (!publication) throw new ConflictException('Publish an accepted balance version before calculating materiality');
    const { approval, lines } = await publishedBenchmarkLines(tx, publication.id, publication.mappingApprovalId);
    const ratePercent = Decimal6.from(body.ratePercent);
    const performancePercent = Decimal6.from(body.performancePercent);
    const trivialPercent = Decimal6.from(body.trivialPercent);
    const policyMessage = validateMateriality(body.benchmarkKind, ratePercent, performancePercent, trivialPercent);
    if (policyMessage) throw new BadRequestException(policyMessage);
    const derived = deriveBenchmark(body.benchmarkKind, body.destinationCode ?? null, lines);
    if (!derived) throw new ConflictException('The requested benchmark is not available from the published balances');
    const figures = calculateMateriality(derived.amount, derived.lineCount, ratePercent, performancePercent, trivialPercent);
    const inputHash = materialityInputHash({
      mappingVersionId: approval.taxonomyVersionId, datasetDigest: publication.digest, kind: body.benchmarkKind, destinationCode: body.destinationCode ?? null,
      benchmarkAmount: figures.benchmarkAmount, ratePercent, performancePercent, trivialPercent,
    });
    const assessment = await tx.materialityAssessment.create({ data: {
      firmId: engagement.firmId, clientId: engagement.clientId, engagementId,
      publicationId: publication.id, taxonomyVersionId: approval.taxonomyVersionId,
      benchmarkKind: body.benchmarkKind, destinationCode: body.destinationCode ?? null, sourceLineCount: figures.sourceLineCount, currency: publication.currency,
      benchmarkAmount: figures.benchmarkAmount.toFixed(6), planningMateriality: figures.planningMateriality.toFixed(6),
      tolerableError: figures.tolerableError.toFixed(6), sadThreshold: figures.sadThreshold.toFixed(6),
      ratePercent: ratePercent.toFixed(6), performancePercent: performancePercent.toFixed(6), trivialPercent: trivialPercent.toFixed(6),
      policyVersion: materialityPolicyVersion, inputHash, calculatedBy: actorId,
    } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'MATERIALITY_CALCULATED', payload: { assessmentId: assessment.id, benchmarkKind: body.benchmarkKind, publicationId: publication.id, inputHash } } });
    const result = {
      assessmentId: assessment.id, status: 'DRAFT', benchmarkKind: body.benchmarkKind, currency: publication.currency,
      benchmarkAmount: figures.benchmarkAmount.toFixed(6), planningMateriality: figures.planningMateriality.toFixed(6),
      tolerableError: figures.tolerableError.toFixed(6), sadThreshold: figures.sadThreshold.toFixed(6),
      inputHash, publicationId: publication.id, publicationSequence: publication.sequence,
    };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function approveMaterialityAssessment(actorId: string, engagementId: string, assessmentId: string, input: unknown) {
  const parsed = approveMaterialitySchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const engagement = await loadEngagement(engagementId);
  await requireCapability(db, actorId, 'MATERIALITY_APPROVE', firmScope(engagement));
  const hash = digestOf(JSON.stringify({ engagementId, assessmentId, body }));
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
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
    const changed = await tx.materialityAssessment.updateMany({ where: { id: assessmentId, status: 'DRAFT' }, data: { status: 'APPROVED', approvedBy: actorId, approvedAt: new Date() } });
    if (changed.count !== 1) throw new ConflictException('Materiality assessment changed; reload before approving');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'MATERIALITY_APPROVED', payload: { assessmentId, publicationId: assessment.publicationId, inputHash: assessment.inputHash } } });
    const result = { assessmentId, status: 'APPROVED', publicationId: assessment.publicationId, inputHash: assessment.inputHash };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function latestMaterialityAssessment(engagementId: string) {
  const assessment = await db.materialityAssessment.findFirst({ where: { engagementId }, orderBy: { calculatedAt: 'desc' } });
  if (!assessment) throw new NotFoundException('No materiality assessment has been calculated for this engagement');
  const latest = await db.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } });
  const decimal = (value: { toFixed: (n: number) => string }) => value.toFixed(6);
  return {
    ...assessment,
    benchmarkAmount: decimal(assessment.benchmarkAmount), planningMateriality: decimal(assessment.planningMateriality),
    tolerableError: decimal(assessment.tolerableError), sadThreshold: decimal(assessment.sadThreshold),
    stale: !latest || latest.id !== assessment.publicationId,
    currentPublicationId: latest?.id ?? null,
  };
}

export async function listMaterialityAssessments(engagementId: string) {
  const assessments = await db.materialityAssessment.findMany({ where: { engagementId }, orderBy: { calculatedAt: 'desc' } });
  const latest = await db.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } });
  return assessments.map((assessment) => ({ ...assessment, stale: !latest || latest.id !== assessment.publicationId }));
}
