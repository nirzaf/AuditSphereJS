import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { db } from '../../platform/db.js';
import { store, storageProvider } from '../../platform/storage.js';
import { decodeGraphReference } from '../../platform/graph-storage.js';
import { resolveClientRepository } from '../../platform/repository.js';
import { requireCapability, type Scope } from '../../platform/authorization.js';
import { runUnitOfWork, withUnitOfWork, lockForUpdate, type UnitOfWork } from '../../platform/unit-of-work.js';
import { createTrialBalanceImportOutbox } from '../../platform/outbox.js';
import { mappingSchema, uploadSchema, finalizeSchema } from '@auditsphere/contracts';
import { z } from 'zod';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function validate<T>(schema: z.ZodType<T>, body: unknown): T { const parsed = schema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.issues); return parsed.data; }

const scopeOf = (engagement: { id: string; firmId: string; clientId: string }): Scope => ({ firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id });
/** True when a concurrent writer already created the same scoped content. */
function isDuplicateContent(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } };
  return candidate?.code === 'P2002'
    || candidate?.meta?.driverAdapterError?.cause?.originalCode === '23505'
    || /Unique constraint|duplicate key/i.test(candidate?.message ?? '');
}
const EDITABLE_STATES = ['FIELDWORK_EXECUTION'];
function assertEditable(state: string) { if (!EDITABLE_STATES.includes(state)) throw new ConflictException('Engagement is not editable'); }

