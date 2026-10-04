import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import {
  approvedAssetCategories, approvedAssetUploadInitiatedSchema, approvedAssetUploadResultSchema,
  createApprovedAssetSchema, createApprovedAssetVersionSchema, documentTemplateEngagementTypes, documentTemplateKinds,
  createDocumentTemplateSchema, createDocumentTemplateVersionSchema,
  documentTemplateActivationSchema, documentTemplateCatalogSchema, documentTemplateCreatedSchema,
  documentTemplateDecisionResultSchema, documentTemplateDecisionSchema, documentTemplateKindSchema,
  documentTemplatePreviewRequestSchema, documentTemplatePreviewSchema, documentTemplateStateResultSchema,
  documentTemplateVariableKeys, documentTemplateVersionCreatedSchema,
} from '@auditsphere/contracts';
import type { z } from 'zod';
import { authenticatedFetch, requestContractJson } from './api-client';
import { currentAccessToken } from './identity';

type Catalog = z.infer<typeof documentTemplateCatalogSchema>;
type Template = Catalog['templates'][number];
type Asset = Catalog['assets'][number];
type Preview = z.infer<typeof documentTemplatePreviewSchema>;
type TemplateKind = z.infer<typeof documentTemplateKindSchema>;
type AssetCategory = (typeof approvedAssetCategories)[number];

const categories = approvedAssetCategories;
const pretty = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());

@Component({
  selector: 'document-templates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-templates.html',
  styleUrl: './document-templates.css',
})
export class DocumentTemplates {
  readonly engagementId = input.required<string>();
  readonly token = input('');
  readonly entra = input(false);
  readonly catalog = signal<Catalog | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly selectedTemplateId = signal('');
  readonly selectedVersionId = signal('');
  readonly preview = signal<Preview | null>(null);
  readonly previewValues = signal<Record<string, string>>({});
  readonly creating = signal(false);
  readonly kind = signal<TemplateKind>('ENGAGEMENT_LETTER');
  readonly engagementType = signal<(typeof documentTemplateEngagementTypes)[number]>('EXTERNAL_STATUTORY_AUDIT');
  readonly name = signal('');
  readonly title = signal('Engagement letter for {{clientLegalName}}');
  readonly paragraph = signal('The statutory period is {{statutoryPeriod}}.');
  readonly selectedVariables = signal<string[]>(['clientLegalName', 'statutoryPeriod']);
  readonly assetBlockVersion = signal('');
  readonly signatureVersion = signal('');
  readonly sealVersion = signal('');
  readonly reason = signal('');
  readonly assetName = signal('');
  readonly assetReason = signal('');
  readonly assetCategory = signal<AssetCategory>('FIRM_PROFILE');
  readonly assetToRevise = signal('');
  readonly selectedAssetId = signal('');
  readonly selectedAssetVersionId = signal('');
  readonly file = signal<File | null>(null);
  private loadGeneration = 0;
  private contextGeneration = 0;
  private contextKey = '';

  readonly selectedTemplate = computed(() => this.catalog()?.templates.find(item => item.id === this.selectedTemplateId()) ?? null);
  readonly selectedVersion = computed(() => this.selectedTemplate()?.versions.find(item => item.id === this.selectedVersionId()) ?? null);
  readonly selectedAsset = computed(() => this.catalog()?.assets.find(item => item.id === this.selectedAssetId()) ?? null);
  readonly selectedAssetVersion = computed(() => this.selectedAsset()?.versions.find(item => item.id === this.selectedAssetVersionId()) ?? null);
  readonly canManage = computed(() => this.catalog()?.canManage === true);
  readonly assets = computed(() => this.catalog()?.assets ?? []);
  readonly approvedAssetOptions = computed(() => this.assets().flatMap(asset => asset.versions
    .filter(version => version.status === 'STORED' && version.approval === 'APPROVED')
    .map(version => ({ assetId: asset.id, versionId: version.id, category: asset.category, label: `${asset.name} · v${version.sequence} · ${asset.category}` }))));
  readonly ordinaryAssetOptions = computed(() => this.approvedAssetOptions().filter(item => item.category !== 'PARTNER_SIGNATURE' && item.category !== 'FIRM_SEAL'));
  readonly signatureOptions = computed(() => this.approvedAssetOptions().filter(item => item.category === 'PARTNER_SIGNATURE'));
  readonly sealOptions = computed(() => this.approvedAssetOptions().filter(item => item.category === 'FIRM_SEAL'));
  readonly variableKeys = documentTemplateVariableKeys;
  readonly kinds = documentTemplateKinds;
  readonly types = documentTemplateEngagementTypes;
  readonly assetCategories = categories;

