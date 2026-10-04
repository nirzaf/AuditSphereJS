import { Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { practiceExpenseDraftSchema, practiceExpenseSettlementSchema, practiceLedgerSchema, practiceJournalViewSchema, type PracticeLedger } from '@auditsphere/contracts';
import { parseContractValue } from './api-client';
import { authenticatedFetch } from './api-client';
import { currentAccessToken } from './identity';
import type { z } from 'zod';

const categories = [
  { id: 'OFFICE_RENT_FACILITIES', label: 'Office rent & facilities' },
  { id: 'STAFF_SALARIES', label: 'Staff salaries' },
  { id: 'BENEFITS_END_OF_SERVICE', label: 'Benefits & end of service' },
  { id: 'OVERHEAD', label: 'Overhead' },
  { id: 'PETTY_CASH', label: 'Petty cash disbursal' },
  { id: 'PARTNER_WITHDRAWAL', label: 'Partner withdrawal' },
] as const;

@Component({
  selector: 'practice-expenses', imports: [FormsModule], template: `
    <section class="intro title-row"><div><div class="eyebrow">INTERNAL FIRM ACCOUNTING</div><h1>Operating expenses</h1><p>Record expenses and partner withdrawals through the firm ledger.</p></div><button type="button" (click)="refresh()" [disabled]="busy()">{{ ledger() ? 'Refresh accounts' : 'Load accounts' }}</button></section>
    <p class="notice" role="status" aria-live="polite">{{ message() }}</p>
    @if (ledger(); as data) {
      <section class="panel">
        <h2>New recognition entry</h2>
        <p>Select accounts from the approved firm chart. Choose a liability account to recognize an unpaid obligation; its settlement is recorded separately.</p>
        <form class="practice-rate-form" (ngSubmit)="createDraft()" ngNativeValidate>
          <label for="expense-category">Category <select id="expense-category" name="category" [(ngModel)]="category" required>@for (item of categories; track item.id) { <option [value]="item.id">{{ item.label }}</option> }</select></label>
          <label for="expense-period">Accounting period <select id="expense-period" name="period" [(ngModel)]="periodId" required><option value="">Select an open period</option>@for (period of data.periods; track period.id) { @if (!period.closed) { <option [value]="period.id">{{ period.startsOn }} – {{ period.endsOn }}</option> } }</select></label>
          <label for="expense-date">Accounting date <input id="expense-date" type="date" name="date" [(ngModel)]="accountingDate" required></label>
          <label for="expense-reference">Reference <input id="expense-reference" name="reference" [(ngModel)]="reference" maxlength="80" required></label>
          <label for="expense-amount">Amount · QAR <input id="expense-amount" name="amount" [(ngModel)]="amount" inputmode="decimal" pattern="[0-9]+(\\.[0-9]{1,6})?" required></label>
          <label for="expense-debit">Classification account <select id="expense-debit" name="debit" [(ngModel)]="debitAccountId" required><option value="">Select account</option>@for (account of debitAccounts(data); track account.id) { <option [value]="account.id">{{ account.code }} · {{ account.name }} ({{ account.kind }})</option> }</select></label>
          <label for="expense-credit">Counterpart account <select id="expense-credit" name="credit" [(ngModel)]="creditAccountId" required><option value="">Select account</option>@for (account of creditAccounts(data); track account.id) { <option [value]="account.id">{{ account.code }} · {{ account.name }} ({{ account.kind }})</option> }</select></label>
          <label for="expense-description">Description <textarea id="expense-description" name="description" [(ngModel)]="description" maxlength="400" required rows="3"></textarea></label>
          <p class="form-hint">Partner withdrawals must use an explicitly selected equity or partner-current account and an asset counterpart. They are never automatically posted as expenses.</p>
          <button class="primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Create journal draft' }}</button>
        </form>
      </section>
      @if (draft(); as journal) { <section class="panel" aria-live="polite"><h2>Expense journal draft created</h2><p>{{ journal.reference }} · {{ journal.accountingDate }} · {{ journal.status }}</p><p>{{ journal.memo }}</p><button type="button" class="primary" (click)="postDraft()" [disabled]="busy()">Post through firm policy</button></section> }
      <section class="panel">
        <h2>Settle a recognized obligation</h2>
        <p>A liability recognized for an expense can be paid later through a separate, balanced firm journal. The payment posts immediately under Practice management and posting authority.</p>
        @if (availableExpenses(data).length) {
          <form class="practice-rate-form" (ngSubmit)="settleExpense()" ngNativeValidate>
            <label for="settlement-expense">Open expense obligation <select id="settlement-expense" name="expense" [(ngModel)]="settlementExpenseJournalId" required><option value="">Select an outstanding obligation</option>@for (expense of availableExpenses(data); track expense.journalId) { <option [value]="expense.journalId">{{ expense.reference }} · {{ expense.category }} · outstanding QAR {{ expense.outstandingAmount }}</option> }</select></label>
            <label for="settlement-period">Accounting period <select id="settlement-period" name="settlement-period" [(ngModel)]="settlementPeriodId" required><option value="">Select an open period</option>@for (period of data.periods; track period.id) { @if (!period.closed) { <option [value]="period.id">{{ period.startsOn }} – {{ period.endsOn }}</option> } }</select></label>
            <label for="settlement-date">Payment accounting date <input id="settlement-date" type="date" name="settlement-date" [(ngModel)]="settlementDate" required></label>
            <label for="settlement-reference">Payment reference <input id="settlement-reference" name="settlement-reference" [(ngModel)]="settlementReference" maxlength="80" required></label>
            <label for="settlement-amount">Amount · QAR <input id="settlement-amount" name="settlement-amount" [(ngModel)]="settlementAmount" inputmode="decimal" pattern="[0-9]+(\\.[0-9]{1,6})?" required></label>
            <label for="settlement-asset">Cash / asset account <select id="settlement-asset" name="settlement-asset" [(ngModel)]="settlementAssetAccountId" required><option value="">Select an asset account</option>@for (account of assetAccounts(data); track account.id) { <option [value]="account.id">{{ account.code }} · {{ account.name }}</option> }</select></label>
            <button class="primary" [disabled]="busy()">{{ busy() ? 'Posting…' : 'Record and post settlement' }}</button>
          </form>
        } @else { <p>No posted expense liability has an outstanding balance.</p> }
      </section>
    } @else { <section class="panel"><h2>Practice access required</h2><p>Load the firm chart and open periods using a staff account with the firm-wide Practice permission.</p></section> }
  `,
})
export class PracticeExpenses {
  readonly token = input(''); readonly engagementId = input(''); readonly entra = input(false);
  readonly categories = categories;
  readonly ledger = signal<PracticeLedger | null>(null); readonly draft = signal<ReturnType<typeof practiceJournalViewSchema.parse> | null>(null);
  readonly busy = signal(false); readonly message = signal('Load the firm chart to record a Practice expense.');
  category: typeof categories[number]['id'] = 'OFFICE_RENT_FACILITIES'; periodId = ''; accountingDate = ''; reference = ''; amount = ''; debitAccountId = ''; creditAccountId = ''; description = '';
  settlementExpenseJournalId = ''; settlementPeriodId = ''; settlementDate = ''; settlementReference = ''; settlementAmount = ''; settlementAssetAccountId = '';
  private path(suffix = '') { return `/api/v1/engagements/${encodeURIComponent(this.engagementId())}/practice${suffix}`; }
  private async request<TSchema extends z.ZodType>(path: string, schema: TSchema, method = 'GET', body?: unknown): Promise<z.output<TSchema>> {
    const init: RequestInit = { method, headers: { 'Content-Type': 'application/json', ...(!this.entra() ? { Authorization: `Bearer ${this.token()}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    const response = this.entra() ? await authenticatedFetch(path, init, currentAccessToken) : await fetch(path, init);
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(response.status === 403 ? 'Your account needs the firm-wide Practice permission required for this action.' : `Practice request failed (HTTP ${response.status}).`);
    return parseContractValue(schema, payload);
  }
  private async run(work: () => Promise<void>) { this.busy.set(true); try { await work(); } catch (error) { this.message.set(error instanceof Error ? error.message : 'Practice request failed.'); } finally { this.busy.set(false); } }
  refresh() { void this.run(async () => { this.ledger.set(await this.request(this.path(), practiceLedgerSchema)); this.draft.set(null); this.message.set('Firm chart and periods loaded.'); }); }
  availableExpenses(data: PracticeLedger) { return data.expenses.filter(expense => expense.settlementAllowed); }
  assetAccounts(data: PracticeLedger) { return data.accounts.filter(a => a.active && a.posting && a.kind === 'ASSET'); }
  debitAccounts(data: PracticeLedger) { return data.accounts.filter(a => a.active && a.posting && (this.category === 'PARTNER_WITHDRAWAL' ? ['EQUITY', 'LIABILITY'].includes(a.kind) : a.kind === 'EXPENSE')); }
  creditAccounts(data: PracticeLedger) { return data.accounts.filter(a => a.active && a.posting && (this.category === 'PARTNER_WITHDRAWAL' ? a.kind === 'ASSET' : ['ASSET', 'LIABILITY'].includes(a.kind))); }
  createDraft() {
    const input = { periodId: this.periodId, accountingDate: this.accountingDate, category: this.category, reference: this.reference, description: this.description, amount: this.amount, debitAccountId: this.debitAccountId, creditAccountId: this.creditAccountId, idempotencyKey: crypto.randomUUID() };
    const parsed = practiceExpenseDraftSchema.safeParse(input);
    if (!parsed.success) { this.message.set(parsed.error.issues[0]?.message ?? 'Review the required expense fields.'); return; }
    void this.run(async () => { this.draft.set(await this.request(this.path('/expenses/drafts'), practiceJournalViewSchema, 'POST', parsed.data)); this.message.set('Expense recognition draft saved with its immutable classification. Receipt-version attachment remains in progress.'); this.ledger.set(await this.request(this.path(), practiceLedgerSchema)); });
  }
  postDraft() {
    const journal = this.draft(); if (!journal) return;
    void this.run(async () => { this.draft.set(await this.request(this.path(`/journals/${journal.id}/post`), practiceJournalViewSchema, 'POST', { expectedVersion: journal.version, idempotencyKey: crypto.randomUUID() })); this.message.set('Expense journal posted through approved policy, period, and balance controls.'); this.ledger.set(await this.request(this.path(), practiceLedgerSchema)); });
  }
  settleExpense() {
    const input = { periodId: this.settlementPeriodId, accountingDate: this.settlementDate, reference: this.settlementReference, amount: this.settlementAmount, assetAccountId: this.settlementAssetAccountId, idempotencyKey: crypto.randomUUID() };
    const parsed = practiceExpenseSettlementSchema.safeParse(input);
    if (!parsed.success || !this.settlementExpenseJournalId) { this.message.set(parsed.success ? 'Select an expense obligation to settle.' : parsed.error.issues[0]?.message ?? 'Review the settlement details.'); return; }
    const expenseJournalId = this.settlementExpenseJournalId;
    void this.run(async () => {
      await this.request(this.path(`/expenses/${encodeURIComponent(expenseJournalId)}/settlements`), practiceJournalViewSchema, 'POST', parsed.data);
      this.message.set('Expense obligation settled through a separate posted journal. The outstanding balance has been refreshed.');
      this.settlementExpenseJournalId = ''; this.settlementAmount = '';
      this.ledger.set(await this.request(this.path(), practiceLedgerSchema));
    });
  }
}
