import { describe, it, expect } from 'vitest';
import { isRetryableConflict, backoffDelay } from '@auditsphere/server';

describe('retryable-conflict classification (T024)', () => {
  it('treats transient PostgreSQL conflicts as retryable', () => {
    expect(isRetryableConflict(Object.assign(new Error('conflict'), { code: 'P2034' }))).toBe(true);
    expect(isRetryableConflict(new Error('deadlock detected'))).toBe(true);
    expect(isRetryableConflict(new Error('could not serialize access due to concurrent update'))).toBe(true);
  });

  it('never treats validation, authorization or unique violations as retryable', () => {
    expect(isRetryableConflict(Object.assign(new Error('duplicate key'), { code: 'P2002' }))).toBe(false);
    expect(isRetryableConflict(new Error('The adjustment must balance'))).toBe(false);
    expect(isRetryableConflict(new Error('FORBIDDEN_RESOURCE'))).toBe(false);
    expect(isRetryableConflict(new Error('Retry the request after resolving concurrent changes'))).toBe(false);
    expect(isRetryableConflict(Object.assign(new Error('deadlock detected'), { code: 'P2002' }))).toBe(false);
  });
});

describe('deterministic capped backoff (T024)', () => {
  it('doubles per attempt and caps', () => {
    expect(backoffDelay(1)).toBe(20);
    expect(backoffDelay(2)).toBe(40);
    expect(backoffDelay(3)).toBe(80);
    expect(backoffDelay(10, 20, 500)).toBe(500);
  });

  it('rejects a non-positive attempt', () => {
    expect(() => backoffDelay(0)).toThrow(/positive integer/);
  });
});
