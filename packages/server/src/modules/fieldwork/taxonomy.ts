import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { approveMappingSchema, createTaxonomySchema } from '@auditsphere/contracts';

/**
 * Versioned mapping taxonomy and the approved-mapping boundary (MIG-009).
 *
 * A firm's taxonomy is versioned. An approved version and its lines are immutable, so historical
 * mappings keep their meaning. A mapping approval binds one import's mapped rows to an exact
 * taxonomy version by digest; any later row change makes that approval stale, and publication
 * requires a current approval.
 */
export const taxonomySections = ['INCOME', 'EXPENSE', 'ASSETS', 'LIABILITIES', 'EQUITY'] as const;
export type TaxonomyLineInput = { code: string; label: string; statementSection: string; sortOrder: number };

const digestOf = (value: string) => createHash('sha256').update(value).digest('hex');
const firmScope = (engagement: { firmId: string; clientId: string; id: string }): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });

/** Canonical digest of the mapped rows, independent of read order. */
export function mappingDigest(rows: Array<{ id: string; fsli: string | null; version: number }>): string {
  const canonical = [...rows].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((row) => [row.id, row.fsli ?? '', String(row.version)].join('\u0000')).join('\n');
  return digestOf(canonical);
}

async function loadEngagement(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  return engagement;
}

export async function createTaxonomyVersion(actorId: string, engagementId: string, input: unknown) {
  const parsed = createTaxonomySchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const engagement = await loadEngagement(engagementId);
  await requireCapability(db, actorId, 'TAXONOMY_MANAGE', firmScope(engagement));
  const codes = new Set<string>();
  for (const line of parsed.data.lines) {
    if (codes.has(line.code)) throw new BadRequestException(`Duplicate taxonomy code '${line.code}'`);
    codes.add(line.code);
  }
  return db.$transaction(async (tx) => {
    const latest = await tx.taxonomyVersion.findFirst({ where: { firmId: engagement.firmId, name: parsed.data.name }, orderBy: { version: 'desc' } });
    const version = (latest?.version ?? 0) + 1;
    const created = await tx.taxonomyVersion.create({ data: { firmId: engagement.firmId, name: parsed.data.name, version, createdBy: actorId } });
    await tx.taxonomyLine.createMany({ data: parsed.data.lines.map((line) => ({ taxonomyVersionId: created.id, code: line.code, label: line.label, statementSection: line.statementSection, sortOrder: line.sortOrder })) });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'TAXONOMY_VERSION_CREATED', payload: { taxonomyVersionId: created.id, name: created.name, version, lineCount: parsed.data.lines.length } } });
    return { id: created.id, name: created.name, version, status: created.status, lineCount: parsed.data.lines.length };
  });
}

export async function approveTaxonomyVersion(actorId: string, engagementId: string, taxonomyVersionId: string) {
  const engagement = await loadEngagement(engagementId);
  await requireCapability(db, actorId, 'TAXONOMY_MANAGE', firmScope(engagement));
  return db.$transaction(async (tx) => {
    const version = await tx.taxonomyVersion.findFirst({ where: { id: taxonomyVersionId, firmId: engagement.firmId } });
    if (!version) throw new NotFoundException('Taxonomy version not found');
    if (version.status !== 'DRAFT') throw new ConflictException('Only a draft taxonomy version can be approved');
    const lineCount = await tx.taxonomyLine.count({ where: { taxonomyVersionId } });
    if (!lineCount) throw new ConflictException('A taxonomy version needs at least one line before approval');
    const changed = await tx.taxonomyVersion.updateMany({ where: { id: taxonomyVersionId, status: 'DRAFT' }, data: { status: 'APPROVED', approvedBy: actorId, approvedAt: new Date() } });
    if (changed.count !== 1) throw new ConflictException('Taxonomy version changed; reload before approving');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'TAXONOMY_VERSION_APPROVED', payload: { taxonomyVersionId, version: version.version, lineCount } } });
    return { id: taxonomyVersionId, status: 'APPROVED', version: version.version, lineCount };
  });
}

