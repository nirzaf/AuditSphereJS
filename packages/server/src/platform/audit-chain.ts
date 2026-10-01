import { createHash, sign, verify, type KeyObject } from 'node:crypto';
import { db } from './db.js';

export type AuditCheckpoint = { formatVersion: 1; engagementId: string; sequence: string; digest: string };
export type SignedAuditCheckpoint = AuditCheckpoint & { keyId: string; signedAt: string; signature: string };

function checkpointBytes(checkpoint: Omit<SignedAuditCheckpoint, 'signature'>): Buffer {
  if (checkpoint.formatVersion !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkpoint.engagementId)
    || !/^(0|[1-9]\d*)$/.test(checkpoint.sequence) || !/^[0-9a-f]{64}$/.test(checkpoint.digest)
    || !/^[A-Za-z0-9_.-]{1,100}$/.test(checkpoint.keyId) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(checkpoint.signedAt)
    || new Date(checkpoint.signedAt).toISOString() !== checkpoint.signedAt) throw new Error('Invalid checkpoint manifest');
  return Buffer.from(JSON.stringify({ formatVersion: 1, engagementId: checkpoint.engagementId, sequence: checkpoint.sequence, digest: checkpoint.digest, keyId: checkpoint.keyId, signedAt: checkpoint.signedAt }));
}
/** Caller supplies a separately protected key; this module never generates or stores production keys. */
export function signAuditCheckpoint(checkpoint: AuditCheckpoint, keyId: string, privateKey: KeyObject, signedAt: Date): SignedAuditCheckpoint {
  if (privateKey.type !== 'private' || privateKey.asymmetricKeyType !== 'ed25519') throw new Error('An Ed25519 private checkpoint key is required');
  const manifest = { ...checkpoint, keyId, signedAt: signedAt.toISOString() };
  return { ...manifest, signature: sign(null, checkpointBytes(manifest), privateKey).toString('base64url') };
}
/** The trust store belongs to the verifier, never to the manifest being checked. */
export function verifySignedAuditCheckpoint(manifest: SignedAuditCheckpoint, trustedKeys: ReadonlyMap<string, KeyObject>): boolean {
  try {
    const key = trustedKeys.get(manifest.keyId);
    if (!key || key.type !== 'public' || key.asymmetricKeyType !== 'ed25519' || !/^[A-Za-z0-9_-]{86}$/.test(manifest.signature)) return false;
    const signature = Buffer.from(manifest.signature, 'base64url');
    if (signature.toString('base64url') !== manifest.signature) return false;
    return verify(null, checkpointBytes(manifest), key, signature);
  } catch { return false; }
}
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
