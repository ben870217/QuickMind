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

  let dialog = page.getByRole('dialog', { name: '搜尋' });
  let input = dialog.getByRole('textbox', { name: '搜尋節點標題' });
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

  await page.getByRole('button', { name: /復原/ }).click();
  await input.press('Escape');
  await expect(searchButton).toBeFocused();

  await searchButton.click();
  dialog = page.getByRole('dialog', { name: '搜尋' });
  input = dialog.getByRole('textbox', { name: '搜尋節點標題' });
  await input.press('Escape');
  await page.getByLabel('介面主題').focus();
  await page.keyboard.press('Control+F');
  await expect(page.getByRole('dialog', { name: '搜尋' }).getByRole('textbox', { name: '搜尋節點標題' })).toBeFocused();

  await page.keyboard.press('Escape');
});

test('temporarily reveals collapsed matches and refreshes results after title changes', async ({ page }) => {
  await page.goto('/');
  const rootEditor = page.locator('[data-node-editor]');
  await rootEditor.fill('Root');
  await rootEditor.press('Enter');

  await page.keyboard.press('Tab');
  await page.locator('[data-node-editor]').fill('Branch');
  await page.locator('[data-node-editor]').press('Enter');
  await page.keyboard.press('Tab');
  await page.locator('[data-node-editor]').fill('Hidden Alpha');
  await page.locator('[data-node-editor]').press('Enter');

  const branch = page.getByRole('button', { name: 'Branch', exact: true });
  await branch.click();
  await page.locator('[data-collapse-node]').nth(1).click();
  await expect(page.getByRole('button', { name: 'Hidden Alpha', exact: true })).toBeHidden();

  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '搜尋' });
  const input = dialog.getByRole('textbox', { name: '搜尋節點標題' });
  await input.fill('alpha');

  await expect(page.getByRole('button', { name: 'Hidden Alpha', exact: true })).toBeVisible();
  await expect(branch.locator('xpath=ancestor::li[@data-node-id][1]')).toHaveAttribute('aria-expanded', 'true');
  await dialog.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hidden Alpha', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '收合 Branch', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hidden Alpha', exact: true })).toBeHidden();

  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hidden Alpha', exact: true })).toBeHidden();
});

test('updates the open result set when a matching title is committed or deleted', async ({ page }) => {
  await page.goto('/');
  const rootEditor = page.locator('[data-node-editor]');
  await rootEditor.fill('Root');
  await rootEditor.press('Enter');
  await page.keyboard.press('Tab');
  await page.locator('[data-node-editor]').fill('Alpha one');
  await page.locator('[data-node-editor]').press('Enter');
  await page.keyboard.press('Enter');
  await page.locator('[data-node-editor]').fill('Alpha two');
  await page.locator('[data-node-editor]').press('Enter');

  await page.getByRole('button', { name: '搜尋', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '搜尋' });
  const input = dialog.getByRole('textbox', { name: '搜尋節點標題' });
  await input.fill('alpha');
  await expect(dialog.getByText('1 / 2')).toBeVisible();

  await page.getByRole('button', { name: 'Alpha two', exact: true }).dragTo(
    page.getByRole('button', { name: 'Alpha one', exact: true }),
    { targetPosition: { x: 20, y: 1 } },
  );
  await expect(dialog.getByText('2 / 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alpha one', exact: true })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Alpha one', exact: true }).dblclick();
  await page.locator('[data-node-editor]').fill('Renamed');
  await page.locator('[data-node-editor]').press('Enter');
  await expect(dialog.getByText('1 / 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alpha two', exact: true })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Alpha two', exact: true }).click();
  await page.keyboard.press('Delete');
  await expect(dialog.getByText('0 / 0')).toBeVisible();
  await expect(dialog.getByText('找不到符合的節點')).toBeVisible();
});

test('keeps search focus contained and preserves editor state across shortcut openings', async ({ page }) => {
  await page.goto('/');
  const rootEditor = page.locator('[data-node-editor]');
  await rootEditor.fill('Committed Alpha');
  await rootEditor.press('Enter');

  const searchButton = page.getByRole('button', { name: '搜尋', exact: true });
  await searchButton.click();
  let dialog = page.getByRole('dialog', { name: '搜尋' });
  let input = dialog.getByRole('textbox', { name: '搜尋節點標題' });
  await input.fill('alpha');
  await input.press('Tab');
  await expect(dialog.getByRole('button', { name: '上一筆', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(input).toBeFocused();
  await input.press('Escape');
  await expect(page.getByRole('button', { name: 'Committed Alpha', exact: true })).toBeFocused();

  await searchButton.click();
  dialog = page.getByRole('dialog', { name: '搜尋' });
  input = dialog.getByRole('textbox', { name: '搜尋節點標題' });
  await expect(input).toHaveValue('');
  await input.press('Escape');
  await expect(searchButton).toBeFocused();

  await page.getByRole('button', { name: 'Committed Alpha', exact: true }).dblclick();
  const editor = page.locator('[data-node-editor]');
  await editor.fill('Uncommitted Alpha');
  await editor.press('Control+F');
  dialog = page.getByRole('dialog', { name: '搜尋' });
  input = dialog.getByRole('textbox', { name: '搜尋節點標題' });
  await input.fill('uncommitted');
  await expect(dialog.getByText('0 / 0')).toBeVisible();
  await input.press('Escape');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('Uncommitted Alpha');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Committed Alpha', exact: true }).click();
  await page.keyboard.press('Tab');
  const newEditor = page.locator('[data-node-editor]');
  await newEditor.fill('New Uncommitted Alpha');
  await newEditor.press('Control+F');
  dialog = page.getByRole('dialog', { name: '搜尋' });
  input = dialog.getByRole('textbox', { name: '搜尋節點標題' });
  await input.fill('committed');
  await expect(dialog.getByText('1 / 1')).toBeVisible();
  await input.press('Escape');
  await expect(newEditor).toBeFocused();
  await expect(newEditor).toHaveValue('New Uncommitted Alpha');
});
