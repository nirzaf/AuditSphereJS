import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { practiceExpenseReceiptsSchema } from '@auditsphere/contracts';
import { db } from '../../platform/db.js';
import { resolveFirmPracticeRepository } from '../../platform/repository.js';
import { decodeGraphReference } from '../../platform/graph-storage.js';
import { storageProvider, storeFile, removeObject } from '../../platform/storage.js';
import { MalwareDetectedError, MalwareScannerUnavailableError, scanFileWithClamAv } from '../../platform/clamav.js';
import { inspectPdfFile, PdfPolicyRejectedError } from '../../platform/pdf-inspection.js';
import { lockForUpdate, runUnitOfWork } from '../../platform/unit-of-work.js';
import { practiceFirmScope } from './ledger.js';
import type { UploadFilePart } from '../../platform/document-uploads.js';

const MAX_UPLOAD_BYTES = 15_000_000;
const SESSION_TTL_MS = 30 * 60_000;
const safeFilename = (value: string) => value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
type ReceiptFileType = 'application/pdf' | 'image/jpeg' | 'image/png';

function detectFileType(prefix: Buffer, filename: string, declared: string): ReceiptFileType {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (prefix.subarray(0, 5).toString('ascii') === '%PDF-' && extension === 'pdf' && declared === 'application/pdf') return 'application/pdf';
  if (prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff && extension === 'jpg' || prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff && extension === 'jpeg') {
    if (declared === 'image/jpeg') return 'image/jpeg';
  }
  if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && extension === 'png' && declared === 'image/png') return 'image/png';
  throw new BadRequestException('Receipt file content must match a PDF, JPEG, or PNG filename and media type.');
}

function receiptView(value: { id: string; sequence: number; filename: string; contentType: string; sizeBytes: number; createdAt: Date }) {
  return practiceExpenseReceiptsSchema.element.parse({
    id: value.id, sequence: value.sequence, filename: value.filename, contentType: value.contentType,
    sizeBytes: value.sizeBytes, createdAt: value.createdAt.toISOString(),
  });
}

async function authorizedExpense(client: typeof db | Parameters<typeof practiceFirmScope>[0], actorId: string, engagementId: string, journalId: string, capability: 'PRACTICE_READ' | 'PRACTICE_MANAGE') {
  const firmId = await practiceFirmScope(client, actorId, engagementId, capability);
  const expense = await client.practiceExpense.findFirst({
    where: { firmId, journalId },
    include: { journal: { include: { reversedJournals: { select: { id: true } } } } },
  });
  if (!expense) throw new NotFoundException('Practice expense not found');
  if (expense.journal.status === 'REVERSED' || expense.journal.reversedJournals.length) throw new ConflictException('Receipts cannot be attached to a reversed expense');
  return { firmId, expense };
}

export async function listPracticeExpenseReceipts(actorId: string, engagementId: string, journalId: string) {
  const { firmId } = await authorizedExpense(db, actorId, engagementId, journalId, 'PRACTICE_READ');
  const rows = await db.practiceExpenseReceipt.findMany({ where: { firmId, expenseJournalId: journalId }, orderBy: { sequence: 'asc' } });
  return rows.map(receiptView);
}

