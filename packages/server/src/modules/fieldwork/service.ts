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
import { publishRealtimeInvalidation } from '../../platform/realtime/invalidation.js';
import { mappingSchema, uploadSchema, finalizeSchema, fslis, importFromDocumentSchema } from '@auditsphere/contracts';
import { Decimal6 } from '../../platform/decimal6.js';
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
/**
 * D13: a stored, screened Trial Balance document version (a workbook or a CSV) becomes an import
 * through the same durable pipeline as an uploaded CSV. The bytes are read from the pinned version
 * by the worker, so the request carries an identifier and never the file contents.
 */
export async function importFromDocument(engagementId: string, actorId: string, input: unknown) {
  const body = validate(importFromDocumentSchema, input);
  return runUnitOfWork(async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const engagement = await tx.engagement.findUnique({ where: { id: engagementId } });
    if (!engagement) throw new NotFoundException('Engagement not found');
    await requireCapability(tx, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
    assertEditable(engagement.state);
    const version = await tx.documentVersion.findFirst({ where: { id: body.documentVersionId, engagementId }, include: { document: true } });
    if (!version) throw new NotFoundException('Document version not found');
    if (version.document.category !== '02_Trial Balance & Schedules') throw new ConflictException('Only Trial Balance documents can be imported');
    const existing = await tx.tbImport.findUnique({ where: { engagementId_sha256: { engagementId, sha256: version.sha256 } } });
    if (existing) {
      if (existing.documentVersionId !== version.id) throw new ConflictException('This content is already imported under another document');
      return existing;
    }
    const batch = await tx.tbImport.create({ data: {
      firmId: engagement.firmId, clientId: engagement.clientId, engagementId, sha256: version.sha256,
      documentId: version.documentId, documentVersionId: version.id,
    } });
    await createTrialBalanceImportOutbox(tx, { ...scopeOf(engagement), importId: batch.id });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'TB_UPLOADED', payload: { importId: batch.id, documentId: version.documentId, documentVersionId: version.id, sequence: version.sequence, sha256: version.sha256, source: 'DOCUMENT_VERSION' } } });
    return batch;
  });
}
export async function getBatch(engagementId: string, id: string) { const batch = await db.tbImport.findFirst({ where: { id, engagementId } }); if (!batch) throw new NotFoundException('Import not found'); return batch; }
/** Resolve and authorize a row-level collaboration lease against the authoritative engagement. */
export async function authorizeRowLease(engagementId: string, importId: string, rowId: string, actorId: string) {
  const [batch, engagement, row, user] = await Promise.all([
    db.tbImport.findFirst({ where: { id: importId, engagementId }, select: { id: true, status: true } }),
    db.engagement.findUnique({ where: { id: engagementId } }),
    db.tbRow.findFirst({ where: { id: rowId, importId }, select: { id: true } }),
    db.user.findUnique({ where: { id: actorId }, select: { email: true } }),
  ]);
  if (!batch || !engagement || !row) throw new NotFoundException('Trial Balance row not found');
  await requireCapability(db, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
  assertEditable(engagement.state);
  if (batch.status !== 'MAPPING_REQUIRED') throw new ConflictException('Only rows in an editable Trial Balance can have an edit lease');
  if (!user?.email) throw new NotFoundException('Active staff identity not found');
  return { displayName: user.email };
}
export async function rows(engagementId: string, id: string, offset: number, search: string, limit = 200) {
  await getBatch(engagementId, id);
  const where = { importId: id, ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }] } : {}) };
  return { total: await db.tbRow.count({ where }), rows: await db.tbRow.findMany({ where, orderBy: { position: 'asc' }, skip: offset, take: limit }) };
}
export async function mapBatch(engagementId: string, importId: string, actorId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = validate(mappingSchema, input); const hash = digest(JSON.stringify({ importId, body }));
  return withUnitOfWork(unitOfWork, async (scope) => {
    const tx = scope.client;
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
    const updatedBatch = await tx.tbImport.update({ where: { id: importId }, data: { version: { increment: 1 } }, select: { version: true } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'TB_MAPPED', payload: { changes: body.changes } } });
    scope.afterCommit(() => publishRealtimeInvalidation({ schemaVersion: 1, engagementId, resourceType: 'trial-balance-import', resourceId: importId, version: updatedBatch.version }));
    const result = { saved: body.changes.length };
    await tx.commandReceipt.create({ data: { key: body.idempotencyKey, engagementId, actorId, hash, result } });
    return result;
  });
}
export async function finalize(engagementId: string, importId: string, actorId: string, input: unknown, unitOfWork?: UnitOfWork) {
  const body = validate(finalizeSchema, input);
  return withUnitOfWork(unitOfWork, async (scope) => {
    const tx = scope.client;
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
    scope.afterCommit(() => publishRealtimeInvalidation({ schemaVersion: 1, engagementId, resourceType: 'trial-balance-import', resourceId: importId, version: batch.version + 1 }));
    return { status: 'FINALIZED' };
  });
}
/** Presentation split only; the statement a balance belongs to never changes its stored value. */
const PROFIT_AND_LOSS_FSLIS: ReadonlySet<string> = new Set(['Revenue', 'Operating expenses']);

