import { describe, it, expect } from 'vitest';
import { GraphStorage, configuredGraphStorage } from '../packages/server/src/platform/graph-storage.js';

const config = { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret', sharepointDriveId: 'sp', sharepointFolderId: 'evidence', onedriveDriveId: 'od', onedriveFolderId: 'working' };
describe('Graph evidence storage', () => {
  it('routes drives, caches tokens, follows downloads without credentials and verifies hashes', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = (async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
      if (init?.method === 'PUT') return Response.json({ id: 'file', eTag: 'v1' });
      if (String(url).endsWith('/content')) return new Response(null, { status: 302, headers: { location: 'https://tenant.sharepoint.com/download' } });
      if (String(url).includes('/download')) return new Response('bytes');
      return Response.json({ eTag: 'v1' });
    }) as typeof fetch;
    const storage = new GraphStorage(config, request);
    const ref = await storage.put('unique.pdf', Buffer.from('bytes'));
    expect((await storage.get(ref)).toString()).toBe('bytes');
    await storage.put('working.pdf', Buffer.from('bytes'), 'working');
    expect(calls.filter(c => c.url.includes('/token'))).toHaveLength(1);
    expect(calls.find(c => c.url.includes('/download'))?.init?.headers).toBeUndefined();
    expect(calls.some(c => c.url.includes('/drives/od/'))).toBe(true);
  });
  it('fails on missing configuration and evidence changed externally', async () => {
    expect(() => configuredGraphStorage({})).toThrow('M365_TENANT_ID');
    let version = 'v1';
    const storage = new GraphStorage(config, (async (url, init) => String(url).includes('/token') ? Response.json({ access_token: 'token', expires_in: 3600 }) : init?.method === 'PUT' ? Response.json({ id: 'file', eTag: version }) : Response.json({ eTag: version })) as typeof fetch);
    const ref = await storage.put('a.csv', Buffer.from('bytes')); version = 'v2';
    await expect(storage.get(ref)).rejects.toThrow('changed outside');
  });
  it('rejects corrupted content and untrusted redirect hosts', async () => {
    for (const target of ['https://evil.test/file', 'https://tenant.sharepoint.com/file']) {
      const storage = new GraphStorage(config, (async (url, init) => {
        if (String(url).includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
        if (init?.method === 'PUT') return Response.json({ id: 'file', eTag: 'v1' });
        if (String(url).endsWith('/content')) return new Response(null, { status: 302, headers: { location: target } });
        if (String(url) === target) return new Response('corrupted');
        return Response.json({ eTag: 'v1' });
      }) as typeof fetch);
      const ref = await storage.put('a.csv', Buffer.from('bytes'));
      await expect(storage.get(ref)).rejects.toThrow(target.includes('evil') ? 'Untrusted' : 'SHA-256');
    }
  });
});
