import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { db } from '../../platform/db.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { publishSchema } from '@auditsphere/contracts';
import { mappingDigest } from './taxonomy.js';

const digestOf = (value: string) => createHash('sha256').update(value).digest('hex');
const scopeOf = (engagement: { id: string; firmId: string; clientId: string }): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });
const PUBLISHABLE_STATES = ['FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW'];

/** Canonical content hash of the published rows; two identical datasets produce the same digest. */
export function rowDigest(rows: Array<{ code: string; name: string; fsli: string | null; current: { toFixed: (n: number) => string }; prior: { toFixed: (n: number) => string } }>): string {
  return digestOf(rows.map((row) => [row.code, row.name, row.fsli, row.current.toFixed(6), row.prior.toFixed(6)].join('\u0000')).join('\n'));
}

export async function publishBalances(engagementId: string, actorId: string, input: unknown) {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  const hash = digestOf(JSON.stringify({ engagementId, body }));
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) {
      if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused');
      return receipt.result;
    }
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'TB_PUBLISH', scopeOf(engagement));
    // One finalized import version publishes exactly once; republishing returns the receipt.
    const existing = await tx.balancePublication.findUnique({ where: { importId: body.importId } });
    if (existing) {
      if (existing.engagementId !== engagementId) throw new ConflictException('Import belongs to another engagement');
      return { publicationId: existing.id, sequence: existing.sequence, rowCount: existing.rowCount, digest: existing.digest, currency: existing.currency };
    }
    if (!PUBLISHABLE_STATES.includes(engagement.state)) throw new ConflictException('Engagement is not in a state that permits publication');
    const batch = await tx.tbImport.findFirst({ where: { id: body.importId, engagementId, firmId: engagement.firmId, clientId: engagement.clientId } });
    if (!batch) throw new NotFoundException('Import not found');
    if (batch.status !== 'FINALIZED') throw new ConflictException('Only a finalized trial balance can be published');
    if (batch.version !== body.expectedVersion) throw new ConflictException('Import changed; reload before publishing');
    const rows = await tx.tbRow.findMany({ where: { importId: batch.id }, orderBy: { position: 'asc' } });
    if (!rows.length) throw new ConflictException('The import has no accepted rows');
    if (rows.some((row) => !row.fsli)) throw new ConflictException('Every account must be mapped before publication');
    const totals = await tx.tbRow.aggregate({ where: { importId: batch.id }, _sum: { current: true, prior: true } });
    if (!totals._sum.current?.equals(0) || !totals._sum.prior?.equals(0)) throw new ConflictException('Both periods must balance to zero before publication');
    // Publication binds approved mappings: the mapping approval must exist and still match the rows.
    const approval = await tx.mappingApproval.findFirst({ where: { engagementId, importId: batch.id }, orderBy: { approvedAt: 'desc' } });
    if (!approval) throw new ConflictException('The import mapping is not approved against a taxonomy version');
    if (mappingDigest(rows) !== approval.digest) throw new ConflictException('The import mapping changed after approval; approve it again before publishing');
    const digest = rowDigest(rows);
    const sequence = (await tx.balancePublication.count({ where: { engagementId } })) + 1;
    const publication = await tx.balancePublication.create({ data: {
      firmId: engagement.firmId, clientId: engagement.clientId, engagementId, importId: batch.id,
      sequence, currency: engagement.currency, rowCount: rows.length, digest, publishedBy: actorId, mappingApprovalId: approval.id,
    } });
    await tx.publishedBalanceRow.createMany({ data: rows.map((row) => ({
      publicationId: publication.id, position: row.position, code: row.code, name: row.name,
      fsli: row.fsli as string, current: row.current, prior: row.prior,
    })) });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'TB_PUBLISHED', payload: { publicationId: publication.id, sequence, importId: batch.id, digest, rowCount: rows.length } } });
    const result = { publicationId: publication.id, sequence, rowCount: rows.length, digest, currency: engagement.currency };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}

export async function latestPublication(engagementId: string) {
  const publication = await db.balancePublication.findFirst({ where: { engagementId }, orderBy: { sequence: 'desc' } });
  if (!publication) throw new NotFoundException('No accepted balance version has been published');
  return publication;
}

export async function publicationDetail(engagementId: string, publicationId: string) {
  const publication = await db.balancePublication.findFirst({ where: { id: publicationId, engagementId } });
  if (!publication) throw new NotFoundException('Publication not found');
  const rows = await db.publishedBalanceRow.findMany({ where: { publicationId: publication.id }, orderBy: { position: 'asc' } });
  return { ...publication, rows: rows.map((row) => ({ ...row, current: row.current.toFixed(6), prior: row.prior.toFixed(6) })) };
}
