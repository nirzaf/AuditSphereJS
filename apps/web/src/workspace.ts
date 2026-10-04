import { Component, signal, computed, OnDestroy, inject, ElementRef, afterRenderEffect } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ModuleWorkspace } from './module-workspace';
import { modules, screensFor } from './module-catalog';
import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  fslis, finalizeSchema, mappingSchema, mappingsSavedSchema, trialBalanceFinalizedSchema, trialBalanceImportSchema,
  trialBalanceImportsSchema, trialBalanceRowsPageSchema, trialBalanceSummarySchema, uploadSchema,
} from '@auditsphere/contracts';
import type { TrialBalanceImport, TrialBalanceRow, TrialBalanceSummaryLine } from '@auditsphere/contracts';
import type { z } from 'zod';
import { parseContractValue, requestAuthenticatedContractJson, requestContractJson } from './api-client';
import { IDENTITY_ADAPTER, type InternalIdentity, type ReadableEngagement } from './identity';
import { RealtimeClient, type RealtimeConnection } from './realtime-client';
// Standalone is the default in Angular v20+; setting it explicitly is unnecessary.
@Component({ selector: 'audit-root', imports: [FormsModule, ScrollingModule, ModuleWorkspace], templateUrl: './workspace.html' })
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
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private navigation?: { unsubscribe(): void };
  private realtimeConnection?: RealtimeConnection;
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
      this.active.set(module); this.screenId.set(screen.id);
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
        this.message.set('Sign in to load engagements assigned to your account.');
        this.sessionRestoring.set(true);
        void this.identity.restoreSession().then(user => {
          if (!user) return;
          this.currentUser.set(user); this.signedIn.set(true);
          void this.loadReadableEngagements().then(() => this.message.set(this.readableEngagements().length ? 'Choose an assigned engagement to continue.' : 'You are signed in, but no engagement with current read access is assigned to this account. Ask your administrator to check your membership and ENGAGEMENT_READ grant.'))
            .catch(error => this.message.set(error instanceof Error ? error.message : 'Assigned engagements could not be loaded.'));
        }).catch(error => this.message.set(error instanceof Error ? error.message : 'Microsoft sign-in could not be restored.'))
          .finally(() => this.sessionRestoring.set(false));
      }
      if (config.provider === 'development') {
        this.engagementId.set('00000000-0000-4000-8000-000000000002');
        this.message.set('Local development access is ready.');
      }
    } catch {
      this.identityProvider.set('unavailable');
      this.message.set('Identity configuration is unavailable. Check the AuditSphere API connection, then retry.');
    }
  }
  retryIdentityConfiguration() { void this.initializeIdentity(); }
  readonly modules = modules;
  readonly screenId = signal('trial-balance');
  readonly screenList = computed(() => screensFor(this.active()));
  readonly summaryTypes = ['Balance sheet','Profit & loss'];
  readonly fslis = fslis; readonly rows = signal<TrialBalanceRow[]>([]); readonly imports = signal<TrialBalanceImport[]>([]); readonly summary = signal<TrialBalanceSummaryLine[]>([]);
  readonly message = signal('Select an engagement and connect to load authorized records.'); readonly busy = signal(false); readonly batch = signal<TrialBalanceImport | null>(null);
  readonly changes = signal<Record<string, { rowId: string; expectedVersion: number; fsli: string }>>({});
  readonly dirty = computed(() => Object.keys(this.changes()).length);
  token = ''; search = ''; offset = 0; total = signal(0); active = signal('Fieldwork');
  get base() { return `/api/v1/engagements/${encodeURIComponent(this.engagementId())}/imports`; }
  private timer = setInterval(() => { const batch = this.batch(); if (batch && ['QUEUED','PARSING'].includes(batch.status)) void this.run(() => this.load(batch.id)); }, 2000);
  ngOnDestroy() { clearInterval(this.timer); this.navigation?.unsubscribe(); this.realtimeConnection?.close(); }
  navigate(module: string, view?: string) {
    if (this.dirty()) { this.message.set('Save or discard mappings before changing workspaces.'); return; }
    const selected = screensFor(module).find(screen => screen.id === view) ?? screensFor(module)[0];
    this.active.set(module); this.screenId.set(selected.id);
    void this.router?.navigate([], { queryParams: { module, view: selected.id } });
  }
  async api<TSchema extends z.ZodType>(path: string, responseSchema: TSchema, method = 'GET', body?: unknown): Promise<z.output<TSchema>> {
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    return this.identityProvider() === 'entra'
      ? requestAuthenticatedContractJson(this.base + path, responseSchema, init, forceRefresh => this.identity.currentAccessToken(forceRefresh))
      : requestContractJson(this.base + path, responseSchema, init);
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
    this.message.set(this.readableEngagements().length ? 'Choose an assigned engagement to continue.' : 'You are signed in, but no engagement with current read access is assigned to this account. Ask your administrator to check your membership and ENGAGEMENT_READ grant.');
  }); }
  selectEngagement(id: string) {
    const selected = this.readableEngagements().some(item => item.id === id) ? id : '';
    if (selected === this.engagementId()) return;
    this.engagementId.set(selected);
    this.imports.set([]); this.rows.set([]); this.summary.set([]); this.total.set(0); this.batch.set(null); this.changes.set({});
    this.realtimeConnection?.close(); this.realtimeConnection = undefined; this.realtimeStatus.set('offline');
    this.message.set(selected ? 'Engagement selected. Load its records to continue.' : 'Choose an engagement assigned to your account.');
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
    this.message.set(this.readableEngagements().length ? 'Signed in. Choose an assigned engagement to continue.' : 'You are signed in, but no engagement with current read access is assigned to this account. Ask your administrator to check your membership and ENGAGEMENT_READ grant.');
  }); }
  microsoftSignOut() { void this.run(async () => {
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
  async load(id: string) { const batch = await this.api('/' + id, trialBalanceImportSchema); this.batch.set(batch); if (batch.status === 'FAILED') { this.message.set(batch.error ?? 'The import failed.'); return; } if (['MAPPING_REQUIRED','FINALIZED'].includes(batch.status)) { const page = await this.api(`/${id}/rows?offset=${this.offset}&search=${encodeURIComponent(this.search)}`, trialBalanceRowsPageSchema); this.rows.set(page.rows); this.total.set(page.total); this.summary.set(await this.api('/' + id + '/summary', trialBalanceSummarySchema)); } }
  open(id: string) { this.changes.set({}); this.offset = 0; this.batch.set(null); this.realtimeConnection?.join({ engagementId: this.engagementId(), resource: { type: 'trial-balance-import', id } }); void this.run(() => this.load(id)); }
  upload(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; if (file.size > 15_000_000) { this.message.set('CSV must be smaller than 15 MB.'); return; } void this.run(async () => { const body = parseContractValue(uploadSchema, { filename: file.name, csv: await file.text() }, 400); const batch = await this.api('', trialBalanceImportSchema, 'POST', body); this.imports.set(await this.api('', trialBalanceImportsSchema)); await this.load(batch.id); this.message.set('Import queued. Worker validation runs in the background.'); }); }
  edit(row: TrialBalanceRow, fsli: string) { if (!fsli) return; this.changes.update(value => ({ ...value, [row.id]: { rowId: row.id, expectedVersion: row.version, fsli } })); }
  save() { void this.run(async () => { const id = this.batch()!.id; const body = parseContractValue(mappingSchema, { idempotencyKey: crypto.randomUUID(), changes: Object.values(this.changes()) }, 400); await this.api('/' + id + '/mappings', mappingsSavedSchema, 'PATCH', body); this.changes.set({}); await this.load(id); this.message.set('Mappings saved. Versions checked by PostgreSQL.'); }); }
  finalize() { void this.run(async () => { const batch = this.batch()!; const body = parseContractValue(finalizeSchema, { expectedVersion: batch.version }, 400); await this.api('/' + batch.id + '/finalize', trialBalanceFinalizedSchema, 'POST', body); await this.load(batch.id); this.message.set('Import finalized and locked.'); }); }
  page(delta: number) { const batch = this.batch(); if (this.dirty()) { this.message.set('Save or discard changes before changing pages.'); return; } if (!batch) return; this.offset = Math.max(0, this.offset + delta); void this.run(() => this.load(batch.id)); }
  filter() { const batch = this.batch(); this.offset = 0; if (!this.dirty() && batch) void this.run(() => this.load(batch.id)); }
}
