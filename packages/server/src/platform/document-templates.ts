import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  approvedAssetCategories, createApprovedAssetSchema, createApprovedAssetVersionSchema,
  createDocumentTemplateSchema, createDocumentTemplateVersionSchema, documentTemplateActivationSchema,
  documentTemplateDecisionSchema, documentTemplatePreviewRequestSchema, documentTemplateVariableKeys,
} from '@auditsphere/contracts';
import type { z } from 'zod';
import { db } from './db.js';
import { hasCapability, requireCapability, type Scope } from './authorization.js';
import { recordAuditEvent } from './audit.js';
import { decodeGraphReference } from './graph-storage.js';
import { resolveFirmTemplateAssetRepository } from './repository.js';
import { removeObject, retrieveToFile, storageProvider, storeFile } from './storage.js';
import { inspectPdfFile } from './pdf-inspection.js';
import { MalwareDetectedError, MalwareScannerUnavailableError, scanFileWithClamAv } from './clamav.js';
import { runUnitOfWork, type DatabaseClient, type TransactionClient } from './unit-of-work.js';
import { compileDocumentTemplatePreview, documentTemplateDigest, type TemplateBlock } from './document-template-compiler.js';
import type { UploadFilePart } from './document-uploads.js';

const MAX_ASSET_BYTES = 5_000_000;
const scopeOf = (value: { id: string; firmId: string; clientId: string }): Scope => ({ firmId: value.firmId, clientId: value.clientId, engagementId: value.id });
const safeFilename = (value: string) => value.trim().replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 200);

async function engagementScope(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId }, select: { id: true, firmId: true, clientId: true } });
  if (!engagement) throw new NotFoundException('Engagement not found.');
  return { engagement, scope: scopeOf(engagement) };
}

function validateTemplateContent(blocks: readonly TemplateBlock[], allowedVariables: readonly string[]) {
  const allowed = new Set(allowedVariables);
  const referenced = new Set<string>();
  for (const block of blocks) {
    const texts = block.kind === 'BULLET_LIST' ? block.items : 'text' in block ? [block.text] : [];
    for (const text of texts) {
      for (const match of text.matchAll(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g)) {
        const key = match[1]!;
        if (!documentTemplateVariableKeys.includes(key as (typeof documentTemplateVariableKeys)[number]) || !allowed.has(key)) {
          throw new BadRequestException(`Template variable “${key}” is not in this version's allow-list.`);
        }
        referenced.add(key);
      }
      if (/\{\{|\}\}/.test(text.replace(/\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g, ''))) {
        throw new BadRequestException('Template contains an unsupported or malformed variable placeholder.');
      }
    }
  }
  if (new Set(allowedVariables).size !== allowedVariables.length) throw new BadRequestException('Template variable allow-list contains duplicates.');
  return referenced;
}

type AssetUse = (typeof approvedAssetCategories)[number];
function assetReferences(blocks: readonly TemplateBlock[]): Array<{ versionId: string; use: AssetUse }> {
  const references: Array<{ versionId: string; use: AssetUse }> = [];
  for (const block of blocks) {
    if (block.kind === 'APPROVED_ASSET') references.push({ versionId: block.assetVersionId, use: block.use });
    if (block.kind === 'PARTNER_SIGNATURE') {
      references.push({ versionId: block.signatureAssetVersionId, use: 'PARTNER_SIGNATURE' });
      if (block.sealAssetVersionId) references.push({ versionId: block.sealAssetVersionId, use: 'FIRM_SEAL' });
    }
  }
  return references;
}

/** Asset blocks may display any specifically approved attachment; metadata is checked per block. */
async function checkedTemplateAssetVersions(client: DatabaseClient | TransactionClient, firmId: string, blocks: readonly TemplateBlock[]) {
  const references = assetReferences(blocks);
  const ids = [...new Set(references.map(item => item.versionId))];
  if (!ids.length) return new Map<string, { id: string; assetId: string; category: string; name: string; sequence: number; storageKey: string; storageReference: string | null; provider: string | null; sha256: string; sizeBytes: number; contentType: string; approval: string | null }>();
  const versions = await client.firmApprovedAssetVersion.findMany({
    where: { firmId, id: { in: ids }, status: 'STORED' },
    include: { asset: { select: { category: true, name: true } }, approvals: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } },
  });
  const byId = new Map(versions.map(version => [version.id, {
    id: version.id, assetId: version.assetId, category: version.asset.category, name: version.asset.name,
    sequence: version.sequence, storageKey: version.storageKey, storageReference: version.storageReference,
    provider: version.provider, sha256: version.sha256, sizeBytes: version.sizeBytes, contentType: version.contentType,
    approval: version.approvals[0]?.action ?? null,
  }]));
  for (const reference of references) {
    const version = byId.get(reference.versionId);
    if (!version || version.approval !== 'APPROVED' || version.category !== reference.use) {
      throw new ConflictException('Template assets must be stored, approved and match the required artwork category.');
    }
  }
  return byId;
}

