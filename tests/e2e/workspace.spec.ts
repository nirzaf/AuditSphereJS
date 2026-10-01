import { test, expect } from '@playwright/test';
test('lazy client layout remains unavailable without portal authentication', async ({ page }) => {
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'Client portal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to client portal' })).toBeFocused();
  await page.getByRole('link', { name: 'Return to the internal workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Trial Balance workspace' })).toBeVisible();
});
test('STE brand logo and palette are served on desktop and mobile', async ({ page }) => {
  await page.goto('/');
  const logo = page.getByRole('img', { name: 'STE — Salem Taleb Efaifa, Auditing and Consulting' });
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(256);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ste-primary').trim())).toBe('#387CA6');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(logo).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('fieldwork shell and module navigation', async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', {name:'Trial Balance workspace'})).toBeVisible(); await page.getByRole('button', {name:'Commercial'}).click(); await expect(page.getByRole('heading', {name:'Commercial',exact:true})).toBeVisible(); await page.getByRole('button', {name:'Open Fieldwork workspace'}).click(); await expect(page.getByLabel('Local development access token')).toBeVisible(); });
