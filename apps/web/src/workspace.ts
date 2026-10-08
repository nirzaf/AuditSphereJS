import { Component, signal, computed, OnDestroy, inject, ElementRef, afterRenderEffect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ModuleWorkspace } from './module-workspace';
import { modules, screensFor } from './module-catalog';
import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  editLeaseResultSchema, finalizeSchema, mappingSchema, mappingsSavedSchema, taxonomyViewsSchema, trialBalanceFinalizedSchema, trialBalanceImportSchema,
  trialBalanceImportsSchema, trialBalanceRowsPageSchema, trialBalanceSummarySchema, uploadSchema,
} from '@auditsphere/contracts';
import type { TaxonomyView, TrialBalanceImport, TrialBalanceRow, TrialBalanceSummaryLine } from '@auditsphere/contracts';

/**
 * The FSLI codes a mapping may use: the lines of the newest approved taxonomy version. The server
 * checks a mapping approval against that same version when none is named, so the choices and the
 * check agree. Lines keep their taxonomy order.
 */
export function approvedMappingCodes(versions: readonly TaxonomyView[]): string[] {
  const newest = versions.filter(version => version.status === 'APPROVED').sort((a, b) => b.version - a.version)[0];
  return newest ? [...newest.lines].sort((a, b) => a.sortOrder - b.sortOrder).map(line => line.code) : [];
}
import type { z } from 'zod';
import { parseContractValue, requestAuthenticatedContractJson, requestContractJson } from './api-client';
import { IDENTITY_ADAPTER, type InternalIdentity, type ReadableEngagement } from './identity';
import { RealtimeClient, type RealtimeConnection } from './realtime-client';
// Standalone is the default in Angular v20+; setting it explicitly is unnecessary.
@Component({ selector: 'audit-root', imports: [FormsModule, ScrollingModule, ModuleWorkspace, DatePipe], templateUrl: './workspace.html' })
export class Workspace implements OnDestroy {
  readonly identityProvider = signal<'loading' | 'unavailable' | 'entra' | 'development'>('loading');
  readonly sessionRestoring = signal(false);
  readonly signedIn = signal(false);
  readonly currentUser = signal<InternalIdentity | null>(null);
  readonly engagementId = signal('');
  readonly readableEngagements = signal<ReadableEngagement[]>([]);
  readonly engagementsLoading = signal(false);
  readonly engagementLoadError = signal('');
  readonly realtimeStatus = signal<'offline' | 'connected' | 'disconnected' | 'denied'>('offline');
  readonly workspaceAccess = computed(() => this.identityProvider() !== 'entra' || (this.signedIn() && this.readableEngagements().some(item => item.id === this.engagementId())));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly identity = inject(IDENTITY_ADAPTER);
  private readonly realtime = inject(RealtimeClient);
  private readonly pageTitle = inject(Title);
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private navigation?: { unsubscribe(): void };
  private realtimeConnection?: RealtimeConnection;
  private leaseEpoch = 0;
  private leaseHeartbeat = setInterval(() => void this.renewEditLeases(), 25_000);
  constructor() {
    afterRenderEffect({ mixedReadWrite: () => {
      this.screenId(); this.active();
      for (const selector of ['.workspace-tabs', 'nav[aria-label="Business modules"]']) {
        const container = this.host.nativeElement.querySelector<HTMLElement>(selector);
        const selected = container?.querySelector<HTMLElement>('[aria-current="page"]');
        if (!container || !selected) continue;
        const bounds = container.getBoundingClientRect(); const item = selected.getBoundingClientRect();
        if (item.left < bounds.left) container.scrollLeft += item.left - bounds.left;
        else if (item.right > bounds.right) container.scrollLeft += item.right - bounds.right;
      }
    } });
    this.navigation = this.route?.queryParamMap.subscribe(params => {
      if (this.dirty()) {
        if (params.get('module') !== this.active() || params.get('view') !== this.screenId()) {
          this.message.set('Save or discard mappings before changing workspaces.');
          void this.router?.navigate([], {queryParams:{module:this.active(),view:this.screenId()},replaceUrl:true});
        }
        return;
      }
      const requestedModule = params.get('module');
      const module = modules.find(value => value === requestedModule) ?? 'Fieldwork';
      const screens = screensFor(module);
      const requestedView = params.get('view');
      const screen = screens.find(value => value.id === requestedView) ?? screens[0];
      this.releaseLeasesWhenLeavingTrialBalance(module, screen.id);
      this.active.set(module); this.screenId.set(screen.id);
      this.updatePageTitle(module, screen.id);
      if (requestedModule !== module || requestedView !== screen.id) {
        void this.router?.navigate([], { queryParams: { module, view: screen.id }, replaceUrl: true });
      }
    });
    void this.initializeIdentity();
  }
  private async initializeIdentity() {
    this.identityProvider.set('loading');
    this.signedIn.set(false);
    this.currentUser.set(null);
    this.readableEngagements.set([]);
    this.engagementId.set('');
    this.engagementLoadError.set('');
    this.sessionRestoring.set(false);
    try {
      const config = await this.identity.identityConfiguration();
      this.identityProvider.set(config.provider);
      if (config.provider === 'entra') {
        this.sessionRestoring.set(true);
        void this.identity.restoreSession().then(user => {
          if (!user) return;
          this.currentUser.set(user); this.signedIn.set(true);
          void this.loadReadableEngagements()
            .catch(error => this.message.set(error instanceof Error ? error.message : 'Assigned engagements could not be loaded.'));
        }).catch(error => this.message.set(error instanceof Error ? error.message : 'Microsoft sign-in could not be restored.'))
          .finally(() => this.sessionRestoring.set(false));
      }
      if (config.provider === 'development') {
        this.engagementId.set('00000000-0000-4000-8000-000000000002');
      }
    } catch {
      this.identityProvider.set('unavailable');
    }
  }
  retryIdentityConfiguration() { void this.initializeIdentity(); }
  readonly modules = modules;
  readonly screenId = signal('trial-balance');
  readonly screenList = computed(() => screensFor(this.active()));
  readonly summaryTypes = ['Balance sheet','Profit & loss'];
  readonly mappingCodes = signal<string[]>([]); readonly rows = signal<TrialBalanceRow[]>([]); readonly imports = signal<TrialBalanceImport[]>([]); readonly summary = signal<TrialBalanceSummaryLine[]>([]);
  readonly message = signal(''); readonly busy = signal(false); readonly batch = signal<TrialBalanceImport | null>(null);
  readonly changes = signal<Record<string, { rowId: string; expectedVersion: number; fsli: string }>>({});
  readonly rowLeases = signal<Record<string, z.output<typeof editLeaseResultSchema>>>({});
  readonly rowLeaseTokens = signal<Record<string, string>>({});
  readonly pendingLeaseRows = signal<Record<string, boolean>>({});
  readonly dirty = computed(() => Object.keys(this.changes()).length);
  token = ''; search = ''; offset = 0; total = signal(0); active = signal('Fieldwork');
  get base() { return `/api/v1/engagements/${encodeURIComponent(this.engagementId())}/imports`; }
  private timer = setInterval(() => { const batch = this.batch(); if (batch && ['QUEUED','PARSING'].includes(batch.status)) void this.run(() => this.load(batch.id)); }, 2000);
  ngOnDestroy() { clearInterval(this.timer); clearInterval(this.leaseHeartbeat); void this.releaseEditLeases(); this.navigation?.unsubscribe(); this.realtimeConnection?.close(); }
  navigate(module: string, view?: string) {
    if (this.dirty()) { this.message.set('Save or discard mappings before changing workspaces.'); return; }
    const selected = screensFor(module).find(screen => screen.id === view) ?? screensFor(module)[0];
    this.releaseLeasesWhenLeavingTrialBalance(module, selected.id);
    this.active.set(module); this.screenId.set(selected.id);
    this.updatePageTitle(module, selected.id);
    void this.router?.navigate([], { queryParams: { module, view: selected.id } });
  }
  private updatePageTitle(module: string, view: string) {
    const screen = screensFor(module).find(value => value.id === view);
    this.pageTitle.setTitle(screen ? `${screen.title} | ${module} | AuditSphere` : `${module} | AuditSphere`);
  }
  private releaseLeasesWhenLeavingTrialBalance(module: string, view: string) {
    if (this.active() === 'Fieldwork' && this.screenId() === 'trial-balance' && (module !== 'Fieldwork' || view !== 'trial-balance')) void this.releaseEditLeases();
  }
  async api<TSchema extends z.ZodType>(path: string, responseSchema: TSchema, method = 'GET', body?: unknown): Promise<z.output<TSchema>> {
    return this.apiUrl(this.base + path, responseSchema, method, body);
  }
  private async apiUrl<TSchema extends z.ZodType>(url: string, responseSchema: TSchema, method = 'GET', body?: unknown): Promise<z.output<TSchema>> {
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    return this.identityProvider() === 'entra'
      ? requestAuthenticatedContractJson(url, responseSchema, init, forceRefresh => this.identity.currentAccessToken(forceRefresh))
      : requestContractJson(url, responseSchema, init);
  }
  async run(action: () => Promise<void>) { this.busy.set(true); try { await action(); } catch (e) { this.message.set(e instanceof Error ? e.message : 'Request failed'); } finally { this.busy.set(false); } }
  async loadReadableEngagements() {
    this.engagementsLoading.set(true);
    this.engagementLoadError.set('');
    this.readableEngagements.set([]);
    this.selectEngagement('');
    try {
      const items = await this.identity.listReadableEngagements();
      this.readableEngagements.set(items);
      this.selectEngagement('');
    } catch (error) {
      this.engagementLoadError.set(error instanceof Error ? error.message : 'Assigned engagements could not be loaded.');
      throw error;
    } finally {
      this.engagementsLoading.set(false);
    }
  }
  retryReadableEngagements() { void this.run(async () => {
    await this.loadReadableEngagements();
  }); }
  selectEngagement(id: string) {
    const selected = this.readableEngagements().some(item => item.id === id) ? id : '';
    if (selected === this.engagementId()) return;
    void this.releaseEditLeases();
    this.engagementId.set(selected);
    this.imports.set([]); this.rows.set([]); this.summary.set([]); this.total.set(0); this.batch.set(null); this.changes.set({}); this.mappingCodes.set([]);
    this.realtimeConnection?.close(); this.realtimeConnection = undefined; this.realtimeStatus.set('offline');
    this.message.set('');
    if (selected && (this.identityProvider() === 'development' || this.signedIn())) this.openRealtimeEngagement(selected);
  }
  private openRealtimeEngagement(engagementId: string) {
    this.realtimeConnection?.close();
    this.realtimeConnection = this.realtime.connect({
      kind: 'internal',
      accessToken: () => this.identityProvider() === 'entra' ? this.identity.currentAccessToken() : Promise.resolve(this.token),
    }, { engagementId, resource: { type: 'engagement' } }, {
      onSnapshot: () => this.refreshAfterRealtime(),
      onInvalidation: event => {
        if (this.dirty()) { this.message.set('Another user changed this import. Your draft is preserved; row versions will detect a conflict if the same accounts changed.'); return; }
        if (this.batch()?.id === event.resourceId) void this.run(async () => {
          this.imports.set(await this.api('', trialBalanceImportsSchema));
          await this.load(event.resourceId);
          this.message.set('This Trial Balance changed in another session. Authoritative data was reloaded.');
        });
      },
      onRefreshRequired: () => this.refreshAfterRealtime(),
      onStatus: status => this.realtimeStatus.set(status),
      onAccessRevoked: () => {
        this.selectEngagement('');
        this.realtimeStatus.set('denied');
        this.message.set('Engagement access was revoked. The workspace has been cleared.');
      },
    });
  }
  private refreshAfterRealtime() {
    if (!this.engagementId() || this.dirty()) {
      if (this.dirty()) this.message.set('Realtime changes are waiting. Save or discard your draft, then reload from the server.');
      return;
    }
    if (this.batch()) void this.run(() => this.load(this.batch()!.id));
    else if (this.imports().length) void this.run(async () => { this.imports.set(await this.api('', trialBalanceImportsSchema)); });
  }
  connect() { void this.run(async () => {
    if (!this.engagementId()) throw new Error('Choose an assigned engagement before loading records.');
    this.imports.set(await this.api('', trialBalanceImportsSchema)); this.message.set('Connected. Upload a CSV or open an existing import.');
  }); }
  microsoftSignIn() { void this.run(async () => {
    await this.identity.signIn();
    const user = await this.identity.currentIdentity();
    this.currentUser.set(user); this.signedIn.set(true);
    await this.loadReadableEngagements();
  }); }
  microsoftSignOut() { void this.run(async () => {
    await this.releaseEditLeases();
    this.realtimeConnection?.close(); this.realtimeConnection = undefined; this.realtimeStatus.set('offline');
    const entraSession = this.identityProvider() === 'entra';
    let sessionRevocationConfirmed = !entraSession;
    if (entraSession) {
      try { await this.identity.revokeSessions(); sessionRevocationConfirmed = true; } catch { sessionRevocationConfirmed = false; }
    }
    this.token = ''; this.signedIn.set(false); this.currentUser.set(null); this.engagementsLoading.set(false); this.engagementLoadError.set(''); this.readableEngagements.set([]); this.engagementId.set(''); this.imports.set([]); this.rows.set([]); this.summary.set([]); this.total.set(0); this.batch.set(null); this.changes.set({});
    let microsoftSignOutConfirmed = true;
    try { await this.identity.signOut(); } catch { microsoftSignOutConfirmed = false; }
    this.message.set(!entraSession
      ? 'Signed out. Local engagement data and unsaved drafts were cleared.'
      : sessionRevocationConfirmed && microsoftSignOutConfirmed
        ? 'Signed out. Server-side session revocation was confirmed; local engagement data and unsaved drafts were cleared.'
        : sessionRevocationConfirmed
          ? 'Server-side session revocation was confirmed and local data was cleared, but Microsoft sign-out could not be confirmed.'
          : microsoftSignOutConfirmed
            ? 'Signed out with Microsoft, but the server could not confirm session revocation. Local engagement data and unsaved drafts were cleared.'
            : 'Local access and engagement data were cleared, but neither server session revocation nor Microsoft sign-out could be confirmed.');
  }); }
  /** Loads the FSLI choices for mapping. The list is capped at the server maximum of 200 versions per request. */
  private async loadMappingCodes() {
    const versions = await this.apiUrl(`/api/v1/engagements/${encodeURIComponent(this.engagementId())}/taxonomies?limit=200`, taxonomyViewsSchema);
    const codes = approvedMappingCodes(versions);
    this.mappingCodes.set(codes);
    if (!codes.length) this.message.set('No approved taxonomy is configured for this engagement. Approve one before choosing account mappings.');
  }
  async load(id: string) { const batch = await this.api('/' + id, trialBalanceImportSchema); this.batch.set(batch); if (batch.status === 'FAILED') { this.message.set(batch.error ?? 'The import failed.'); return; } if (['MAPPING_REQUIRED','FINALIZED'].includes(batch.status)) { const page = await this.api(`/${id}/rows?offset=${this.offset}&search=${encodeURIComponent(this.search)}`, trialBalanceRowsPageSchema); this.rows.set(page.rows); this.total.set(page.total); this.summary.set(await this.api('/' + id + '/summary', trialBalanceSummarySchema)); } }
  open(id: string) {
    if (this.batch() && this.batch()!.id !== id) void this.releaseEditLeases();
    this.changes.set({}); this.rowLeases.set({}); this.rowLeaseTokens.set({}); this.pendingLeaseRows.set({}); this.offset = 0; this.batch.set(null);
    this.realtimeConnection?.join({ engagementId: this.engagementId(), resource: { type: 'trial-balance-import', id } }); void this.run(async () => { await this.loadMappingCodes(); await this.load(id); });
  }
  upload(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; if (file.size > 15_000_000) { this.message.set('CSV must be smaller than 15 MB.'); return; } void this.run(async () => { const body = parseContractValue(uploadSchema, { filename: file.name, csv: await file.text() }, 400); const batch = await this.api('', trialBalanceImportSchema, 'POST', body); this.imports.set(await this.api('', trialBalanceImportsSchema)); await this.loadMappingCodes(); await this.load(batch.id); this.message.set('Import queued. Worker validation runs in the background.'); }); }
  private rowLeaseUrl(engagementId: string, importId: string, rowId: string) {
    return `/api/v1/engagements/${encodeURIComponent(engagementId)}/imports/${encodeURIComponent(importId)}/rows/${encodeURIComponent(rowId)}/lease`;
  }
  private rememberLease(rowId: string, result: z.output<typeof editLeaseResultSchema>) {
    this.rowLeases.update(value => ({ ...value, [rowId]: result }));
    if (!result.available) return;
    const token = result.lease?.ownedByCurrentUser ? result.lease.leaseToken : undefined;
    this.rowLeaseTokens.update(value => {
      const next = { ...value };
      if (token) next[rowId] = token;
      else delete next[rowId];
      return next;
    });
  }
  async inspectRowLease(rowId: string) {
    const batch = this.batch(); const engagementId = this.engagementId();
    if (!batch || !engagementId) return;
    const epoch = this.leaseEpoch;
    try {
      const result = await this.apiUrl(this.rowLeaseUrl(engagementId, batch.id, rowId), editLeaseResultSchema);
      if (epoch === this.leaseEpoch && this.batch()?.id === batch.id && this.engagementId() === engagementId) this.rememberLease(rowId, result);
    }
    catch (error) { this.message.set(error instanceof Error ? error.message : 'Row collaboration status is unavailable.'); }
  }
  async edit(row: TrialBalanceRow, fsli: string) {
    const batch = this.batch(); const engagementId = this.engagementId();
    if (!fsli || !batch || !engagementId || this.pendingLeaseRows()[row.id]) return;
    const importId = batch.id; const epoch = this.leaseEpoch; const url = this.rowLeaseUrl(engagementId, importId, row.id);
    this.pendingLeaseRows.update(value => ({ ...value, [row.id]: true }));
    try {
      let result: z.output<typeof editLeaseResultSchema>;
      const token = this.rowLeaseTokens()[row.id];
      try {
        result = await this.apiUrl(url, editLeaseResultSchema, 'POST', token ? { action: 'renew', token } : { action: 'acquire' });
      } catch (error) {
        result = await this.apiUrl(url, editLeaseResultSchema);
        if (result.available && result.lease && !result.lease.ownedByCurrentUser) {
          this.message.set(`${result.lease.displayName} is editing this row until ${new Date(result.lease.expiresAt).toLocaleTimeString()}. You may continue; PostgreSQL checks the row version when you save.`);
        } else if (!result.available) {
          this.message.set('Shared editing presence is unavailable. Database version checks remain active.');
        } else if (!result.lease) {
          this.message.set(error instanceof Error ? error.message : 'Row lease could not be acquired. Database version checks remain active.');
        }
      }
      if (epoch !== this.leaseEpoch || this.engagementId() !== engagementId || this.batch()?.id !== importId) {
        const staleToken = result.available && result.lease?.ownedByCurrentUser ? result.lease.leaseToken : undefined;
        if (staleToken) void this.apiUrl(url, editLeaseResultSchema, 'POST', { action: 'release', token: staleToken }).catch(() => undefined);
        return;
      }
      this.rememberLease(row.id, result);
      if (result.available && result.lease && !result.lease.ownedByCurrentUser) {
        this.message.set(`${result.lease.displayName} is editing this row until ${new Date(result.lease.expiresAt).toLocaleTimeString()}. You may continue; PostgreSQL checks the row version when you save.`);
      } else if (!result.available) {
        this.message.set('Shared editing presence is unavailable. Database version checks remain active.');
      }
      this.changes.update(value => ({ ...value, [row.id]: { rowId: row.id, expectedVersion: row.version, fsli } }));
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not check row editing status.');
    } finally {
      this.pendingLeaseRows.update(value => { const next = { ...value }; delete next[row.id]; return next; });
    }
  }
  private async renewEditLeases() {
    const batch = this.batch(); const engagementId = this.engagementId();
    if (!batch || !engagementId || this.active() !== 'Fieldwork' || this.screenId() !== 'trial-balance') return;
    const importId = batch.id; const epoch = this.leaseEpoch;
    await Promise.all(Object.entries(this.rowLeaseTokens()).map(async ([rowId, token]) => {
      const url = this.rowLeaseUrl(engagementId, importId, rowId);
      try {
        const result = await this.apiUrl(url, editLeaseResultSchema, 'POST', { action: 'renew', token });
        if (epoch === this.leaseEpoch && this.batch()?.id === importId && this.engagementId() === engagementId) this.rememberLease(rowId, result);
      } catch {
        if (epoch !== this.leaseEpoch || this.batch()?.id !== importId || this.engagementId() !== engagementId) return;
        this.rowLeaseTokens.update(value => { const next = { ...value }; delete next[rowId]; return next; });
        try { this.rememberLease(rowId, await this.apiUrl(url, editLeaseResultSchema)); } catch { /* PostgreSQL expectedVersion remains authoritative. */ }
      }
    }));
  }
  private async releaseEditLeases() {
    const batch = this.batch(); const engagementId = this.engagementId(); const tokens = this.rowLeaseTokens();
    this.leaseEpoch++;
    this.rowLeaseTokens.set({});
    if (!batch || !engagementId) return;
    const importId = batch.id;
    await Promise.all(Object.entries(tokens).map(async ([rowId, token]) => {
      try { await this.apiUrl(this.rowLeaseUrl(engagementId, importId, rowId), editLeaseResultSchema, 'POST', { action: 'release', token }); }
      catch { /* A disconnected client leaves only a short-lived advisory lease. */ }
    }));
    if (this.batch()?.id === importId && this.engagementId() === engagementId) this.rowLeases.set({});
  }
  discard() { void this.releaseEditLeases(); this.changes.set({}); this.rowLeases.set({}); this.message.set('Unsaved mappings discarded.'); }
  save() { void this.run(async () => { const id = this.batch()!.id; const body = parseContractValue(mappingSchema, { idempotencyKey: crypto.randomUUID(), changes: Object.values(this.changes()) }, 400); await this.api('/' + id + '/mappings', mappingsSavedSchema, 'PATCH', body); this.changes.set({}); await this.releaseEditLeases(); await this.load(id); this.message.set('Mappings saved. PostgreSQL checked every row version; advisory leases were released.'); }); }
  finalize() { void this.run(async () => { const batch = this.batch()!; const body = parseContractValue(finalizeSchema, { expectedVersion: batch.version }, 400); await this.api('/' + batch.id + '/finalize', trialBalanceFinalizedSchema, 'POST', body); await this.releaseEditLeases(); await this.load(batch.id); this.message.set('Import finalized and locked.'); }); }
  page(delta: number) { const batch = this.batch(); if (this.dirty()) { this.message.set('Save or discard changes before changing pages.'); return; } if (!batch) return; this.offset = Math.max(0, this.offset + delta); void this.run(() => this.load(batch.id)); }
  filter() { const batch = this.batch(); this.offset = 0; if (!this.dirty() && batch) void this.run(() => this.load(batch.id)); }
}
