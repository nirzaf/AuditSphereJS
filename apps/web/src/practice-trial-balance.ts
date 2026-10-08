import { Component, input, signal } from '@angular/core';
import { practiceFirmTrialBalanceDetailSchema, practiceFirmTrialBalanceSchema } from '@auditsphere/contracts';
import type { PracticeFirmTrialBalance, PracticeFirmTrialBalanceDetail } from '@auditsphere/contracts';
import type { z } from 'zod';
import { authenticatedFetch, requestContractJson } from './api-client';
import { currentAccessToken } from './identity';
import { csvLine } from './csv-export';

/** Stable export of the exact report response; values stay decimal strings from PostgreSQL. */
export function firmTrialBalanceCsv(report: PracticeFirmTrialBalance): string {
  const rows = [
    ['AuditSphere trial balance snapshot SHA-256', report.snapshotHash],
    ['Accounting period', `${report.startsOn} to ${report.endsOn}`],
    [],
    ['Account code', 'Account name', 'Kind', 'Opening debit', 'Opening credit', 'Period debit', 'Period credit', 'Closing debit', 'Closing credit'],
    ...report.rows.map(row => [row.code, row.name, row.kind, row.openingDebit, row.openingCredit, row.periodDebit, row.periodCredit, row.closingDebit, row.closingCredit]),
    ['TOTAL', '', '', report.totals.openingDebit, report.totals.openingCredit, report.totals.periodDebit, report.totals.periodCredit, report.totals.closingDebit, report.totals.closingCredit],
  ];
  // Columns 3 to 8 are amounts; the other columns are text and are protected against spreadsheet formulas (DN-03).
  return rows.map(row => csvLine(row, [3, 4, 5, 6, 7, 8])).join('\r\n') + '\r\n';
}

@Component({
  selector: 'practice-trial-balance',
  templateUrl: './practice-trial-balance.html',
  styleUrl: './practice-trial-balance.css',
})
export class PracticeTrialBalance {
  readonly token = input('');
  readonly engagementId = input('');
  readonly entra = input(false);
  readonly report = signal<PracticeFirmTrialBalance | null>(null);
  readonly detail = signal<PracticeFirmTrialBalanceDetail | null>(null);
  readonly busy = signal(false);
  readonly periodId = signal('');
  readonly accountId = signal('');
  readonly message = signal('Load posted Practice journals to review the firm trial balance.');

  private path(suffix = '') { return `/api/v1/engagements/${encodeURIComponent(this.engagementId())}/practice/reports/trial-balance${suffix}`; }

  private async request<TSchema extends z.ZodType>(path: string, schema: TSchema) {
    const init: RequestInit = { headers: this.entra() ? {} : { Authorization: `Bearer ${this.token()}` } };
    const fetcher = this.entra()
      ? (request: RequestInfo | URL, options?: RequestInit) => authenticatedFetch(request, options, currentAccessToken)
      : fetch;
    return requestContractJson(path, schema, init, fetcher);
  }

  private async run(work: () => Promise<void>) {
    this.busy.set(true);
    try { await work(); }
    catch (error) { this.message.set(error instanceof Error ? error.message : 'The Practice report could not be loaded.'); }
    finally { this.busy.set(false); }
  }

  refresh() {
    void this.run(async () => {
      const query = this.periodId() ? `?periodId=${encodeURIComponent(this.periodId())}` : '';
      const report = await this.request(this.path() + query, practiceFirmTrialBalanceSchema);
      this.report.set(report);
      this.periodId.set(report.periodId);
      this.accountId.set('');
      this.detail.set(null);
      this.message.set(`Posted trial balance loaded · snapshot ${report.snapshotHash.slice(0, 12)}.`);
    });
  }

  changePeriod(event: Event) {
    this.periodId.set((event.target as HTMLSelectElement).value);
    this.accountId.set('');
    this.detail.set(null);
    this.refresh();
  }

  selectAccount(accountId: string, page = 1) {
    this.accountId.set(accountId);
    const periodId = this.periodId();
    const query = new URLSearchParams({ periodId, page: String(page), pageSize: '50' });
    void this.run(async () => {
      const detail = await this.request(this.path(`/accounts/${encodeURIComponent(accountId)}?${query.toString()}`), practiceFirmTrialBalanceDetailSchema);
      this.detail.set(detail);
      const first = (detail.page - 1) * detail.pageSize + 1;
      const last = Math.min(detail.totalCount, detail.page * detail.pageSize);
      this.message.set(`Showing posted account activity ${detail.totalCount ? `${first}–${last} of ${detail.totalCount}` : 'with no period activity'}.`);
    });
  }

  downloadSnapshot() {
    const report = this.report();
    if (!report) return;
    const blob = new Blob([firmTrialBalanceCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `firm-trial-balance-${report.startsOn}-${report.endsOn}-${report.snapshotHash.slice(0, 12)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.message.set(`Deterministic CSV snapshot ${report.snapshotHash.slice(0, 12)} downloaded.`);
  }

  page(page: number) {
    const accountId = this.accountId();
    if (accountId && page >= 1) this.selectAccount(accountId, page);
  }
}
