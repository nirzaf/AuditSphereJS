import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { db } from './db.js';
import { type AuthClient, type Scope } from './authorization.js';
import { decodeGraphReference } from './graph-storage.js';
import { resolveClientRepository } from './repository.js';
import { storageProvider, storeBytes } from './storage.js';
import { lockForUpdate, runUnitOfWork } from './unit-of-work.js';
import type { PdfArtifact } from './pdf-renderer.js';

export type RenderedPdfAuthorizer = (client: AuthClient, actorId: string, scope: Scope) => Promise<void>;

export type PersistedRenderedPdfVersion = {
  documentId: string;
  documentVersionId: string;
  sha256: string;
  sizeBytes: number;
  pageCount: number;
};

const MAX_RENDERED_PDF_BYTES = 20_000_000;

function safePdfFilename(value: string): string {
  const filename = value.trim().replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 200);
  if (!filename || !/\.pdf$/i.test(filename)) throw new ConflictException('A safe PDF filename is required.');
  return filename;
}

function checkedProvenance(artifact: PdfArtifact) {
  const bytes = artifact?.bytes;
  if (!Buffer.isBuffer(bytes) || bytes.byteLength < 8 || bytes.byteLength > MAX_RENDERED_PDF_BYTES || bytes.subarray(0, 4).toString('ascii') !== '%PDF'
    || artifact.sizeBytes !== bytes.byteLength || !/^[0-9a-f]{64}$/.test(artifact.sha256)
    || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256
    || !Number.isInteger(artifact.pageCount) || artifact.pageCount < 1 || artifact.pageCount > 100
    || !Number.isSafeInteger(artifact.blockedResourceCount) || artifact.blockedResourceCount < 0 || artifact.blockedResourceCount > 2147483647) {
    throw new ConflictException('The rendered PDF failed its integrity checks and was not stored.');
  }
  const source = artifact.provenance;
  if (!source || source.renderer !== 'playwright-chromium'
    || !/^\d+\.\d+\.\d+$/.test(source.playwrightVersion) || source.playwrightVersion !== '1.58.2'
    || !/^\d+\.\d+\.\d+\.\d+$/.test(source.chromiumVersion)
    || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(source.templateId)
    || !Number.isSafeInteger(source.templateVersion) || source.templateVersion < 1 || source.templateVersion > 2147483647
    || !/^[0-9a-f]{64}$/.test(source.templateSha256) || !/^[0-9a-f]{64}$/.test(source.dataSha256)) {
    throw new ConflictException('The rendered PDF provenance is invalid and was not stored.');
  }
  return {
    schemaVersion: 1,
    renderer: source.renderer,
    playwrightVersion: source.playwrightVersion,
    chromiumVersion: source.chromiumVersion,
    templateId: source.templateId,
    templateVersion: source.templateVersion,
    templateSha256: source.templateSha256,
    dataSha256: source.dataSha256,
    pageCount: artifact.pageCount,
    blockedResourceCount: artifact.blockedResourceCount,
  };
}

/**
 * Persist one completed renderer artifact as a new immutable DocumentVersion.
 * The owning workflow supplies its report-specific authorization guard; it runs once before any
 * provider write and again inside the metadata transaction after the external upload completes.
 * A failed final transaction leaves the tracked object unreferenced for the normal cleanup sweep.
 */
export async function persistRenderedPdfVersion(input: {
  actorId: string;
  engagementId: string;
  filename: string;
  artifact: PdfArtifact;
  authorize: RenderedPdfAuthorizer;
}): Promise<PersistedRenderedPdfVersion> {
  const filename = safePdfFilename(input.filename);
  const provenance = checkedProvenance(input.artifact);
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: { id: true, firmId: true, clientId: true },
  });
  if (!engagement) throw new NotFoundException('Engagement not found.');
  const scope: Scope = { firmId: engagement.firmId, clientId: engagement.clientId, engagementId: engagement.id };
  await input.authorize(db, input.actorId, scope);

  const key = `${engagement.id}/${randomUUID()}.pdf`;
  const repository = storageProvider() === 'graph'
    ? await resolveClientRepository(db, engagement.firmId, engagement.clientId, 'evidence')
    : undefined;
  await db.storedObject.create({ data: { engagementId: engagement.id, key, sha256: input.artifact.sha256, status: 'UPLOADING' } });

  const reference = await storeBytes(key, input.artifact.bytes, 'application/pdf', repository);
  await db.storedObject.update({ where: { key }, data: { reference, status: 'PENDING' } });
  let providerData: { provider: string; storageReference: string; driveId: string | null; itemId: string | null; versionId: string; eTag: string | null };
  if (reference.startsWith('graph:')) {
    const identity = decodeGraphReference(reference);
    if (identity.sha256 !== input.artifact.sha256 || identity.sizeBytes !== input.artifact.sizeBytes) {
      throw new ConflictException('The stored provider version does not match the rendered PDF.');
    }
    providerData = { provider: 'graph', storageReference: reference, driveId: identity.driveId, itemId: identity.itemId, versionId: identity.versionId, eTag: identity.eTag };
  } else {
    providerData = { provider: 'local-s3', storageReference: reference, driveId: null, itemId: null, versionId: reference, eTag: null };
  }

  return runUnitOfWork(async ({ client: tx }) => {
    await lockForUpdate(tx, 'Engagement', engagement.id);
    const currentEngagement = await tx.engagement.findUnique({ where: { id: engagement.id }, select: { id: true, firmId: true, clientId: true } });
    if (!currentEngagement || currentEngagement.firmId !== scope.firmId || currentEngagement.clientId !== scope.clientId) {
      throw new ConflictException('The engagement scope changed before the rendered document could be attached.');
    }
    await input.authorize(tx, input.actorId, scope);
    await tx.$queryRaw`SELECT id FROM "StoredObject" WHERE key = ${key} FOR UPDATE`;
    const storedObject = await tx.storedObject.findUnique({ where: { key } });
    if (!storedObject || storedObject.status !== 'PENDING' || storedObject.reference !== reference
      || storedObject.sha256 !== input.artifact.sha256 || storedObject.engagementId !== engagement.id) {
      throw new ConflictException('The rendered PDF staging object changed before finalization.');
    }

    const document = await tx.document.create({ data: {
      engagementId: engagement.id,
      key: reference,
      sha256: input.artifact.sha256,
      filename,
      category: '04_Drafts & Deliverables',
      version: 1,
    } });
    const version = await tx.documentVersion.create({ data: {
      engagementId: engagement.id,
      documentId: document.id,
      sequence: 1,
      ...providerData,
      sha256: input.artifact.sha256,
      sizeBytes: input.artifact.sizeBytes,
      renderProvenance: provenance,
      createdBy: input.actorId,
    } });
    await tx.storedObject.update({ where: { key }, data: { status: 'REFERENCED', documentId: document.id, resolvedAt: new Date() } });
    await tx.auditEvent.create({ data: {
      engagementId: engagement.id,
      actorId: input.actorId,
      action: 'RENDERED_PDF_VERSION_PUBLISHED',
      resourceType: 'Document',
      resourceId: document.id,
      resourceVersion: version.sequence,
      payload: { documentVersionId: version.id, filename, sha256: version.sha256, sizeBytes: version.sizeBytes, renderProvenance: provenance },
    } });
    return { documentId: document.id, documentVersionId: version.id, sha256: version.sha256, sizeBytes: version.sizeBytes, pageCount: input.artifact.pageCount };
  });
}
