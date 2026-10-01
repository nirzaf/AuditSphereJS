import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { signAuditCheckpoint, verifySignedAuditCheckpoint } from '@auditsphere/server';

describe('independently signed audit checkpoints', () => {
  it('binds scope, format, sequence, digest, key identity and timestamp to a trusted signer', () => {
    const keys = generateKeyPairSync('ed25519');
    const manifest = signAuditCheckpoint({ formatVersion: 1, engagementId: '11111111-1111-4111-8111-111111111111', sequence: '42', digest: 'a'.repeat(64) }, 'records-2026', keys.privateKey, new Date('2026-10-02T00:00:00.000Z'));
    const trusted = new Map([['records-2026', keys.publicKey]]);
    expect(verifySignedAuditCheckpoint(manifest, trusted)).toBe(true);
    for (const change of [{ sequence: '43' }, { digest: 'b'.repeat(64) }, { engagementId: '22222222-2222-4222-8222-222222222222' }, { signedAt: '2026-10-03T00:00:00.000Z' }, { keyId: 'other-key' }, { formatVersion: 2 }]) {
      expect(verifySignedAuditCheckpoint({ ...manifest, ...change } as typeof manifest, trusted)).toBe(false);
    }
    expect(verifySignedAuditCheckpoint(manifest, new Map())).toBe(false);
    expect(verifySignedAuditCheckpoint(manifest, new Map([['records-2026', generateKeyPairSync('ed25519').publicKey]]))).toBe(false);
    expect(verifySignedAuditCheckpoint({ ...manifest, signature: '!'.repeat(86) }, trusted)).toBe(false);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const nonCanonical = manifest.signature.slice(0,-1) + alphabet[alphabet.indexOf(manifest.signature.at(-1)!) + 1];
    expect(verifySignedAuditCheckpoint({ ...manifest, signature: nonCanonical }, trusted)).toBe(false);
  });
});
