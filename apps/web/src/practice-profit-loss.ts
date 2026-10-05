import { Component, input, signal } from '@angular/core';
import { practiceFirmProfitLossDetailSchema, practiceFirmProfitLossSchema } from '@auditsphere/contracts';
import type { PracticeFirmProfitLoss, PracticeFirmProfitLossDetail, PracticeFirmProfitLossRow } from '@auditsphere/contracts';
import type { z } from 'zod';
import { ApiContractError, authenticatedFetch, requestContractJson } from './api-client';
import { currentAccessToken } from './identity';

function localMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }

/** Export the loaded, hashed report with enough context to identify and reproduce its query. */
export function firmProfitLossCsv(report: PracticeFirmProfitLoss): string {
  const rows = [
    ['AuditSphere monthly Profit and Loss snapshot SHA-256', report.snapshotHash],
    ['Reporting month', report.parameters.month],
    ['Comparison month', report.parameters.compareMonth ?? 'Not selected'],
    ['Database as-of time', report.asOf],
    ['Currency', report.currency],
    [],
    ['Statement section', 'Account code', 'Account name', 'Monthly amount', 'Comparison amount', 'Current posted journal lines', 'Comparison posted journal lines'],
    ...report.rows.map(row => [row.section, row.code, row.name, row.currentAmount, row.comparisonAmount ?? '', String(row.currentEntryCount), row.comparisonEntryCount === null ? '' : String(row.comparisonEntryCount)]),
    ['TOTAL INCOME', '', '', report.currentTotals.income, report.comparisonTotals?.income ?? '', '', ''],
    ['TOTAL EXPENSES', '', '', report.currentTotals.expenses, report.comparisonTotals?.expenses ?? '', '', ''],
    ['NET PROFIT / (LOSS)', '', '', report.currentTotals.net, report.comparisonTotals?.net ?? '', '', ''],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

@Component({
  selector: 'practice-profit-loss',
  templateUrl: './practice-profit-loss.html',
  styleUrl: './practice-profit-loss.css',
})
export class PracticeProfitLoss {
  readonly token = input('');
  readonly engagementId = input('');
  readonly entra = input(false);
  readonly report = signal<PracticeFirmProfitLoss | null>(null);
  readonly detail = signal<PracticeFirmProfitLossDetail | null>(null);
  readonly busy = signal(false);
  readonly error = signal(false);
  readonly month = signal(localMonth());
  readonly compareMonth = signal('');
  readonly message = signal('Choose an accounting month to load the firm Profit and Loss statement.');

  private path(suffix = '') { return `/api/v1/engagements/${encodeURIComponent(this.engagementId())}/practice/reports/profit-loss${suffix}`; }

  private async request<TSchema extends z.ZodType>(path: string, schema: TSchema) {
    const init: RequestInit = { headers: this.entra() ? {} : { Authorization: `Bearer ${this.token()}` } };
    const fetcher = this.entra()
      ? (request: RequestInfo | URL, options?: RequestInit) => authenticatedFetch(request, options, currentAccessToken)
      : fetch;
    return requestContractJson(path, schema, init, fetcher);
  }

  private async run(work: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(false);
    try { await work(); }
    catch (error) {
      this.error.set(true);
      this.message.set(this.userFacingError(error));
    }
    finally { this.busy.set(false); }
  }

  private userFacingError(error: unknown) {
    if (error instanceof ApiContractError) {
      const reference = error.correlationId ? ` Reference: ${error.correlationId}.` : '';
      if (error.status === 401) return `Your sign-in could not be verified. Sign in again, then retry.${reference}`;
      if (error.status === 403) return `Firm-wide Practice reporting access (PRACTICE_READ) is missing. Ask an administrator to assign it; selecting an engagement only identifies the firm context.${reference}`;
      if (error.status === 409) return `The report changed after it was loaded. Reload the statement, then retry the account detail.${reference}`;
    }
    return error instanceof Error ? error.message : 'The Practice Profit and Loss report could not be loaded.';
  }

  private filtersChanged() {
    this.error.set(false);
    this.message.set('Report periods changed. Load the report to view an updated snapshot.');
  }

  setMonth(event: Event) { this.month.set((event.target as HTMLInputElement).value); this.filtersChanged(); }
  setCompareMonth(event: Event) { this.compareMonth.set((event.target as HTMLInputElement).value); this.filtersChanged(); }

  private validationError(message: string) {
    this.error.set(true);
    this.message.set(message);
  }

  refresh() {
    const month = this.month();
    if (!month) { this.validationError('Choose an accounting month before loading the report.'); return; }
    const comparison = this.compareMonth();
    if (comparison && comparison === month) { this.validationError('Choose a different month for the comparison.'); return; }
    void this.run(async () => {
      const query = new URLSearchParams({ month });
      if (comparison) query.set('compareMonth', comparison);
      const report = await this.request(`${this.path()}?${query.toString()}`, practiceFirmProfitLossSchema);
      this.report.set(report);
      this.detail.set(null);
      this.message.set(`Posted Profit and Loss loaded for ${report.parameters.month}${report.parameters.compareMonth ? ` vs ${report.parameters.compareMonth}` : ''} · snapshot ${report.snapshotHash.slice(0, 12)}.`);
    });
  }

  selectAccount(row: PracticeFirmProfitLossRow, period: 'CURRENT' | 'COMPARISON') {
    const report = this.report();
    if (!report || (period === 'COMPARISON' && !report.parameters.compareMonth)) return;
    const query = new URLSearchParams({
      month: report.parameters.month,
      period,
      snapshotHash: report.snapshotHash,
      page: '1',
      pageSize: '50',
    });
    if (report.parameters.compareMonth) query.set('compareMonth', report.parameters.compareMonth);
    void this.run(async () => {
      const detail = await this.request(this.path(`/accounts/${encodeURIComponent(row.accountId)}?${query.toString()}`), practiceFirmProfitLossDetailSchema);
      this.detail.set(detail);
      const month = period === 'CURRENT' ? detail.parameters.month : detail.parameters.compareMonth;
      this.message.set(`Showing ${detail.totalCount} posted journal lines for ${row.code} · ${month}.`);
    });
  }

  downloadSnapshot() {
    const report = this.report();
    if (!report) return;
    const blob = new Blob([firmProfitLossCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `firm-profit-loss-${report.parameters.month}-${report.snapshotHash.slice(0, 12)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.message.set(`Report snapshot ${report.snapshotHash.slice(0, 12)} downloaded with its parameters and database as-of time.`);
  }

  page(page: number) {
    const selected = this.detail();
    const report = this.report();
    if (!selected || !report || page < 1) return;
    const query = new URLSearchParams({
      month: report.parameters.month,
      period: selected.period,
      snapshotHash: selected.snapshotHash,
      page: String(page),
      pageSize: String(selected.pageSize),
    });
    if (report.parameters.compareMonth) query.set('compareMonth', report.parameters.compareMonth);
    void this.run(async () => {
      this.detail.set(await this.request(this.path(`/accounts/${encodeURIComponent(selected.account.accountId)}?${query.toString()}`), practiceFirmProfitLossDetailSchema));
    });
  }
}
