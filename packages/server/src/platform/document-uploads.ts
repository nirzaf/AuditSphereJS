import { BadRequestException, ConflictException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { documentUploadInitSchema } from '@auditsphere/contracts';
import { db } from './db.js';
import { requireCapability, type Scope } from './authorization.js';
import { resolveClientRepository } from './repository.js';
import { storageProvider, storeFile } from './storage.js';
import { decodeGraphReference } from './graph-storage.js';
import { lockForUpdate, runUnitOfWork } from './unit-of-work.js';

const MAX_UPLOAD_BYTES = 15_000_000;
const SESSION_TTL_MS = 30 * 60_000;
const scopeOf = (value: { id: string; firmId: string; clientId: string }): Scope => ({ firmId: value.firmId, clientId: value.clientId, engagementId: value.id });
const safeFilename = (value: string) => value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);

export type UploadFilePart = { filename: string; mimetype: string; file: AsyncIterable<Uint8Array> & { truncated?: boolean } };

function identifyContent(prefix: Buffer, filename: string, declaredType: string, hasNul: boolean, validUtf8: boolean): 'application/pdf' | 'text/csv' {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (prefix.subarray(0, 5).toString('ascii') === '%PDF-' && extension === 'pdf' && declaredType === 'application/pdf') return 'application/pdf';
  if (extension === 'csv' && declaredType === 'text/csv' && !hasNul && validUtf8) return 'text/csv';
  throw new BadRequestException('Uploaded file content does not match the permitted PDF or CSV type.');
}

export async function initiateDocumentUpload(actorId: string, input: unknown, now = new Date()) {
  const parsed = documentUploadInitSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues);
  const body = parsed.data;
  if (!['02_Trial Balance & Schedules', '03_Fieldwork & Testing'].includes(body.category)) throw new ConflictException('This fieldwork upload endpoint does not accept planning or deliverable archive documents');
  const engagement = await db.engagement.findUnique({ where: { id: body.engagementId } });
  if (!engagement) throw new NotFoundException('Engagement not found');
  await requireCapability(db, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
  if (engagement.state !== 'FIELDWORK_EXECUTION') throw new ConflictException('Engagement does not permit uploads in its current state');
  const session = await db.documentUploadSession.create({ data: {
    firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id, actorId,
    category: body.category, originalFilename: safeFilename(body.filename), declaredContentType: body.contentType,
    declaredSizeBytes: body.sizeBytes, maxSizeBytes: MAX_UPLOAD_BYTES, expectedSha256: body.expectedSha256 ?? null,
    storageKey: `${engagement.id}/${randomUUID()}`, expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  } });
  return toUploadSession(session);
}

