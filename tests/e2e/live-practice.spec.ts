import 'dotenv/config';
import { test, expect } from '@playwright/test';

test('live Practice keeps the fieldwork-only preparer outside the firm ledger', async ({ page }) => {
  test.skip(!process.env.RUN_LIVE_E2E, 'Requires the seeded local API');
  const base = '/api/v1/engagements/00000000-0000-4000-8000-000000000002/practice';
  const headers = { Authorization: `Bearer ${process.env.DEV_AUTH_TOKEN}` };
  const response = await page.request.get(`http://127.0.0.1:3000${base}`, { headers });
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({ error: { status: 403 } });
  await page.goto('/');
  await page.getByLabel('Local development access token').fill(process.env.DEV_AUTH_TOKEN!);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Connected');
  await page.getByRole('button', { name: 'Practice' }).click();
  await page.getByRole('button', { name: 'Load ledger', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('PRACTICE_READ is not granted');
  await page.screenshot({ path: 'test-results/practice-preview.png', fullPage: true });
});
