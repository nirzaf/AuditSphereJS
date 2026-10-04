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
  ], periods: [{ id: ids.period, startsOn: '2026-01-01', endsOn: '2026-12-31', closed: false, version: 1, lastTransitionReason: '' }], journals: [], expenses: [], balances: [],
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

it('records a later expense liability payment as a separate posted journal', async () => {
  const obligation = { id: ids.journal, journalId: ids.journal, reference: 'EXP-1', category: 'OFFICE_RENT_FACILITIES', amount: '1250.250000', creditAccountId: ids.payable, journalStatus: 'POSTED', journalVersion: 2, settledAmount: '0.000000', outstandingAmount: '1250.250000', settlementAllowed: true, receipts: [], receiptAttachable: true };
  const updatedLedger = { ...ledger, expenses: [obligation] };
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(updatedLedger)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...journal, status: 'POSTED', version: 2 })))
    .mockResolvedValueOnce(new Response(JSON.stringify(updatedLedger)));
  vi.stubGlobal('fetch', request);
  const fixture = TestBed.createComponent(PracticeExpenses);
  fixture.componentRef.setInput('token', 'billing-session'); fixture.componentRef.setInput('engagementId', ids.engagement); fixture.detectChanges();
  const view = fixture.componentInstance; view.refresh(); await vi.waitFor(() => expect(view.ledger()).not.toBeNull());
  view.settlementExpenseJournalId = ids.journal; view.settlementPeriodId = ids.period; view.settlementDate = '2026-10-04'; view.settlementReference = 'PAY-EXP-1'; view.settlementAmount = '500.25'; view.settlementAssetAccountId = ids.cash;
  view.settleExpense(); await vi.waitFor(() => expect(view.message()).toContain('separate posted journal'));
  expect(request.mock.calls[1][0]).toBe(`/api/v1/engagements/${ids.engagement}/practice/expenses/${ids.journal}/settlements`);
  expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({ amount: '500.25', assetAccountId: ids.cash });
  fixture.destroy();
});

it('uploads a bounded receipt as multipart and refreshes immutable receipt metadata', async () => {
  const baseLedger = { ...ledger, expenses: [{ id: ids.journal, journalId: ids.journal, reference: 'EXP-1', category: 'OFFICE_RENT_FACILITIES', amount: '1250.250000', creditAccountId: ids.payable, journalStatus: 'DRAFT', journalVersion: 1, settledAmount: '0.000000', outstandingAmount: '1250.250000', settlementAllowed: false, receipts: [], receiptAttachable: true }] };
  const receipt = { id: '10000000-0000-4000-8000-000000000008', sequence: 1, filename: 'rent.png', contentType: 'image/png', sizeBytes: 12, createdAt: '2026-10-04T12:00:00.000Z' };
  const updatedLedger = { ...baseLedger, expenses: [{ ...baseLedger.expenses[0], receipts: [receipt] }] };
  const request = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(baseLedger)))
    .mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(updatedLedger)));
  vi.stubGlobal('fetch', request);
  const fixture = TestBed.createComponent(PracticeExpenses);
  fixture.componentRef.setInput('token', 'billing-session'); fixture.componentRef.setInput('engagementId', ids.engagement); fixture.detectChanges();
  const view = fixture.componentInstance;
  view.refresh(); await vi.waitFor(() => expect(view.ledger()).not.toBeNull());
  const file = new File([new Uint8Array(12)], 'rent.png', { type: 'image/png' });
  view.attachReceipt({ target: { files: [file], value: 'chosen' } } as unknown as Event, ids.journal);
  await vi.waitFor(() => expect(view.ledger()?.expenses[0]?.receipts).toEqual([receipt]));
  expect(request.mock.calls[1][0]).toBe(`/api/v1/engagements/${ids.engagement}/practice/expenses/${ids.journal}/receipts`);
  expect(request.mock.calls[1][1].method).toBe('PUT');
  expect(request.mock.calls[1][1].body).toBeInstanceOf(FormData);
  expect(new Headers(request.mock.calls[1][1].headers).get('content-type')).toBeNull();
  expect(view.message()).toContain('Receipt version 1 attached');
  fixture.destroy();
});