  constructor() {
    effect(() => {
      const engagementId = this.engagementId();
      const token = this.token();
      const entra = this.entra();
      const contextKey = `${engagementId}:${entra ? 'entra' : token}`;
      if (contextKey !== this.contextKey) {
        this.contextKey = contextKey;
        this.contextGeneration++;
        this.loadGeneration++;
        this.catalog.set(null); this.selectedTemplateId.set(''); this.selectedVersionId.set('');
        this.preview.set(null); this.previewValues.set({}); this.error.set(''); this.message.set('');
        this.busy.set(false); this.creating.set(false); this.file.set(null); this.assetName.set(''); this.assetReason.set(''); this.assetToRevise.set(''); this.selectedAssetId.set(''); this.selectedAssetVersionId.set(''); this.reason.set(''); this.name.set('');
        this.title.set('Engagement letter for {{clientLegalName}}'); this.paragraph.set('The statutory period is {{statutoryPeriod}}.');
        this.selectedVariables.set(['clientLegalName', 'statutoryPeriod']); this.assetBlockVersion.set(''); this.signatureVersion.set(''); this.sealVersion.set('');
        this.kind.set('ENGAGEMENT_LETTER'); this.engagementType.set('EXTERNAL_STATUTORY_AUDIT');
      }
      if (engagementId) void this.loadCatalog(engagementId, this.contextGeneration);
    });
  }

  private basePath(engagementId = this.engagementId()) { return `/api/v1/engagements/${encodeURIComponent(engagementId)}/document-templates`; }

