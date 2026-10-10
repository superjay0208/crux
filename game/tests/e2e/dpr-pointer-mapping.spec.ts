import { test, expect } from '@playwright/test';

// Regression test for the display-scaling bug (see TASKS.md): the canvas carries no CSS size, so
// its width/height attributes double as its layout size. handleResize() used to measure the canvas
// and write (measured * devicePixelRatio) back into it, which painted the world `dpr` times larger
// than the viewport the Camera modelled. Pointer positions were then converted with the model's
// scale, so on a 125%-scaled display every limb sat ~180px away from where clicking said it was —
// the game looked fine and was completely unclickable.
//
// The suite's other pointer tests could not catch this: they compute their click point with
// camera.worldToScreen(), the same model the bug lives in, so they stayed self-consistently green.
// This test compares against the PAINTED PIXELS instead, which is ground truth.
test.describe('Pointer mapping under display scaling', () => {
  test.use({ deviceScaleFactor: 1.25, viewport: { width: 1012, height: 1050 } });

  test('painted limbs land where the camera model says, and are draggable', async ({ page }) => {
    await page.goto('/?level=first_light');
    await page.waitForFunction(() => Boolean((window as any).__crux?.facade));
    await page.waitForTimeout(400);

    const probe = await page.evaluate(() => {
      const facade = (window as any).__crux.facade;
      const sim = facade.getSimulation();
      const cam = facade.getCamera();
      const canvas = document.querySelector('#viewport') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const dpr = cam.getDpr();

      // The painted size must equal the size the camera models, or painting and input disagree.
      const paintScale = rect.width / (canvas.width / dpr);

      // Locate the shoes by their exact fill (#26242F) and convert buffer px -> CSS px.
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const hits: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const i = (y * canvas.width + x) * 4;
          if (data[i] === 0xce && data[i + 1] === 0xdc && data[i + 2] === 0xd1) {
            hits.push({ x: x / dpr, y: y / dpr });
          }
        }
      }
      hits.sort((a, b) => a.x - b.x);
      const mid = hits.length ? (hits[0].x + hits[hits.length - 1].x) / 2 : 0;
      const centroid = (arr: Array<{ x: number; y: number }>) =>
        arr.length
          ? { x: arr.reduce((s, h) => s + h.x, 0) / arr.length, y: arr.reduce((s, h) => s + h.y, 0) / arr.length }
          : null;
      const paintedLeft = centroid(hits.filter((h) => h.x < mid));
      const paintedRight = centroid(hits.filter((h) => h.x >= mid));

      const modelLeft = cam.worldToScreen(sim.climber.getLimbPosition('leftFoot'));
      const modelRight = cam.worldToScreen(sim.climber.getLimbPosition('rightFoot'));
      const err = (p: any, m: any) => (p ? Math.hypot(p.x - m.x, p.y - m.y) : Number.POSITIVE_INFINITY);

      return {
        dpr,
        paintScale,
        shoePixels: hits.length,
        errorLeft: err(paintedLeft, modelLeft),
        errorRight: err(paintedRight, modelRight),
        rightFootPagePoint: { x: rect.x + modelRight.x, y: rect.y + modelRight.y },
      };
    });

    expect(probe.dpr).toBe(1.25);
    expect(probe.shoePixels).toBeGreaterThan(10);
    // Painting and the input model must be the same coordinate space.
    expect(probe.paintScale).toBeCloseTo(1, 2);
    expect(probe.errorLeft).toBeLessThan(6);
    expect(probe.errorRight).toBeLessThan(6);

    // And the user-level behaviour: pressing on the visible foot must actually grab it.
    const before = await page.evaluate(() =>
      (window as any).__crux.facade.getSimulation().climber.getLimbPosition('rightFoot')
    );
    await page.mouse.move(probe.rightFootPagePoint.x, probe.rightFootPagePoint.y);
    await page.mouse.down();
    await page.waitForTimeout(60);
    expect(
      await page.evaluate(() => (window as any).__crux.facade.getSimulation().dragActuator.isDragging())
    ).toBe(true);
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(probe.rightFootPagePoint.x, probe.rightFootPagePoint.y - i * 8);
      await page.waitForTimeout(16);
    }
    const after = await page.evaluate(() =>
      (window as any).__crux.facade.getSimulation().climber.getLimbPosition('rightFoot')
    );
    await page.mouse.up();
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.2);
  });

  test('repeated resizes do not grow the canvas', async ({ page }) => {
    await page.goto('/?level=first_light');
    await page.waitForFunction(() => Boolean((window as any).__crux?.facade));
    await page.waitForTimeout(300);

    const sizes = await page.evaluate(() => {
      const canvas = document.querySelector('#viewport') as HTMLCanvasElement;
      const out: string[] = [];
      for (let i = 0; i < 4; i++) {
        window.dispatchEvent(new Event('resize'));
        out.push(`${canvas.width}x${canvas.height}`);
      }
      return out;
    });

    expect(new Set(sizes).size).toBe(1);
  });
});
