import { expect, test } from '@playwright/test';

test('switches themes, updates theme-color, and persists explicit choices', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  const select = page.getByLabel('介面主題');
  await expect(select).toHaveValue('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await select.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#252322');

  await page.reload();
  await expect(select).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await select.selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('keeps a session theme when browser storage rejects persistence', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('storage blocked for test');
    };
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  const select = page.getByLabel('介面主題');
  await select.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(select).toHaveValue('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