export async function upload(engagementId: string, actorId: string, input: unknown) {
  const body = validate(uploadSchema, input); const sha256 = digest(body.csv);
  // Authorize before storing bytes, then re-authorize inside the write transaction.
  const initial = await db.engagement.findUnique({ where: { id: engagementId } });
  if (!initial) throw new NotFoundException('Engagement not found');
  await requireCapability(db, actorId, 'FIELDWORK_WRITE', scopeOf(initial));
  assertEditable(initial.state);
  const existing = await db.tbImport.findUnique({ where: { engagementId_sha256: { engagementId, sha256 } } });
  if (existing) {
    if (body.documentId && existing.documentId !== body.documentId) throw new ConflictException('This content is already imported under another document');
    return existing;
  }
  const category = '02_Trial Balance & Schedules';
  if (body.documentId) {
    const document = await db.document.findFirst({ where: { id: body.documentId, engagementId }, select: { filename: true, category: true, version: true } });
    if (!document) throw new NotFoundException('Document not found');
    if (document.category !== category || document.filename !== body.filename) throw new ConflictException('Only a Trial Balance document with its original name can receive a new version');
    if (document.version !== body.expectedDocumentVersion) throw new ConflictException('Document changed; reload before uploading a new version');
  }
  // Graph writes are bound to the client's own repository; local development storage is not.
  const repository = storageProvider() === 'graph' ? await resolveClientRepository(db, initial.firmId, initial.clientId, 'evidence') : undefined;
  const key = `${engagementId}/${randomUUID()}.csv`;
  // Track the object before the bytes exist, so a crash or a losing race never leaves untracked bytes.
  await db.storedObject.create({ data: { engagementId, key, sha256, status: 'UPLOADING' } });
  const reference = await store(key, body.csv, repository);
  await db.storedObject.update({ where: { key }, data: { reference, status: 'PENDING' } });
  try {
    return await runUnitOfWork(async ({ client: tx }) => {
      await lockForUpdate(tx, 'Engagement', engagementId);
      await tx.$queryRaw`SELECT id FROM "StoredObject" WHERE key = ${key} FOR UPDATE`;
      const storedObject = await tx.storedObject.findUnique({ where: { key } });
      if (!storedObject || storedObject.status !== 'PENDING' || storedObject.reference !== reference || storedObject.sha256 !== sha256) throw new ConflictException('Uploaded object is being cleaned or no longer matches this Trial Balance');
      // Scope is derived from the engagement inside the transaction; callers cannot supply it.
      const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
      if (!engagement) throw new NotFoundException('Engagement not found');
      await requireCapability(tx, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
      assertEditable(engagement.state);
      let documentId: string;
      let sequence = 1;
      if (body.documentId) {
        await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${body.documentId}::uuid AND "engagementId" = ${engagementId}::uuid FOR UPDATE`;
        const current = await tx.document.findFirst({ where: { id: body.documentId, engagementId } });
        if (!current) throw new NotFoundException('Document not found');
        if (current.category !== category || current.filename !== body.filename) throw new ConflictException('Document category or original name changed');
        if (current.version !== body.expectedDocumentVersion) throw new ConflictException('Document changed; reload before uploading a new version');
        sequence = current.version + 1;
        await tx.document.update({ where: { id: current.id }, data: { key: reference, sha256, version: { increment: 1 } } });
        documentId = current.id;
      } else {
        const document = await tx.document.create({ data: { engagementId, key: reference, sha256, filename: body.filename, category } });
        documentId = document.id;
      }
      const sizeBytes = Buffer.byteLength(body.csv, 'utf8');
      const versionData = reference.startsWith('graph:')
        ? (() => {
            const identity = decodeGraphReference(reference);
            if (identity.sha256 !== sha256 || identity.sizeBytes !== sizeBytes) throw new ConflictException('Stored provider version does not match the uploaded content');
            return { provider: 'graph', storageReference: reference, driveId: identity.driveId, itemId: identity.itemId, versionId: identity.versionId, eTag: identity.eTag };
          })()
        : { provider: 'local-s3', storageReference: reference, driveId: null, itemId: null, versionId: reference, eTag: null };
      const documentVersion = await tx.documentVersion.create({ data: {
        engagementId, documentId, sequence, ...versionData, sha256, sizeBytes, createdBy: actorId,
      } });
      const batch = await tx.tbImport.create({ data: {
        firmId: engagement.firmId, clientId: engagement.clientId, engagementId, sha256,
        documentId, documentVersionId: documentVersion.id,
      } });
      await tx.storedObject.update({ where: { key }, data: { status: 'REFERENCED', documentId, resolvedAt: new Date() } });
      await createTrialBalanceImportOutbox(tx, { ...scopeOf(engagement), importId: batch.id });
      await tx.auditEvent.create({ data: { engagementId, actorId, action: 'TB_UPLOADED', payload: { importId: batch.id, documentId, documentVersionId: documentVersion.id, sequence, sha256 } } });
      return batch;
    });
  } catch (error) {
    if (!isDuplicateContent(error)) throw error;
    // A concurrent upload of identical content won. This object is a duplicate, not evidence, and
    // is left for the grace-period sweep rather than deleted inline.
    await db.storedObject.updateMany({ where: { key }, data: { status: 'DUPLICATE', resolvedAt: new Date() } });
    const winner = await db.tbImport.findUnique({ where: { engagementId_sha256: { engagementId, sha256 } } });
    if (winner) {
      if (body.documentId && winner.documentId !== body.documentId) throw new ConflictException('This content is already imported under another document');
      return winner;
    }
    throw error;
  }
}
export async function getBatch(engagementId: string, id: string) { const batch = await db.tbImport.findFirst({ where: { id, engagementId } }); if (!batch) throw new NotFoundException('Import not found'); return batch; }
export async function rows(engagementId: string, id: string, offset: number, search: string, limit = 200) {
  await getBatch(engagementId, id);
  const where = { importId: id, ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }] } : {}) };
  return { total: await db.tbRow.count({ where }), rows: await db.tbRow.findMany({ where, orderBy: { position: 'asc' }, skip: offset, take: limit }) };
}
export async function mapBatch(engagementId: string, importId: string, actorId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = validate(mappingSchema, input); const hash = digest(JSON.stringify({ importId, body }));
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) { if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused'); return receipt.result; }
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
    assertEditable(engagement.state);
    const batch = await tx.tbImport.findFirst({ where: { id: importId, engagementId } });
    if (!batch || batch.status !== 'MAPPING_REQUIRED') throw new ConflictException('Import is not editable');
    const updated = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "TbRow" AS row
      SET fsli = change.fsli, version = row.version + 1
      FROM jsonb_to_recordset(${JSON.stringify(body.changes)}::jsonb)
        AS change("rowId" text, "expectedVersion" integer, fsli text)
      WHERE row.id = change."rowId"::uuid
        AND row."importId" = ${importId}::uuid
        AND row.version = change."expectedVersion"
      RETURNING row.id`;
    if (updated.length !== body.changes.length) throw new ConflictException('One or more rows changed; reload before saving');
    await tx.tbImport.update({ where: { id: importId }, data: { version: { increment: 1 } } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'TB_MAPPED', payload: { changes: body.changes } } });
    const result = { saved: body.changes.length };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}
export async function finalize(engagementId: string, importId: string, actorId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = validate(finalizeSchema, input);
  return withUnitOfWork(unitOfWork, async ({ client: tx }) => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'FIELDWORK_FINALIZE', scopeOf(engagement));
    assertEditable(engagement.state);
    // Authorize and resolve the scoped import before any counts or aggregates are read.
    const batch = await tx.tbImport.findFirst({ where: { id: importId, engagementId, firmId: engagement.firmId, clientId: engagement.clientId } });
    if (!batch) throw new NotFoundException('Import not found');
    if (await tx.tbRow.count({ where: { importId: batch.id, fsli: null } })) throw new BadRequestException('Map every account before finalizing');
    const totals = await tx.tbRow.aggregate({ where: { importId: batch.id }, _sum: { current: true, prior: true }, _count: true });
    if (!totals._count || !totals._sum.current?.equals(0) || !totals._sum.prior?.equals(0)) throw new BadRequestException('Both periods must balance to zero');
    const changed = await tx.tbImport.updateMany({ where: { id: batch.id, engagementId, status: 'MAPPING_REQUIRED', version: body.expectedVersion }, data: { status: 'FINALIZED', version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException('Import changed');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'TB_FINALIZED', payload: { importId: batch.id } } });
    return { status: 'FINALIZED' };
  });
}
export async function aggregate(engagementId: string, importId: string) {
  await getBatch(engagementId, importId);
  const grouped = await db.tbRow.groupBy({ by: ['fsli'], where: { importId }, _sum: { current: true, prior: true }, _count: true });
  return grouped.map(row => ({ fsli: row.fsli || 'Unmapped', current: (row._sum.current || new Prisma.Decimal(0)).toFixed(6), prior: (row._sum.prior || new Prisma.Decimal(0)).toFixed(6), count: row._count }));
}
