import { createHash } from 'node:crypto';
import { db } from './db.js';

export type AuditCheckpoint = { formatVersion: 1; engagementId: string; sequence: string; digest: string };
export type AuditChainRow = { eventId: string; sequence: bigint; formatVersion: number; previousDigest: string; digest: string; canonicalText: string; currentCanonical: string };
const genesis = '0'.repeat(64);
export function verifyAuditRecords(rows: readonly AuditChainRow[], checkpoint: AuditCheckpoint): { valid: boolean; reason?: string } {
  let previous = genesis;
  let sequence = 0n;
  if (checkpoint.formatVersion !== 1) return { valid: false, reason: 'Unsupported checkpoint format' };
  for (const row of rows) {
    sequence += 1n;
    if (row.formatVersion !== 1 || row.sequence !== sequence || row.previousDigest !== previous)
      return { valid: false, reason: `Broken lineage at event ${row.eventId}` };
    if (row.canonicalText !== row.currentCanonical) return { valid: false, reason: `Event changed: ${row.eventId}` };
    const digest = createHash('sha256').update(previous).update('\n').update(row.canonicalText).digest('hex');
    if (digest !== row.digest) return { valid: false, reason: `Invalid digest: ${row.eventId}` };
    previous = digest;
  }
  if (sequence.toString() !== checkpoint.sequence || previous !== checkpoint.digest)
    return { valid: false, reason: 'Independent checkpoint mismatch or missing events' };
  return { valid: true };
}
/** Capture a manifest for independently locked/signed storage. This function does not sign it. */
export async function captureAuditCheckpoint(engagementId: string): Promise<AuditCheckpoint> {
  const heads = await db.$queryRaw<Array<{ sequence: bigint; digest: string }>>`SELECT sequence, digest FROM "AuditChainHead" WHERE "engagementId" = ${engagementId}::uuid`;
  return { formatVersion: 1, engagementId, sequence: (heads[0]?.sequence ?? 0n).toString(), digest: heads[0]?.digest ?? genesis };
}
/** One repeatable-read snapshot prevents concurrent appends from producing false mismatches. */
export async function verifyAuditChain(engagementId: string, checkpoint?: AuditCheckpoint) {
  if (checkpoint && checkpoint.engagementId !== engagementId) return { valid: false, reason: 'Checkpoint scope mismatch' };
  return db.$transaction(async tx => {
    const heads = await tx.$queryRaw<Array<{ sequence: bigint; digest: string }>>`SELECT sequence, digest FROM "AuditChainHead" WHERE "engagementId" = ${engagementId}::uuid`;
    const expected = checkpoint ?? { formatVersion: 1 as const, engagementId, sequence: (heads[0]?.sequence ?? 0n).toString(), digest: heads[0]?.digest ?? genesis };
    if (!/^\d+$/.test(expected.sequence)) return { valid: false, reason: 'Invalid checkpoint sequence' };
    const rows = await tx.$queryRaw<AuditChainRow[]>`SELECT r.*, public.audit_event_canonical(e) AS "currentCanonical" FROM "AuditChainRecord" r JOIN "AuditEvent" e ON e.id = r."eventId" WHERE r."engagementId" = ${engagementId}::uuid AND r.sequence <= ${BigInt(expected.sequence)} ORDER BY r.sequence`;
    const missing = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM "AuditEvent" e LEFT JOIN "AuditChainRecord" r ON r."eventId" = e.id WHERE e."engagementId" = ${engagementId}::uuid AND r."eventId" IS NULL`;
    if (missing[0].count > 0n) return { valid: false, reason: 'Unchained events detected' };
    return verifyAuditRecords(rows, expected);
  }, { isolationLevel: 'RepeatableRead' });
}
