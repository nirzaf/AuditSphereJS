import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { PracticeTrialBalance, firmTrialBalanceCsv } from './practice-trial-balance';

afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

const engagementId = '10000000-0000-4000-8000-000000000001';
const accountId = '10000000-0000-4000-8000-000000000002';
const periodId = '10000000-0000-4000-8000-000000000003';
const snapshotHash = 'a'.repeat(64);
const report = {
  currency: 'QAR' as const,
  periods: [{ id: periodId, startsOn: '2026-01-01', endsOn: '2026-12-31', closed: false, version: 1, lastTransitionReason: '' }],
  periodId, startsOn: '2026-01-01', endsOn: '2026-12-31', snapshotHash,
  rows: [{ accountId, code: '100', name: 'Cash "on hand"', kind: 'ASSET' as const, openingBalance: '100.000000', openingDebit: '100.000000', openingCredit: '0.000000', periodDebit: '25.000000', periodCredit: '0.000000', closingBalance: '125.000000', closingDebit: '125.000000', closingCredit: '0.000000' }],
  totals: { openingDebit: '100.000000', openingCredit: '0.000000', periodDebit: '25.000000', periodCredit: '0.000000', closingDebit: '125.000000', closingCredit: '0.000000' },
};
const detail = {
  periodId, account: report.rows[0], page: 1, pageSize: 50, totalCount: 1,
  entries: [{ id: '10000000-0000-4000-8000-000000000004', journalId: '10000000-0000-4000-8000-000000000005', accountingDate: '2026-04-03', reference: 'CASH-1', memo: 'Cash received', position: 0, debit: '25.000000', credit: '0.000000', isOpeningBalance: false, reversalOf: null, reversedBy: false }],
};

it('loads the real posted-only report, opens account detail and exposes an accessible export snapshot', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(report)))
    .mockResolvedValueOnce(new Response(JSON.stringify(detail)));
  vi.stubGlobal('fetch', fetcher);
  const fixture = TestBed.createComponent(PracticeTrialBalance);
  fixture.componentRef.setInput('token', 'practice-read-session');
  fixture.componentRef.setInput('engagementId', engagementId);
  fixture.detectChanges();
  const view = fixture.componentInstance;
  view.refresh();
  await vi.waitFor(() => expect(view.report()?.snapshotHash).toBe(snapshotHash));
  fixture.detectChanges();
  expect(fetcher.mock.calls[0][0]).toBe('/api/v1/firm/practice/reports/trial-balance');
  expect(fixture.nativeElement.textContent).toContain('Posted firm journals only');
  expect(fixture.nativeElement.textContent).toContain('125.000000');
  expect(fixture.nativeElement.querySelector('#trial-balance-period')).not.toBeNull();

  view.selectAccount(accountId);
  await vi.waitFor(() => expect(view.detail()?.entries[0]?.reference).toBe('CASH-1'));
  expect(fetcher.mock.calls[1][0]).toContain(`/accounts/${accountId}?periodId=${periodId}`);
  expect(view.detail()?.account.closingBalance).toBe(view.report()?.rows[0]?.closingBalance);
  expect(firmTrialBalanceCsv(report)).toBe(firmTrialBalanceCsv(report));
  expect(firmTrialBalanceCsv(report)).toContain('"Cash ""on hand"""');
  expect(firmTrialBalanceCsv(report)).toContain(snapshotHash);
  fixture.destroy();
});

it('shows the firm-wide authorization boundary when a read is denied', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 403 })));
  const fixture = TestBed.createComponent(PracticeTrialBalance);
  fixture.componentRef.setInput('token', 'engagement-only-session');
  fixture.componentRef.setInput('engagementId', engagementId);
  fixture.detectChanges();
  fixture.componentInstance.refresh();
  await vi.waitFor(() => expect(fixture.componentInstance.busy()).toBe(false));
  expect(fixture.componentInstance.message()).toContain('403');
  fixture.destroy();
});
