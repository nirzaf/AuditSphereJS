import { describe, expect, it } from 'vitest';
import { normalizedRequestHash } from '../src/platform/idempotency.js';

describe('normalized operation request hashes', () => {
  it('ignores object insertion order recursively while preserving array order', () => {
    expect(normalizedRequestHash({ amount: '10.00', detail: { b: 2, a: 1 } }))
      .toBe(normalizedRequestHash({ detail: { a: 1, b: 2 }, amount: '10.00' }));
    expect(normalizedRequestHash({ lines: ['debit', 'credit'] }))
      .not.toBe(normalizedRequestHash({ lines: ['credit', 'debit'] }));
  });

  it('rejects values JSON would silently omit or change', () => {
    expect(() => normalizedRequestHash({ value: undefined })).toThrow(/undefined/);
    expect(() => normalizedRequestHash({ value: Number.NaN })).toThrow(/non-finite/);
    expect(() => normalizedRequestHash({ value: 1n })).toThrow(/unsupported bigint/);
    expect(() => normalizedRequestHash(new Date())).toThrow(/plain JSON objects/);
    const sparse = Array(1);
    expect(() => normalizedRequestHash({ values: sparse })).toThrow(/sparse array/);
  });
});
