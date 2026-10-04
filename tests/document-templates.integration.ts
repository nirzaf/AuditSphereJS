import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);

async function startScanner() {
  const server: Server = createServer(socket => {
    let input = Buffer.alloc(0); let started = false;
    socket.on('data', chunk => {
      input = Buffer.concat([input, chunk]);
      if (!started) { const separator = input.indexOf(0); if (separator < 0) return; input = input.subarray(separator + 1); started = true; }
      while (input.length >= 4) {
        const length = input.readUInt32BE(0);
        if (input.length < length + 4) return;
        input = input.subarray(length + 4);
        if (length === 0) { socket.end(Buffer.from('stream: OK\0')); return; }
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Test malware scanner failed to bind');
  return { server, port: address.port };
}

test('firm template catalog versions, asset approvals, scoped preview and immutable rendered output', { timeout: 180_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_templates').withUsername('template_owner').withPassword(randomBytes(24).toString('hex')).start();
  const originalFetch = globalThis.fetch;
  const envNames = ['DATABASE_URL','MIGRATION_DATABASE_URL','NODE_ENV','SERVICE_NAME','STORAGE_PROVIDER','M365_TENANT_ID','M365_CLIENT_ID','M365_CLIENT_SECRET','CLAMAV_HOST','CLAMAV_PORT'];
  const originalEnv = new Map(envNames.map(name => [name, process.env[name]]));
  const files = new Map<string, { bytes: Buffer; driveId: string; folderId: string; name: string; eTag: string; versionId: string }>();
  let fileSequence = 0;
  let scanner: Server | undefined;

  globalThis.fetch = (async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === 'login.microsoftonline.com') return Response.json({ access_token: 'synthetic-template-token', expires_in: 3600 });
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const driveIndex = parts.indexOf('drives');
    const driveId = driveIndex >= 0 ? parts[driveIndex + 1]! : '';
    const itemIndex = parts.indexOf('items');
    const itemId = itemIndex >= 0 ? parts[itemIndex + 1]! : '';
    if (init?.method === 'PUT' && url.pathname.includes(':/')) {
      const folderIndex = parts.indexOf('items');
      const folderId = parts[folderIndex + 1]!.split(':')[0]!;
      const afterColon = url.pathname.split(':/')[1] ?? '';
      const name = decodeURIComponent(afterColon.split(':/')[0] ?? 'asset.bin');
      const id = `template-object-${++fileSequence}`;
      const body = init.body;
      const bytes = body instanceof ReadableStream ? Buffer.from(await new Response(body).arrayBuffer()) : Buffer.from(body as Uint8Array);
      const eTag = `template-etag-${fileSequence}`;
      const versionId = `template-version-${fileSequence}`;
      files.set(id, { bytes, driveId, folderId, name, eTag, versionId });
      return Response.json({ id, eTag });
    }
    if (url.pathname.includes(':/') && init?.method !== 'PUT') return Response.json({ error: { code: 'itemNotFound' } }, { status: 404 });
    const file = files.get(itemId);
    if (url.pathname.endsWith('/versions')) return file ? Response.json({ value: [{ id: file.versionId, size: file.bytes.byteLength }] }) : Response.json({ error: { code: 'itemNotFound' } }, { status: 404 });
    if (url.pathname.endsWith('/content')) return file ? new Response(new Uint8Array(file.bytes)) : Response.json({ error: { code: 'itemNotFound' } }, { status: 404 });
    if (/\/versions\/[^/]+$/.test(url.pathname)) return file ? Response.json({ id: file.versionId, size: file.bytes.byteLength }) : Response.json({ error: { code: 'itemNotFound' } }, { status: 404 });
    if (/\/items\/[^/]+$/.test(url.pathname) && init?.method === 'DELETE') { files.delete(itemId); return new Response(null, { status: 204 }); }
    if (/\/items\/[^/]+$/.test(url.pathname) && url.searchParams.has('$select')) return file ? Response.json({ id: itemId, name: file.name, eTag: file.eTag, size: file.bytes.byteLength, parentReference: { id: file.folderId } }) : Response.json({ error: { code: 'itemNotFound' } }, { status: 404 });
    throw new Error(`Unexpected synthetic Graph request ${init?.method ?? 'GET'} ${url.pathname}`);
  }) as typeof fetch;

  try {
    const uri = container.getConnectionUri();
    const env = { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri };
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env, timeout: 60_000, stdio: 'pipe' });
    Object.assign(process.env, env, {
      STORAGE_PROVIDER: 'graph', M365_TENANT_ID: randomUUID(), M365_CLIENT_ID: randomUUID(), M365_CLIENT_SECRET: 'synthetic-template-secret',
    });
    const clamd = await startScanner(); scanner = clamd.server;
    process.env.CLAMAV_HOST = '127.0.0.1'; process.env.CLAMAV_PORT = String(clamd.port);

    const {
      db, listDocumentTemplateCatalog, createDocumentTemplate, appendDocumentTemplateVersion,
      decideDocumentTemplateVersion, changeDocumentTemplateActivation, previewDocumentTemplate,
      initiateApprovedAsset, initiateApprovedAssetVersion, receiveApprovedAsset, decideApprovedAsset, prepareApprovedAssetDownload,
      renderAndPublishPdf, persistRenderedPdfVersion, requireCapability, sweepUnfinishedDocumentTemplateAssetUploads,
    } = await import('@auditsphere/server');
    try {
      const firmId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID();
      const partnerId = randomUUID(), preparerId = randomUUID();
      const scope = { firmId, clientId, engagementId };
      await db.firm.create({ data: { id: firmId, name: 'Synthetic template firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Synthetic template client' } });
      await db.engagement.create({ data: { id: engagementId, firmId, clientId, name: 'Synthetic template engagement' } });
      await db.user.createMany({ data: [
        { id: partnerId, email: `partner-${partnerId}@example.test`, role: 'APPROVER' },
        { id: preparerId, email: `preparer-${preparerId}@example.test`, role: 'PREPARER' },
      ] });
      await db.membership.createMany({ data: [
        { userId: partnerId, firmId, clientId, engagementId, role: 'APPROVER' },
        { userId: preparerId, firmId, clientId, engagementId, role: 'PREPARER' },
      ] });
      for (const [userId, capabilities] of [[partnerId, ['ENGAGEMENT_READ', 'DOCUMENT_TEMPLATE_MANAGE']], [preparerId, ['ENGAGEMENT_READ']]] as const) {
        for (const capability of capabilities) await db.roleGrant.create({ data: { userId, capability, firmId, clientId, engagementId, grantedBy: partnerId, reason: 'bounded synthetic T036 acceptance' } });
      }
      const evidenceDrive = randomUUID(), evidenceFolder = randomUUID(), templateDrive = randomUUID(), templateFolder = randomUUID();
      await db.clientRepository.create({ data: { firmId, clientId, purpose: 'evidence', provider: 'graph', driveId: evidenceDrive, folderId: evidenceFolder } });
      await db.firmRepository.create({ data: { firmId, purpose: 'template-assets-private', provider: 'graph', driveId: templateDrive, folderId: templateFolder } });

      await assert.rejects(createDocumentTemplate(preparerId, engagementId, {
        kind: 'ENGAGEMENT_LETTER', engagementType: 'EXTERNAL_STATUTORY_AUDIT', name: 'Denied', blocks: [{ id: 'title', kind: 'TITLE', text: 'Denied' }], allowedVariables: [],
      }), /DOCUMENT_TEMPLATE_MANAGE/);
      assert.equal((await listDocumentTemplateCatalog(preparerId, engagementId)).canManage, false);
      await assert.rejects(listDocumentTemplateCatalog(randomUUID(), engagementId), /not granted/);

      const signatureBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
      const signature = await initiateApprovedAsset(partnerId, engagementId, {
        name: 'Partner image signature', category: 'PARTNER_SIGNATURE', filename: 'partner-signature.jpg', contentType: 'image/jpeg',
        sizeBytes: signatureBytes.byteLength, sha256: createHash('sha256').update(signatureBytes).digest('hex'),
      });
      assert.equal(signature.status, 'UPLOADING');
      await assert.rejects(prepareApprovedAssetDownload(preparerId, engagementId, signature.id, signature.versionId), /not granted/);
      await assert.rejects(receiveApprovedAsset(partnerId, engagementId, signature.id, signature.versionId, {
        filename: 'spoof.png', mimetype: 'image/png', file: (async function* () { yield signatureBytes; })(),
      }), /metadata does not match/);
      const uploaded = await receiveApprovedAsset(partnerId, engagementId, signature.id, signature.versionId, {
        filename: 'partner-signature.jpg', mimetype: 'image/jpeg', file: (async function* () { yield signatureBytes.subarray(0, 5); yield signatureBytes.subarray(5); })(),
      });
      assert.equal(uploaded.status, 'STORED');
      const signatureRow = await db.firmApprovedAssetVersion.findUniqueOrThrow({ where: { id: signature.versionId } });
      assert.equal(signatureRow.provider, 'graph');
      assert.equal(signatureRow.storageReference?.startsWith('graph:'), true);
      await assert.rejects(prepareApprovedAssetDownload(partnerId, engagementId, signature.id, signature.versionId), /not found/);

      await decideApprovedAsset(partnerId, engagementId, signature.id, signature.versionId, { expectedVersion: 1, action: 'APPROVED', reason: 'Approved exact partner artwork for templates.' });
      const privateAsset = await prepareApprovedAssetDownload(partnerId, engagementId, signature.id, signature.versionId);
      try { assert.deepEqual(await (await import('node:fs/promises')).readFile(privateAsset.path), signatureBytes); } finally { await privateAsset.cleanup(); }
      await assert.rejects(prepareApprovedAssetDownload(preparerId, engagementId, signature.id, signature.versionId), /not granted/);

      const templateInput = {
        kind: 'ENGAGEMENT_LETTER', engagementType: 'EXTERNAL_STATUTORY_AUDIT', name: 'Statutory engagement letter',
        blocks: [
          { id: 'title', kind: 'TITLE', text: 'Engagement letter for {{clientLegalName}}' },
          { id: 'period', kind: 'PARAGRAPH', text: 'The statutory period is {{statutoryPeriod}}.' },
          { id: 'signature', kind: 'PARTNER_SIGNATURE', signatureAssetVersionId: signature.versionId, sealAssetVersionId: null },
        ],
        allowedVariables: ['clientLegalName', 'statutoryPeriod'],
      } as const;
      const created = await createDocumentTemplate(partnerId, engagementId, templateInput);
      const v1 = await db.documentTemplateVersion.findUniqueOrThrow({ where: { id: created.versionId } });
      assert.equal(v1.sequence, 1);
      await assert.rejects(previewDocumentTemplate(partnerId, engagementId, created.id, created.versionId, { data: { clientLegalName: 'Northwind WLL' } }), /statutoryPeriod/);
      await assert.rejects(previewDocumentTemplate(preparerId, engagementId, created.id, created.versionId, { data: { clientLegalName: 'Northwind WLL', statutoryPeriod: 'FY 2026' } }), /not found/);
      const draftPreview = await previewDocumentTemplate(partnerId, engagementId, created.id, created.versionId, { data: { clientLegalName: 'Northwind WLL', statutoryPeriod: 'FY 2026' } });
      assert.match(draftPreview.blocks[0]?.text ?? '', /Northwind WLL/);
      assert.match(draftPreview.blocks[2]?.signatureLabel ?? '', /version 1/);
      await decideDocumentTemplateVersion(partnerId, engagementId, created.id, created.versionId, { expectedVersion: 1, action: 'APPROVED', reason: 'Approved exact statutory engagement-letter version.' });
      await changeDocumentTemplateActivation(partnerId, engagementId, created.id, { expectedVersion: 2, versionId: created.versionId, reason: 'Activate approved statutory template version.' });

      const preparerCatalog = await listDocumentTemplateCatalog(preparerId, engagementId);
      assert.equal(preparerCatalog.canManage, false);
      assert.equal(preparerCatalog.templates.length, 1);
      assert.equal(preparerCatalog.assets.length, 0, 'ordinary preparers do not receive approved signature asset metadata');
      const activePreview = await previewDocumentTemplate(preparerId, engagementId, created.id, created.versionId, { data: { clientLegalName: 'Northwind WLL', statutoryPeriod: 'FY 2026' } });
      assert.match(activePreview.blocks[0]?.text ?? '', /Northwind WLL/);

      const { templatePreviewHtml } = await import('@auditsphere/server');
      const renderedHtml = templatePreviewHtml(draftPreview.blocks);
      const templateSha256 = createHash('sha256').update(renderedHtml).digest('hex');
      const renderedResult = await renderAndPublishPdf({ template: { id: created.id, version: 1, html: renderedHtml, sha256: templateSha256 }, data: {} }, artifact => persistRenderedPdfVersion({
        actorId: partnerId, engagementId, filename: 'engagement-letter-v1.pdf', artifact,
        authorize: (client, userId, commandScope) => requireCapability(client, userId, 'DOCUMENT_TEMPLATE_MANAGE', commandScope),
      }));
      const immutableDocument = await db.document.findUniqueOrThrow({ where: { id: renderedResult.documentId } });
      const immutableVersion = await db.documentVersion.findUniqueOrThrow({ where: { id: renderedResult.documentVersionId } });
      const oldReference = JSON.parse(Buffer.from(immutableVersion.storageReference.slice(6), 'base64url').toString()) as { itemId: string };
      const oldBytes = Buffer.from(files.get(oldReference.itemId)!.bytes);
      assert.equal(immutableVersion.sha256, createHash('sha256').update(oldBytes).digest('hex'));

      const changedTemplate = await appendDocumentTemplateVersion(partnerId, engagementId, created.id, {
        expectedVersion: 3,
        blocks: [
          { id: 'title', kind: 'TITLE', text: 'Revised letter for {{clientLegalName}}' },
          { id: 'period', kind: 'PARAGRAPH', text: 'The statutory period is {{statutoryPeriod}}.' },
          { id: 'signature', kind: 'PARTNER_SIGNATURE', signatureAssetVersionId: signature.versionId, sealAssetVersionId: null },
        ],
        allowedVariables: ['clientLegalName', 'statutoryPeriod'],
      });
      await decideDocumentTemplateVersion(partnerId, engagementId, created.id, changedTemplate.versionId, { expectedVersion: 4, action: 'APPROVED', reason: 'Approved revised exact engagement-letter wording.' });
      await changeDocumentTemplateActivation(partnerId, engagementId, created.id, { expectedVersion: 5, versionId: changedTemplate.versionId, reason: 'Activate revised approved letter version.' });
      const afterRevision = await db.documentVersion.findUniqueOrThrow({ where: { id: immutableVersion.id } });
      assert.equal(afterRevision.sha256, immutableVersion.sha256, 'a template revision never rewrites a generated document byte version');
      assert.equal((afterRevision.renderProvenance as Record<string, unknown> | null)?.['templateSha256'], templateSha256);
      assert.deepEqual(files.get(oldReference.itemId)?.bytes, oldBytes, 'the original provider object remains the exact historical PDF bytes');
      assert.equal((await db.document.findUniqueOrThrow({ where: { id: immutableDocument.id } })).version, 1);

      await changeDocumentTemplateActivation(partnerId, engagementId, created.id, { expectedVersion: 6, versionId: null, reason: 'Deactivate the statutory template pending review.' });
      assert.equal((await listDocumentTemplateCatalog(preparerId, engagementId)).templates.length, 0, 'deactivated template drafts are hidden from preparers');
      await assert.rejects(previewDocumentTemplate(preparerId, engagementId, created.id, changedTemplate.versionId, { data: { clientLegalName: 'Northwind WLL', statutoryPeriod: 'FY 2026' } }), /not found/);

      const signatureBytesV2 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x11, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
      const signatureV2 = await initiateApprovedAssetVersion(partnerId, engagementId, signature.id, {
        expectedVersion: 2, filename: 'partner-signature-v2.jpg', contentType: 'image/jpeg', sizeBytes: signatureBytesV2.byteLength,
        sha256: createHash('sha256').update(signatureBytesV2).digest('hex'),
      });
      assert.equal(signatureV2.sequence, 2, 'asset approval revisions do not create gaps in the content-version sequence');
      await receiveApprovedAsset(partnerId, engagementId, signature.id, signatureV2.versionId, {
        filename: 'partner-signature-v2.jpg', mimetype: 'image/jpeg', file: (async function* () { yield signatureBytesV2; })(),
      });
      await decideApprovedAsset(partnerId, engagementId, signature.id, signatureV2.versionId, { expectedVersion: 3, action: 'APPROVED', reason: 'Approved the revised exact partner artwork.' });
      const originalArtwork = await db.firmApprovedAssetVersion.findUniqueOrThrow({ where: { id: signature.versionId } });
      const revisedArtwork = await db.firmApprovedAssetVersion.findUniqueOrThrow({ where: { id: signatureV2.versionId } });
      assert.equal(originalArtwork.sha256, createHash('sha256').update(signatureBytes).digest('hex'));
      assert.equal(revisedArtwork.sequence, 2);
      const oldTemplateArtwork = await db.documentTemplateVersionAsset.findFirstOrThrow({ where: { templateVersionId: created.versionId, assetId: signature.id } });
      assert.equal(oldTemplateArtwork.assetVersionId, signature.versionId, 'existing templates remain pinned to the earlier approved image version');

      const stale = await initiateApprovedAsset(partnerId, engagementId, {
        name: 'Unfinished artwork', category: 'FIRM_PROFILE', filename: 'stale.png', contentType: 'image/png', sizeBytes: 13,
        sha256: createHash('sha256').update(signatureBytes).digest('hex'),
      });
      const swept = await sweepUnfinishedDocumentTemplateAssetUploads({ olderThanMinutes: 60, now: new Date(Date.now() + 61 * 60_000) });
      assert.ok(swept.cleaned >= 1);
      assert.equal((await db.firmApprovedAssetVersion.findUniqueOrThrow({ where: { id: stale.versionId } })).status, 'CLEANED');

      await assert.rejects(db.$executeRaw`UPDATE "DocumentTemplateVersion" SET "contentSha256" = ${'0'.repeat(64)} WHERE id = ${created.versionId}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`DELETE FROM "FirmApprovedAssetVersion" WHERE id = ${signature.versionId}::uuid`, /append-only/);
      assert.equal(await db.documentTemplateActivation.count({ where: { templateId: created.id } }), 3, 'activation history is append-only');
      console.log('T036 passed: partner-scoped versioning and approvals, exact image-artwork pinning, safe preview, stale upload cleanup and immutable generated PDF bytes');
    } finally { await db.$disconnect(); }
  } finally {
    scanner?.close();
    globalThis.fetch = originalFetch;
    for (const [name, value] of originalEnv) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    await container.stop();
  }
});
