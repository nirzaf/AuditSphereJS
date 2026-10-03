import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { requestAuthenticatedContractJson } from './api-client';

afterEach(() => vi.unstubAllGlobals());

const responseSchema = z.object({ ready: z.literal(true) });
const unauthorized = () => new Response(JSON.stringify({
  error: { code: 'UNAUTHENTICATED', status: 401, message: 'Unauthorized' },
}), { status: 401 });

describe('authenticated browser API requests', () => {
  it('refreshes one rejected bearer token and validates the successful response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ready: true })));
    vi.stubGlobal('fetch', fetchMock);
    const getAccessToken = vi.fn()
      .mockResolvedValueOnce('cached-token')
      .mockResolvedValueOnce('fresh-token');

    await expect(requestAuthenticatedContractJson('/api/check', responseSchema, undefined, getAccessToken))
      .resolves.toEqual({ ready: true });

    expect(getAccessToken.mock.calls).toEqual([[false], [true]]);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer cached-token');
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer fresh-token');
  });

  it('does not retry beyond one forced token refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    vi.stubGlobal('fetch', fetchMock);
    const getAccessToken = vi.fn().mockResolvedValue('rejected-token');

    await expect(requestAuthenticatedContractJson('/api/check', responseSchema, undefined, getAccessToken))
      .rejects.toMatchObject({ name: 'ApiContractError', status: 401 });

    expect(getAccessToken.mock.calls).toEqual([[false], [true]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces the server correlation reference without exposing request data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'INTERNAL_SERVER_ERROR', status: 500, message: 'Internal server error', correlationId: 'safe-ref-123' },
    }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestAuthenticatedContractJson('/api/check', responseSchema, undefined, async () => 'token'))
      .rejects.toMatchObject({ status: 500, correlationId: 'safe-ref-123', message: 'Internal server error (reference: safe-ref-123)' });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
