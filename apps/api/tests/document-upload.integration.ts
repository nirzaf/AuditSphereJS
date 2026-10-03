import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { configureHttpSecurity, createFastifyAdapter } from '../src/http-security.js';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const firmId = 'a1000000-0000-4000-8000-000000000001';
const clientId = 'a2000000-0000-4000-8000-000000000002';
const engagementId = 'a3000000-0000-4000-8000-000000000003';
const otherClientId = 'a4000000-0000-4000-8000-000000000004';
const otherEngagementId = 'a5000000-0000-4000-8000-000000000005';
const actorId = 'a6000000-0000-4000-8000-000000000006';
const otherActorId = 'a7000000-0000-4000-8000-000000000007';
const localFixtureId = '00000000-0000-4000-8000-000000000001';
const testTenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('document upload sessions validate bytes and recheck authorization/workflow before attachment', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_document_uploads').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  const originalFetch = globalThis.fetch;
  const originalEnv = new Map(['AUTH_PROVIDER', 'DEV_AUTH_ENABLED', 'DEV_AUTH_TOKEN'].map(name => [name, process.env[name]]));
  const objects = new Map<string, Buffer>();
  const recycledItemIds: string[] = [];
  let objectNumber = 0;
  globalThis.fetch = (async (input, init) => {
    const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (target.hostname === '127.0.0.1' || target.hostname === 'localhost') return originalFetch(input, init);
    if (target.hostname === 'login.microsoftonline.com') return Response.json({ access_token: 'synthetic-graph-token', expires_in: 3600 });
    if (init?.method === 'DELETE') {
      const itemId = decodeURIComponent(target.pathname.split('/items/')[1]?.split('/')[0] ?? '');
      recycledItemIds.push(itemId);
      objects.delete(itemId);
      return new Response(null, { status: 204 });
    }
    if (init?.method === 'PUT') {
      const itemId = `upload-item-${++objectNumber}`;
      const body = init.body;
      objects.set(itemId, body instanceof ReadableStream
        ? Buffer.from(await new Response(body).arrayBuffer())
        : Buffer.from(body as Uint8Array));
      return Response.json({ id: itemId, eTag: `etag-${objectNumber}` });
    }
    const itemId = decodeURIComponent(target.pathname.split('/items/')[1]?.split('/')[0] ?? '');
    const bytes = objects.get(itemId);
    if (target.pathname.endsWith('/versions')) return bytes ? Response.json({ value: [{ id: '1.0', size: bytes.byteLength }] }) : Response.json({ error: 'missing' }, { status: 404 });
    if (target.pathname.endsWith('/versions/1.0')) return bytes ? Response.json({ id: '1.0', size: bytes.byteLength }) : Response.json({ error: 'missing' }, { status: 404 });
    if (target.pathname.endsWith('/versions/1.0/content')) return bytes ? new Response(new Uint8Array(bytes)) : Response.json({ error: 'missing' }, { status: 404 });
    throw new Error(`Unexpected synthetic Graph request: ${target.pathname}`);
  }) as typeof fetch;

  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, { NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri, STORAGE_PROVIDER: 'graph', M365_TENANT_ID: testTenant, M365_CLIENT_ID: 'synthetic-client', M365_CLIENT_SECRET: 'synthetic-secret', AUTH_PROVIDER: 'development', DEV_AUTH_ENABLED: 'true', DEV_AUTH_TOKEN: 'document-upload-integration-token' });
    const { db, initiateDocumentUpload, receiveDocumentUpload, finalizeDocumentUpload, sweepUnreferencedUploads, decodeGraphReference, DocumentUploadsController, InternalIdentityGuard } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Upload session firm' } });
      await db.client.createMany({ data: [{ id: clientId, firmId, name: 'Upload client' }, { id: otherClientId, firmId, name: 'Other client' }] });
      await db.engagement.createMany({ data: [
        { id: engagementId, firmId, clientId, name: 'Upload engagement', state: 'FIELDWORK_EXECUTION' },
        { id: otherEngagementId, firmId, clientId: otherClientId, name: 'Other client engagement', state: 'FIELDWORK_EXECUTION' },
      ] });
      await db.user.createMany({ data: [
        { id: actorId, email: 'upload-user@example.test', role: 'PREPARER' },
        { id: otherActorId, email: 'other-upload-user@example.test', role: 'PREPARER' },
      ] });
      await db.user.create({ data: { id: localFixtureId, email: 'local-upload-fixture@example.test', role: 'PREPARER' } });
      await db.membership.create({ data: { userId: actorId, firmId, clientId, engagementId, role: 'PREPARER' } });
      await db.membership.create({ data: { userId: localFixtureId, firmId, clientId, engagementId, role: 'PREPARER' } });
      for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE'] as const) await db.roleGrant.create({ data: { userId: actorId, capability, firmId, clientId, engagementId, grantedBy: actorId, reason: 'synthetic upload-session acceptance' } });
      for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE'] as const) await db.roleGrant.create({ data: { userId: localFixtureId, capability, firmId, clientId, engagementId, grantedBy: localFixtureId, reason: 'synthetic API upload-session acceptance' } });
      await db.clientRepository.create({ data: { firmId, clientId, purpose: 'evidence', provider: 'graph', driveId: 'upload-drive', folderId: 'upload-evidence-folder' } });

      await assert.rejects(initiateDocumentUpload(otherActorId, { engagementId, category: '03_Fieldwork & Testing', filename: 'blocked.pdf', contentType: 'application/pdf', sizeBytes: 12 }), /not granted|authorization/);
      await assert.rejects(initiateDocumentUpload(actorId, { engagementId, category: '03_Fieldwork & Testing', filename: 'macro-enabled.xlsm', contentType: 'application/vnd.ms-excel.sheet.macroEnabled.12', sizeBytes: 128 }), /Bad Request Exception/, 'macro-enabled workbooks are rejected before an upload session is created');
      assert.equal(await db.documentUploadSession.count({ where: { engagementId, originalFilename: 'macro-enabled.xlsm' } }), 0, 'unsupported workbook MIME cannot create an upload session');

      const interrupted = await initiateDocumentUpload(actorId, { engagementId, category: '03_Fieldwork & Testing', filename: 'interrupted.pdf', contentType: 'application/pdf', sizeBytes: 12 }) as { id: string };
      assert.equal(await db.document.count({ where: { engagementId } }), 0, 'an initiated but interrupted transfer creates no document');
      assert.equal((await db.documentUploadSession.findUniqueOrThrow({ where: { id: interrupted.id } })).status, 'INITIATED');
      const unauthorizedBytes = Buffer.from('%PDF-1.7\nforeign');
      await assert.rejects(receiveDocumentUpload(otherActorId, interrupted.id, { filename: 'interrupted.pdf', mimetype: 'application/pdf', file: (async function* () { yield unauthorizedBytes; })() }), /Upload session not found/);

      const spoofed = await initiateDocumentUpload(actorId, { engagementId, category: '03_Fieldwork & Testing', filename: 'spoofed.pdf', contentType: 'application/pdf', sizeBytes: 9 }) as { id: string };
      const csvBytes = Buffer.from('code,name');
      await assert.rejects(receiveDocumentUpload(actorId, spoofed.id, { filename: 'spoofed.pdf', mimetype: 'application/pdf', file: (async function* () { yield csvBytes; })() }), /content does not match/);
      assert.equal(await db.document.count({ where: { engagementId } }), 0, 'MIME spoofing cannot create an attached document');

      const mismatchedSize = await initiateDocumentUpload(actorId, { engagementId, category: '03_Fieldwork & Testing', filename: 'mismatched.pdf', contentType: 'application/pdf', sizeBytes: 17 }) as { id: string };
      const mismatchedBytes = Buffer.from('%PDF-1.7\nsmall');
      await assert.rejects(receiveDocumentUpload(actorId, mismatchedSize.id, { filename: 'mismatched.pdf', mimetype: 'application/pdf', file: (async function* () { yield mismatchedBytes; })() }), /size does not match/);
      assert.equal(await db.document.count({ where: { engagementId } }), 0, 'declared and observed sizes must match before bytes are attached');

      const pdfBytes = Buffer.from('%PDF-1.7\nfixture');
      const frozen = await initiateDocumentUpload(actorId, { engagementId, category: '03_Fieldwork & Testing', filename: 'frozen.pdf', contentType: 'application/pdf', sizeBytes: pdfBytes.byteLength, expectedSha256: createHash('sha256').update(pdfBytes).digest('hex') }) as { id: string };
      await receiveDocumentUpload(actorId, frozen.id, { filename: 'frozen.pdf', mimetype: 'application/pdf', file: (async function* () { yield pdfBytes.subarray(0, 5); yield pdfBytes.subarray(5); })() });
      await db.engagement.update({ where: { id: engagementId }, data: { state: 'DELIVERABLE_RELEASE' } });
      await assert.rejects(finalizeDocumentUpload(actorId, frozen.id), /does not permit uploads/);
      assert.equal(await db.document.count({ where: { engagementId } }), 0, 'a workflow freeze after transfer prevents attachment');
      await db.engagement.update({ where: { id: engagementId }, data: { state: 'FIELDWORK_EXECUTION' } });
      const finalized = await finalizeDocumentUpload(actorId, frozen.id) as { documentId: string; documentVersionId: string; sha256: string; sizeBytes: number };
      const document = await db.document.findFirstOrThrow({ where: { id: finalized.documentId, engagementId } });
      const version = await db.documentVersion.findFirstOrThrow({ where: { id: finalized.documentVersionId, engagementId, documentId: document.id } });
      assert.equal(finalized.sha256, createHash('sha256').update(pdfBytes).digest('hex'));
      assert.equal(finalized.sizeBytes, pdfBytes.byteLength);
      assert.equal(version.storageReference.startsWith('graph:'), true);
      assert.equal((await db.documentUploadSession.findUniqueOrThrow({ where: { id: frozen.id } })).status, 'FINALIZED');
      assert.deepEqual(await finalizeDocumentUpload(actorId, frozen.id), finalized, 'a same-actor retry returns the immutable finalized result');
      assert.equal(await db.document.count({ where: { engagementId } }), 1, 'finalize replay never duplicates a document');
      assert.equal(await db.storedObject.count({ where: { engagementId, documentId: document.id, status: 'REFERENCED' } }), 1);
      await assert.rejects(db.$executeRaw`UPDATE "DocumentUploadSession" SET status = 'STORED', version = version + 1 WHERE id = ${frozen.id}::uuid`, /invalid state transition|check constraint/i);

      const abandonedBytes = Buffer.from('%PDF-1.7\nabandoned-stage');
      const abandoned = await initiateDocumentUpload(actorId, { engagementId, category: '03_Fieldwork & Testing', filename: 'abandoned.pdf', contentType: 'application/pdf', sizeBytes: abandonedBytes.byteLength }) as { id: string };
      await receiveDocumentUpload(actorId, abandoned.id, { filename: 'abandoned.pdf', mimetype: 'application/pdf', file: (async function* () { yield abandonedBytes; })() });
      const abandonedRow = await db.storedObject.findFirstOrThrow({ where: { engagementId, status: 'PENDING', documentId: null, sha256: createHash('sha256').update(abandonedBytes).digest('hex') } });
      await db.$executeRaw`UPDATE "StoredObject" SET "createdAt" = now() - interval '2 hours' WHERE id = ${abandonedRow.id}::uuid`;
      const sweep = await sweepUnreferencedUploads({ olderThanMinutes: 60 });
      assert.equal(sweep.cleaned, 1, 'an expired, unreferenced Graph stage is recycled');
      assert.deepEqual(recycledItemIds, [decodeGraphReference(abandonedRow.reference!).itemId]);
      assert.equal((await db.storedObject.findUniqueOrThrow({ where: { id: abandonedRow.id } })).status, 'CLEANED');
      await assert.rejects(finalizeDocumentUpload(actorId, abandoned.id), /no longer matches|not ready/);

      @Module({ controllers: [DocumentUploadsController], providers: [InternalIdentityGuard] })
      class UploadApiModule {}
      const app = await NestFactory.create<NestFastifyApplication>(UploadApiModule, createFastifyAdapter(), { logger: false });
      try {
        await configureHttpSecurity(app, { NODE_ENV: 'test', WEB_ORIGIN: 'http://localhost:4200' });
        app.setGlobalPrefix('api/v1');
        await app.listen(0, '127.0.0.1');
        const address = app.getHttpServer().address();
        assert.ok(address && typeof address === 'object');
        const origin = `http://127.0.0.1:${address.port}`;
        const apiHeaders = { authorization: 'Bearer document-upload-integration-token' };
        const oversizedInit = await fetch(`${origin}/api/v1/documents/uploads`, { method: 'POST', headers: { ...apiHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ engagementId, category: '03_Fieldwork & Testing', filename: 'oversized.pdf', contentType: 'application/pdf', sizeBytes: 15_000_001 }) });
        assert.equal(oversizedInit.status, 400, 'the shared contract rejects declared sizes above 15 MB before a session is persisted');
        const apiPdf = Buffer.from('%PDF-1.7\napi-fixture');
        const create = await fetch(`${origin}/api/v1/documents/uploads`, { method: 'POST', headers: { ...apiHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ engagementId, category: '03_Fieldwork & Testing', filename: 'api-evidence.pdf', contentType: 'application/pdf', sizeBytes: apiPdf.byteLength }) });
        assert.equal(create.status, 201);
        const created = await create.json() as { id: string; status: string };
        assert.equal(created.status, 'INITIATED');
        const unauthorized = await fetch(`${origin}/api/v1/documents/uploads/${created.id}/content`, { method: 'PUT', body: new FormData() });
        assert.equal(unauthorized.status, 401, 'multipart transport still passes through the staff identity guard');
        const form = new FormData();
        form.append('file', new Blob([apiPdf], { type: 'application/pdf' }), 'api-evidence.pdf');
        const uploaded = await fetch(`${origin}/api/v1/documents/uploads/${created.id}/content`, { method: 'PUT', headers: apiHeaders, body: form });
        assert.equal(uploaded.status, 200);
        assert.equal((await uploaded.json() as { status: string }).status, 'STORED');
        const finalizedApi = await fetch(`${origin}/api/v1/documents/uploads/${created.id}/finalize`, { method: 'POST', headers: apiHeaders });
        assert.equal(finalizedApi.status, 201);
        const finalizedBody = await finalizedApi.json() as { documentId: string; sizeBytes: number };
        assert.equal(finalizedBody.sizeBytes, apiPdf.byteLength);
        const rejectedPath = await fetch(`${origin}/api/v1/documents/uploads`, { method: 'PUT', headers: { ...apiHeaders, 'content-type': 'multipart/form-data; boundary=bad' }, body: 'raw' });
        assert.equal(rejectedPath.status, 415, 'multipart is rejected on every route except the UUID-bound upload content endpoint');
      } finally { await app.close(); }
      console.log('upload sessions bind actor and scope, verify PDF bytes/hash, reject workflow freeze, and attach immutable provider version only after finalization');
    } finally { await db.$disconnect(); }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of originalEnv) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    await container.stop();
  }
});
