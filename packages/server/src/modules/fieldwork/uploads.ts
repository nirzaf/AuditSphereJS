import { db } from '../../platform/db.js';
import { removeObject, storageProvider } from '../../platform/storage.js';
import { resolveClientRepository } from '../../platform/repository.js';

export type UploadSweepOutcome = { key: string; previousStatus: string; outcome: 'CLEANED' | 'REVIEW_REQUIRED'; detail?: string };

/**
 * Recycles unreferenced storage only after a grace period. CLEANING is a persisted lease, so
 * interrupted cleanup can be retried while finalization cannot attach the same object concurrently.
 * REFERENCED evidence is never selected. Graph deletes move verified staging files to the recycle bin.
 */
export async function sweepUnreferencedUploads(options: { olderThanMinutes?: number; limit?: number } = {}) {
  const olderThan = new Date(Date.now() - (options.olderThanMinutes ?? 60) * 60_000);
  const expiredSessions = await db.documentUploadSession.updateMany({
    where: { status: { in: ['INITIATED', 'STORED'] }, expiresAt: { lt: new Date() }, createdAt: { lt: olderThan } },
    data: { status: 'EXPIRED', version: { increment: 1 } },
  });
  const candidates = await db.storedObject.findMany({
    where: { OR: [
      { status: { in: ['UPLOADING', 'PENDING', 'DUPLICATE'] }, createdAt: { lt: olderThan } },
      { status: 'CLEANING', OR: [{ cleanupStartedAt: null }, { cleanupStartedAt: { lt: olderThan } }] },
    ] },
    orderBy: { createdAt: 'asc' },
    take: options.limit ?? 100,
    include: { engagement: { select: { id: true, firmId: true, clientId: true } } },
  });
  const outcomes: UploadSweepOutcome[] = [];
  for (const candidate of candidates) {
    const claimedAt = new Date();
    const claimed = await db.storedObject.updateMany({
      where: candidate.status === 'CLEANING'
        ? { id: candidate.id, status: 'CLEANING', cleanupStartedAt: candidate.cleanupStartedAt }
        : { id: candidate.id, status: candidate.status, createdAt: { lt: olderThan } },
      data: { status: 'CLEANING', cleanupStartedAt: claimedAt },
    });
    if (claimed.count !== 1) continue;
    try {
      const repository = storageProvider() === 'graph'
        ? await resolveClientRepository(db, candidate.engagement.firmId, candidate.engagement.clientId, 'evidence')
        : undefined;
      if (repository && !new RegExp(`^${candidate.engagement.id}/[0-9a-f-]{36}(?:\\.[a-z0-9]+)?$`, 'i').test(candidate.key)) throw new Error('Graph cleanup key is not an application-generated staging name');
      await removeObject(candidate.reference ?? candidate.key, repository, candidate.sha256);
      await db.storedObject.updateMany({ where: { id: candidate.id, status: 'CLEANING', cleanupStartedAt: claimedAt }, data: { status: 'CLEANED', cleanupStartedAt: null, resolvedAt: new Date() } });
      outcomes.push({ key: candidate.key, previousStatus: candidate.status, outcome: 'CLEANED' });
    } catch (error) {
      await db.storedObject.updateMany({
        where: { id: candidate.id, status: 'CLEANING', cleanupStartedAt: claimedAt },
        data: candidate.status === 'CLEANING'
          ? { cleanupStartedAt: new Date() }
          : { status: candidate.status === 'UPLOADING' ? 'PENDING' : candidate.status, cleanupStartedAt: null },
      });
      outcomes.push({ key: candidate.key, previousStatus: candidate.status, outcome: 'REVIEW_REQUIRED', detail: error instanceof Error ? error.message : 'unknown error' });
    }
  }
  return {
    scanned: candidates.length,
    expiredSessions: expiredSessions.count,
    cleaned: outcomes.filter((outcome) => outcome.outcome === 'CLEANED').length,
    reviewRequired: outcomes.filter((outcome) => outcome.outcome === 'REVIEW_REQUIRED').length,
    outcomes,
  };
}
