import { expect, test, type Download, type Page } from '@playwright/test';

async function createSmallMap(page: Page): Promise<void> {
  const rootEditor = page.locator('[data-node-editor]');
  await rootEditor.fill('我的心智圖');
  await rootEditor.press('Enter');
  await page.keyboard.press('Tab');
  await page.locator('[data-node-editor]').fill('第一個想法');
  await page.locator('[data-node-editor]').press('Enter');
  await page.keyboard.press('Tab');
  await page.locator('[data-node-editor]').fill('收合後仍要匯出');
  await page.locator('[data-node-editor]').press('Enter');
  await page.getByRole('button', { name: '我的心智圖', exact: true }).click();
  await page.locator('[data-collapse-node]').first().click();
}

async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) {
    throw new Error('The browser did not expose the downloaded file');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

test('exports complete Mermaid source while preserving native export state', async ({ page }) => {
  await page.goto('/');
  await createSmallMap(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Mermaid' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('我的心智圖.mmd');
  const text = await readDownload(download);
  expect(text).toContain('mindmap');
  expect(text).toContain('我的心智圖');
  expect(text).toContain('第一個想法');
  expect(text).toContain('收合後仍要匯出');
  await expect(page.locator('[data-status-badge="export"]')).toHaveText('尚未匯出');
  await expect(page.locator('[data-file-message]')).toContainText('Mermaid');
});

test('commits a valid title before external export and cancels invalid editing', async ({ page }) => {
  await page.goto('/');
  await createSmallMap(page);
  await page.locator('[data-collapse-node]').first().click();

  const firstChild = page.getByRole('button', { name: '第一個想法', exact: true });
  await firstChild.dblclick();
  const editor = page.locator('[data-node-editor]');
  await editor.fill('匯出前提交');
  await expect(editor).toHaveValue('匯出前提交');
  const validDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Mermaid' }).click();
  await validDownload;
  await expect(page.getByRole('button', { name: '匯出前提交', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '匯出前提交', exact: true }).dblclick();
  await page.locator('[data-node-editor]').fill('   ');
  const invalidDownload = page.waitForEvent('download', { timeout: 500 }).then(() => true).catch(() => false);
  await page.getByRole('button', { name: '匯出 Mermaid' }).click();
  expect(await invalidDownload).toBe(false);
  await expect(page.locator('[data-node-editor]')).toHaveValue('   ');
  await expect(page.locator('[data-file-message]')).toContainText('完成節點標題');
});

test('exports a complete editable draw.io document with stable synthetic ids', async ({ page }) => {
  await page.goto('/');
  await createSmallMap(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 draw.io' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('我的心智圖.drawio');
  const source = await readDownload(download);
  expect(source).toContain('<diagram name="我的心智圖"');
  expect(source).toContain('vertex="1"');
  expect(source).toContain('edge="1"');
  expect(source).toContain('收合後仍要匯出');
  await expect(page.locator('[data-file-message]')).toContainText('draw.io');
  await expect(page.locator('[data-status-badge="export"]')).toHaveText('尚未匯出');
});
