import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { PracticeProfitLoss, firmProfitLossCsv } from './practice-profit-loss';

afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

const engagementId = '10000000-0000-4000-8000-000000000001';
const revenueId = '10000000-0000-4000-8000-000000000002';
const snapshotHash = 'b'.repeat(64);
const report = {
  currency: 'QAR' as const,
  parameters: { month: '2026-04', compareMonth: '2025-04' },
  asOf: '2026-10-05T10:00:00.000Z',
  rows: [
    { accountId: revenueId, code: '400', name: 'Audit income', section: 'INCOME' as const, currentAmount: '25.000000', currentEntryCount: 1, comparisonAmount: '80.000000', comparisonEntryCount: 1 },
    { accountId: '10000000-0000-4000-8000-000000000003', code: '500', name: 'Office expense', section: 'EXPENSE' as const, currentAmount: '7.500000', currentEntryCount: 1, comparisonAmount: '30.000000', comparisonEntryCount: 1 },
  ],
  currentTotals: { income: '25.000000', expenses: '7.500000', net: '17.500000' },
  comparisonTotals: { income: '80.000000', expenses: '30.000000', net: '50.000000' },
  snapshotHash,
};
const detail = {
  parameters: report.parameters, period: 'COMPARISON' as const, asOf: report.asOf, snapshotHash,
  account: report.rows[0]!, page: 1, pageSize: 50, totalCount: 1,
  entries: [{ id: '10000000-0000-4000-8000-000000000004', journalId: '10000000-0000-4000-8000-000000000005', accountingDate: '2025-04-14', reference: 'REV-APR', memo: 'Monthly audit income', position: 0, debit: '0.000000', credit: '80.000000', reversalOf: null, reversedBy: false }],
};

it('loads comparison months, drills to posted sources, and exports the exact report context', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(report))).mockResolvedValueOnce(new Response(JSON.stringify(detail)));
  vi.stubGlobal('fetch', fetcher);
  const fixture = TestBed.createComponent(PracticeProfitLoss);
  fixture.componentRef.setInput('token', 'practice-read-session');
  fixture.componentRef.setInput('engagementId', engagementId);
  fixture.detectChanges();
  const view = fixture.componentInstance;
  view.month.set('2026-04'); view.compareMonth.set('2025-04'); view.refresh();
  await vi.waitFor(() => expect(view.report()?.snapshotHash).toBe(snapshotHash));
  fixture.detectChanges();
  expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/v1/engagements/${engagementId}/practice/reports/profit-loss?month=2026-04&compareMonth=2025-04`);
  expect(fixture.nativeElement.textContent).toContain('Net profit / (loss)');
  expect(fixture.nativeElement.textContent).toContain('2025-04');

  view.selectAccount(report.rows[0]!, 'COMPARISON');
  await vi.waitFor(() => expect(view.detail()?.entries[0]?.reference).toBe('REV-APR'));
  expect(fetcher.mock.calls[1]?.[0]).toContain(`/accounts/${revenueId}?month=2026-04&period=COMPARISON&snapshotHash=${snapshotHash}&page=1&pageSize=50&compareMonth=2025-04`);
  expect(firmProfitLossCsv(report)).toBe(firmProfitLossCsv(report));
  expect(firmProfitLossCsv(report)).toContain('"Reporting month","2026-04"');
  expect(firmProfitLossCsv(report)).toContain('"Comparison month","2025-04"');
  expect(firmProfitLossCsv(report)).toContain(`"Database as-of time","${report.asOf}"`);
  expect(firmProfitLossCsv(report)).toContain(snapshotHash);
  fixture.destroy();
});

it('blocks a same-month comparison and reports stale snapshot conflicts without fabricating detail', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(report))).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Posted Profit and Loss sources changed since this report was loaded.', statusCode: 409 }), { status: 409 }));
  vi.stubGlobal('fetch', fetcher);
  const fixture = TestBed.createComponent(PracticeProfitLoss);
  fixture.componentRef.setInput('engagementId', engagementId);
  fixture.detectChanges();
  const view = fixture.componentInstance;
  view.month.set('2026-04'); view.compareMonth.set('2026-04'); view.refresh();
  expect(view.message()).toContain('different month');
  expect(fetcher).not.toHaveBeenCalled();
  view.compareMonth.set('2025-04'); view.refresh();
  await vi.waitFor(() => expect(view.report()?.snapshotHash).toBe(snapshotHash));
  view.selectAccount(report.rows[0]!, 'CURRENT');
  await vi.waitFor(() => expect(view.busy()).toBe(false));
  expect(view.detail()).toBeNull();
  expect(view.message()).toContain('409');
  fixture.destroy();
});
