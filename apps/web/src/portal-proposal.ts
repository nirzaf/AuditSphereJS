import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormField, form, minLength, required } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { commercialProposalActionResultSchema, portalAcceptProposalSchema, portalProposalSchema } from '@auditsphere/contracts';
import type { z } from 'zod';

@Component({
  selector: 'portal-proposal', imports: [FormField],
  template: `
    <section aria-labelledby="proposal-title" class="portal-form">
      <h2 id="proposal-title">Review your proposal</h2>
      <p>Enter the proposal reference supplied by your engagement team. Acceptance records your decision for the exact terms shown below.</p>
      <label for="proposal-reference">Proposal reference</label>
      <input id="proposal-reference" autocomplete="off" [formField]="fields.proposalId">
      <button type="button" (click)="load()" [disabled]="busy() || fields.proposalId().invalid()">{{ busy() ? 'Checking…' : 'Review proposal' }}</button>
      @if (proposal(); as item) {
        <dl>
          <dt>Service</dt><dd>{{ item.service }}</dd>
          <dt>Audit period</dt><dd>{{ item.periodStart }} to {{ item.periodEnd }}</dd>
          <dt>Fee</dt><dd>{{ item.totalAmount }} {{ item.currency }}</dd>
          <dt>Revision</dt><dd>{{ item.revision }}</dd>
        </dl>
        @if (item.status === 'PRESENTED') {
          <label for="proposal-code">One-time acceptance code</label>
          <input id="proposal-code" autocomplete="one-time-code" [formField]="fields.token">
          <label><input type="checkbox" [checked]="acknowledged()" (change)="acknowledge($event)"> I accept the service, audit period and fee shown for revision {{ item.revision }}.</label>
          <button type="button" class="primary" (click)="accept()" [disabled]="busy() || !acknowledged() || fields().invalid()">{{ busy() ? 'Recording acceptance…' : 'Accept this proposal' }}</button>
        } @else { <p role="status">Your acceptance has been recorded for this revision.</p> }
      }
      @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
      @if (notice()) { <p role="status">{{ notice() }}</p> }
    </section>
  `,
})
export class PortalProposal {
  private readonly http = inject(HttpClient);
  private generation = 0;
  private acceptanceKey = crypto.randomUUID();
  readonly model = signal({ proposalId: '', token: '' });
  readonly fields = form(this.model, path => { required(path.proposalId); required(path.token); minLength(path.token, 64); });
  readonly proposal = signal<z.infer<typeof portalProposalSchema> | null>(null);
  readonly busy = signal(false);
  readonly acknowledged = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  acknowledge(event: Event) { this.acknowledged.set((event.target as HTMLInputElement).checked); }
  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => { this.generation++; this.model.set({ proposalId: '', token: '' }); });
    effect(() => {
      const id = this.model().proposalId;
      if (this.proposal() && this.proposal()!.id !== id) { this.generation++; this.proposal.set(null); this.acknowledged.set(false); this.busy.set(false); }
    });
  }
  async load() {
    if (this.busy()) return;
    const id = this.model().proposalId.trim();
    if (!portalProposalSchema.shape.id.safeParse(id).success) { this.error.set('Enter the complete proposal reference.'); return; }
    const generation = ++this.generation;
    this.busy.set(true); this.error.set(''); this.notice.set(''); this.acknowledged.set(false); this.proposal.set(null);
    try {
      const item = portalProposalSchema.parse(await firstValueFrom(this.http.get<unknown>(`/api/v1/portal/proposals/${encodeURIComponent(id)}`, { withCredentials: true })));
      if (item.id !== id) throw new Error('Proposal response does not match its reference');
      if (generation === this.generation) { this.acceptanceKey = crypto.randomUUID(); this.proposal.set(item); }
    } catch { if (generation === this.generation) this.error.set('This proposal is unavailable for your account. Verify the reference with your engagement team.'); }
    finally { if (generation === this.generation) this.busy.set(false); }
  }
  async accept() {
    const item = this.proposal();
    if (this.busy() || !item || item.status !== 'PRESENTED' || !this.acknowledged() || this.model().proposalId.trim() !== item.id) return;
    const parsed = portalAcceptProposalSchema.safeParse({ idempotencyKey: this.acceptanceKey, token: this.model().token.trim(), expectedVersion: item.revision });
    if (!parsed.success) { this.error.set('Enter the complete one-time acceptance code.'); return; }
    const cookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('auditsphere_portal_csrf='));
    const csrf = cookie ? decodeURIComponent(cookie.slice('auditsphere_portal_csrf='.length)) : '';
    const generation = this.generation; this.busy.set(true); this.error.set('');
    try {
      const result = commercialProposalActionResultSchema.parse(await firstValueFrom(this.http.post<unknown>(`/api/v1/portal/proposals/${item.id}/accept`, parsed.data, { withCredentials: true, headers: new HttpHeaders({ 'x-csrf-token': csrf }) })));
      if (result.status !== 'ACCEPTED' || result.id !== item.id || result.revision !== item.revision) throw new Error('Acceptance response does not match the reviewed proposal');
      if (generation !== this.generation) return;
      this.model.update(value => ({ ...value, token: '' }));
      this.proposal.set({ ...item, status: 'ACCEPTED' }); this.notice.set('Acceptance recorded. Your engagement team can continue onboarding.');
    } catch { if (generation === this.generation) this.error.set('Acceptance was not recorded. The code may be expired, replaced or used, or the proposal may have changed. Ask your engagement team for the current proposal.'); }
    finally { if (generation === this.generation) this.busy.set(false); }
  }
}