export async function listTaxonomies(engagementId: string) {
  const engagement = await loadEngagement(engagementId);
  return db.taxonomyVersion.findMany({ where: { firmId: engagement.firmId }, orderBy: [{ name: 'asc' }, { version: 'desc' }], include: { lines: { orderBy: { sortOrder: 'asc' } } } });
}

/**
 * Suggests a taxonomy code for each row from the client's approved-mapping memory. Read-only: it
 * never writes a mapping, and every suggestion names the approval it came from. A remembered code
 * that is not in the currently approved taxonomy is reported as unresolved rather than offered.
 */
export async function suggestMappings(actorId: string, engagementId: string, importId: string, options: { taxonomyVersionId?: string } = {}) {
  const engagement = await loadEngagement(engagementId);
  await requireCapability(db, actorId, 'FIELDWORK_WRITE', firmScope(engagement));
  const batch = await db.tbImport.findFirst({ where: { id: importId, engagementId, firmId: engagement.firmId, clientId: engagement.clientId } });
  if (!batch) throw new NotFoundException('Import not found');
  const taxonomy = options.taxonomyVersionId
    ? await db.taxonomyVersion.findFirst({ where: { id: options.taxonomyVersionId, firmId: engagement.firmId, status: 'APPROVED' }, include: { lines: true } })
    : await db.taxonomyVersion.findFirst({ where: { firmId: engagement.firmId, status: 'APPROVED' }, orderBy: { version: 'desc' }, include: { lines: true } });
  if (!taxonomy) throw new ConflictException('No approved taxonomy version is configured for this firm');
  const codes = new Set(taxonomy.lines.map((line) => line.code));
  const [rows, memory] = await Promise.all([
    db.tbRow.findMany({ where: { importId: batch.id }, orderBy: { position: 'asc' } }),
    db.mappingMemoryEntry.findMany({ where: { firmId: engagement.firmId, clientId: engagement.clientId } }),
  ]);
  const remembered = new Map(memory.map((entry) => [entry.accountCode, entry]));
  const items = rows.map((row) => {
    if (row.fsli) return { rowId: row.id, code: row.code, name: row.name, currentFsli: row.fsli, suggestedFsli: null, reason: 'ALREADY_MAPPED' as const, provenance: null };
    const entry = remembered.get(row.code);
    if (!entry) return { rowId: row.id, code: row.code, name: row.name, currentFsli: null, suggestedFsli: null, reason: 'NO_MEMORY' as const, provenance: null };
    const provenance = { memoryEntryId: entry.id, sourceApprovalId: entry.sourceApprovalId, timesApplied: entry.timesApplied, lastApprovedAt: entry.lastApprovedAt };
    if (!codes.has(entry.taxonomyLineCode)) return { rowId: row.id, code: row.code, name: row.name, currentFsli: null, suggestedFsli: null, reason: 'MEMORY_NOT_IN_TAXONOMY' as const, provenance };
    return { rowId: row.id, code: row.code, name: row.name, currentFsli: null, suggestedFsli: entry.taxonomyLineCode, reason: 'MEMORY' as const, provenance };
  });
  return {
    importId: batch.id, taxonomyVersionId: taxonomy.id, taxonomyVersion: taxonomy.version,
    suggested: items.filter((item) => item.reason === 'MEMORY').length,
    alreadyMapped: items.filter((item) => item.reason === 'ALREADY_MAPPED').length,
    unresolved: items.filter((item) => item.reason === 'NO_MEMORY' || item.reason === 'MEMORY_NOT_IN_TAXONOMY').length,
    items,
  };
}

export async function currentMappingApproval(engagementId: string, importId: string) {
  const approval = await db.mappingApproval.findFirst({ where: { engagementId, importId }, orderBy: { approvedAt: 'desc' } });
  if (!approval) return null;
  const rows = await db.tbRow.findMany({ where: { importId }, select: { id: true, fsli: true, version: true } });
  return mappingDigest(rows) === approval.digest ? approval : null;
}

