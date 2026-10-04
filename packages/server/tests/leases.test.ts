import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditLeaseService } from '../src/platform/leases.js';

afterEach(() => vi.restoreAllMocks());

describe('advisory edit lease Redis failures', () => {
  it('reports presence unavailable when Redis is closed without creating write authority', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const redis = {
      get: vi.fn().mockRejectedValue(new Error('Command timed out')),
      eval: vi.fn().mockRejectedValue(new Error('Connection is closed.')),
    } as unknown as Parameters<typeof createEditLeaseService>[0];
    const leases = createEditLeaseService(redis);

    await expect(leases.status('engagement', 'import', 'row', 'actor')).resolves.toEqual({
      available: false, action: 'status', reason: 'REDIS_UNAVAILABLE',
    });
    await expect(leases.mutate('engagement', 'import', 'row', 'actor', 'Auditor', { action: 'acquire' })).resolves.toEqual({
      available: false, action: 'acquire', reason: 'REDIS_UNAVAILABLE',
    });
    expect(redis.get).toHaveBeenCalledOnce();
    expect(redis.eval).toHaveBeenCalledOnce();
  });

  it('does not hide malformed Redis script/data errors as a recoverable outage', async () => {
    const redis = {
      get: vi.fn().mockRejectedValue(new Error('ERR Error compiling script')),
      eval: vi.fn(),
    } as unknown as Parameters<typeof createEditLeaseService>[0];
    const leases = createEditLeaseService(redis);

    await expect(leases.status('engagement', 'import', 'row', 'actor')).rejects.toThrow('Error compiling script');
  });
});
