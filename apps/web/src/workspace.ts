import { Component, signal, computed, OnDestroy, inject, ElementRef, afterRenderEffect } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ModuleWorkspace } from './module-workspace';
import { modules, screensFor } from './module-catalog';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { fslis, TrialBalanceRow } from '@auditsphere/contracts';
import { IDENTITY_ADAPTER, type InternalIdentity } from './identity';
// Standalone is the default in Angular v20+; setting it explicitly is unnecessary.
@Component({ selector: 'audit-root', imports: [FormsModule, ScrollingModule, ModuleWorkspace], templateUrl: './workspace.html' })
export class Workspace implements OnDestroy {
  readonly identityProvider = signal<'loading' | 'entra' | 'development'>('loading');
  readonly signedIn = signal(false);
  readonly currentUser = signal<InternalIdentity | null>(null);
  engagementId = '00000000-0000-4000-8000-000000000002';
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly identity = inject(IDENTITY_ADAPTER);
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private navigation?: { unsubscribe(): void };
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
      const module = modules.find(value => value === params.get('module')) ?? 'Fieldwork';
      const screen = screensFor(module).find(value => value.id === params.get('view')) ?? screensFor(module)[0];
      this.active.set(module); this.screenId.set(screen.id);
    });
    void this.identity.identityConfiguration().then(config => this.identityProvider.set(config.provider)).catch(() => this.message.set('Identity configuration is unavailable.'));
  }
  readonly modules = modules;
  readonly screenId = signal('trial-balance');
  readonly screenList = computed(() => screensFor(this.active()));
  readonly summaryTypes = ['Balance sheet','Profit & loss'];
  readonly fslis = fslis; readonly rows = signal<TrialBalanceRow[]>([]); readonly imports = signal<any[]>([]); readonly summary = signal<any[]>([]);
  readonly message = signal('Select an engagement and connect to load authorized records.'); readonly busy = signal(false); readonly batch = signal<any>(null);
  readonly changes = signal<Record<string, { rowId: string; expectedVersion: number; fsli: string }>>({});
  readonly dirty = computed(() => Object.keys(this.changes()).length);
  token = ''; search = ''; offset = 0; total = signal(0); active = signal('Fieldwork');
  get base() { return `/api/v1/engagements/${encodeURIComponent(this.engagementId)}/imports`; }
  private timer = setInterval(() => { if (this.batch() && ['QUEUED','PARSING'].includes(this.batch().status)) void this.run(() => this.load(this.batch().id)); }, 2000);
  ngOnDestroy() { clearInterval(this.timer); this.navigation?.unsubscribe(); }
  navigate(module: string, view?: string) {
    if (this.dirty()) { this.message.set('Save or discard mappings before changing workspaces.'); return; }
    const selected = screensFor(module).find(screen => screen.id === view) ?? screensFor(module)[0];
    this.active.set(module); this.screenId.set(selected.id);
    void this.router?.navigate([], { queryParams: { module, view: selected.id } });
  }
  async api(path: string, method = 'GET', body?: unknown): Promise<any> {
    if (this.identityProvider() === 'entra') this.token = await this.identity.currentAccessToken();
    const response = await fetch(this.base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(typeof result.error?.message === 'string' ? result.error.message : JSON.stringify(result.error?.message)); return result;
  }
  async run(action: () => Promise<void>) { this.busy.set(true); try { await action(); } catch (e) { this.message.set(e instanceof Error ? e.message : 'Request failed'); } finally { this.busy.set(false); } }
  connect() { void this.run(async () => { this.imports.set(await this.api('')); this.message.set('Connected. Upload a CSV or open an existing import.'); }); }
  microsoftSignIn() { void this.run(async () => { this.token = await this.identity.signIn(); this.signedIn.set(true); this.currentUser.set(await this.identity.currentIdentity()); this.imports.set(await this.api('')); this.message.set('Connected with Microsoft Entra ID.'); }); }
  microsoftSignOut() { void this.run(async () => {
    let signOutConfirmed = true;
    try { await this.identity.signOut(); } catch { signOutConfirmed = false; }
    this.token = ''; this.signedIn.set(false); this.currentUser.set(null); this.imports.set([]); this.rows.set([]); this.summary.set([]); this.total.set(0); this.batch.set(null); this.changes.set({});
    this.message.set(signOutConfirmed ? 'Signed out. Local engagement data and unsaved drafts were cleared.' : 'Local access and engagement data were cleared, but Microsoft sign-out could not be confirmed.');
  }); }
  async load(id: string) { this.batch.set(await this.api('/' + id)); if (this.batch().status === 'FAILED') { this.message.set(this.batch().error); return; } if (['MAPPING_REQUIRED','FINALIZED'].includes(this.batch().status)) { const page = await this.api(`/${id}/rows?offset=${this.offset}&search=${encodeURIComponent(this.search)}`); this.rows.set(page.rows); this.total.set(page.total); this.summary.set(await this.api('/' + id + '/summary')); } }
  open(id: string) { this.changes.set({}); this.offset = 0; void this.run(() => this.load(id)); }
  upload(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; if (file.size > 15_000_000) { this.message.set('CSV must be smaller than 15 MB.'); return; } void this.run(async () => { const batch = await this.api('', 'POST', { filename: file.name, csv: await file.text() }); this.imports.set(await this.api('')); await this.load(batch.id); this.message.set('Import queued. Worker validation runs in the background.'); }); }
  edit(row: TrialBalanceRow, fsli: string) { if (!fsli) return; this.changes.update(value => ({ ...value, [row.id]: { rowId: row.id, expectedVersion: row.version, fsli } })); }
  save() { void this.run(async () => { await this.api('/' + this.batch().id + '/mappings', 'PATCH', { idempotencyKey: crypto.randomUUID(), changes: Object.values(this.changes()) }); this.changes.set({}); await this.load(this.batch().id); this.message.set('Mappings saved. Versions checked by PostgreSQL.'); }); }
  finalize() { void this.run(async () => { await this.api('/' + this.batch().id + '/finalize', 'POST', { expectedVersion: this.batch().version }); await this.load(this.batch().id); this.message.set('Import finalized and locked.'); }); }
  page(delta: number) { if (this.dirty()) { this.message.set('Save or discard changes before changing pages.'); return; } this.offset = Math.max(0, this.offset + delta); void this.run(() => this.load(this.batch().id)); }
  filter() { this.offset = 0; if (!this.dirty() && this.batch()) void this.run(() => this.load(this.batch().id)); }
}
