import { expect, test } from '@playwright/test';

test('serves a base-path-safe standalone manifest and native install affordance', async ({ page, request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json() as {
    display: string;
    start_url: string;
    scope: string;
    icons: Array<{ src: string }>;
  };
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('.');
  expect(manifest.scope).toBe('.');
  expect(manifest.icons[0]?.src).toBe('icon.svg');

  await page.goto('/');
  const installButton = page.getByRole('button', { name: '安裝 QuickMind', exact: true });
  await expect(installButton).toBeHidden();

  await page.evaluate(() => {
    let promptCalled = false;
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' }>;
    };
    event.prompt = async () => {
      promptCalled = true;
      (window as Window & { __quickMindPromptCalled?: boolean }).__quickMindPromptCalled = true;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
    void promptCalled;
  });
  await expect(installButton).toBeVisible();
  await installButton.click();
  await expect(installButton).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as Window & { __quickMindPromptCalled?: boolean }).__quickMindPromptCalled)).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(installButton).toBeHidden();
});