/**
 * Statement-ordered summary (T050). Totals are summed by the database and converted once to
 * `Decimal6`, so no browser or JavaScript float sum is involved. Variance uses the shared rule: a
 * zero prior base is reported as NO_BASE with a null percentage rather than 0%.
 */
export async function statementSummary(engagementId: string, importId: string) {
  await getBatch(engagementId, importId);
  const grouped = await db.tbRow.groupBy({ by: ['fsli'], where: { importId }, _sum: { current: true, prior: true }, _count: true });
  const totals = new Map<string | null, { current: Decimal6; prior: Decimal6; count: number }>();
  for (const row of grouped) {
    totals.set(row.fsli, {
      current: Decimal6.from((row._sum.current || new Prisma.Decimal(0)).toFixed(6)),
      prior: Decimal6.from((row._sum.prior || new Prisma.Decimal(0)).toFixed(6)),
      count: row._count,
    });
  }
  const line = (fsli: string, value: { current: Decimal6; prior: Decimal6; count: number }) => {
    const variance = Decimal6.variance(value.current, value.prior);
    return {
      fsli,
      current: value.current.toFixed(6),
      prior: value.prior.toFixed(6),
      change: variance.change.toFixed(6),
      percent: variance.percent ? variance.percent.toFixed(6) : null,
      direction: variance.direction,
      count: value.count,
    };
  };
  const ordered = (statement: (fsli: string) => boolean) => fslis
    .filter(fsli => statement(fsli) && totals.has(fsli))
    .map(fsli => line(fsli, totals.get(fsli)!));
  const unmapped = totals.get(null);
  return {
    profitAndLoss: ordered(fsli => PROFIT_AND_LOSS_FSLIS.has(fsli)),
    balanceSheet: ordered(fsli => !PROFIT_AND_LOSS_FSLIS.has(fsli)),
    unmapped: unmapped ? line('Unmapped', unmapped) : null,
    // Route targets for later workstreams. They are explicit placeholders, not links to live data.
    placeholders: { accountsReceivable: 'ROUTE_PENDING' as const, workprograms: 'ROUTE_PENDING' as const },
  };
}

export async function aggregate(engagementId: string, importId: string) {
  await getBatch(engagementId, importId);
  const grouped = await db.tbRow.groupBy({ by: ['fsli'], where: { importId }, _sum: { current: true, prior: true }, _count: true });
  return grouped.map(row => ({ fsli: row.fsli || 'Unmapped', current: (row._sum.current || new Prisma.Decimal(0)).toFixed(6), prior: (row._sum.prior || new Prisma.Decimal(0)).toFixed(6), count: row._count }));
}