export async function receiveDocumentUpload(actorId: string, sessionId: string, part: UploadFilePart) {
  const session = await db.documentUploadSession.findUnique({ where: { id: sessionId } });
  if (!session || session.actorId !== actorId) throw new NotFoundException('Upload session not found');
  if (session.status !== 'INITIATED' || session.expiresAt <= new Date()) throw new ConflictException('Upload session is no longer active');
  if (part.filename !== session.originalFilename || part.mimetype !== session.declaredContentType) throw new BadRequestException('Uploaded file metadata does not match the authorized upload session.');

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'auditsphere-upload-'));
  const temporaryFile = join(temporaryDirectory, 'content.part');
  let size = 0;
  try {
    const hash = createHash('sha256');
    const isCsv = session.originalFilename.toLowerCase().endsWith('.csv') && session.declaredContentType === 'text/csv';
    const textDecoder = isCsv ? new TextDecoder('utf-8', { fatal: true }) : undefined;
    let prefix = Buffer.alloc(0);
    let hasNul = false;
    let validUtf8 = true;
    const inspect = new Transform({
      transform(chunk: Buffer | Uint8Array, _encoding, callback) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.byteLength;
        if (size > session.maxSizeBytes) return callback(new PayloadTooLargeException('Uploaded file exceeds the authorized size limit.'));
        if (prefix.byteLength < 5) prefix = Buffer.concat([prefix, bytes.subarray(0, 5 - prefix.byteLength)]);
        if (bytes.includes(0)) hasNul = true;
        if (textDecoder) {
          try { textDecoder.decode(bytes, { stream: true }); } catch {
            validUtf8 = false;
            return callback(new BadRequestException('Uploaded CSV is not valid UTF-8 text.'));
          }
        }
        hash.update(bytes);
        callback(null, bytes);
      },
      flush(callback) {
        if (textDecoder) {
          try { textDecoder.decode(); } catch {
            validUtf8 = false;
            return callback(new BadRequestException('Uploaded CSV is not valid UTF-8 text.'));
          }
        }
        callback();
      },
    });
    await pipeline(Readable.from(part.file), inspect, createWriteStream(temporaryFile, { flags: 'wx', mode: 0o600 }));
    if (part.file.truncated || size > session.maxSizeBytes) throw new PayloadTooLargeException('Uploaded file exceeds the authorized size limit.');
    if (size !== session.declaredSizeBytes || size <= 0) throw new BadRequestException('Uploaded file size does not match the authorized upload session.');
    const contentType = identifyContent(prefix, session.originalFilename, session.declaredContentType, hasNul, validUtf8);
    const digest = hash.digest('hex');
    if (session.expectedSha256 && session.expectedSha256 !== digest) throw new BadRequestException('Uploaded file failed SHA-256 validation.');
    const engagement = await db.engagement.findUnique({ where: { id: session.engagementId } });
    if (!engagement || engagement.firmId !== session.firmId || engagement.clientId !== session.clientId) throw new NotFoundException('Upload session not found');
    await requireCapability(db, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
    if (engagement.state !== 'FIELDWORK_EXECUTION') throw new ConflictException('Engagement does not permit uploads in its current state');

    await db.storedObject.create({ data: { engagementId: session.engagementId, key: session.storageKey, sha256: digest, status: 'UPLOADING' } });
    const repository = storageProvider() === 'graph' ? await resolveClientRepository(db, session.firmId, session.clientId, 'evidence') : undefined;
    try {
      const reference = await storeFile(session.storageKey, temporaryFile, size, digest, contentType, repository, async providerReference => {
        await db.storedObject.update({ where: { key: session.storageKey }, data: { reference: providerReference } });
      });
      await db.storedObject.update({ where: { key: session.storageKey }, data: { reference, status: 'PENDING' } });
      const updated = await db.documentUploadSession.updateMany({
        where: { id: session.id, actorId, status: 'INITIATED', expiresAt: { gt: new Date() } },
        data: { status: 'STORED', storageReference: reference, actualSha256: digest, actualSizeBytes: size, uploadedAt: new Date(), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('Upload session changed or expired while receiving its file');
      return { sessionId: session.id, status: 'STORED' as const, sha256: digest, sizeBytes: size };
    } catch (error) {
      await db.documentUploadSession.updateMany({ where: { id: session.id, status: 'INITIATED' }, data: { status: 'FAILED', version: { increment: 1 } } });
      throw error;
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function finalizeDocumentUpload(actorId: string, sessionId: string) {
  const before = await db.documentUploadSession.findUnique({ where: { id: sessionId } });
  if (!before || before.actorId !== actorId) throw new NotFoundException('Upload session not found');
  return runUnitOfWork(async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', before.engagementId);
    await tx.$queryRaw`SELECT id FROM "DocumentUploadSession" WHERE id = ${sessionId}::uuid FOR UPDATE`;
    const engagement = await tx.engagement.findUnique({ where: { id: before.engagementId } });
    const session = await tx.documentUploadSession.findUnique({ where: { id: sessionId } });
    if (!engagement || !session || session.actorId !== actorId) throw new NotFoundException('Upload session not found');
    await requireCapability(tx, actorId, 'FIELDWORK_WRITE', scopeOf(engagement));
    if (session.status === 'FINALIZED' && session.documentId && session.documentVersionId && session.actualSha256 && session.actualSizeBytes) {
      return { sessionId, documentId: session.documentId, documentVersionId: session.documentVersionId, sha256: session.actualSha256, sizeBytes: session.actualSizeBytes };
    }
    if (engagement.state !== 'FIELDWORK_EXECUTION') throw new ConflictException('Engagement does not permit uploads in its current state');
    if (session.status !== 'STORED' || session.expiresAt <= new Date() || !session.storageReference || !session.actualSha256 || !session.actualSizeBytes) throw new ConflictException('Upload session is not ready for finalization');
    if (session.actualSizeBytes !== session.declaredSizeBytes || (session.expectedSha256 && session.actualSha256 !== session.expectedSha256)) throw new ConflictException('Stored bytes do not match the authorized upload session');
    await tx.$queryRaw`SELECT id FROM "StoredObject" WHERE key = ${session.storageKey} FOR UPDATE`;
    const storedObject = await tx.storedObject.findUnique({ where: { key: session.storageKey } });
    if (!storedObject || storedObject.status !== 'PENDING' || storedObject.reference !== session.storageReference || storedObject.sha256 !== session.actualSha256) throw new ConflictException('Stored object is being cleaned or no longer matches the upload session');

    const document = await tx.document.create({ data: {
      engagementId: session.engagementId, key: session.storageReference, sha256: session.actualSha256,
      filename: session.originalFilename, category: session.category,
    } });
    let providerData: { provider: string; storageReference: string; driveId: string | null; itemId: string | null; versionId: string; eTag: string | null };
    if (session.storageReference.startsWith('graph:')) {
      const reference = decodeGraphReference(session.storageReference);
      if (reference.sha256 !== session.actualSha256 || reference.sizeBytes !== session.actualSizeBytes) throw new ConflictException('Provider version does not match the authorized upload session');
      providerData = { provider: 'graph', storageReference: session.storageReference, driveId: reference.driveId, itemId: reference.itemId, versionId: reference.versionId, eTag: reference.eTag };
    } else {
      providerData = { provider: 'local-s3', storageReference: session.storageReference, driveId: null, itemId: null, versionId: session.storageReference, eTag: null };
    }
    const documentVersion = await tx.documentVersion.create({ data: {
      engagementId: session.engagementId, documentId: document.id, sequence: 1, ...providerData,
      sha256: session.actualSha256, sizeBytes: session.actualSizeBytes, createdBy: actorId,
    } });
    await tx.documentUploadSession.update({ where: { id: session.id }, data: {
      status: 'FINALIZED', finalizedAt: new Date(), documentId: document.id,
      documentVersionId: documentVersion.id, version: { increment: 1 },
    } });
    await tx.storedObject.update({ where: { key: session.storageKey }, data: { status: 'REFERENCED', documentId: document.id, resolvedAt: new Date() } });
    await tx.auditEvent.create({ data: { engagementId: session.engagementId, actorId, action: 'DOCUMENT_UPLOAD_FINALIZED', resourceType: 'Document', resourceId: document.id, resourceVersion: 1, payload: { sessionId, category: session.category, sha256: session.actualSha256, sizeBytes: session.actualSizeBytes, documentVersionId: documentVersion.id } } });
    return { sessionId, documentId: document.id, documentVersionId: documentVersion.id, sha256: session.actualSha256, sizeBytes: session.actualSizeBytes };
  });
}

function toUploadSession(session: { id: string; engagementId: string; category: string; originalFilename: string; declaredContentType: string; maxSizeBytes: number; expiresAt: Date; status: string }) {
  return { id: session.id, engagementId: session.engagementId, category: session.category, filename: session.originalFilename, contentType: session.declaredContentType, maxSizeBytes: session.maxSizeBytes, expiresAt: session.expiresAt.toISOString(), status: session.status as 'INITIATED' | 'STORED' | 'FINALIZED' | 'EXPIRED' | 'FAILED' };
}

export async function getDocumentUploadSession(actorId: string, sessionId: string) {
  const session = await db.documentUploadSession.findFirst({ where: { id: sessionId, actorId } });
  if (!session) throw new NotFoundException('Upload session not found');
  return toUploadSession(session);
}
