import { Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { authenticatedFetch } from './api-client';
import { currentAccessToken } from './identity';

@Component({ selector: 'practice-ledger', imports: [FormsModule, ReactiveFormsModule], template: `
  <section class="intro"><div class="eyebrow">INTERNAL FIRM ACCOUNTING</div><h1>Practice ledger</h1><p>Firm accounts and postings are separate from client audit adjustments.</p><button (click)="refresh()" [disabled]="busy()">Load ledger</button></section>
  <p class="notice" role="status">{{ message() }}</p>
  @if (ledger()) {
    <section class="panel"><h2>Chart of accounts</h2>
      <form (ngSubmit)="account()" class="toolbar"><label>Code <input name="code" [(ngModel)]="accountCode" required maxlength="30"></label><label>Name <input name="name" [(ngModel)]="accountName" required maxlength="150"></label><label>Type <select name="kind" [(ngModel)]="accountKind">@for(kind of kinds; track kind) { <option>{{kind}}</option> }</select></label><button [disabled]="busy()">Add account</button></form>
      <div class="ledger-scroll"><table><thead><tr><th>Account</th><th>Name</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance · QAR</th></tr></thead><tbody>@for(a of ledger().balances; track a.accountId) { <tr><td>{{a.code}}</td><td>{{a.name}}</td><td>{{a.kind}}</td><td>{{a.debit}}</td><td>{{a.credit}}</td><td>{{a.balance}}</td></tr> }</tbody></table></div>
    </section>
  <section class="panel"><h2>Accounting periods</h2><form class="toolbar" (ngSubmit)="period()"><label>Start <input type="date" name="starts" [(ngModel)]="startsOn" required></label><label>End <input type="date" name="ends" [(ngModel)]="endsOn" required></label><button [disabled]="busy()">Create period</button></form>
      @for(p of ledger().periods; track p.id) { <article><p>{{p.startsOn.slice(0,10)}} – {{p.endsOn.slice(0,10)}} · {{p.closed ? 'Closed' : 'Open'}} · Version {{p.version}}</p>@if (!p.closed) { <button (click)="preparePeriodAction(p,'close')" [disabled]="busy()">Close period</button> } @else { <button (click)="preparePeriodAction(p,'reopen')" [disabled]="busy()">Request period reopen</button> }</article> }
      @if (periodAction(); as action) { <form class="toolbar" (submit)="$event.preventDefault(); submitPeriodAction()"><label for="period-reason">{{action.action === 'close' ? 'Reason for closing' : 'Reason for reopening'}} (at least 10 characters)</label><input id="period-reason" [formControl]="periodReason" required minlength="10" maxlength="1000" aria-describedby="period-reason-help" [attr.aria-invalid]="periodReason.touched && periodReason.invalid ? 'true' : null"><span id="period-reason-help">The reason is retained in the append-only audit history.</span>@if (periodReason.touched && periodReason.invalid) { <span role="alert">Enter a reason with at least 10 characters.</span> }<button type="button" (click)="submitPeriodAction()" [disabled]="busy()">Record {{action.action === 'close' ? 'period close' : 'reopen request'}}</button><button type="button" (click)="cancelPeriodAction()" [disabled]="busy()">Cancel</button></form> }
    </section>
    <section class="panel"><h2>New journal</h2><form (ngSubmit)="journal()">
      <div class="toolbar"><label>Period <select aria-label="Journal period" name="period" [(ngModel)]="periodId" required><option value="" disabled>Select an open period</option>@for(p of ledger().periods; track p.id) { @if (!p.closed) { <option [value]="p.id">{{p.startsOn.slice(0,10)}} – {{p.endsOn.slice(0,10)}}</option> } }</select></label><label>Date <input type="date" name="date" [(ngModel)]="accountingDate" required></label><label>Reference <input name="reference" [(ngModel)]="reference" required maxlength="80"></label><label>Memo <input name="memo" [(ngModel)]="memo" required maxlength="500"></label></div>
      @for(l of lines; track $index; let i = $index) { <div class="toolbar"><label>Account <select [attr.aria-label]="'Journal account '+(i+1)" [name]="'account'+i" [(ngModel)]="l.accountId" required><option value="" disabled>Select account</option>@for(a of ledger().accounts; track a.id) { <option [value]="a.id">{{a.code}} · {{a.name}}</option> }</select></label><label>Debit <input [name]="'debit'+i" [(ngModel)]="l.debit" inputmode="decimal" required></label><label>Credit <input [name]="'credit'+i" [(ngModel)]="l.credit" inputmode="decimal" required></label></div> }
      <button type="button" (click)="addLine()" [disabled]="lines.length >= 500">Add line</button> <button class="primary" [disabled]="busy()">Save draft</button>
    </form></section>
    <section class="panel"><h2>Journals</h2><p>Latest 100 journals. Posted entries are immutable; corrections use a reversal.</p>@for(j of ledger().journals; track j.id) { <article><h3>{{j.reference}} · {{j.status}}</h3><p>{{j.accountingDate.slice(0,10)}} · {{j.memo}}</p>@if (j.status === 'DRAFT') { <button (click)="post(j)" [disabled]="busy()">Post journal</button> } @else { <button (click)="reverse(j)" [disabled]="busy() || !periodId || !accountingDate">Reverse into selected period and date</button> }</article> }</section>
  }
` })
export class Practice {
  readonly token = input(''); readonly engagementId = input(''); readonly entra = input(false);
  readonly ledger = signal<any>(null); readonly busy = signal(false); readonly message = signal('Connect in Fieldwork, then load the ledger. A firm-wide practice grant is required.');
  readonly periodAction = signal<{ id: string; version: number; action: 'close' | 'reopen' } | null>(null);
  readonly periodReason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(10), Validators.maxLength(1000)] });
  readonly kinds = ['ASSET','LIABILITY','EQUITY','INCOME','EXPENSE'];
  accountCode = ''; accountName = ''; accountKind = 'ASSET'; startsOn = ''; endsOn = ''; periodId = ''; accountingDate = ''; reference = ''; memo = '';
  lines = [{ accountId: '', debit: '0', credit: '0' }, { accountId: '', debit: '0', credit: '0' }];
  addLine() { this.lines.push({ accountId: '', debit: '0', credit: '0' }); }
  private async request(path = '', method = 'GET', body?: unknown) {
    const token = this.entra() ? '' : this.token();
    const url = `/api/v1/engagements/${encodeURIComponent(this.engagementId())}/practice${path}`;
    const init: RequestInit = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) };
    const response = this.entra() ? await authenticatedFetch(url, init, currentAccessToken) : await fetch(url, init);
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const envelope = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
      const error = envelope['error'] !== null && typeof envelope['error'] === 'object' && !Array.isArray(envelope['error']) ? envelope['error'] as Record<string, unknown> : {};
      const detail = error['message'] !== null && typeof error['message'] === 'object' && !Array.isArray(error['message']) ? error['message'] as Record<string, unknown> : {};
      const serverMessage = typeof error['message'] === 'string' ? error['message'] : typeof detail['message'] === 'string' ? detail['message'] : '';
      const missingPracticeGrant = /^PRACTICE_(READ|MANAGE|POST|REOPEN_PERIOD) is not granted/.test(serverMessage)
        || serverMessage === 'A firm-wide practice grant is required';
      const message = response.status === 401
        ? 'AuditSphere could not confirm this Microsoft identity. Refresh the Microsoft session and sign in again with the designated staff account; if this persists, ask an administrator to verify its local Entra identity mapping.'
        : response.status === 403 && missingPracticeGrant
          ? 'Your account needs the firm-wide Practice permission required for this action.'
          : response.status === 403
            ? 'Your account is not assigned to this engagement or lacks an engagement permission. Ask an administrator to check your assignment.'
          : typeof error['message'] === 'string'
            ? error['message']
            : typeof detail['message'] === 'string'
              ? detail['message']
              : `The ledger request failed (HTTP ${response.status}). Try again.`;
      throw new Error(message);
    }
    return value;
  }
  private async run(work: () => Promise<void>) { this.busy.set(true); try { await work(); } catch(e) { this.message.set(e instanceof Error ? e.message : 'Request failed'); } finally { this.busy.set(false); } }
  refresh() { void this.run(async () => { this.ledger.set(await this.request()); this.message.set('Firm ledger loaded.'); }); }
  private mutate(path: string, body: unknown) { void this.run(async () => { await this.request(path, 'POST', body); this.ledger.set(await this.request()); this.message.set('Saved with an audit record.'); }); }
  account() { this.mutate('/accounts', { code: this.accountCode, name: this.accountName, kind: this.accountKind }); }
  period() { this.mutate('/periods', { startsOn: this.startsOn, endsOn: this.endsOn }); }
  journal() { this.mutate('/journals', { periodId: this.periodId, accountingDate: this.accountingDate, reference: this.reference, memo: this.memo, lines: this.lines, idempotencyKey: crypto.randomUUID() }); }
  post(j: any) { this.mutate(`/journals/${j.id}/post`, { expectedVersion: j.version, idempotencyKey: crypto.randomUUID() }); }
  reverse(j: any) { this.mutate(`/journals/${j.id}/reverse`, { expectedVersion: j.version, idempotencyKey: crypto.randomUUID(), periodId: this.periodId, accountingDate: this.accountingDate, reference: `REV-${j.reference}`.slice(0,80) }); }
  preparePeriodAction(period: { id: string; version: number }, action: 'close' | 'reopen') {
    this.periodReason.reset(''); this.periodAction.set({ id: period.id, version: period.version, action });
  }
  cancelPeriodAction() { this.periodAction.set(null); this.periodReason.reset(''); }
  submitPeriodAction() {
    this.periodReason.markAsTouched();
    const transition = this.periodAction();
    if (!transition || this.periodReason.invalid) return;
    const reason = this.periodReason.value.trim();
    void this.run(async () => {
      await this.request(`/periods/${transition.id}/${transition.action}`, 'POST', { expectedVersion: transition.version, reason, idempotencyKey: crypto.randomUUID() });
      this.ledger.set(await this.request()); this.periodAction.set(null); this.periodReason.reset('');
      this.message.set(transition.action === 'close' ? 'Period closed with an audit reason.' : 'Period reopened with privileged authorization and an audit reason.');
    });
  }
}
