import { describe, it, expect } from 'vitest';
import { GraphStorage, configuredGraphStorage, decodeGraphReference } from '../packages/server/src/platform/graph-storage.js';

const config = { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret' };
const evidence = { driveId: 'sp', folderId: 'evidence' };
const reference = (fields: Record<string, unknown>) => 'graph:' + Buffer.from(JSON.stringify(fields)).toString('base64url');

describe('Graph evidence storage', () => {
  it('writes into the bound client repository using the immutable provider version', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = (async (url, init) => {
      const target = String(url);
      calls.push({ url: target, init });
      if (target.includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
      if (init?.method === 'PUT') return Response.json({ id: 'file', eTag: 'v1' });
      if (target.includes('/versions?')) return Response.json({ value: [{ id: '1.0', size: 5 }] });
      if (target.endsWith('/versions/1.0')) return Response.json({ id: '1.0', size: 5 });
      if (target.endsWith('/versions/1.0/content')) return new Response(null, { status: 302, headers: { location: 'https://tenant.sharepoint.com/download' } });
      if (target === 'https://tenant.sharepoint.com/download') return new Response('bytes');
      return Response.json({});
    }) as typeof fetch;
    const storage = new GraphStorage(config, request);
    const ref = await storage.put(evidence, 'unique.pdf', Buffer.from('bytes'));
    expect(calls.some((call) => call.url.includes('/drives/sp/items/evidence:/unique.pdf:/content'))).toBe(true);
    const decoded = decodeGraphReference(ref);
    expect(decoded.versionId).toBe('1.0');
    expect(decoded.eTag).toBe('v1');
    expect(calls.find((call) => call.url.includes('/versions?'))?.url).not.toContain('eTag');
    expect(decoded.sizeBytes).toBe(5);
    expect((await storage.get(evidence, ref)).toString()).toBe('bytes');
    expect(calls.some((call) => call.url.endsWith('/versions/1.0/content'))).toBe(true);
    expect(calls.filter((call) => call.url.includes('/token'))).toHaveLength(1);
    // The preauthenticated download URL authenticates itself; no bearer token is forwarded.
    expect(calls.find((call) => call.url === 'https://tenant.sharepoint.com/download')?.init?.headers).toBeUndefined();
  });

  it('keeps an accepted version readable after the current item changes, and rejects substitution', async () => {
    let versionSize = 5;
    let content = 'bytes';
    const request = (async (url, init) => {
      const target = String(url);
      if (target.includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
      if (init?.method === 'PUT') return Response.json({ id: 'file', eTag: 'v9' });
      if (target.includes('/versions?')) return Response.json({ value: [{ id: '1.0', size: 5 }] });
      if (target.endsWith('/versions/1.0')) return Response.json({ id: '1.0', size: versionSize });
      if (target.endsWith('/versions/1.0/content')) return new Response(content);
      return Response.json({});
    }) as typeof fetch;
    const storage = new GraphStorage(config, request);
    const ref = await storage.put(evidence, 'evidence.csv', Buffer.from('bytes'));
    expect(decodeGraphReference(ref).eTag).toBe('v9');
    versionSize = 6;
    await expect(storage.get(evidence, ref)).rejects.toThrow('changed outside');
    versionSize = 5;
    content = 'yyyyy';
    await expect(storage.get(evidence, ref)).rejects.toThrow('SHA-256');
    // A same-size external edit that wins the lookup race must fail at put,
    // before a successful reference can enter the application's database.
    await expect(storage.put(evidence, 'raced.csv', Buffer.from('bytes'))).rejects.toThrow('SHA-256');
  });

  it('rejects a foreign repository, an incomplete reference and an upload without a version identity', async () => {
    expect(() => configuredGraphStorage({})).toThrow('M365_TENANT_ID');
    expect(() => decodeGraphReference(reference({ driveId: 'other', itemId: 'x', versionId: '1', eTag: 'v', sha256: '0'.repeat(64), sizeBytes: 1 }))).not.toThrow();
    expect(() => decodeGraphReference('graph:' + Buffer.from('{}').toString('base64url'))).toThrow('Invalid Graph object identity');
    const storage = new GraphStorage(config, (async (url, init) => {
      const target = String(url);
      if (target.includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
      if (init?.method === 'PUT') return Response.json({ id: 'file', eTag: 'v1' });
      if (target.includes('/versions?')) return Response.json({ value: [] });
      return Response.json({});
    }) as typeof fetch);
    await expect(storage.put(evidence, '../evil.pdf', Buffer.from('bytes'))).rejects.toThrow('Invalid storage filename');
    await expect(storage.put(evidence, 'unique.pdf', Buffer.from('bytes'))).rejects.toThrow('no matching immutable version identity');
    const foreign = reference({ driveId: 'other', itemId: 'x', versionId: '1', eTag: 'v', sha256: '0'.repeat(64), sizeBytes: 1 });
    await expect(storage.get(evidence, foreign)).rejects.toThrow('does not belong to this client repository');
  });
});
