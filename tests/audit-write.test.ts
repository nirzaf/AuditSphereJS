import { describe, expect, it } from 'vitest';
import { redactValue, redactedMarker } from '@auditsphere/server';

describe('audit payload redaction', () => {
  it('replaces sensitive keys at any depth while preserving structure and other values', () => {
    const input = {
      password: 'hunter2',
      nested: { accessToken: 'abc', refreshToken: 'def', keep: 'visible' },
      list: [{ apiKey: 'zzz', amount: '12.340000' }],
      action: 'TB_MAPPED',
    };
    expect(redactValue(input)).toEqual({
      password: redactedMarker,
      nested: { accessToken: redactedMarker, refreshToken: redactedMarker, keep: 'visible' },
      list: [{ apiKey: redactedMarker, amount: '12.340000' }],
      action: 'TB_MAPPED',
    });
  });

  it('leaves primitives and non-sensitive keys untouched', () => {
    expect(redactValue('plain')).toBe('plain');
    expect(redactValue(7)).toBe(7);
    expect(redactValue(null)).toBeNull();
    expect(redactValue({ engagementId: 'e1', digest: 'ab' })).toEqual({ engagementId: 'e1', digest: 'ab' });
  });

  it('stops descending past the depth bound instead of walking unbounded input', () => {
    let deep: Record<string, unknown> = { password: 'deepest' };
    for (let i = 0; i < 10; i++) deep = { child: deep };
    const result = redactValue(deep) as Record<string, unknown>;
    let node: unknown = result;
    for (let i = 0; i < 6; i++) node = (node as Record<string, unknown>).child;
    expect((node as Record<string, unknown>).child).toBe(redactedMarker);
  });
});
