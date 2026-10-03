import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { db } from './db.js';
import { requireCapability, type Scope } from './authorization.js';
import { recordAuditEvent } from './audit.js';
import { resolveClientRepository } from './repository.js';
import { retrieveToFile } from './storage.js';

const scopeOf = (value: { id: string; firmId: string; clientId: string }): Scope => ({ firmId: value.firmId, clientId: value.clientId, engagementId: value.id });

function attachmentDisposition(filename: string) {
  const safe = filename.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || 'evidence';
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export type PreparedDocumentDownload = {
  stream: ReturnType<typeof createReadStream>;
  disposition: string;
  sizeBytes: number;
  sha256: string;
  sequence: number;
  filename: string;
  engagementId: string;
  documentId: string;
  documentVersionId: string;
  actorId: string;
  finish(responseFinished: boolean): Promise<void>;
};

/** Reauthorize on every request, stage and verify the immutable bytes, then stream only the verified file. */
export async function prepareDocumentVersionDownload(actorId: string, documentId: string, documentVersionId: string): Promise<PreparedDocumentDownload> {
  const version = await db.documentVersion.findFirst({
    where: { id: documentVersionId, documentId },
    select: {
      id: true, engagementId: true, documentId: true, sequence: true, storageReference: true, sha256: true, sizeBytes: true,
      document: { select: { id: true, engagementId: true, filename: true, engagement: { select: { id: true, firmId: true, clientId: true } } } },
    },
  });
  if (!version || version.engagementId !== version.document.engagementId) throw new NotFoundException('Document version not found');
  try {
    await requireCapability(db, actorId, 'ENGAGEMENT_READ', scopeOf(version.document.engagement));
  } catch (error) {
    if (error instanceof ForbiddenException) throw new NotFoundException('Document version not found');
    throw error;
  }

  const event = (action: string) => recordAuditEvent(db, {
    engagementId: version.engagementId,
    actorId,
    action,
    resource: { type: 'DocumentVersion', id: version.id, version: version.sequence },
    payload: { documentId: version.documentId, sha256: version.sha256, sizeBytes: version.sizeBytes },
  });

  await event('DOCUMENT_VERSION_DOWNLOAD_AUTHORIZED');
  const directory = await mkdtemp(join(tmpdir(), 'auditsphere-document-'));
  const path = join(directory, 'verified-content');
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rm(directory, { recursive: true, force: true });
  };
  try {
    const repository = await resolveClientRepository(db, version.document.engagement.firmId, version.document.engagement.clientId, 'evidence');
    await retrieveToFile(version.storageReference, path, { sha256: version.sha256, sizeBytes: version.sizeBytes }, repository);
  } catch (error) {
    await cleanup();
    try { await event('DOCUMENT_VERSION_DOWNLOAD_FAILED'); } catch { console.error('Document download failure audit write failed'); }
    throw error;
  }

  let finished = false;
  return {
    stream: createReadStream(path),
    disposition: attachmentDisposition(version.document.filename),
    sizeBytes: version.sizeBytes,
    sha256: version.sha256,
    sequence: version.sequence,
    filename: version.document.filename,
    engagementId: version.engagementId,
    documentId: version.documentId,
    documentVersionId: version.id,
    actorId,
    finish: async responseFinished => {
      if (finished) return;
      finished = true;
      try { await event(responseFinished ? 'DOCUMENT_VERSION_DOWNLOAD_RESPONSE_FINISHED' : 'DOCUMENT_VERSION_DOWNLOAD_RESPONSE_ABORTED'); }
      finally { await cleanup(); }
    },
  };
}
