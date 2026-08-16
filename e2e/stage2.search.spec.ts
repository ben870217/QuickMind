import { expect, test } from '@playwright/test';

test('searches current document titles and cycles through matching results', async ({ page }) => {
  await page.goto('/');

  const rootEditor = page.locator('[data-node-editor]');
  await rootEditor.fill('我的 Alpha 主題');
  await rootEditor.press('Enter');

  await page.keyboard.press('Tab');
  const childEditor = page.locator('[data-node-editor]');
  await childEditor.fill('Beta Alpha 想法');
  await childEditor.press('Enter');

  await page.getByRole('button', { name: 'Beta Alpha 想法', exact: true }).press('Enter');
  await page.locator('[data-node-editor]').fill('Gamma 想法');
  await page.locator('[data-node-editor]').press('Enter');

  const searchButton = page.getByRole('button', { name: '搜尋', exact: true });
  await searchButton.click();

  const dialog = page.getByRole('dialog', { name: '搜尋' });
  const input = dialog.getByRole('textbox', { name: '搜尋節點標題' });
  await expect(input).toBeFocused();

  await input.fill('alpha');
  await expect(dialog.getByText('1 / 2')).toBeVisible();
  await expect(page.getByRole('button', { name: '我的 Alpha 主題', exact: true })).toHaveAttribute('aria-selected', 'true');

  await input.press('Enter');
  await expect(dialog.getByText('2 / 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beta Alpha 想法', exact: true })).toHaveAttribute('aria-selected', 'true');

  await input.press('Shift+Enter');
  await expect(dialog.getByText('1 / 2')).toBeVisible();

  await input.fill('does-not-exist');
  await expect(dialog.getByText('0 / 0')).toBeVisible();
  await expect(dialog.getByText('找不到符合的節點')).toBeVisible();

  await dialog.getByRole('button', { name: '關閉', exact: true }).click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+F' : 'Control+F');
  await expect(page.getByRole('dialog', { name: '搜尋' }).getByRole('textbox', { name: '搜尋節點標題' })).toBeFocused();
});
