import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import type { Prisma } from '../../generated/prisma/client.js';
import { db } from '../../platform/db.js';
import {
  claimBackgroundOperation,
  completeBackgroundOperation,
  failBackgroundOperation,
  parseTrialBalanceOutbox,
  parseTrialBalanceOutboxJob,
  retryBackgroundOperation,
  type TrialBalanceOutboxJob,
} from '../../platform/outbox.js';
import { importWhere, parseImportJob } from './import-job.js';
import { parseTrialBalanceStream, writeTrialBalanceChunks } from './parser.js';

type QueueJob = Pick<Job<TrialBalanceOutboxJob>, 'id' | 'data' | 'attemptsMade' | 'opts'>;
type ScopedDocument = { key: string; sha256: string; id: string };
type ScopedImport = { id: string; firmId: string; clientId: string; engagementId: string; documentId: string; documentVersionId: string | null; rowCount: number; status: string };

export type LoadTrialBalanceEvidence = (document: ScopedDocument, batch: ScopedImport) => Promise<string | Buffer>;

const completedStatuses = new Set(['MAPPING_REQUIRED', 'FINALIZED']);
const operationResult = (batch: Pick<ScopedImport, 'status' | 'rowCount'>): Prisma.InputJsonValue => ({
  status: batch.status,
  rowCount: batch.rowCount,
});

/**
 * A durable operation CAS suppresses duplicate queue deliveries. The import rows and operation
 * completion are committed together, so an acknowledgement lost after commit is a harmless replay.
 */
export function createTrialBalanceImportProcessor(loadEvidence: LoadTrialBalanceEvidence) {
  return async (job: QueueJob): Promise<void> => {
    const queued = parseTrialBalanceOutboxJob(job.data);
    if (job.id !== queued.operationId || queued.outboxEventId !== queued.operationId) {
      throw new Error('Trial-balance job identity does not match its durable operation');
    }
    const event = await db.outboxEvent.findUnique({ where: { id: queued.outboxEventId } });
    if (!event?.importId) throw new Error('Scoped trial-balance outbox event not found');
    const expected = parseTrialBalanceOutbox(event);
    if (expected.operationId !== queued.operationId || expected.payloadVersion !== queued.payloadVersion) {
      throw new Error('Trial-balance queue payload does not match its outbox record');
    }
    const scope = parseImportJob({
      importId: event.importId,
      firmId: event.firmId,
      clientId: event.clientId,
      engagementId: event.engagementId,
    });
    const where = importWhere(scope);
    if (!await claimBackgroundOperation(expected.operationId)) return;

    const batch = await db.tbImport.findFirst({ where });
    if (!batch) {
      await db.$transaction(tx => failBackgroundOperation(tx, expected.operationId, 'TB_IMPORT_MISSING'));
      return;
    }
    if (completedStatuses.has(batch.status)) {
      await db.$transaction(tx => completeBackgroundOperation(tx, expected.operationId, operationResult(batch)));
      return;
    }
    if (batch.status === 'FAILED') {
      await db.$transaction(tx => failBackgroundOperation(tx, expected.operationId, 'TB_IMPORT_FAILED'));
      return;
    }

    const claimedBatch = await db.tbImport.updateMany({
      where: { ...where, status: { in: ['QUEUED', 'PARSING'] } },
      data: { status: 'PARSING', error: null },
    });
    if (!claimedBatch.count) {
      await db.$transaction(tx => failBackgroundOperation(tx, expected.operationId, 'TB_IMPORT_STATE_INVALID'));
      return;
    }

    try {
      const document = await db.document.findFirst({
        where: { id: batch.documentId, engagementId: scope.engagementId },
        select: { id: true, key: true, sha256: true },
      });
      if (!document) throw new Error('Scoped trial-balance evidence not found');
      let evidence = document;
      if (batch.documentVersionId) {
        const version = await db.documentVersion.findFirst({
          where: { id: batch.documentVersionId, documentId: document.id, engagementId: scope.engagementId },
          select: { storageReference: true, sha256: true },
        });
        if (!version) throw new Error('Scoped trial-balance document version not found');
        evidence = { ...document, key: version.storageReference, sha256: version.sha256 };
      }
      const content = await loadEvidence(evidence, batch);
      if (createHash('sha256').update(content).digest('hex') !== evidence.sha256) {
        throw Object.assign(new Error('Evidence hash mismatch'), { code: 'EVIDENCE_HASH_MISMATCH' });
      }

      await db.$transaction(async tx => {
        await tx.$queryRaw`
          SELECT id FROM "TbImport"
          WHERE id = ${batch.id}::uuid
            AND "firmId" = ${scope.firmId}::uuid
            AND "clientId" = ${scope.clientId}::uuid
            AND "engagementId" = ${scope.engagementId}::uuid
          FOR UPDATE
        `;
        const latest = await tx.tbImport.findFirst({ where });
        if (!latest) throw new Error('Scoped trial-balance import not found');
        if (completedStatuses.has(latest.status)) {
          await completeBackgroundOperation(tx, expected.operationId, operationResult(latest));
          return;
        }
        if (latest.status !== 'PARSING') throw new Error('Trial-balance import left its processing state');

        await tx.tbRow.deleteMany({ where: { importId: batch.id } });
        const rowCount = await writeTrialBalanceChunks(parseTrialBalanceStream(content), async chunk => {
          await tx.tbRow.createMany({ data: chunk.map(value => ({ ...value, importId: batch.id })) });
        });
        const updated = await tx.tbImport.updateMany({
          where: { ...where, status: 'PARSING' },
          data: { status: 'MAPPING_REQUIRED', rowCount, error: null },
        });
        if (updated.count !== 1) throw new Error('Trial-balance import changed before parse completion');
        await completeBackgroundOperation(tx, expected.operationId, { status: 'MAPPING_REQUIRED', rowCount });
      }, { timeout: 120_000 });
    } catch (error) {
      const terminal = job.attemptsMade + 1 >= (job.opts.attempts || 1);
      await db.$transaction(async tx => {
        const currentOperation = await tx.backgroundOperation.findUnique({ where: { id: expected.operationId } });
        if (!currentOperation || currentOperation.state !== 'RUNNING') return;

        const latest = await tx.tbImport.findFirst({ where });
        if (latest && completedStatuses.has(latest.status)) {
          await completeBackgroundOperation(tx, expected.operationId, operationResult(latest));
          return;
        }

        const changed = await tx.tbImport.updateMany({
          where: { ...where, status: { in: ['QUEUED', 'PARSING'] } },
          data: {
            status: terminal ? 'FAILED' : 'QUEUED',
            error: error instanceof Error ? error.message.slice(0, 500) : 'Import failed',
          },
        });
        if (!changed.count) {
          await failBackgroundOperation(tx, expected.operationId, 'TB_IMPORT_STATE_INVALID');
          return;
        }
        if (terminal) await failBackgroundOperation(tx, expected.operationId, 'TB_IMPORT_FAILED');
        else await retryBackgroundOperation(tx, expected.operationId);
      });
      throw error;
    }
  };
}
