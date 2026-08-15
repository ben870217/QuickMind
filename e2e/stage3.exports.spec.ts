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
  const buffer = await readDownloadBuffer(download);
  return buffer.toString('utf8');
}

async function readDownloadBuffer(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (!stream) {
    throw new Error('The browser did not expose the downloaded file');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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

test('offers a retry entry after an external export capability failure', async ({ page }) => {
  await page.goto('/');
  await createSmallMap(page);
  await page.evaluate(() => {
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    let failNext = true;
    URL.createObjectURL = (blob: Blob): string => {
      if (failNext) {
        failNext = false;
        throw new Error('blocked for test');
      }
      return originalCreateObjectUrl(blob);
    };
  });

  const failedDownload = page.waitForEvent('download', { timeout: 500 }).then(() => true).catch(() => false);
  await page.getByRole('button', { name: '匯出 Mermaid' }).click();
  expect(await failedDownload).toBe(false);
  await expect(page.locator('[data-file-message]')).toContainText('Mermaid 匯出失敗');
  await page.getByText('查看詳細資訊').click();
  const retryButton = page.getByRole('button', { name: '重試匯出' });
  await expect(retryButton).toBeVisible();

  const retryDownload = page.waitForEvent('download');
  await retryButton.click();
  const download = await retryDownload;
  expect(download.suggestedFilename()).toBe('我的心智圖.mmd');
  await expect(page.locator('[data-file-message]')).toContainText('已匯出 Mermaid 原始碼');
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
  const parseError = await page.evaluate((xml) => (
    new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror')?.textContent ?? ''
  ), source);
  expect(parseError).toBe('');
  await expect(page.locator('[data-file-message]')).toContainText('draw.io');
  await expect(page.locator('[data-status-badge="export"]')).toHaveText('尚未匯出');
});

test('exports a complete three-times PNG without using the current viewport', async ({ page }) => {
  await page.goto('/');
  await createSmallMap(page);

  const canvas = page.locator('[data-canvas]');
  await canvas.focus();
  await page.keyboard.press('+');
  await canvas.hover();
  await page.mouse.wheel(0, 500);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 PNG' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('我的心智圖.png');
  const png = await readDownloadBuffer(download);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(3024);
  expect(png.readUInt32BE(20)).toBe(336);
  await expect(page.locator('[data-file-message]')).toContainText('PNG');
  await expect(page.locator('[data-status-badge="export"]')).toHaveText('尚未匯出');
});

test('rejects PNG atomically when the canvas capability is unavailable', async ({ page }) => {
  await page.goto('/');
  await createSmallMap(page);
  await page.evaluate(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let failNext = true;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (failNext) {
        failNext = false;
        return null;
      }
      return Reflect.apply(originalGetContext, this, args);
    };
  });

  const failedDownload = page.waitForEvent('download', { timeout: 500 }).then(() => true).catch(() => false);
  await page.getByRole('button', { name: '匯出 PNG' }).click();
  expect(await failedDownload).toBe(false);
  await expect(page.locator('[data-file-message]')).toContainText('PNG 匯出失敗');
  await page.getByText('查看詳細資訊').click();
  const retryButton = page.getByRole('button', { name: '重試匯出' });
  await expect(retryButton).toBeVisible();

  const retryDownload = page.waitForEvent('download');
  await retryButton.click();
  const download = await retryDownload;
  expect(download.suggestedFilename()).toBe('我的心智圖.png');
});

test('rejects PNG atomically when canvas encoding returns no blob', async ({ page }) => {
  await page.goto('/');
  await createSmallMap(page);
  await page.evaluate(() => {
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    let failNext = true;
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      if (failNext) {
        failNext = false;
        args[0](null);
        return;
      }
      return Reflect.apply(originalToBlob, this, args);
    };
  });

  const failedDownload = page.waitForEvent('download', { timeout: 500 }).then(() => true).catch(() => false);
  await page.getByRole('button', { name: '匯出 PNG' }).click();
  expect(await failedDownload).toBe(false);
  await expect(page.locator('[data-file-message]')).toContainText('PNG 匯出失敗');
  await page.getByText('查看詳細資訊').click();
  const retryButton = page.getByRole('button', { name: '重試匯出' });
  await expect(retryButton).toBeVisible();

  const retryDownload = page.waitForEvent('download');
  await retryButton.click();
  const download = await retryDownload;
  expect(download.suggestedFilename()).toBe('我的心智圖.png');
});