export async function listDocumentTemplateCatalog(actorId: string, engagementId: string) {
  const { engagement, scope } = await engagementScope(engagementId);
  await requireCapability(db, actorId, 'ENGAGEMENT_READ', scope);
  const canManage = await hasCapability(db, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
  const [templates, assets] = await Promise.all([
    db.documentTemplate.findMany({
      where: { firmId: engagement.firmId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200,
      include: {
        versions: { orderBy: [{ sequence: 'desc' }, { id: 'desc' }], take: 100, include: { approvals: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } } },
        activationEvents: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
      },
    }),
    canManage ? db.firmApprovedAsset.findMany({
      where: { firmId: engagement.firmId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 500,
      include: { versions: { orderBy: [{ sequence: 'desc' }, { id: 'desc' }], take: 100, include: { approvals: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } } } },
    }) : Promise.resolve([]),
  ]);
  const mapped = templates.map(template => {
    const activeVersionId = template.activationEvents[0]?.action === 'ACTIVATED' ? template.activationEvents[0].templateVersionId : null;
    const versions = template.versions.map(version => ({
      id: version.id, sequence: version.sequence, contentSha256: version.contentSha256,
      blocks: version.blocks as unknown as TemplateBlock[], allowedVariables: version.allowedVariables as string[],
      status: version.approvals[0]?.action === 'APPROVED' ? 'APPROVED' as const : version.approvals[0]?.action === 'REVOKED' ? 'REVOKED' as const : 'DRAFT' as const,
      createdAt: version.createdAt.toISOString(),
    }));
    return { id: template.id, kind: template.kind, engagementType: template.engagementType, name: template.name, version: template.version, activeVersionId, versions };
  }).filter(template => canManage || (!!template.activeVersionId && template.versions.some(version => version.id === template.activeVersionId && version.status === 'APPROVED')));
  return {
    canManage,
    templates: mapped,
    assets: assets.map(asset => ({
      id: asset.id, name: asset.name, category: asset.category, version: asset.version,
      versions: asset.versions.map(version => ({
        id: version.id, sequence: version.sequence, contentType: version.contentType, sizeBytes: version.sizeBytes,
        sha256: version.sha256, status: version.status,
        approval: version.approvals[0]?.action === 'APPROVED' ? 'APPROVED' as const : version.approvals[0]?.action === 'REVOKED' ? 'REVOKED' as const : 'UNREVIEWED' as const,
        createdAt: version.createdAt.toISOString(),
      })),
    })),
  };
}

export async function createDocumentTemplate(actorId: string, engagementId: string, input: unknown) {
  const body = createDocumentTemplateSchema.parse(input);
  validateTemplateContent(body.blocks, body.allowedVariables);
  const { engagement, scope } = await engagementScope(engagementId);
  const contentSha256 = documentTemplateDigest(body);
  return runUnitOfWork(async ({ client: tx }) => {
    await requireCapability(tx, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
    const checkedAssets = await checkedTemplateAssetVersions(tx, engagement.firmId, body.blocks);
    const template = await tx.documentTemplate.create({ data: {
      firmId: engagement.firmId, kind: body.kind, engagementType: body.engagementType, name: body.name, version: 1, createdBy: actorId,
    } });
    const version = await tx.documentTemplateVersion.create({ data: {
      firmId: engagement.firmId, templateId: template.id, sequence: 1, blocks: body.blocks as never,
      allowedVariables: body.allowedVariables as never, contentSha256, createdBy: actorId,
    } });
    await createTemplateAssetLinks(tx, engagement.firmId, template.id, version.id, assetReferences(body.blocks), checkedAssets);
    await recordAuditEvent(tx, { engagementId, actorId, action: 'DOCUMENT_TEMPLATE_CREATED', resource: { type: 'DocumentTemplate', id: template.id, version: 1 }, payload: { kind: template.kind, engagementType: template.engagementType, contentSha256 } });
    return { id: template.id, versionId: version.id, version: 1, status: 'DRAFT' as const, contentSha256 };
  });
}

async function createTemplateAssetLinks(tx: TransactionClient, firmId: string, templateId: string, versionId: string, references: Array<{ versionId: string; use: AssetUse }>, checked: Awaited<ReturnType<typeof checkedTemplateAssetVersions>>) {
  const deduped = new Map<string, { versionId: string; use: AssetUse }>();
  for (const item of references) deduped.set(`${item.versionId}:${item.use}`, item);
  const rows = [...deduped.values()].map(item => ({
    firmId, templateId, templateVersionId: versionId, assetId: checked.get(item.versionId)!.assetId, assetVersionId: item.versionId, use: item.use,
  }));
  if (rows.length) await tx.documentTemplateVersionAsset.createMany({ data: rows });
}

export async function appendDocumentTemplateVersion(actorId: string, engagementId: string, templateId: string, input: unknown) {
  const body = createDocumentTemplateVersionSchema.parse(input);
  validateTemplateContent(body.blocks, body.allowedVariables);
  const { engagement, scope } = await engagementScope(engagementId);
  const contentSha256 = documentTemplateDigest(body);
  return runUnitOfWork(async ({ client: tx }) => {
    await requireCapability(tx, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
    await tx.$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = ${templateId}::uuid AND "firmId" = ${engagement.firmId}::uuid FOR UPDATE`;
    const template = await tx.documentTemplate.findFirst({ where: { id: templateId, firmId: engagement.firmId } });
    if (!template) throw new NotFoundException('Template not found.');
    if (template.version !== body.expectedVersion) throw new ConflictException('Template changed since it was loaded. Refresh the catalog and retry.');
    const checkedAssets = await checkedTemplateAssetVersions(tx, engagement.firmId, body.blocks);
    const changed = await tx.documentTemplate.updateMany({ where: { id: template.id, firmId: template.firmId, version: body.expectedVersion }, data: { version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException('Template changed concurrently. Refresh the catalog and retry.');
    const version = await tx.documentTemplateVersion.create({ data: {
      firmId: engagement.firmId, templateId, sequence: (await tx.documentTemplateVersion.aggregate({ where: { firmId: engagement.firmId, templateId }, _max: { sequence: true } }))._max.sequence! + 1,
      blocks: body.blocks as never, allowedVariables: body.allowedVariables as never, contentSha256, createdBy: actorId,
    } });
    await createTemplateAssetLinks(tx, engagement.firmId, templateId, version.id, assetReferences(body.blocks), checkedAssets);
    await recordAuditEvent(tx, { engagementId, actorId, action: 'DOCUMENT_TEMPLATE_VERSION_CREATED', resource: { type: 'DocumentTemplate', id: templateId, version: template.version + 1 }, payload: { templateVersionId: version.id, sequence: version.sequence, contentSha256 } });
    return { id: templateId, versionId: version.id, version: template.version + 1, status: 'DRAFT' as const, contentSha256 };
  });
}

export async function decideDocumentTemplateVersion(actorId: string, engagementId: string, templateId: string, versionId: string, input: unknown) {
  const body = documentTemplateDecisionSchema.parse(input);
  const { engagement, scope } = await engagementScope(engagementId);
  return runUnitOfWork(async ({ client: tx }) => {
    await requireCapability(tx, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
    await tx.$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = ${templateId}::uuid AND "firmId" = ${engagement.firmId}::uuid FOR UPDATE`;
    const template = await tx.documentTemplate.findFirst({ where: { id: templateId, firmId: engagement.firmId } });
    const version = await tx.documentTemplateVersion.findFirst({ where: { id: versionId, templateId, firmId: engagement.firmId } });
    if (!template || !version) throw new NotFoundException('Template version not found.');
    if (template.version !== body.expectedVersion) throw new ConflictException('Template changed since it was loaded. Refresh the catalog and retry.');
    const currentActivation = await tx.documentTemplateActivation.findFirst({ where: { templateId, firmId: engagement.firmId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const currentDecision = await tx.documentTemplateApproval.findFirst({ where: { templateId, templateVersionId: versionId, firmId: engagement.firmId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (body.action === 'REVOKED' && currentActivation?.action === 'ACTIVATED' && currentActivation.templateVersionId === versionId) throw new ConflictException('Deactivate the template before revoking its active version.');
    if ((body.action === 'APPROVED' && currentDecision?.action === 'APPROVED') || (body.action === 'REVOKED' && currentDecision?.action === 'REVOKED')) throw new ConflictException('This version already has that current decision.');
    if (body.action === 'APPROVED') await checkedTemplateAssetVersions(tx, engagement.firmId, version.blocks as unknown as TemplateBlock[]);
    const changed = await tx.documentTemplate.updateMany({ where: { id: templateId, firmId: engagement.firmId, version: body.expectedVersion }, data: { version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException('Template changed concurrently. Refresh the catalog and retry.');
    const decision = await tx.documentTemplateApproval.create({ data: { firmId: engagement.firmId, templateId, templateVersionId: versionId, action: body.action, reason: body.reason, actorId } });
    await recordAuditEvent(tx, { engagementId, actorId, action: `DOCUMENT_TEMPLATE_${body.action}`, resource: { type: 'DocumentTemplate', id: templateId, version: version.sequence }, payload: { templateVersionId: versionId, decisionId: decision.id, reason: body.reason } });
    return { versionId, status: body.action, decidedAt: decision.createdAt.toISOString() };
  });
}

export async function changeDocumentTemplateActivation(actorId: string, engagementId: string, templateId: string, input: unknown) {
  const body = documentTemplateActivationSchema.parse(input);
  const { engagement, scope } = await engagementScope(engagementId);
  return runUnitOfWork(async ({ client: tx }) => {
    await requireCapability(tx, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
    await tx.$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = ${templateId}::uuid AND "firmId" = ${engagement.firmId}::uuid FOR UPDATE`;
    const template = await tx.documentTemplate.findFirst({ where: { id: templateId, firmId: engagement.firmId } });
    if (!template) throw new NotFoundException('Template not found.');
    if (template.version !== body.expectedVersion) throw new ConflictException('Template changed since it was loaded. Refresh the catalog and retry.');
    const active = await tx.documentTemplateActivation.findFirst({ where: { templateId, firmId: engagement.firmId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const action = body.versionId ? 'ACTIVATED' : 'DEACTIVATED';
    if (action === 'DEACTIVATED' && active?.action !== 'ACTIVATED') throw new ConflictException('This template is already inactive.');
    if (action === 'ACTIVATED') {
      const decision = await tx.documentTemplateApproval.findFirst({ where: { firmId: engagement.firmId, templateId, templateVersionId: body.versionId! }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      if (decision?.action !== 'APPROVED') throw new ConflictException('Only an approved exact template version can be activated.');
      const version = await tx.documentTemplateVersion.findFirst({ where: { id: body.versionId!, firmId: engagement.firmId, templateId } });
      if (!version) throw new NotFoundException('Template version not found.');
      await checkedTemplateAssetVersions(tx, engagement.firmId, version.blocks as unknown as TemplateBlock[]);
    }
    const changed = await tx.documentTemplate.updateMany({ where: { id: templateId, firmId: engagement.firmId, version: body.expectedVersion }, data: { version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException('Template changed concurrently. Refresh the catalog and retry.');
    const event = await tx.documentTemplateActivation.create({ data: { firmId: engagement.firmId, templateId, templateVersionId: body.versionId, action, reason: body.reason, actorId } });
    await recordAuditEvent(tx, { engagementId, actorId, action: `DOCUMENT_TEMPLATE_${action}`, resource: { type: 'DocumentTemplate', id: templateId, version: template.version + 1 }, payload: { templateVersionId: body.versionId, activationEventId: event.id, reason: body.reason } });
    return action === 'ACTIVATED' ? { templateId, activeVersionId: body.versionId!, status: 'ACTIVE' as const, activatedAt: event.createdAt.toISOString() } : { templateId, activeVersionId: null, status: 'INACTIVE' as const, activatedAt: event.createdAt.toISOString() };
  });
}

export async function previewDocumentTemplate(actorId: string, engagementId: string, templateId: string, versionId: string, input: unknown) {
  const body = documentTemplatePreviewRequestSchema.parse(input);
  const { engagement, scope } = await engagementScope(engagementId);
  await requireCapability(db, actorId, 'ENGAGEMENT_READ', scope);
  const canManage = await hasCapability(db, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
  const [template, version] = await Promise.all([
    db.documentTemplate.findFirst({ where: { id: templateId, firmId: engagement.firmId } }),
    db.documentTemplateVersion.findFirst({
      where: { id: versionId, templateId, firmId: engagement.firmId },
      include: {
        approvals: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
        assets: { include: { assetVersion: { include: { asset: true, approvals: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } } } } },
      },
    }),
  ]);
  if (!template || !version) throw new NotFoundException('Template version not found.');
  const activation = await db.documentTemplateActivation.findFirst({ where: { templateId, firmId: engagement.firmId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const activeApproved = activation?.action === 'ACTIVATED' && activation.templateVersionId === versionId && version.approvals[0]?.action === 'APPROVED';
  if (!canManage && !activeApproved) throw new NotFoundException('Template version not found.');
  if (!canManage && version.assets.some(link => link.assetVersion.approvals[0]?.action !== 'APPROVED')) throw new NotFoundException('Template version not found.');
  const assetMap = new Map(version.assets.filter(link => link.assetVersion.approvals[0]?.action === 'APPROVED' && link.assetVersion.status === 'STORED').map(link => [link.assetVersionId, {
    name: link.assetVersion.asset.name, category: link.assetVersion.asset.category, sequence: link.assetVersion.sequence,
  }]));
  const blocks = compileDocumentTemplatePreview({
    blocks: version.blocks as unknown as TemplateBlock[], allowedVariables: version.allowedVariables as string[],
    data: body.data, assets: assetMap,
  });
  return { versionId, contentSha256: version.contentSha256, blocks };
}

type UploadMetadata = z.infer<typeof createApprovedAssetSchema>;
async function initiateAssetVersion(actorId: string, engagementId: string, input: UploadMetadata, existingAssetId?: string, expectedVersion?: number) {
  const filename = safeFilename(input.filename);
  if (!filename || filename !== input.filename) throw new BadRequestException('Asset filename contains unsupported characters.');
  if ((input.category === 'PARTNER_SIGNATURE' || input.category === 'FIRM_SEAL') && !['image/png', 'image/jpeg'].includes(input.contentType)) throw new BadRequestException('Signature and seal artwork must be a PNG or JPEG image.');
  if (input.sizeBytes > MAX_ASSET_BYTES) throw new BadRequestException('Approved assets may not exceed 5 MB.');
  const { engagement, scope } = await engagementScope(engagementId);
  return runUnitOfWork(async ({ client: tx }) => {
    await requireCapability(tx, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
    let assetId = existingAssetId;
    let sequence = 1;
    if (existingAssetId) {
      await tx.$queryRaw`SELECT id FROM "FirmApprovedAsset" WHERE id = ${existingAssetId}::uuid AND "firmId" = ${engagement.firmId}::uuid FOR UPDATE`;
      const asset = await tx.firmApprovedAsset.findFirst({ where: { id: existingAssetId, firmId: engagement.firmId } });
      if (!asset) throw new NotFoundException('Approved asset not found.');
      if (asset.version !== expectedVersion) throw new ConflictException('Asset changed since it was loaded. Refresh the catalog and retry.');
      const pending = await tx.firmApprovedAssetVersion.count({ where: { firmId: engagement.firmId, assetId, status: { in: ['UPLOADING', 'CLEANING'] } } });
      if (pending) throw new ConflictException('An asset upload is already in progress for this artwork.');
      sequence = (await tx.firmApprovedAssetVersion.aggregate({ where: { firmId: engagement.firmId, assetId }, _max: { sequence: true } }))._max.sequence! + 1;
      const changed = await tx.firmApprovedAsset.updateMany({ where: { id: assetId, firmId: engagement.firmId, version: expectedVersion }, data: { version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('Asset changed concurrently. Refresh the catalog and retry.');
    } else {
      const key = `${engagement.firmId}/${randomUUID()}`;
      const asset = await tx.firmApprovedAsset.create({ data: { firmId: engagement.firmId, key, category: input.category, name: input.name, version: 1, createdBy: actorId } });
      assetId = asset.id;
    }
    const version = await tx.firmApprovedAssetVersion.create({ data: {
      firmId: engagement.firmId, assetId: assetId!, sequence, storageKey: `template-assets/${engagement.firmId}/${randomUUID()}`,
      originalFilename: filename, contentType: input.contentType, sha256: input.sha256, sizeBytes: input.sizeBytes, createdBy: actorId,
    } });
    await recordAuditEvent(tx, { engagementId, actorId, action: existingAssetId ? 'DOCUMENT_TEMPLATE_ASSET_VERSION_UPLOAD_INITIATED' : 'DOCUMENT_TEMPLATE_ASSET_UPLOAD_INITIATED', resource: { type: 'FirmApprovedAsset', id: assetId!, version: sequence }, payload: { assetVersionId: version.id, category: input.category, contentType: input.contentType, sizeBytes: input.sizeBytes, sha256: input.sha256 } });
    return { id: assetId!, versionId: version.id, sequence, status: 'UPLOADING' as const, sizeBytes: input.sizeBytes, sha256: input.sha256 };
  });
}

export async function initiateApprovedAsset(actorId: string, engagementId: string, input: unknown) {
  const parsed = createApprovedAssetSchema.parse(input);
  return initiateAssetVersion(actorId, engagementId, parsed);
}

export async function initiateApprovedAssetVersion(actorId: string, engagementId: string, assetId: string, input: unknown) {
  const parsed = createApprovedAssetVersionSchema.parse(input);
  const { expectedVersion, ...metadata } = parsed;
  const { engagement } = await engagementScope(engagementId);
  const asset = await db.firmApprovedAsset.findFirst({ where: { id: assetId, firmId: engagement.firmId }, select: { category: true } });
  if (!asset) throw new NotFoundException('Approved asset not found.');
  return initiateAssetVersion(actorId, engagementId, { ...metadata, category: asset.category as UploadMetadata['category'], name: '' }, assetId, expectedVersion);
}

function identifyAsset(prefix: Buffer, filename: string, contentType: string) {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (contentType === 'application/pdf' && extension === 'pdf' && prefix.subarray(0, 5).toString('ascii') === '%PDF-') return;
  if (contentType === 'image/png' && extension === 'png' && prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return;
  if (contentType === 'image/jpeg' && ['jpg', 'jpeg'].includes(extension ?? '') && prefix.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return;
  throw new BadRequestException('Asset bytes do not match the declared PDF, PNG or JPEG file type.');
}

export async function receiveApprovedAsset(actorId: string, engagementId: string, assetId: string, versionId: string, part: UploadFilePart) {
  const { engagement, scope } = await engagementScope(engagementId);
  const version = await db.firmApprovedAssetVersion.findFirst({ where: { id: versionId, assetId, firmId: engagement.firmId }, include: { asset: true } });
  if (!version || version.createdBy !== actorId || version.status !== 'UPLOADING') throw new NotFoundException('Asset upload session not found.');
  await requireCapability(db, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
  if (part.filename !== version.originalFilename || part.mimetype !== version.contentType) throw new BadRequestException('Asset upload metadata does not match the authorized upload.');
  const directory = await mkdtemp(join(tmpdir(), 'auditsphere-template-asset-'));
  const file = join(directory, 'asset.part');
  let sizeBytes = 0;
  let prefix = Buffer.alloc(0);
  const digest = createHash('sha256');
  try {
    const inspect = new Transform({
      transform(chunk: Buffer | Uint8Array, _encoding, callback) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        sizeBytes += bytes.byteLength;
        if (sizeBytes > MAX_ASSET_BYTES || sizeBytes > version.sizeBytes) return callback(new BadRequestException('Asset upload exceeds its declared size limit.'));
        if (prefix.byteLength < 8) prefix = Buffer.concat([prefix, bytes.subarray(0, 8 - prefix.byteLength)]);
        digest.update(bytes);
        callback(null, bytes);
      },
    });
    await pipeline(Readable.from(part.file), inspect, createWriteStream(file, { flags: 'wx', mode: 0o600 }));
    if (part.file.truncated) throw new BadRequestException('Asset upload was truncated at the transport limit.');
    const sha256 = digest.digest('hex');
    if (sizeBytes !== version.sizeBytes || sha256 !== version.sha256) throw new ConflictException('Asset bytes do not match the declared size and SHA-256.');
    identifyAsset(prefix, version.originalFilename, version.contentType);
    if ((version.asset.category === 'PARTNER_SIGNATURE' || version.asset.category === 'FIRM_SEAL') && !['image/png', 'image/jpeg'].includes(version.contentType)) throw new BadRequestException('Signature and seal artwork must be a PNG or JPEG image.');
    try {
      await scanFileWithClamAv(file, { host: process.env.CLAMAV_HOST ?? '', port: Number(process.env.CLAMAV_PORT ?? 0) });
      if (version.contentType === 'application/pdf') await inspectPdfFile(file);
    } catch (error) {
      if (error instanceof MalwareDetectedError) throw new BadRequestException('The asset was rejected by malware screening.');
      if (error instanceof MalwareScannerUnavailableError || error instanceof ServiceUnavailableException) throw new ServiceUnavailableException('Security scanning is unavailable; the asset was not stored.');
      if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException('Asset security inspection is unavailable; the asset was not stored.');
    }
    const repository = storageProvider() === 'graph' ? await resolveFirmTemplateAssetRepository(db, engagement.firmId) : undefined;
    let storedReference: string | undefined;
    await storeFile(version.storageKey, file, sizeBytes, sha256, version.contentType, repository, async reference => {
      storedReference = reference;
      const provider = reference.startsWith('graph:') ? 'graph' : 'local-s3';
      const graphIdentity = provider === 'graph' ? decodeGraphReference(reference) : undefined;
      const recorded = await db.firmApprovedAssetVersion.updateMany({
        where: { id: version.id, firmId: engagement.firmId, assetId, status: 'UPLOADING', storageReference: null },
        data: { storageReference: reference, provider, driveId: graphIdentity?.driveId ?? null, itemId: graphIdentity?.itemId ?? null, versionId: graphIdentity?.versionId ?? reference, eTag: graphIdentity?.eTag ?? null },
      });
      if (recorded.count !== 1) throw new ConflictException('Asset upload session changed before storage could be recorded.');
    });
    if (!storedReference) throw new ServiceUnavailableException('Asset storage did not return an immutable provider reference.');
    const graphIdentity = storedReference.startsWith('graph:') ? decodeGraphReference(storedReference) : undefined;
    await runUnitOfWork(async ({ client: tx }) => {
      await requireCapability(tx, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
      const updated = await tx.firmApprovedAssetVersion.updateMany({
        where: { id: version.id, firmId: engagement.firmId, assetId, status: 'UPLOADING', storageReference: storedReference, createdBy: actorId },
        data: { status: 'STORED', provider: graphIdentity ? 'graph' : 'local-s3', driveId: graphIdentity?.driveId ?? null, itemId: graphIdentity?.itemId ?? null, versionId: graphIdentity?.versionId ?? storedReference, eTag: graphIdentity?.eTag ?? null },
      });
      if (updated.count !== 1) throw new ConflictException('Asset upload could not be finalized; it remains tracked for cleanup.');
      await recordAuditEvent(tx, { engagementId, actorId, action: 'DOCUMENT_TEMPLATE_ASSET_STORED', resource: { type: 'FirmApprovedAsset', id: assetId, version: version.sequence }, payload: { assetVersionId: version.id, contentType: version.contentType, sizeBytes, sha256 } });
    });
    return { versionId: version.id, status: 'STORED' as const, sizeBytes, sha256 };
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
    throw new ServiceUnavailableException('Approved asset storage failed; its private upload remains tracked for recovery.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function decideApprovedAsset(actorId: string, engagementId: string, assetId: string, versionId: string, input: unknown) {
  const body = documentTemplateDecisionSchema.parse(input);
  const { engagement, scope } = await engagementScope(engagementId);
  return runUnitOfWork(async ({ client: tx }) => {
    await requireCapability(tx, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
    await tx.$queryRaw`SELECT id FROM "FirmApprovedAsset" WHERE id = ${assetId}::uuid AND "firmId" = ${engagement.firmId}::uuid FOR UPDATE`;
    const asset = await tx.firmApprovedAsset.findFirst({ where: { id: assetId, firmId: engagement.firmId } });
    const version = await tx.firmApprovedAssetVersion.findFirst({ where: { id: versionId, assetId, firmId: engagement.firmId } });
    if (!asset || !version || version.status !== 'STORED') throw new NotFoundException('Stored approved asset version not found.');
    if (asset.version !== body.expectedVersion) throw new ConflictException('Asset changed since it was loaded. Refresh the catalog and retry.');
    const current = await tx.firmApprovedAssetApproval.findFirst({ where: { firmId: engagement.firmId, assetId, versionId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if ((body.action === 'APPROVED' && current?.action === 'APPROVED') || (body.action === 'REVOKED' && current?.action === 'REVOKED')) throw new ConflictException('This asset version already has that current decision.');
    if (body.action === 'REVOKED') {
      const activeLinks = await tx.documentTemplateVersionAsset.findMany({ where: { firmId: engagement.firmId, assetId, assetVersionId: versionId }, select: { templateId: true, templateVersionId: true } });
      for (const link of activeLinks) {
        const active = await tx.documentTemplateActivation.findFirst({ where: { firmId: engagement.firmId, templateId: link.templateId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
        if (active?.action === 'ACTIVATED' && active.templateVersionId === link.templateVersionId) throw new ConflictException('Deactivate every active template that uses this artwork before revoking it.');
      }
    }
    const changed = await tx.firmApprovedAsset.updateMany({ where: { id: assetId, firmId: engagement.firmId, version: body.expectedVersion }, data: { version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException('Asset changed concurrently. Refresh the catalog and retry.');
    const decision = await tx.firmApprovedAssetApproval.create({ data: { firmId: engagement.firmId, assetId, versionId, action: body.action, reason: body.reason, actorId } });
    await recordAuditEvent(tx, { engagementId, actorId, action: `DOCUMENT_TEMPLATE_ASSET_${body.action}`, resource: { type: 'FirmApprovedAsset', id: assetId, version: version.sequence }, payload: { assetVersionId: versionId, decisionId: decision.id, reason: body.reason } });
    return { versionId, status: body.action, decidedAt: decision.createdAt.toISOString() };
  });
}

export async function prepareApprovedAssetDownload(actorId: string, engagementId: string, assetId: string, versionId: string) {
  const { engagement, scope } = await engagementScope(engagementId);
  await requireCapability(db, actorId, 'DOCUMENT_TEMPLATE_MANAGE', scope);
  const version = await db.firmApprovedAssetVersion.findFirst({
    where: { id: versionId, assetId, firmId: engagement.firmId, status: 'STORED' },
    include: { asset: true, approvals: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } },
  });
  if (!version || version.approvals[0]?.action !== 'APPROVED' || !version.storageReference) throw new NotFoundException('Approved asset version not found.');
  const repository = version.provider === 'graph' ? await resolveFirmTemplateAssetRepository(db, engagement.firmId) : undefined;
  const directory = await mkdtemp(join(tmpdir(), 'auditsphere-template-download-'));
  const path = join(directory, 'approved-asset');
  try {
    await retrieveToFile(version.storageReference, path, { sha256: version.sha256, sizeBytes: version.sizeBytes }, repository);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { path, stream: createReadStream(path), sizeBytes: version.sizeBytes, sha256: version.sha256, contentType: version.contentType, filename: version.originalFilename, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

/** Remove only stale, unreferenced upload sessions. Failed cleanup remains tracked and is retried. */
export async function sweepUnfinishedDocumentTemplateAssetUploads(input: { olderThanMinutes?: number; limit?: number; now?: Date } = {}) {
  const olderThanMinutes = input.olderThanMinutes ?? 60;
  const limit = input.limit ?? 50;
  const now = input.now ?? new Date();
  if (!Number.isInteger(olderThanMinutes) || olderThanMinutes < 1 || !Number.isInteger(limit) || limit < 1 || limit > 500 || Number.isNaN(now.getTime())) throw new Error('Invalid document-template upload sweep bounds');
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000);
  const rows = await db.firmApprovedAssetVersion.findMany({ where: { status: { in: ['UPLOADING', 'CLEANING'] }, createdAt: { lt: cutoff } }, orderBy: { createdAt: 'asc' }, take: limit, include: { asset: { select: { firmId: true } } } });
  let cleaned = 0;
  for (const row of rows) {
    const claimed = await db.firmApprovedAssetVersion.updateMany({ where: { id: row.id, status: { in: ['UPLOADING', 'CLEANING'] }, createdAt: { lt: cutoff } }, data: { status: 'CLEANING' } });
    if (!claimed.count) continue;
    try {
      const repository = storageProvider() === 'graph' ? await resolveFirmTemplateAssetRepository(db, row.firmId) : undefined;
      const reference = row.storageReference ?? row.storageKey;
      await removeObject(reference, repository, row.sha256);
      const finished = await db.firmApprovedAssetVersion.updateMany({ where: { id: row.id, status: 'CLEANING' }, data: { status: 'CLEANED' } });
      if (finished.count) cleaned++;
    } catch {
      // Keep CLEANING so a later bounded worker pass retries exact-version provider cleanup.
    }
  }
  return { scanned: rows.length, cleaned, reviewRequired: rows.length - cleaned };
}

export type PreparedTemplateAssetDownload = Awaited<ReturnType<typeof prepareApprovedAssetDownload>>;
