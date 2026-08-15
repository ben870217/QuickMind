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

test('uses the remaining viewport space for the normal canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('[data-node-editor]')).toBeFocused();

  const tallCanvas = await page.locator('[data-canvas]').boundingBox();
  await page.setViewportSize({ width: 1280, height: 540 });
  const shortCanvas = await page.locator('[data-canvas]').boundingBox();

  expect(tallCanvas?.height ?? 0).toBeGreaterThan((shortCanvas?.height ?? 0) + 100);
});

test('offers native canvas fullscreen without changing the document view', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('[data-canvas]');
  const fullscreenButton = page.getByRole('button', { name: '進入全螢幕' });
  await expect(fullscreenButton).toBeVisible();

  await canvas.focus();
  await page.keyboard.press('+');
  await expect(page.locator('[data-workspace]')).toHaveAttribute('data-canvas-zoom', '1.1');
  await fullscreenButton.click();

  await page.waitForFunction(() => (
    document.fullscreenElement !== null
    || document.querySelector('[data-fullscreen-error]') !== null
  ));

  const enteredFullscreen = await page.evaluate(() => document.fullscreenElement !== null);
  if (enteredFullscreen) {
    await expect(page.locator('.workspace-toolbar')).toBeHidden();
    await expect(page.getByRole('button', { name: '退出全螢幕' })).toBeVisible();
    await expect(page.locator('[data-workspace]')).toHaveAttribute('data-canvas-zoom', '1.1');

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.fullscreenElement === null);
    await expect(page.getByRole('button', { name: '進入全螢幕' })).toBeFocused();
  } else {
    await expect(page.locator('[data-fullscreen-error]')).toContainText('全螢幕');
  }
});

test('covers the Stage 1 local-first workflow', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'QuickMind' })).toBeVisible();

  const rootEditor = page.locator('[data-node-editor]');
  await expect(rootEditor).toBeFocused();
  await expect(rootEditor).toHaveValue('未命名心智圖');
  await rootEditor.fill('我的心智圖');
  await rootEditor.press('Enter');
  const root = page.getByRole('button', { name: '我的心智圖', exact: true });
  await expect(root).toBeVisible();
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
  await expect(page.locator('.node-card')).toContainText(['我的心智圖', '第一個想法', '第二個想法']);

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

  await page.getByRole('button', { name: '我的心智圖', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menu', { name: '節點操作' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '我的心智圖', exact: true })).toBeFocused();

  const canvas = page.locator('[data-canvas]');
  await canvas.click({ position: { x: 12, y: 12 } });
  await expect(canvas).toBeFocused();
  await page.keyboard.press('+');
  await expect(page.locator('[data-workspace]')).toHaveAttribute('data-canvas-zoom', '1.1');
  await page.keyboard.press('0');
  await expect(page.locator('[data-workspace]')).toHaveAttribute('data-canvas-zoom', '1');
  await page.keyboard.press('f');
  await expect(page.getByRole('button', { name: '我的心智圖', exact: true })).toBeFocused();
  await canvas.focus();
  await page.keyboard.press('+');
  await expect(page.locator('[data-workspace]')).toHaveAttribute('data-canvas-zoom', '1.1');

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
  await expect(page.locator('[data-workspace]')).toHaveAttribute('data-canvas-zoom', '1');
  await page.getByRole('button', { name: /復原/ }).click();
  await expect(page.getByRole('button', { name: '我的心智圖', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /重做/ }).click();
  await expect(page.getByRole('button', { name: '匯入後標題', exact: true })).toBeVisible();

  await expect(page.locator('.app-status')).toHaveText('已保存到本機');
  await page.reload();
  await expect(page.getByRole('button', { name: '匯入後標題', exact: true })).toBeVisible();
  await expect(page.getByText('已匯出原生檔')).toBeVisible();

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
