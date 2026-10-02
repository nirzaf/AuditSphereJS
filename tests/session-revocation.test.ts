import { describe, expect, it } from 'vitest';
import { sessionRevocationCutoff, wasSessionRevoked } from '../packages/server/src/platform/session-revocation.js';

describe('Entra session revocation cutoff', () => {
  it('invalidates every token already issued in the current second and allows later tokens', () => {
    const now = new Date('2026-10-02T12:00:00.500Z');
    const cutoff = sessionRevocationCutoff(now);
    expect(cutoff.toISOString()).toBe('2026-10-02T12:00:01.000Z');
    expect(wasSessionRevoked(Math.floor(now.getTime() / 1000), cutoff)).toBe(true);
    expect(wasSessionRevoked(Math.floor(cutoff.getTime() / 1000), cutoff)).toBe(false);
  });
});
