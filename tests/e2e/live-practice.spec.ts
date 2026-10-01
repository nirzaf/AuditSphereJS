import 'dotenv/config';
import { test, expect } from '@playwright/test';

test('live Practice draft, balanced posting and reversing entry through the UI', async ({ page }) => {
  test.skip(!process.env.RUN_LIVE_E2E, 'Requires the seeded local API');
  const base = '/api/v1/engagements/00000000-0000-4000-8000-000000000002/practice';
  const headers = { Authorization: `Bearer ${process.env.DEV_AUTH_TOKEN}` };
  const response = await page.request.get(`http://127.0.0.1:3000${base}`, { headers });
  expect(response.ok()).toBeTruthy();
  const ledger = await response.json();
  let period = ledger.periods.find((p: any) => !p.closed);
  if (!period) {
    const created = await page.request.post(`http://127.0.0.1:3000${base}/periods`, { headers, data: { startsOn: '2026-01-01', endsOn: '2026-12-31' } });
    expect(created.ok()).toBeTruthy(); period = await created.json();
  }
  const cash = ledger.accounts.find((a: any) => a.code === '100');
  const rent = ledger.accounts.find((a: any) => a.code === '500');
  const reference = `E2E-${crypto.randomUUID()}`;
  await page.goto('/');
  await page.getByLabel('Local development access token').fill(process.env.DEV_AUTH_TOKEN!);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Connected');
  await page.getByRole('button', { name: 'Practice' }).click();
  await page.getByRole('button', { name: 'Load ledger', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chart of accounts' })).toBeVisible();
  await page.getByLabel('Journal period', { exact: true }).selectOption(period.id);
  await page.getByLabel('Date', { exact: true }).fill(period.startsOn.slice(0,10));
  await page.getByLabel('Reference', { exact: true }).fill(reference);
  await page.getByLabel('Memo', { exact: true }).fill('Disposable browser journal');
  await page.getByLabel('Journal account 1', { exact: true }).selectOption(rent.id);
  await page.getByLabel('Journal account 2', { exact: true }).selectOption(cash.id);
  await page.getByLabel('Debit', { exact: true }).nth(0).fill('0.10');
  await page.getByLabel('Credit', { exact: true }).nth(1).fill('0.10');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const journal = page.locator('practice-ledger article').filter({ has: page.getByRole('heading', { name: `${reference} · DRAFT`, exact: true }) });
  await expect(journal).toBeVisible();
  await journal.getByRole('button', { name: 'Post journal', exact: true }).click();
  await expect(page.getByRole('heading', { name: `${reference} · POSTED`, exact: true })).toBeVisible();
  const posted = page.locator('practice-ledger article').filter({ has: page.getByRole('heading', { name: `${reference} · POSTED`, exact: true }) });
  await posted.getByRole('button', { name: 'Reverse into selected period and date', exact: true }).click();
  await expect(page.getByRole('heading', { name: `REV-${reference} · POSTED`, exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/practice-preview.png', fullPage: true });
});
