import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const cli = resolve('node_modules/prisma', JSON.parse(readFileSync('node_modules/prisma/package.json', 'utf8')).bin.prisma);
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const firmId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const engagementId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const otherEngagementId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const actorId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

test('document uploads append immutable versions and queued imports read their pinned bytes', { timeout: 120_000 }, async () => {
  const container = await new PostgreSqlContainer('postgres:18.6').withDatabase('auditsphere_document_versions').withUsername('test_owner').withPassword(randomBytes(24).toString('hex')).start();
  const originalFetch = globalThis.fetch;
  const objects = new Map<string, { bytes: Buffer; eTag: string }>();
  let objectSequence = 0;
  globalThis.fetch = (async (input, init) => {
    const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (target.hostname === 'login.microsoftonline.com') return Response.json({ access_token: 'synthetic-graph-token', expires_in: 3600 });
    if (init?.method === 'PUT') {
      const itemId = `synthetic-item-${++objectSequence}`;
      const bytes = Buffer.from(init.body as Uint8Array);
      const eTag = `synthetic-etag-${objectSequence}`;
      objects.set(itemId, { bytes, eTag });
      return Response.json({ id: itemId, eTag });
    }
    const versionList = target.pathname.match(/\/items\/([^/]+)\/versions$/);
    if (versionList) {
      const stored = objects.get(versionList[1]!);
      if (!stored) return Response.json({ error: { code: 'itemNotFound' } }, { status: 404 });
      return Response.json({ value: [{ id: '1.0', size: stored.bytes.byteLength }] });
    }
    const versionContent = target.pathname.match(/\/items\/([^/]+)\/versions\/([^/]+)\/content$/);
    if (versionContent) {
      const stored = objects.get(versionContent[1]!);
      return stored ? new Response(new Uint8Array(stored.bytes)) : Response.json({ error: { code: 'itemNotFound' } }, { status: 404 });
    }
    const versionMetadata = target.pathname.match(/\/items\/([^/]+)\/versions\/([^/]+)$/);
    if (versionMetadata) {
      const stored = objects.get(versionMetadata[1]!);
      return stored ? Response.json({ id: versionMetadata[2], size: stored.bytes.byteLength }) : Response.json({ error: { code: 'itemNotFound' } }, { status: 404 });
    }
    throw new Error(`Unexpected synthetic Graph request: ${target.pathname}`);
  }) as typeof fetch;

  try {
    const uri = container.getConnectionUri();
    execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env, NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri }, timeout: 45_000, stdio: 'pipe' });
    Object.assign(process.env, {
      NODE_ENV: 'test', SERVICE_NAME: 'integration', DATABASE_URL: uri, MIGRATION_DATABASE_URL: uri,
      STORAGE_PROVIDER: 'graph', M365_TENANT_ID: tenantId, M365_CLIENT_ID: 'synthetic-client', M365_CLIENT_SECRET: 'synthetic-secret',
    });
    const { db, upload, retrieve, resolveClientRepository, renderAndPublishPdf, persistRenderedPdfVersion, requireCapability } = await import('@auditsphere/server');
    try {
      await db.firm.create({ data: { id: firmId, name: 'Document version firm' } });
      await db.client.create({ data: { id: clientId, firmId, name: 'Document version client' } });
      await db.engagement.createMany({ data: [
        { id: engagementId, firmId, clientId, name: 'Versioned fieldwork', state: 'FIELDWORK_EXECUTION' },
        { id: otherEngagementId, firmId, clientId, name: 'Separate fieldwork', state: 'FIELDWORK_EXECUTION' },
      ] });
      await db.user.create({ data: { id: actorId, email: 'document-uploader@example.test', role: 'PREPARER' } });
      await db.membership.createMany({ data: [engagementId, otherEngagementId].map(id => ({ userId: actorId, firmId, clientId, engagementId: id, role: 'PREPARER' })) });
      for (const scopedEngagementId of [engagementId, otherEngagementId]) {
        for (const capability of ['ENGAGEMENT_READ', 'FIELDWORK_WRITE'] as const) {
          await db.roleGrant.create({ data: { userId: actorId, capability, firmId, clientId, engagementId: scopedEngagementId, grantedBy: actorId, reason: 'synthetic document version integration' } });
        }
      }
      await db.clientRepository.create({ data: { firmId, clientId, purpose: 'evidence', provider: 'graph', driveId: 'synthetic-drive', folderId: 'synthetic-evidence-folder' } });

      const firstCsv = 'code,name,current,prior\n100,Cash,100.00,0.00\n200,Equity,-100.00,0.00';
      const secondCsv = 'code,name,current,prior\n300,Revenue,0.00,50.00\n400,Expense,0.00,-50.00';
      const firstImport = await upload(engagementId, actorId, { filename: 'trial-balance.csv', csv: firstCsv }) as { id: string; documentId: string; documentVersionId: string };
      const document = await db.document.findFirstOrThrow({ where: { id: firstImport.documentId, engagementId } });
      const secondImport = await upload(engagementId, actorId, {
        filename: 'trial-balance.csv', csv: secondCsv, documentId: document.id, expectedDocumentVersion: 1,
      }) as { id: string; documentId: string; documentVersionId: string };

      assert.equal(secondImport.documentId, firstImport.documentId, 'a new revision stays under the same scoped document');
      assert.notEqual(secondImport.documentVersionId, firstImport.documentVersionId);
      const versions = await db.documentVersion.findMany({ where: { engagementId, documentId: document.id }, orderBy: { sequence: 'asc' } });
      assert.equal(versions.length, 2);
      assert.deepEqual(versions.map(version => version.sequence), [1, 2]);
      assert.deepEqual(versions.map(version => version.sha256), [
        (await import('node:crypto')).createHash('sha256').update(firstCsv).digest('hex'),
        (await import('node:crypto')).createHash('sha256').update(secondCsv).digest('hex'),
      ]);
      assert.equal(versions[0]!.storageReference.startsWith('graph:'), true);
      assert.equal(versions[0]!.sizeBytes, Buffer.byteLength(firstCsv));
      assert.equal(document.version, 1, 'the first document read remains an immutable historical snapshot');
      const currentDocument = await db.document.findFirstOrThrow({ where: { id: document.id, engagementId } });
      assert.equal(currentDocument.version, 2);
      assert.equal(currentDocument.sha256, versions[1]!.sha256);

      const uploadCount = objects.size;
      await assert.rejects(upload(engagementId, actorId, {
        filename: 'trial-balance.csv', csv: 'code,name,current,prior\n500,Other,1.00,-1.00',
        documentId: document.id, expectedDocumentVersion: 1,
      }), /Document changed; reload/);
      await assert.rejects(upload(otherEngagementId, actorId, {
        filename: 'trial-balance.csv', csv: 'code,name,current,prior\n600,Foreign,1.00,-1.00',
        documentId: document.id, expectedDocumentVersion: 2,
      }), /Document not found/);
      assert.equal(objects.size, uploadCount, 'stale and cross-engagement attempts are rejected before provider writes');

      const competingCsvA = 'code,name,current,prior\n700,Accepted,2.00,-2.00';
      const competingCsvB = 'code,name,current,prior\n800,Rejected,3.00,-3.00';
      const competing = await Promise.allSettled([
        upload(engagementId, actorId, { filename: 'trial-balance.csv', csv: competingCsvA, documentId: document.id, expectedDocumentVersion: 2 }),
        upload(engagementId, actorId, { filename: 'trial-balance.csv', csv: competingCsvB, documentId: document.id, expectedDocumentVersion: 2 }),
      ]);
      assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1, 'only one concurrent writer can advance a document head');
      const loser = competing.find(result => result.status === 'rejected') as PromiseRejectedResult;
      assert.match(String(loser.reason), /Document changed; reload/);
      const afterRace = await db.documentVersion.findMany({ where: { engagementId, documentId: document.id }, orderBy: { sequence: 'asc' } });
      assert.deepEqual(afterRace.map(version => version.sequence), [1, 2, 3]);
      assert.equal(await db.storedObject.count({ where: { engagementId, status: 'PENDING' } }), 1, 'the losing external object remains tracked for the delayed review sweep');

      const loadedReferences = new Map<string, string>();
      const repository = await resolveClientRepository(db, firmId, clientId, 'evidence');
      const { createTrialBalanceImportProcessor } = await import('../packages/server/src/modules/fieldwork/import-worker.js');
      const processImport = createTrialBalanceImportProcessor(async (evidence, batch) => {
        loadedReferences.set(batch.id, evidence.key);
        return retrieve(evidence.key, repository);
      });
      for (const batch of [firstImport, secondImport]) {
        const event = await db.outboxEvent.findFirstOrThrow({ where: { importId: batch.id } });
        await processImport({
          id: event.operationId,
          data: { outboxEventId: event.id, operationId: event.operationId, correlationId: event.correlationId ?? event.id, payloadVersion: 1 },
          attemptsMade: 0,
          opts: { attempts: 1 },
        });
      }
      assert.equal(loadedReferences.get(firstImport.id), versions[0]!.storageReference);
      assert.equal(loadedReferences.get(secondImport.id), versions[1]!.storageReference);
      assert.deepEqual((await db.tbRow.findMany({ where: { importId: firstImport.id }, orderBy: { position: 'asc' }, select: { code: true } })).map(row => row.code), ['100', '200']);
      assert.deepEqual((await db.tbRow.findMany({ where: { importId: secondImport.id }, orderBy: { position: 'asc' }, select: { code: true } })).map(row => row.code), ['300', '400']);

      const templateHtml = '<!doctype html><html><body><h1>{{reportTitle}}</h1><p>{{reportBasis}}</p></body></html>';
      const templateSha256 = (await import('node:crypto')).createHash('sha256').update(templateHtml).digest('hex');
      const reportData = { reportTitle: 'Synthetic Report', reportBasis: 'Acceptance fixture' };
      let renderedArtifact: Parameters<typeof persistRenderedPdfVersion>[0]['artifact'] | undefined;
      const renderedVersion = await renderAndPublishPdf({
        template: { id: 't035-synthetic-report', version: 1, html: templateHtml, sha256: templateSha256 },
        data: reportData,
      }, artifact => {
        renderedArtifact = artifact;
        return persistRenderedPdfVersion({
          actorId, engagementId, filename: 'synthetic-report.pdf', artifact,
          authorize: (client, principal, scope) => requireCapability(client, principal, 'FIELDWORK_WRITE', scope),
        });
      });
      if (!renderedArtifact) throw new Error('The renderer did not produce a publishable artifact');
      const renderedDocument = await db.document.findFirstOrThrow({ where: { id: renderedVersion.documentId, engagementId } });
      const storedVersion = await db.documentVersion.findFirstOrThrow({ where: { id: renderedVersion.documentVersionId, engagementId, documentId: renderedDocument.id } });
      assert.equal(renderedDocument.filename, 'synthetic-report.pdf');
      assert.equal(renderedDocument.category, '04_Drafts & Deliverables');
      assert.equal(storedVersion.sequence, 1);
      assert.equal(storedVersion.sha256, renderedVersion.sha256);
      assert.equal(storedVersion.sizeBytes, renderedVersion.sizeBytes);
      assert.equal(storedVersion.provider, 'graph');
      const expectedDataSha256 = (await import('node:crypto')).createHash('sha256').update('{"reportBasis":"Acceptance fixture","reportTitle":"Synthetic Report"}').digest('hex');
      const provenance = storedVersion.renderProvenance as Record<string, unknown>;
      assert.match(String(provenance.chromiumVersion), /^\d+\.\d+\.\d+\.\d+$/);
      assert.deepEqual(provenance, {
        schemaVersion: 1, renderer: 'playwright-chromium', playwrightVersion: '1.58.2',
        chromiumVersion: provenance.chromiumVersion,
        templateId: 't035-synthetic-report', templateVersion: 1,
        templateSha256,
        dataSha256: expectedDataSha256,
        pageCount: 1, blockedResourceCount: 0,
      });
      const trackedRenderedObject = await db.storedObject.findFirstOrThrow({ where: { documentId: renderedDocument.id } });
      assert.equal(trackedRenderedObject.status, 'REFERENCED');
      assert.equal(await db.auditEvent.count({ where: { resourceId: renderedDocument.id, action: 'RENDERED_PDF_VERSION_PUBLISHED' } }), 1);
      await assert.rejects(db.$executeRaw`UPDATE "DocumentVersion" SET "renderProvenance" = '{}'::jsonb WHERE id = ${storedVersion.id}::uuid`, /append-only/);

      let authorizationChecks = 0;
      const beforeDeniedRender = objects.size;
      await assert.rejects(persistRenderedPdfVersion({
        actorId, engagementId, filename: 'revoked-report.pdf', artifact: renderedArtifact,
        authorize: async () => { authorizationChecks++; if (authorizationChecks === 2) throw new Error('report permission was revoked'); },
      }), /report permission was revoked/);
      assert.equal(authorizationChecks, 2, 'the workflow authorization is rechecked after provider storage');
      assert.equal(objects.size, beforeDeniedRender + 1, 'the denied render is still tracked for cleanup, not attached to a document');
      assert.equal(await db.document.count({ where: { engagementId, filename: 'revoked-report.pdf' } }), 0);
      const orphanedRender = await db.storedObject.findFirstOrThrow({ where: { engagementId, status: 'PENDING', sha256: renderedArtifact.sha256, documentId: null } });
      assert.equal(orphanedRender.status, 'PENDING');

      const { linkDocument, listDocumentLinks, revokeDocumentLink } = await import('@auditsphere/server');
      const linkInput = {
        idempotencyKey: '11111111-1111-4111-8111-111111111111', documentId: document.id,
        documentVersionId: secondImport.documentVersionId, targetType: 'TRIAL_BALANCE_IMPORT',
        targetImportId: secondImport.id, label: 'Imported source workbook',
      } as const;
      const linkResult = await linkDocument(engagementId, actorId, linkInput) as { id: string; version: number; created: boolean };
      assert.deepEqual(linkResult, { id: linkResult.id, version: 1, created: true });
      assert.deepEqual(await linkDocument(engagementId, actorId, linkInput), linkResult, 'idempotent replay returns the committed link');
      await assert.rejects(linkDocument(engagementId, actorId, { ...linkInput, label: 'Changed replay' }), /Idempotency key reused/);
      const listed = await listDocumentLinks(engagementId, actorId, secondImport.id) as Array<Record<string, any>>;
      assert.equal(listed.length, 1);
      assert.equal(listed[0]!.document.sequence, 2);
      assert.equal(listed[0]!.document.sha256, versions[1]!.sha256);
      assert.equal(JSON.stringify(listed).includes('storageReference'), false, 'metadata listing never returns provider references');
      assert.equal(JSON.stringify(listed).includes('driveId'), false);
      await assert.rejects(linkDocument(engagementId, actorId, {
        ...linkInput, idempotencyKey: '66666666-6666-4666-8666-666666666666',
      }), /already linked/);
      await assert.rejects(linkDocument(otherEngagementId, actorId, {
        ...linkInput, idempotencyKey: '22222222-2222-4222-8222-222222222222', targetImportId: firstImport.id,
      }), /Document not found/);
      await assert.rejects(linkDocument(engagementId, actorId, {
        ...linkInput, idempotencyKey: '33333333-3333-4333-8333-333333333333', targetImportId: otherEngagementId,
      }), /Trial Balance import not found/);
      const revoked = await revokeDocumentLink(engagementId, linkResult.id, actorId, {
        idempotencyKey: '44444444-4444-4444-8444-444444444444', expectedVersion: 1, reason: 'Duplicate workpaper attachment',
      }) as { id: string; version: number; revoked: true };
      assert.deepEqual(revoked, { id: linkResult.id, version: 2, revoked: true });
      const revokeInput = { idempotencyKey: '44444444-4444-4444-8444-444444444444', expectedVersion: 1, reason: 'Duplicate workpaper attachment' };
      assert.deepEqual(await revokeDocumentLink(engagementId, linkResult.id, actorId, revokeInput), revoked, 'revocation replay returns its committed receipt');
      await assert.rejects(revokeDocumentLink(engagementId, linkResult.id, actorId, {
        idempotencyKey: '55555555-5555-4555-8555-555555555555', expectedVersion: 1, reason: 'Stale revocation version',
      }), /already revoked|changed; reload/);
      const revokedLinks = await listDocumentLinks(engagementId, actorId, secondImport.id) as Array<Record<string, any>>;
      assert.equal(revokedLinks[0]!.revokedAt !== null, true);
      await assert.rejects(db.$executeRaw`UPDATE "DocumentLink" SET label = ${'rewritten'} WHERE id = ${linkResult.id}::uuid`, /immutable/);
      await assert.rejects(db.$executeRaw`DELETE FROM "DocumentLink" WHERE id = ${linkResult.id}::uuid`, /append-only/);
      await assert.rejects(db.$executeRaw`INSERT INTO "DocumentLink" (id, "engagementId", "documentId", "documentVersionId", "targetType", label, "createdBy") VALUES (gen_random_uuid(), ${otherEngagementId}::uuid, ${document.id}::uuid, ${versions[0]!.id}::uuid, 'ENGAGEMENT', 'cross-engagement', ${actorId}::uuid)`, /DocumentLink_document_scope_fkey/);
      await assert.rejects(db.$executeRaw`INSERT INTO "DocumentLink" (id, "engagementId", "documentId", "documentVersionId", "targetType", "targetImportId", label, "createdBy") VALUES (gen_random_uuid(), ${engagementId}::uuid, ${document.id}::uuid, ${versions[0]!.id}::uuid, 'TRIAL_BALANCE_IMPORT', ${otherEngagementId}::uuid, 'cross-import', ${actorId}::uuid)`, /DocumentLink_import_scope_fkey/);
      const noReadActor = '99999999-9999-4999-8999-999999999999';
      await db.user.create({ data: { id: noReadActor, email: 'no-document-grant@example.test', role: 'PREPARER' } });
      await db.membership.create({ data: { userId: noReadActor, firmId, clientId, engagementId, role: 'PREPARER' } });
      await assert.rejects(listDocumentLinks(engagementId, noReadActor), /ENGAGEMENT_READ is not granted/);
      await db.engagement.update({ where: { id: engagementId }, data: { state: 'ARCHIVED_READ_ONLY' } });
      await assert.rejects(linkDocument(engagementId, actorId, {
        ...linkInput, idempotencyKey: '77777777-7777-4777-8777-777777777777',
      }), /does not permit evidence-link changes/);
      await db.engagement.update({ where: { id: engagementId }, data: { state: 'FIELDWORK_EXECUTION' } });

      await assert.rejects(db.$executeRaw`UPDATE "DocumentVersion" SET "sha256" = ${'0'.repeat(64)} WHERE id = ${versions[0]!.id}::uuid`, /append-only/);
      console.log('document uploads append immutable provider versions, imports pin exact versions, and authorized evidence links are scoped, idempotent and revocable');
    } finally {
      await db.$disconnect();
    }
  } finally {
    globalThis.fetch = originalFetch;
    await container.stop();
  }
});
