import { Component, Input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { currentAccessToken } from './identity';

@Component({ selector: 'practice-ledger', imports: [FormsModule], template: `
  <section class="intro"><div class="eyebrow">INTERNAL FIRM ACCOUNTING</div><h1>Practice ledger</h1><p>Firm accounts and postings are separate from client audit adjustments.</p><button (click)="refresh()" [disabled]="busy()">Load ledger</button></section>
  <p class="notice" role="status">{{ message() }}</p>
  @if (ledger()) {
    <section class="panel"><h2>Chart of accounts</h2>
      <form (ngSubmit)="account()" class="toolbar"><label>Code <input name="code" [(ngModel)]="accountCode" required maxlength="30"></label><label>Name <input name="name" [(ngModel)]="accountName" required maxlength="150"></label><label>Type <select name="kind" [(ngModel)]="accountKind">@for(kind of kinds; track kind) { <option>{{kind}}</option> }</select></label><button [disabled]="busy()">Add account</button></form>
      <div class="ledger-scroll"><table><thead><tr><th>Account</th><th>Name</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance · QAR</th></tr></thead><tbody>@for(a of ledger().balances; track a.accountId) { <tr><td>{{a.code}}</td><td>{{a.name}}</td><td>{{a.kind}}</td><td>{{a.debit}}</td><td>{{a.credit}}</td><td>{{a.balance}}</td></tr> }</tbody></table></div>
    </section>
    <section class="panel"><h2>Accounting periods</h2><form class="toolbar" (ngSubmit)="period()"><label>Start <input type="date" name="starts" [(ngModel)]="startsOn" required></label><label>End <input type="date" name="ends" [(ngModel)]="endsOn" required></label><button [disabled]="busy()">Create period</button></form>
      @for(p of ledger().periods; track p.id) { <p>{{p.startsOn.slice(0,10)}} – {{p.endsOn.slice(0,10)}} · {{p.closed ? 'Closed' : 'Open'}} @if (!p.closed) { <button (click)="close(p)" [disabled]="busy()">Close period</button> }</p> }
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
  @Input() token = ''; @Input() engagementId = ''; @Input() entra = false;
  readonly ledger = signal<any>(null); readonly busy = signal(false); readonly message = signal('Connect in Fieldwork, then load the ledger. A firm-wide practice grant is required.');
  readonly kinds = ['ASSET','LIABILITY','EQUITY','INCOME','EXPENSE'];
  accountCode = ''; accountName = ''; accountKind = 'ASSET'; startsOn = ''; endsOn = ''; periodId = ''; accountingDate = ''; reference = ''; memo = '';
  lines = [{ accountId: '', debit: '0', credit: '0' }, { accountId: '', debit: '0', credit: '0' }];
  addLine() { this.lines.push({ accountId: '', debit: '0', credit: '0' }); }
  private async request(path = '', method = 'GET', body?: unknown) {
    const token = this.entra ? await currentAccessToken() : this.token;
    const response = await fetch(`/api/v1/engagements/${encodeURIComponent(this.engagementId)}/practice${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(value.error?.message ?? 'Request failed'));
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
  close(p: any) { this.mutate(`/periods/${p.id}/close`, { expectedVersion: p.version, idempotencyKey: crypto.randomUUID() }); }
}
