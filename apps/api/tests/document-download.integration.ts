import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { configureHttpSecurity, createFastifyAdapter } from '../src/http-security.js';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'd1000000-0000-4000-8000-000000000001';
const clientId = 'd2000000-0000-4000-8000-000000000002';
const otherClientId = 'd3000000-0000-4000-8000-000000000003';
const engagementId = 'd4000000-0000-4000-8000-000000000004';
const otherEngagementId = 'd5000000-0000-4000-8000-000000000005';
const documentId = 'd6000000-0000-4000-8000-000000000006';
const versionId = 'd7000000-0000-4000-8000-000000000007';
const otherUserId = 'd8000000-0000-4000-8000-000000000008';
const fixtureUser = '00000000-0000-4000-8000-000000000001';
const token = 'document-download-integration-token';
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('document download streams verified immutable bytes only after a fresh scope check and records access', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_document_downloads').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  const originalFetch = globalThis.fetch;
  const originalEnv = new Map(['AUTH_PROVIDER', 'DEV_AUTH_ENABLED', 'DEV_AUTH_TOKEN'].map(name => [name, process.env[name]]));
  const objects = new Map<string, { bytes: Buffer; eTag: string }>();
  let sequence = 0;
  globalThis.fetch = (async (input, init) => {
    const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (target.hostname === '127.0.0.1' || target.hostname === 'localhost') return originalFetch(input, init);
    if (target.hostname === 'login.microsoftonline.com') return Response.json({ access_token: 'synthetic-graph-token', expires_in: 3600 });
    if (init?.method === 'PUT') {
      const itemId = `download-item-${++sequence}`;
      const bytes = Buffer.from(init.body as Uint8Array);
      const eTag = `download-etag-${sequence}`;
      objects.set(itemId, { bytes, eTag });
      return Response.json({ id: itemId, eTag });
    }
    const itemId = decodeURIComponent(target.pathname.split('/items/')[1]?.split('/')[0] ?? '');
    const stored = objects.get(itemId);
    if (target.pathname.endsWith('/versions')) return stored ? Response.json({ value: [{ id: '1.0', size: stored.bytes.byteLength }] }) : Response.json({}, { status: 404 });
    if (target.pathname.endsWith('/versions/1.0')) return stored ? Response.json({ id: '1.0', size: stored.bytes.byteLength }) : Response.json({}, { status: 404 });
    if (target.pathname.endsWith('/versions/1.0/content')) return stored ? new Response(new Uint8Array(stored.bytes)) : Response.json({}, { status: 404 });
    throw new Error(`Unexpected synthetic Graph request: ${target.pathname}`);
  }) as typeof fetch;

  let app: NestFastifyApplication | undefined;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, {
      NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri,
      STORAGE_PROVIDER: 'graph', M365_TENANT_ID: tenantId, M365_CLIENT_ID: 'synthetic-client', M365_CLIENT_SECRET: 'synthetic-secret',
      AUTH_PROVIDER: 'development', DEV_AUTH_ENABLED: 'true', DEV_AUTH_TOKEN: token,
    });
    const { db, GraphStorage, DocumentDownloadsController, InternalIdentityGuard } = await import('@auditsphere/server');
    disconnect = () => db.$disconnect();
    const bytes = Buffer.from('%PDF-1.7\nimmutable acceptance evidence');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Download acceptance firm' } });
      await db.client.createMany({ data: [{ id: clientId, firmId, name: 'Download client' }, { id: otherClientId, firmId, name: 'Other download client' }] });
      await db.engagement.createMany({ data: [
        { id: engagementId, firmId, clientId, name: 'Download engagement', state: 'FIELDWORK_EXECUTION' },
        { id: otherEngagementId, firmId, clientId: otherClientId, name: 'Other client engagement', state: 'FIELDWORK_EXECUTION' },
      ] });
      await db.user.createMany({ data: [
        { id: fixtureUser, email: 'download-staff@example.test', role: 'PREPARER' },
        { id: otherUserId, email: 'foreign-download-staff@example.test', role: 'PREPARER' },
      ] });
      await db.membership.createMany({ data: [
        { userId: fixtureUser, firmId, clientId, engagementId, role: 'PREPARER' },
        { userId: otherUserId, firmId, clientId: otherClientId, engagementId: otherEngagementId, role: 'PREPARER' },
      ] });
      await db.roleGrant.createMany({ data: [
        { userId: fixtureUser, capability: 'ENGAGEMENT_READ', firmId, clientId, engagementId, grantedBy: fixtureUser, reason: 'scoped download test' },
        { userId: otherUserId, capability: 'ENGAGEMENT_READ', firmId, clientId: otherClientId, engagementId: otherEngagementId, grantedBy: fixtureUser, reason: 'foreign-scope denial test' },
      ] });
      await db.clientRepository.create({ data: { firmId, clientId, purpose: 'evidence', provider: 'graph', driveId: 'download-drive', folderId: 'download-folder' } });
      const graph = new GraphStorage({ tenantId, clientId: 'synthetic-client', clientSecret: 'synthetic-secret' });
      const reference = await graph.put({ driveId: 'download-drive', folderId: 'download-folder', purpose: 'evidence' }, 'synthetic-evidence.pdf', bytes);
      await db.document.create({ data: { id: documentId, engagementId, key: reference, sha256, filename: 'quarterly "evidence" – 01.pdf', category: '03_Fieldwork & Testing' } });
      await db.documentVersion.create({ data: {
        id: versionId, engagementId, documentId, sequence: 1, provider: 'graph', storageReference: reference,
        driveId: 'download-drive', itemId: 'download-item-1', versionId: '1.0', eTag: 'download-etag-1', sha256, sizeBytes: bytes.byteLength, createdBy: fixtureUser,
      } });

      await assert.rejects(import('@auditsphere/server').then(({ prepareDocumentVersionDownload }) => prepareDocumentVersionDownload(otherUserId, documentId, versionId)), /Document version not found/, 'a foreign client cannot obtain a download response or provider address');

      @Module({ controllers: [DocumentDownloadsController], providers: [InternalIdentityGuard] })
      class DownloadApiModule {}
      app = await NestFactory.create<NestFastifyApplication>(DownloadApiModule, createFastifyAdapter(), { logger: false });
      await configureHttpSecurity(app, { NODE_ENV: 'test', WEB_ORIGIN: 'http://localhost:4200' });
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address();
      assert.ok(address && typeof address === 'object');
      const origin = `http://127.0.0.1:${address.port}`;
      const url = `${origin}/api/v1/documents/${documentId}/versions/${versionId}/download`;
      assert.equal((await fetch(url)).status, 401, 'downloads require current application authentication');
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes, 'the endpoint streams the exact staged provider bytes');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="quarterly _evidence_ _ 01.pdf"; filename*=UTF-8\'\'quarterly%20%22evidence%22%20%E2%80%93%2001.pdf');
      assert.equal(response.headers.get('content-length'), String(bytes.byteLength));
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-auditsphere-document-version'), '1');
      assert.equal(response.headers.get('x-auditsphere-document-sha256'), sha256);
      assert.equal(response.headers.get('location'), null, 'the browser never receives a Graph preauthenticated URL');
      let downloadEvents: Array<{ action: string; resourceVersion: number | null }> = [];
      for (let attempt = 0; attempt < 50; attempt++) {
        downloadEvents = await db.auditEvent.findMany({ where: { engagementId, resourceType: 'DocumentVersion', resourceId: versionId }, orderBy: { createdAt: 'asc' }, select: { action: true, resourceVersion: true } });
        if (downloadEvents.some(event => event.action === 'DOCUMENT_VERSION_DOWNLOAD_RESPONSE_FINISHED')) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.deepEqual(downloadEvents.map(event => [event.action, event.resourceVersion]), [
        ['DOCUMENT_VERSION_DOWNLOAD_AUTHORIZED', 1], ['DOCUMENT_VERSION_DOWNLOAD_RESPONSE_FINISHED', 1],
      ], 'audit history distinguishes authorization and completed server response for the exact version');

      const storedItem = objects.get('download-item-1')!;
      storedItem.bytes = Buffer.from(storedItem.bytes);
      storedItem.bytes[storedItem.bytes.length - 1] = storedItem.bytes[storedItem.bytes.length - 1]! ^ 1;
      const corrupted = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      assert.equal(corrupted.status, 500, 'provider hash mismatch fails before any binary response begins');
      assert.equal((await corrupted.text()).includes(storedItem.bytes.toString()), false);
      assert.equal(await db.auditEvent.count({ where: { engagementId, resourceType: 'DocumentVersion', resourceId: versionId, action: 'DOCUMENT_VERSION_DOWNLOAD_FAILED' } }), 1, 'a failed immutable-version read is auditable separately from a completed transfer');

      await db.roleGrant.updateMany({ where: { userId: fixtureUser, capability: 'ENGAGEMENT_READ', engagementId }, data: { revokedAt: new Date(), revokedBy: fixtureUser, reason: 'test immediate access revocation' } });
      const afterRevocation = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      assert.equal(afterRevocation.status, 404, 'revoked access is rechecked; there is no reusable download URL');
      const absentVersion = await fetch(`${origin}/api/v1/documents/${documentId}/versions/d7000000-0000-4000-8000-000000000099/download`, { headers: { authorization: `Bearer ${token}` } });
      assert.equal(absentVersion.status, 404);
      console.log('document downloads verify exact provider bytes before streaming, enforce live engagement scope, and audit the exact version without exposing provider URLs');
    } finally {
      await app?.close();
      await db.$disconnect();
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of originalEnv) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    await disconnect?.();
    await container.stop();
  }
});