export async function approveImportMapping(actorId: string, engagementId: string, importId: string, input: unknown) {
  const parsed = approveMappingSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const hash = digestOf(JSON.stringify({ engagementId, importId, body }));
  const engagement = await loadEngagement(engagementId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    await requireCapability(tx, actorId, 'MAPPING_APPROVE', firmScope(engagement));
    const batch = await tx.tbImport.findFirst({ where: { id: importId, engagementId, firmId: engagement.firmId, clientId: engagement.clientId } });
    if (!batch) throw new NotFoundException('Import not found');
    if (batch.status !== 'MAPPING_REQUIRED') throw new ConflictException('Only an import whose mapping is complete can be approved');
    const rows = await tx.tbRow.findMany({ where: { importId: batch.id }, select: { id: true, fsli: true, version: true } });
    if (!rows.length) throw new ConflictException('The import has no mapped rows');
    if (rows.some((row) => !row.fsli)) throw new ConflictException('Every account must be mapped before approval');
    const taxonomy = body.taxonomyVersionId
      ? await tx.taxonomyVersion.findFirst({ where: { id: body.taxonomyVersionId, firmId: engagement.firmId, status: 'APPROVED' }, include: { lines: true } })
      : await tx.taxonomyVersion.findFirst({ where: { firmId: engagement.firmId, status: 'APPROVED' }, orderBy: { version: 'desc' }, include: { lines: true } });
    if (!taxonomy) throw new ConflictException('No approved taxonomy version is configured for this firm');
    const codes = new Set(taxonomy.lines.map((line) => line.code));
    const unknown = [...new Set(rows.filter((row) => !codes.has(row.fsli as string)).map((row) => row.fsli as string))];
    if (unknown.length) throw new BadRequestException(`Mapped lines are not in ${taxonomy.name} v${taxonomy.version}: ${unknown.slice(0, 5).join(', ')}`);
    const digest = mappingDigest(rows);
    const existing = await tx.mappingApproval.findUnique({ where: { importId_taxonomyVersionId: { importId: batch.id, taxonomyVersionId: taxonomy.id } } });
    if (existing) {
      if (existing.digest !== digest) throw new ConflictException('The mapping changed after approval; approve the new mapping version');
      return { approvalId: existing.id, taxonomyVersionId: taxonomy.id, taxonomyVersion: taxonomy.version, digest, rowCount: existing.rowCount };
    }
    const approval = await tx.mappingApproval.create({ data: { firmId: engagement.firmId, clientId: engagement.clientId, engagementId, importId: batch.id, taxonomyVersionId: taxonomy.id, digest, rowCount: rows.length, approvedBy: actorId } });
    // Approved mappings become client-scoped memory with the approval as provenance.
    await tx.$executeRaw`
      INSERT INTO "MappingMemoryEntry" (id, "firmId", "clientId", "accountCode", "accountName", "taxonomyLineCode", "sourceApprovalId")
      SELECT gen_random_uuid(), ${engagement.firmId}::uuid, ${engagement.clientId}::uuid, source."code", source."name", source."fsli", ${approval.id}::uuid
      FROM (SELECT r."code", r."name", r."fsli" FROM "TbRow" r WHERE r."importId" = ${batch.id}::uuid) AS source
      ON CONFLICT ("firmId", "clientId", "accountCode") DO UPDATE SET
        "taxonomyLineCode" = EXCLUDED."taxonomyLineCode",
        "accountName" = EXCLUDED."accountName",
        "sourceApprovalId" = EXCLUDED."sourceApprovalId",
        "lastApprovedAt" = now(),
        "timesApplied" = "MappingMemoryEntry"."timesApplied" + 1`;
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'MAPPING_APPROVED', payload: { approvalId: approval.id, importId: batch.id, taxonomyVersionId: taxonomy.id, digest, rowCount: rows.length } } });
    const result = { approvalId: approval.id, taxonomyVersionId: taxonomy.id, taxonomyVersion: taxonomy.version, digest, rowCount: rows.length };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}
