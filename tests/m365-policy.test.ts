import { createServer } from 'node:http';
import { it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readConfiguration } from '../packages/server/src/platform/config.js';

it('documents the selected Graph permission and excludes unapproved tenant-wide capabilities', async () => {
  const policy = await readFile('docs/microsoft365/permission-matrix.md', 'utf8');
  expect(policy).toContain('Files.SelectedOperations.Selected');
  expect(policy).toContain('Explicit `write` grants on the two synthetic acceptance folders only');
  expect(policy).toContain('Graph mail | None');
  expect(policy).toContain('Graph directory lookup/sync | None');
  expect(policy).toContain('Runtime SharePoint site/folder provisioning | None');
  expect(policy).toContain('Graph change notifications/webhooks | None');
  expect(policy).toContain('Never add `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `Mail.Send`, `User.Read.All`, or `Directory.Read.All`');
});

it('keeps Graph disabled in the local S3 mode and rejects that mode in production', () => {
  const base = { DATABASE_URL: 'postgresql://localhost/test', REDIS_URL: 'redis://localhost' };
  expect(readConfiguration(base).STORAGE_PROVIDER).toBeUndefined();
  expect(() => readConfiguration({ ...base, NODE_ENV: 'production', AUTH_PROVIDER: 'entra', STORAGE_PROVIDER: 'local-s3' }))
    .toThrow('Production requires Entra identity and Graph storage');
});

it('does not acquire a Graph token when local nonproduction storage is selected', async () => {
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const s3 = createServer((request, response) => {
    if (request.method === 'HEAD') { response.writeHead(404); response.end(); return; }
    if (request.method === 'PUT') { response.writeHead(200); response.end(); return; }
    response.writeHead(500); response.end();
  });
  await new Promise<void>(resolve => s3.listen(0, '127.0.0.1', resolve));
  const address = s3.address();
  if (!address || typeof address === 'string') throw new Error('Local S3 test server did not bind');
  try {
    Object.assign(process.env, {
      NODE_ENV: 'test', STORAGE_PROVIDER: 'local-s3', S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
      S3_ACCESS_KEY: 'test-key', S3_SECRET_KEY: 'test-secret', S3_BUCKET: 'policy-test',
      M365_TENANT_ID: 'tenant', M365_CLIENT_ID: 'client', M365_CLIENT_SECRET: 'secret',
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input));
      throw new Error('unexpected outbound fetch');
    }) as typeof fetch;
    const { ensureBucket } = await import('../packages/server/src/platform/storage.js');
    await ensureBucket();
    expect(requests).toEqual([]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    await new Promise<void>((resolve, reject) => s3.close(error => error ? reject(error) : resolve()));
  }
});
