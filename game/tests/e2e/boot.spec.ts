import { test, expect } from '@playwright/test';

test.describe('Boot Smoke Test', () => {
  test('opens the page, asserts canvas and shell banner exist', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`${msg.text()} (${JSON.stringify(msg.location())})`);
      }
    });

    await page.goto('/?shell=true');

    // Assert canvas exists and has correct default dimensions
    const canvas = page.locator('canvas#viewport');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('width', '1280');
    await expect(canvas).toHaveAttribute('height', '720');

    // Assert shell title
    const title = page.locator('#shell-title');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('CRUX');

    // Assert fonts loaded
    const fontLoaded = await page.evaluate(async () => {
      await document.fonts.load('400 36px "Barlow Condensed"');
      await document.fonts.ready;
      return document.fonts.check('36px "Barlow Condensed"');
    });
    expect(fontLoaded).toBe(true);

    expect(consoleErrors).toEqual([]);
  });
});
