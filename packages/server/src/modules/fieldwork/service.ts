import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { db } from '../../platform/db.js';
import { store } from '../../platform/storage.js';
import { mappingSchema, uploadSchema, finalizeSchema } from '@auditsphere/contracts';
import { z } from 'zod';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function validate<T>(schema: z.ZodType<T>, body: unknown): T { const parsed = schema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.issues); return parsed.data; }
export async function upload(engagementId: string, actorId: string, input: unknown) {
  const body = validate(uploadSchema, input); const sha256 = digest(body.csv);
  const existing = await db.tbImport.findUnique({ where: { engagementId_sha256: { engagementId, sha256 } } });
  if (existing) return existing;
  const key = await store(`${engagementId}/${randomUUID()}.csv`, body.csv);
  return db.$transaction(async tx => {
    const document = await tx.document.create({ data: { engagementId, key, sha256, filename: body.filename } });
    const batch = await tx.tbImport.create({ data: { engagementId, sha256, documentId: document.id } });
    await tx.outboxEvent.create({ data: { type: 'tb.import', payload: { importId: batch.id } } });
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'TB_UPLOADED', payload: { importId: batch.id, sha256 } } });
    return batch;
  });
}
export async function getBatch(engagementId: string, id: string) { const batch = await db.tbImport.findFirst({ where: { id, engagementId } }); if (!batch) throw new NotFoundException('Import not found'); return batch; }
export async function rows(engagementId: string, id: string, offset: number, search: string) {
  await getBatch(engagementId, id);
  const where = { importId: id, ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }] } : {}) };
  return { total: await db.tbRow.count({ where }), rows: await db.tbRow.findMany({ where, orderBy: { position: 'asc' }, skip: offset, take: 200 }) };
}
export async function mapBatch(engagementId: string, importId: string, actorId: string, input: unknown) {
  const body = validate(mappingSchema, input); const hash = digest(JSON.stringify({ importId, body }));
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    const receipt = await tx.commandReceipt.findUnique({ where: { key: body.idempotencyKey } });
    if (receipt) { if (receipt.hash !== hash || receipt.actorId !== actorId || receipt.engagementId !== engagementId) throw new ConflictException('Idempotency key reused'); return receipt.result; }
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
export async function finalize(engagementId: string, importId: string, actorId: string, input: unknown) {
  const body = validate(finalizeSchema, input);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Engagement" WHERE id = ${engagementId}::uuid FOR UPDATE`;
    if (await tx.tbRow.count({ where: { importId, fsli: null } })) throw new BadRequestException('Map every account before finalizing');
    const totals = await tx.tbRow.aggregate({ where: { importId }, _sum: { current: true, prior: true }, _count: true });
    if (!totals._count || !totals._sum.current?.equals(0) || !totals._sum.prior?.equals(0)) throw new BadRequestException('Both periods must balance to zero');
    const changed = await tx.tbImport.updateMany({ where: { id: importId, engagementId, status: 'MAPPING_REQUIRED', version: body.expectedVersion }, data: { status: 'FINALIZED', version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException('Import changed');
    await tx.auditEvent.create({ data: { engagementId, actorId, action: 'TB_FINALIZED', payload: { importId } } });
    return { status: 'FINALIZED' };
  });
}
export async function aggregate(engagementId: string, importId: string) {
  await getBatch(engagementId, importId);
  const grouped = await db.tbRow.groupBy({ by: ['fsli'], where: { importId }, _sum: { current: true, prior: true }, _count: true });
  return grouped.map(row => ({ fsli: row.fsli || 'Unmapped', current: (row._sum.current || new Prisma.Decimal(0)).toFixed(2), prior: (row._sum.prior || new Prisma.Decimal(0)).toFixed(2), count: row._count }));
}
