import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { PracticeExpenses } from './practice-expenses';

afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

const ids = { expense: '10000000-0000-4000-8000-000000000001', cash: '10000000-0000-4000-8000-000000000002', payable: '10000000-0000-4000-8000-000000000003', equity: '10000000-0000-4000-8000-000000000004', period: '10000000-0000-4000-8000-000000000005', journal: '10000000-0000-4000-8000-000000000006', engagement: '10000000-0000-4000-8000-000000000007' };
const ledger = {
  currency: 'QAR',
  accounts: [
    { id: ids.expense, code: '500', name: 'Office rent', kind: 'EXPENSE', active: true, posting: true },
    { id: ids.cash, code: '100', name: 'Cash', kind: 'ASSET', active: true, posting: true },
    { id: ids.payable, code: '210', name: 'Accrued expenses', kind: 'LIABILITY', active: true, posting: true },
    { id: ids.equity, code: '310', name: 'Partner drawings', kind: 'EQUITY', active: true, posting: true },
  ], periods: [{ id: ids.period, startsOn: '2026-01-01', endsOn: '2026-12-31', closed: false, version: 1, lastTransitionReason: '' }], journals: [], balances: [],
};
const journal = { id: ids.journal, periodId: ids.period, accountingDate: '2026-10-04', reference: 'EXP-1', memo: '[OFFICE_RENT_FACILITIES] October rent', status: 'DRAFT', version: 1, postedAt: null, reversalOf: null, lines: [] };

it('loads firm accounts and submits an expense draft with exact decimal strings', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(ledger)))
    .mockResolvedValueOnce(new Response(JSON.stringify(journal)))
    .mockResolvedValueOnce(new Response(JSON.stringify(ledger)));
  vi.stubGlobal('fetch', request);
  const fixture = TestBed.createComponent(PracticeExpenses);
  fixture.componentRef.setInput('token', 'billing-session'); fixture.componentRef.setInput('engagementId', ids.engagement); fixture.detectChanges();
  fixture.componentInstance.refresh(); await vi.waitFor(() => expect(fixture.componentInstance.busy()).toBe(false));
  expect(fixture.componentInstance.ledger(), fixture.componentInstance.message()).not.toBeNull();
  const view = fixture.componentInstance;
  view.periodId = ids.period; view.accountingDate = '2026-10-04'; view.reference = 'EXP-1'; view.amount = '1250.25'; view.debitAccountId = ids.expense; view.creditAccountId = ids.payable; view.description = 'October rent';
  expect(view.debitAccounts(ledger as never).map(a => a.id)).toEqual([ids.expense]);
  expect(view.creditAccounts(ledger as never).map(a => a.id)).toEqual([ids.cash, ids.payable]);
  view.createDraft(); await vi.waitFor(() => expect(view.draft()?.id).toBe(ids.journal));
  expect(request.mock.calls[1][0]).toBe(`/api/v1/engagements/${ids.engagement}/practice/expenses/drafts`);
  expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({ amount: '1250.25', category: 'OFFICE_RENT_FACILITIES', debitAccountId: ids.expense, creditAccountId: ids.payable });
  fixture.destroy();
});

it('routes partner withdrawals to equity and asset accounts, never the expense accounts', () => {
  const fixture = TestBed.createComponent(PracticeExpenses); fixture.detectChanges();
  const view = fixture.componentInstance; view.category = 'PARTNER_WITHDRAWAL';
  expect(view.debitAccounts(ledger as never).map(a => a.id)).toEqual([ids.payable, ids.equity]);
  expect(view.creditAccounts(ledger as never).map(a => a.id)).toEqual([ids.cash]);
  fixture.destroy();
});

it('keeps the firm-wide authorization denial explicit', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'denied' }), { status: 403 })));
  const fixture = TestBed.createComponent(PracticeExpenses); fixture.componentRef.setInput('token', 'read-only'); fixture.componentRef.setInput('engagementId', ids.engagement); fixture.detectChanges();
  fixture.componentInstance.refresh(); await vi.waitFor(() => expect(fixture.componentInstance.busy()).toBe(false));
  expect(fixture.componentInstance.message()).toContain('firm-wide Practice permission');
  fixture.destroy();
});
