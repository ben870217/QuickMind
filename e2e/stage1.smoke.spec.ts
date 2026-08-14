import { expect, test, type Download } from '@playwright/test';

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

test('covers the Stage 1 local-first workflow', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'QuickMind' })).toBeVisible();

  const root = page.locator('.node-card').first();
  await expect(root).toHaveText('未命名心智圖');
  await root.click();

  await page.keyboard.press('Tab');
  const editor = page.locator('[data-node-editor]');
  await expect(editor).toBeFocused();
  await editor.fill('第一個想法');
  await editor.press('Enter');

  await page.keyboard.press('Enter');
  await expect(editor).toBeFocused();
  await editor.fill('第二個想法');
  await editor.press('Enter');
  await expect(page.locator('.node-card')).toContainText(['未命名心智圖', '第一個想法', '第二個想法']);

  await page.keyboard.press('F2');
  await expect(editor).toBeFocused();
  await editor.fill('第二個想法（已編輯）');
  await editor.press('Enter');
  await expect(page.getByRole('button', { name: '第二個想法（已編輯）' })).toBeVisible();

  const firstChild = page.getByRole('button', { name: '第一個想法' });
  const secondChild = page.getByRole('button', { name: '第二個想法（已編輯）' });
  await secondChild.dragTo(firstChild, { targetPosition: { x: 20, y: 1 } });
  const childCards = page.locator('.mindmap-children > .mindmap-node > .node-row > .node-card');
  await expect(childCards).toHaveText(['第二個想法（已編輯）', '第一個想法']);

  const rootToggle = page.locator('[data-collapse-node]').first();
  await rootToggle.click();
  await expect(childCards).toHaveCount(0);
  await page.getByRole('button', { name: /復原/ }).click();
  await expect(childCards).toHaveCount(2);
  await page.getByRole('button', { name: /重做/ }).click();
  await expect(childCards).toHaveCount(0);
  await rootToggle.click();
  await expect(childCards).toHaveCount(2);

  await page.getByRole('button', { name: '未命名心智圖', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menu', { name: '節點操作' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '未命名心智圖', exact: true })).toBeFocused();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-file-action="export"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.quickmind$/);
  const exportedSource = await readDownload(download);
  const importedDocument = JSON.parse(exportedSource) as {
    root: { text: string };
  };
  importedDocument.root.text = '匯入後標題';

  await page.locator('[data-native-file-input]').setInputFiles({
    name: 'roundtrip.quickmind',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedDocument)),
  });
  await expect(page.getByRole('button', { name: '匯入後標題', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /復原/ }).click();
  await expect(page.getByRole('button', { name: '未命名心智圖', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /重做/ }).click();
  await expect(page.getByRole('button', { name: '匯入後標題', exact: true })).toBeVisible();

  await expect(page.locator('.app-status')).toHaveText('已保存到本機');
  await page.reload();
  await expect(page.getByRole('button', { name: '匯入後標題', exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(page.locator('.app-status')).toHaveText('離線模式');
  await page.getByRole('button', { name: '匯入後標題', exact: true }).click();
  await page.keyboard.press('F2');
  await expect(page.locator('[data-node-editor]')).toBeFocused();
  await page.locator('[data-node-editor]').fill('離線編輯');
  await page.locator('[data-node-editor]').press('Enter');
  await expect(page.getByRole('button', { name: '離線編輯', exact: true })).toBeVisible();
  await context.setOffline(false);
});
