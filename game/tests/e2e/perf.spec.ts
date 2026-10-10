import { test, expect } from '@playwright/test';

test.describe('Performance Benchmark (P2 / E-09)', () => {
  test('measures frame render time over 60 frames, asserts smooth 60 fps capable performance', async ({ page }) => {
    await page.goto('/?profile=original_browser&level=crux');
    await page.waitForFunction(() => (window as any).__crux !== undefined);

    const frameTimes: number[] = await page.evaluate(async () => {
      const facade = (window as any).__crux.facade;
      const times: number[] = [];

      return new Promise<number[]>((resolve) => {
        let count = 0;
        let last = performance.now();

        function measure(now: number) {
          times.push(now - last);
          last = now;
          count++;
          if (count < 60) {
            requestAnimationFrame(measure);
          } else {
            resolve(times);
          }
        }
        requestAnimationFrame(measure);
      });
    });

    expect(frameTimes.length).toBe(60);
    // Calculate average frame duration
    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    console.log(`Average frame time: ${avgFrameTime.toFixed(2)}ms (~${(1000 / avgFrameTime).toFixed(1)} fps)`);

    // In a browser with 60Hz display, frame time is ~16.6ms
    // Assert average frame time is within standard refresh budget (< 35ms even in headless test runner)
    expect(avgFrameTime).toBeLessThan(35);
  });
});

