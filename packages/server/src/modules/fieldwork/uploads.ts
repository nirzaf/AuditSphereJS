import { db } from '../../platform/db.js';
import { removeObject } from '../../platform/storage.js';

export type UploadSweepOutcome = { key: string; previousStatus: string; outcome: 'CLEANED' | 'REVIEW_REQUIRED'; detail?: string };

/**
 * Removes unreferenced stored objects that are older than a grace period. A REFERENCED object is
 * evidence and is never selected. Durable Graph evidence is never deleted automatically, so it is
 * reported as requiring review instead.
 */
export async function sweepUnreferencedUploads(options: { olderThanMinutes?: number; limit?: number } = {}) {
  const olderThan = new Date(Date.now() - (options.olderThanMinutes ?? 60) * 60_000);
  const candidates = await db.storedObject.findMany({
    where: { status: { in: ['PENDING', 'DUPLICATE'] }, createdAt: { lt: olderThan } },
    orderBy: { createdAt: 'asc' },
    take: options.limit ?? 100,
  });
  const outcomes: UploadSweepOutcome[] = [];
  for (const candidate of candidates) {
    try {
      await removeObject(candidate.reference ?? candidate.key);
      await db.storedObject.update({ where: { id: candidate.id }, data: { status: 'CLEANED', resolvedAt: new Date() } });
      outcomes.push({ key: candidate.key, previousStatus: candidate.status, outcome: 'CLEANED' });
    } catch (error) {
      outcomes.push({ key: candidate.key, previousStatus: candidate.status, outcome: 'REVIEW_REQUIRED', detail: error instanceof Error ? error.message : 'unknown error' });
    }
  }
  return {
    scanned: candidates.length,
    cleaned: outcomes.filter((outcome) => outcome.outcome === 'CLEANED').length,
    reviewRequired: outcomes.filter((outcome) => outcome.outcome === 'REVIEW_REQUIRED').length,
    outcomes,
  };
}
