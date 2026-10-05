import { expect, test } from '@playwright/test';

const report = {
  currency: 'QAR',
  parameters: { month: '2026-10', compareMonth: '2025-10' },
  asOf: '2026-10-05T10:00:00.000Z',
  rows: [
    { accountId: '10000000-0000-4000-8000-000000000001', code: '400', name: 'Audit income', section: 'INCOME', currentAmount: '125.500000', currentEntryCount: 1, comparisonAmount: '100.000000', comparisonEntryCount: 1 },
    { accountId: '10000000-0000-4000-8000-000000000002', code: '500', name: 'Office expense', section: 'EXPENSE', currentAmount: '25.000000', currentEntryCount: 1, comparisonAmount: '30.000000', comparisonEntryCount: 1 },
  ],
  currentTotals: { income: '125.500000', expenses: '25.000000', net: '100.500000' },
  comparisonTotals: { income: '100.000000', expenses: '30.000000', net: '70.000000' },
  snapshotHash: 'b'.repeat(64),
};

test('Practice Profit and Loss stays usable at phone, tablet, and desktop widths', async ({ page }) => {
  await page.route('**/api/v1/identity/config', route => route.fulfill({ json: { provider: 'development' } }));
  await page.route('**/api/v1/engagements/*/practice/reports/profit-loss**', route => route.fulfill({ json: report }));
  await page.goto('/?module=Practice&view=profit-loss');

  await expect(page).toHaveTitle('Monthly Profit & Loss | Practice | AuditSphere');
  await expect(page.locator('p.notice')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'How to read this report' })).toBeVisible();
  await page.getByRole('button', { name: 'Load report' }).click();
  await expect(page.getByRole('region', { name: 'Monthly Profit and Loss account rows' })).toBeVisible();

  for (const width of [320, 390, 768, 900, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `document overflow at ${width}px`).toBe(true);
    const loadButton = await page.getByRole('button', { name: 'Load report' }).boundingBox();
    expect(loadButton?.height, `Load report touch target at ${width}px`).toBeGreaterThanOrEqual(44);
    const periodInput = await page.getByLabel('Reporting month').boundingBox();
    expect(periodInput?.height, `Reporting month touch target at ${width}px`).toBeGreaterThanOrEqual(44);
    const table = await page.getByRole('region', { name: 'Monthly Profit and Loss account rows' }).evaluate(element => ({ tabIndex: (element as HTMLElement).tabIndex, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(table.tabIndex, `table keyboard focus at ${width}px`).toBe(0);
    if (width <= 390) expect(table.scrollWidth).toBeGreaterThan(table.clientWidth);
  }
});

test('Practice access recovery stays readable and contained on narrow screens', async ({ page }) => {
  await page.route('**/api/v1/identity/config', route => route.fulfill({ json: { provider: 'development' } }));
  await page.route('**/api/v1/engagements/*/practice/reports/profit-loss**', route => route.fulfill({
    status: 403,
    json: { error: { code: 'FORBIDDEN', status: 403, message: 'Firm-wide Practice reporting access is missing.', correlationId: 'e2e-support-403' } },
  }));
  await page.goto('/?module=Practice&view=profit-loss');
  await page.getByRole('button', { name: 'Load report' }).click();

  const alert = page.getByRole('alert');
  await expect(alert.getByRole('heading', { name: 'Firm-wide Practice access is required' })).toBeVisible();
  await expect(alert.getByText('PRACTICE_READ', { exact: true })).toBeVisible();
  await expect(alert.getByText('e2e-support-403', { exact: true })).toBeVisible();

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `document overflow at ${width}px`).toBe(true);
    const copyButton = await alert.getByRole('button', { name: 'Copy reference' }).boundingBox();
    expect(copyButton?.height, `copy reference touch target at ${width}px`).toBeGreaterThanOrEqual(44);
    const alertBounds = await alert.boundingBox();
    expect(alertBounds ? alertBounds.x + alertBounds.width : undefined, `recovery panel overflows at ${width}px`).toBeLessThanOrEqual(width + 1);
  }
});