  private async json<TSchema extends z.ZodType>(path: string, schema: TSchema, method = 'GET', body?: unknown, engagementId = this.engagementId()) {
    if (!this.entra() && !this.token()) throw new Error('Connect to your engagement before loading or managing templates.');
    const headers = new Headers({ Accept: 'application/json' });
    if (body !== undefined && !(body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (!this.entra()) headers.set('Authorization', `Bearer ${this.token()}`);
    const init: RequestInit = {
      method,
      headers,
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    };
    const fetcher = this.entra() ? (request: RequestInfo | URL, options?: RequestInit) => authenticatedFetch(request, options, currentAccessToken) : fetch;
    return requestContractJson(`${this.basePath(engagementId)}${path}`, schema, init, fetcher);
  }

  async loadCatalog(engagementId = this.engagementId(), contextGeneration = this.contextGeneration) {
    const generation = ++this.loadGeneration;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.json('', documentTemplateCatalogSchema, 'GET', undefined, engagementId);
      if (generation !== this.loadGeneration || contextGeneration !== this.contextGeneration) return;
      this.catalog.set(result);
      const current = result.templates.find(item => item.id === this.selectedTemplateId());
      const template = current ?? result.templates[0];
      this.selectedTemplateId.set(template?.id ?? '');
      const selectedVersionId = template?.versions.some(item => item.id === this.selectedVersionId())
        ? this.selectedVersionId()
        : template?.activeVersionId ?? template?.versions[0]?.id ?? '';
      this.selectedVersionId.set(selectedVersionId);
    } catch (failure) {
      if (generation === this.loadGeneration && contextGeneration === this.contextGeneration) this.error.set(failure instanceof Error ? failure.message : 'The template catalog could not be loaded.');
    } finally {
      if (generation === this.loadGeneration && contextGeneration === this.contextGeneration) this.busy.set(false);
    }
  }

  selectTemplate(id: string) {
    const template = this.catalog()?.templates.find(item => item.id === id);
    this.selectedTemplateId.set(id);
    this.selectedVersionId.set(template?.activeVersionId ?? template?.versions[0]?.id ?? '');
    this.preview.set(null);
  }

  setText(target: 'name' | 'title' | 'paragraph' | 'reason' | 'assetName' | 'assetReason', event: Event) {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    if (target === 'name') this.name.set(value);
    else if (target === 'title') this.title.set(value);
    else if (target === 'paragraph') this.paragraph.set(value);
    else if (target === 'reason') this.reason.set(value);
    else if (target === 'assetName') this.assetName.set(value);
    else this.assetReason.set(value);
  }

  setKind(event: Event) { this.kind.set((event.target as HTMLSelectElement).value as TemplateKind); }
  setEngagementType(event: Event) { this.engagementType.set((event.target as HTMLSelectElement).value as (typeof documentTemplateEngagementTypes)[number]); }
  setVersion(event: Event) { this.selectedVersionId.set((event.target as HTMLSelectElement).value); this.preview.set(null); }
  setAssetCategory(event: Event) { this.assetCategory.set((event.target as HTMLSelectElement).value as AssetCategory); }
  setAssetToRevise(event: Event) { this.assetToRevise.set((event.target as HTMLSelectElement).value); }
  setAssetBlock(event: Event) { this.assetBlockVersion.set((event.target as HTMLSelectElement).value); }
  setSignature(event: Event) { this.signatureVersion.set((event.target as HTMLSelectElement).value); }
  setSeal(event: Event) { this.sealVersion.set((event.target as HTMLSelectElement).value); }
  setFile(event: Event) { this.file.set((event.target as HTMLInputElement).files?.[0] ?? null); }
  selectAsset(assetId: string, versionId: string) { this.selectedAssetId.set(assetId); this.selectedAssetVersionId.set(versionId); }
  setPreviewValue(key: string, event: Event) { this.previewValues.update(values => ({ ...values, [key]: (event.target as HTMLInputElement).value })); }
  toggleVariable(key: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedVariables.update(values => checked ? [...new Set([...values, key])] : values.filter(value => value !== key));
  }

  private templateBlocks() {
    const blocks: unknown[] = [
      { id: 'title', kind: 'TITLE', text: this.title() },
      { id: 'body', kind: 'PARAGRAPH', text: this.paragraph() },
    ];
    if (this.assetBlockVersion()) {
      const option = this.approvedAssetOptions().find(item => item.versionId === this.assetBlockVersion());
      if (!option) throw new Error('Choose an approved exact asset version from the catalog.');
      blocks.push({ id: 'firm-asset', kind: 'APPROVED_ASSET', assetVersionId: option.versionId, use: option.category, caption: option.label });
    }
    if (this.signatureVersion()) blocks.push({ id: 'partner-signature', kind: 'PARTNER_SIGNATURE', signatureAssetVersionId: this.signatureVersion(), sealAssetVersionId: this.sealVersion() || null });
    return blocks;
  }

  private async mutate(work: (engagementId: string) => Promise<unknown>, success: string, preservePreview = false, afterSuccess?: (result: unknown) => void) {
    if (this.busy()) return;
    const engagementId = this.engagementId();
    const contextGeneration = this.contextGeneration;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const result = await work(engagementId);
      if (contextGeneration !== this.contextGeneration || engagementId !== this.engagementId()) return;
      this.message.set(success);
      if (!preservePreview) this.preview.set(null);
      afterSuccess?.(result);
      this.creating.set(false);
      await this.loadCatalog(engagementId, contextGeneration);
    } catch (failure) {
      if (contextGeneration === this.contextGeneration && engagementId === this.engagementId()) this.error.set(failure instanceof Error ? failure.message : 'The requested change could not be completed.');
    } finally {
      if (contextGeneration === this.contextGeneration) this.busy.set(false);
    }
  }

  saveTemplate() {
    if (!this.canManage()) return;
    void this.mutate(async engagementId => {
      const blocks = this.templateBlocks();
      const allowedVariables = this.selectedVariables();
      if (this.creating()) {
        const body = createDocumentTemplateSchema.parse({ kind: this.kind(), engagementType: this.engagementType(), name: this.name(), blocks, allowedVariables });
        return this.json('', documentTemplateCreatedSchema, 'POST', body, engagementId);
      }
      const template = this.selectedTemplate();
      if (!template) throw new Error('Choose an existing template or start a new one.');
      const body = createDocumentTemplateVersionSchema.parse({ blocks, allowedVariables, expectedVersion: template.version });
      return this.json(`/${template.id}/versions`, documentTemplateVersionCreatedSchema, 'POST', body, engagementId);
    }, this.creating() ? 'Draft template created as a new immutable version.' : 'A new immutable draft version was added.');
  }

  decideTemplate(action: 'APPROVED' | 'REVOKED') {
    const template = this.selectedTemplate(); const version = this.selectedVersion();
    if (!this.canManage() || !template || !version) return;
    void this.mutate(async engagementId => {
      const body = documentTemplateDecisionSchema.parse({ expectedVersion: template.version, action, reason: this.reason() });
      return this.json(`/${template.id}/versions/${version.id}/decision`, documentTemplateDecisionResultSchema, 'POST', body, engagementId);
    }, action === 'APPROVED' ? 'Exact template version approved.' : 'Template approval revoked.');
  }

