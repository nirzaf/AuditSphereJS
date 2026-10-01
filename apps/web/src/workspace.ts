import { Component, signal, computed, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { fslis, TrialBalanceRow } from '@auditsphere/contracts';
import { identityConfiguration, signIn, currentAccessToken } from './identity';
@Component({ selector: 'audit-root', standalone: true, imports: [FormsModule, ScrollingModule], templateUrl: './workspace.html' })
export class Workspace implements OnDestroy {
  readonly identityProvider = signal<'loading' | 'entra' | 'development'>('loading');
  engagementId = '00000000-0000-4000-8000-000000000002';
  constructor() { void identityConfiguration().then(config => this.identityProvider.set(config.provider)).catch(() => this.message.set('Identity configuration is unavailable.')); }
  readonly modules = ['Commercial','Governance','Fieldwork','Reporting','Practice'];
  readonly fslis = fslis; readonly rows = signal<TrialBalanceRow[]>([]); readonly imports = signal<any[]>([]); readonly summary = signal<any[]>([]);
  readonly message = signal('Connect your local environment to begin the Trial Balance validation slice.'); readonly busy = signal(false); readonly batch = signal<any>(null);
  readonly changes = signal<Record<string, { rowId: string; expectedVersion: number; fsli: string }>>({});
  readonly dirty = computed(() => Object.keys(this.changes()).length);
  token = ''; search = ''; offset = 0; total = signal(0); active = signal('Fieldwork');
  get base() { return `/api/v1/engagements/${encodeURIComponent(this.engagementId)}/imports`; }
  private timer = setInterval(() => { if (this.batch() && ['QUEUED','PARSING'].includes(this.batch().status)) void this.run(() => this.load(this.batch().id)); }, 2000);
  ngOnDestroy() { clearInterval(this.timer); }
  async api(path: string, method = 'GET', body?: unknown): Promise<any> {
    if (this.identityProvider() === 'entra') this.token = await currentAccessToken();
    const response = await fetch(this.base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(typeof result.error?.message === 'string' ? result.error.message : JSON.stringify(result.error?.message)); return result;
  }
  async run(action: () => Promise<void>) { this.busy.set(true); try { await action(); } catch (e) { this.message.set(e instanceof Error ? e.message : 'Request failed'); } finally { this.busy.set(false); } }
  connect() { void this.run(async () => { this.imports.set(await this.api('')); this.message.set('Connected. Upload a CSV or open an existing import.'); }); }
  microsoftSignIn() { void this.run(async () => { this.token = await signIn(); this.imports.set(await this.api('')); this.message.set('Connected with Microsoft Entra ID.'); }); }
  async load(id: string) { this.batch.set(await this.api('/' + id)); if (this.batch().status === 'FAILED') { this.message.set(this.batch().error); return; } if (['MAPPING_REQUIRED','FINALIZED'].includes(this.batch().status)) { const page = await this.api(`/${id}/rows?offset=${this.offset}&search=${encodeURIComponent(this.search)}`); this.rows.set(page.rows); this.total.set(page.total); this.summary.set(await this.api('/' + id + '/summary')); } }
  open(id: string) { this.changes.set({}); this.offset = 0; void this.run(() => this.load(id)); }
  upload(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; if (file.size > 15_000_000) { this.message.set('CSV must be smaller than 15 MB.'); return; } void this.run(async () => { const batch = await this.api('', 'POST', { filename: file.name, csv: await file.text() }); this.imports.set(await this.api('')); await this.load(batch.id); this.message.set('Import queued. Worker validation runs in the background.'); }); }
  edit(row: TrialBalanceRow, fsli: string) { if (!fsli) return; this.changes.update(value => ({ ...value, [row.id]: { rowId: row.id, expectedVersion: row.version, fsli } })); }
  save() { void this.run(async () => { await this.api('/' + this.batch().id + '/mappings', 'PATCH', { idempotencyKey: crypto.randomUUID(), changes: Object.values(this.changes()) }); this.changes.set({}); await this.load(this.batch().id); this.message.set('Mappings saved. Versions checked by PostgreSQL.'); }); }
  finalize() { void this.run(async () => { await this.api('/' + this.batch().id + '/finalize', 'POST', { expectedVersion: this.batch().version }); await this.load(this.batch().id); this.message.set('Import finalized and locked.'); }); }
  page(delta: number) { if (this.dirty()) { this.message.set('Save or discard changes before changing pages.'); return; } this.offset = Math.max(0, this.offset + delta); void this.run(() => this.load(this.batch().id)); }
  filter() { this.offset = 0; if (!this.dirty() && this.batch()) void this.run(() => this.load(this.batch().id)); }
}