/** Uploads one bounded, scanned receipt to a firm-private provider folder, then pins its exact version. */
export async function attachPracticeExpenseReceipt(actorId: string, engagementId: string, journalId: string, idempotencyKey: string, part: UploadFilePart) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new BadRequestException('A valid receipt upload idempotency key is required.');
  const filename = safeFilename(part.filename);
  if (!filename || filename !== part.filename || !['application/pdf', 'image/jpeg', 'image/png'].includes(part.mimetype)) {
    throw new BadRequestException('A PDF, JPEG, or PNG receipt with a safe filename is required.');
  }
  const initialized = await runUnitOfWork(async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagementId);
    const { firmId, expense } = await authorizedExpense(tx, actorId, engagementId, journalId, 'PRACTICE_MANAGE');
    if (expense.journal.status !== 'DRAFT' && expense.journal.status !== 'POSTED') throw new ConflictException('Receipts can only be attached to a draft or posted expense');
    const replay = await tx.practiceExpenseReceiptUploadSession.findUnique({ where: { actorId_idempotencyKey: { actorId, idempotencyKey } } });
    if (replay) {
      if (replay.firmId !== firmId || replay.expenseJournalId !== journalId) throw new ConflictException('Receipt idempotency key was already used for a different expense');
      if (replay.status === 'ATTACHED' && replay.receiptId) {
        const receipt = await tx.practiceExpenseReceipt.findUnique({ where: { id: replay.receiptId } });
        if (receipt) return { firmId, session: replay, replay: receiptView(receipt) };
      }
      throw new ConflictException('Receipt upload with this idempotency key is already in progress or requires recovery');
    }
    const session = await tx.practiceExpenseReceiptUploadSession.create({ data: {
      firmId, expenseJournalId: journalId, actorId, filename, contentType: part.mimetype,
      storageKey: `${firmId}/${randomUUID()}`, idempotencyKey, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    } });
    return { firmId, session, replay: undefined };
  });
  if (initialized.replay) {
    for await (const _chunk of part.file) { /* drain duplicate multipart content without storing it */ }
    return initialized.replay;
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'auditsphere-practice-receipt-'));
  const temporaryFile = join(temporaryDirectory, 'content.part');
  let sizeBytes = 0;
  let digest: string | undefined;
  let providerWriteStarted = false;
  try {
    const hash = createHash('sha256');
    let prefix = Buffer.alloc(0);
    const inspect = new Transform({
      transform(chunk: Buffer | Uint8Array, _encoding, callback) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        sizeBytes += bytes.byteLength;
        if (sizeBytes > MAX_UPLOAD_BYTES) return callback(new PayloadTooLargeException('Receipt exceeds the 15 MB limit.'));
        if (prefix.byteLength < 8) prefix = Buffer.concat([prefix, bytes.subarray(0, 8 - prefix.byteLength)]);
        hash.update(bytes);
        callback(null, bytes);
      },
    });
    await pipeline(Readable.from(part.file), inspect, createWriteStream(temporaryFile, { flags: 'wx', mode: 0o600 }));
    if (part.file.truncated || sizeBytes > MAX_UPLOAD_BYTES) throw new PayloadTooLargeException('Receipt exceeds the 15 MB limit.');
    if (sizeBytes <= 0) throw new BadRequestException('Receipt file cannot be empty.');
    const contentType = detectFileType(prefix, filename, part.mimetype);
    digest = hash.digest('hex');
    try {
      await scanFileWithClamAv(temporaryFile, { host: process.env.CLAMAV_HOST ?? '127.0.0.1', port: Number(process.env.CLAMAV_PORT ?? 3310) });
    } catch (error) {
      if (error instanceof MalwareDetectedError) throw new BadRequestException('Receipt was rejected by security scanning.');
      if (error instanceof MalwareScannerUnavailableError) throw new ServiceUnavailableException('Security scanning is unavailable; the receipt was not stored.');
      throw error;
    }
    if (contentType === 'application/pdf') {
      try { await inspectPdfFile(temporaryFile); }
      catch (error) {
        if (error instanceof PdfPolicyRejectedError) throw new BadRequestException('PDF receipt contains prohibited active content or cannot be safely inspected.');
        if (error instanceof ServiceUnavailableException) throw error;
        throw new ServiceUnavailableException('PDF security inspection is unavailable; the receipt was not stored.');
      }
    }
    const moving = await db.practiceExpenseReceiptUploadSession.updateMany({
      where: { id: initialized.session.id, actorId, status: 'INITIATED', expiresAt: { gt: new Date() } },
      data: { status: 'UPLOADING', sha256: digest, sizeBytes, version: { increment: 1 } },
    });
    if (moving.count !== 1) throw new ConflictException('Receipt upload session expired or changed');

    const repository = storageProvider() === 'graph' ? await resolveFirmPracticeRepository(db, initialized.firmId) : undefined;
    providerWriteStarted = true;
    const storageReference = await storeFile(initialized.session.storageKey, temporaryFile, sizeBytes, digest, contentType, repository, async reference => {
      await db.practiceExpenseReceiptUploadSession.updateMany({
        where: { id: initialized.session.id, status: 'UPLOADING', storageReference: null },
        data: { storageReference: reference, version: { increment: 1 } },
      });
    });
    const stored = await db.practiceExpenseReceiptUploadSession.updateMany({
      where: { id: initialized.session.id, actorId, status: 'UPLOADING' },
      data: { status: 'STORED', storageReference, uploadedAt: new Date(), version: { increment: 1 } },
    });
    if (stored.count !== 1) throw new ConflictException('Receipt upload changed before it could be attached');

    return await runUnitOfWork(async ({ client: tx }) => {
      await lockForUpdate(tx, 'Engagement', engagementId);
      const { firmId, expense } = await authorizedExpense(tx, actorId, engagementId, journalId, 'PRACTICE_MANAGE');
      if (firmId !== initialized.firmId) throw new ForbiddenException('Practice expense firm scope changed during receipt upload');
      if (expense.journal.status !== 'DRAFT' && expense.journal.status !== 'POSTED') throw new ConflictException('Receipt can no longer be attached to this expense');
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${firmId}, 0)) IS NULL AS locked`;
      const current = await tx.practiceExpenseReceiptUploadSession.findUnique({ where: { id: initialized.session.id } });
      if (!current || current.actorId !== actorId || current.firmId !== firmId || current.expenseJournalId !== journalId || current.status !== 'STORED' || current.storageReference !== storageReference || current.sha256 !== digest || current.sizeBytes !== sizeBytes || current.expiresAt <= new Date()) {
        throw new ConflictException('Verified receipt upload session is not available for attachment');
      }
      let provider = 'local-s3';
      let driveId: string | null = null;
      let itemId: string | null = null;
      let versionId = storageReference;
      let eTag: string | null = null;
      if (storageReference.startsWith('graph:')) {
        const reference = decodeGraphReference(storageReference);
        if (reference.sha256 !== digest || reference.sizeBytes !== sizeBytes) throw new ConflictException('Stored Graph version does not match the scanned receipt bytes');
        const boundRepository = await resolveFirmPracticeRepository(tx, firmId);
        if (reference.driveId !== boundRepository.driveId || reference.repositoryFolderId !== boundRepository.folderId) throw new ForbiddenException('Stored receipt is outside the firm-private Practice folder');
        provider = 'graph'; driveId = reference.driveId; itemId = reference.itemId; versionId = reference.versionId; eTag = reference.eTag;
      }
      const latest = await tx.practiceExpenseReceipt.aggregate({ where: { firmId, expenseJournalId: journalId }, _max: { sequence: true } });
      const receipt = await tx.practiceExpenseReceipt.create({ data: {
        firmId, expenseJournalId: journalId, sequence: (latest._max.sequence ?? 0) + 1, provider, storageReference,
        driveId, itemId, versionId, eTag, sha256: digest!, sizeBytes, filename, contentType, createdBy: actorId,
      } });
      const attached = await tx.practiceExpenseReceiptUploadSession.updateMany({
        where: { id: current.id, actorId, status: 'STORED', version: current.version },
        data: { status: 'ATTACHED', attachedAt: new Date(), receiptId: receipt.id, version: { increment: 1 } },
      });
      if (attached.count !== 1) throw new ConflictException('Receipt upload session changed during attachment');
      await tx.auditEvent.create({ data: {
        engagementId, actorId, action: 'PRACTICE_EXPENSE_RECEIPT_ATTACHED', resourceType: 'PracticeExpenseReceipt',
        resourceId: receipt.id, resourceVersion: receipt.sequence,
        payload: { firmId, expenseJournalId: journalId, sequence: receipt.sequence, filename, contentType, sha256: digest, sizeBytes },
      } });
      return receiptView(receipt);
    });
  } catch (error) {
    if (!providerWriteStarted) {
      await db.practiceExpenseReceiptUploadSession.updateMany({ where: { id: initialized.session.id, status: { in: ['INITIATED', 'UPLOADING'] } }, data: { status: 'FAILED', version: { increment: 1 } } }).catch(() => undefined);
    }
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

/** Reclaims expired temporary receipts only after a database claim; uncertain Graph states go to review. */
export async function sweepPracticeExpenseReceiptUploads(options: { now?: Date; staleCleaningMinutes?: number; limit?: number } = {}) {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - (options.staleCleaningMinutes ?? 60) * 60_000);
  const candidates = await db.practiceExpenseReceiptUploadSession.findMany({
    where: { OR: [
      { status: { in: ['INITIATED', 'UPLOADING', 'STORED', 'FAILED'] }, expiresAt: { lt: now } },
      { status: 'CLEANING', cleanupStartedAt: { lt: staleBefore } },
    ] }, orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }], take: options.limit ?? 25,
  });
  let cleaned = 0; let reviewRequired = 0;
  for (const candidate of candidates) {
    const claim = await db.practiceExpenseReceiptUploadSession.updateMany({
      where: { id: candidate.id, version: candidate.version, status: candidate.status },
      data: { status: 'CLEANING', cleanupStartedAt: now, version: { increment: 1 } },
    });
    if (claim.count !== 1) continue;
    try {
      if (candidate.status === 'UPLOADING' || candidate.status === 'STORED' || candidate.status === 'CLEANING') {
        if (!candidate.sha256) throw new Error('Staged upload has no verified digest');
        const repository = storageProvider() === 'graph' ? await resolveFirmPracticeRepository(db, candidate.firmId) : undefined;
        const reference = candidate.storageReference ?? candidate.storageKey;
        await removeObject(reference, repository, candidate.storageReference ? undefined : candidate.sha256);
      }
      await db.practiceExpenseReceiptUploadSession.updateMany({ where: { id: candidate.id, status: 'CLEANING' }, data: { status: 'CLEANED', version: { increment: 1 } } });
      cleaned++;
    } catch {
      await db.practiceExpenseReceiptUploadSession.updateMany({ where: { id: candidate.id, status: 'CLEANING' }, data: { status: 'REVIEW_REQUIRED', version: { increment: 1 } } });
      reviewRequired++;
    }
  }
  return { scanned: candidates.length, cleaned, reviewRequired };
}