  setActivation(active: boolean) {
    const template = this.selectedTemplate(); const version = this.selectedVersion();
    if (!this.canManage() || !template || !version) return;
    void this.mutate(async engagementId => {
      const body = documentTemplateActivationSchema.parse({ expectedVersion: template.version, versionId: active ? version.id : null, reason: this.reason() });
      return this.json(`/${template.id}/activation`, documentTemplateStateResultSchema, 'POST', body, engagementId);
    }, active ? 'Approved template version activated.' : 'Template deactivated.');
  }

  runPreview() {
    const template = this.selectedTemplate(); const version = this.selectedVersion();
    if (!template || !version) return;
    void this.mutate(async engagementId => {
      const body = documentTemplatePreviewRequestSchema.parse({ data: Object.fromEntries(version.allowedVariables.map(key => [key, this.previewValues()[key] ?? ''])) });
      return this.json(`/${template.id}/versions/${version.id}/preview`, documentTemplatePreviewSchema, 'POST', body, engagementId);
    }, 'Controlled preview rendered from the selected immutable template version.', true, result => this.preview.set(result as Preview));
  }

  uploadAsset() {
    if (!this.canManage()) return;
    const file = this.file();
    if (!file) { this.error.set('Select one PDF, PNG or JPEG asset to upload.'); return; }
    void this.mutate(async engagementId => {
      const decision = documentTemplateDecisionSchema.parse({ expectedVersion: 1, action: 'APPROVED', reason: this.assetReason() });
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('');
      const body = createApprovedAssetSchema.parse({ name: this.assetName(), category: this.assetCategory(), filename: file.name, contentType: file.type, sizeBytes: file.size, sha256 });
      const initialized = await this.json('/assets', approvedAssetUploadInitiatedSchema, 'POST', body, engagementId);
      const form = new FormData(); form.append('file', file, file.name);
      await this.json(`/assets/${initialized.id}/versions/${initialized.versionId}/content`, approvedAssetUploadResultSchema, 'PUT', form, engagementId);
      await this.json(`/assets/${initialized.id}/versions/${initialized.versionId}/decision`, documentTemplateDecisionResultSchema, 'POST', decision, engagementId);
      this.file.set(null);
      return initialized;
    }, 'Asset uploaded, screened and approved at its exact content hash.');
  }

  uploadAssetVersion() {
    if (!this.canManage()) return;
    const file = this.file(); const asset = this.catalog()?.assets.find(item => item.id === this.assetToRevise());
    if (!file || !asset) { this.error.set('Choose an existing asset and one PDF, PNG or JPEG file for its new version.'); return; }
    void this.mutate(async engagementId => {
      const decision = documentTemplateDecisionSchema.parse({ expectedVersion: asset.version + 1, action: 'APPROVED', reason: this.assetReason() });
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('');
      const body = createApprovedAssetVersionSchema.parse({ filename: file.name, contentType: file.type, sizeBytes: file.size, sha256, expectedVersion: asset.version });
      const initialized = await this.json(`/assets/${asset.id}/versions`, approvedAssetUploadInitiatedSchema, 'POST', body, engagementId);
      const form = new FormData(); form.append('file', file, file.name);
      await this.json(`/assets/${asset.id}/versions/${initialized.versionId}/content`, approvedAssetUploadResultSchema, 'PUT', form, engagementId);
      await this.json(`/assets/${asset.id}/versions/${initialized.versionId}/decision`, documentTemplateDecisionResultSchema, 'POST', decision, engagementId);
      this.file.set(null); this.assetToRevise.set('');
      return initialized;
    }, 'A new asset version was screened and approved; earlier artwork versions remain intact.');
  }

  decideAsset(action: 'APPROVED' | 'REVOKED') {
    const asset = this.selectedAsset(); const version = this.selectedAssetVersion();
    if (!this.canManage() || !asset || !version || version.status !== 'STORED') return;
    void this.mutate(async engagementId => {
      const body = documentTemplateDecisionSchema.parse({ expectedVersion: asset.version, action, reason: this.assetReason() });
      return this.json(`/assets/${asset.id}/versions/${version.id}/decision`, documentTemplateDecisionResultSchema, 'POST', body, engagementId);
    }, action === 'APPROVED' ? 'Exact asset version approved.' : 'Exact asset approval revoked.');
  }

  pretty(value: string) { return pretty(value); }
}
