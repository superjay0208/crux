import { describe, it, expect } from 'vitest';
import { Simulation } from '../../src/core/sim/Simulation';
import { LevelLoader } from '../../src/core/data/levelLoader';
import fs from 'fs';
import path from 'path';

// Reproduces the overload scenario from validation/review-2026-09-11/REVIEW.md ("Ten 100 ms
// frame deltas produce interpolation alpha 4 -> 40") and asserts the fix in Simulation.update()
// (docs/09 R-03/J2): alpha must stay within [0,1] and debt must not compound across frames.
describe('Simulation timing accumulator (docs/09 J2)', () => {
  const profile = LevelLoader.validateProfile(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/profiles/original_browser.json'), 'utf-8'))
  );
  const labLevel = LevelLoader.validateLevel(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/levels/lab.json'), 'utf-8'))
  );

  it('keeps interpolation alpha in [0,1] across ordinary 60Hz frames', () => {
    const sim = new Simulation(labLevel, profile);
    for (let i = 0; i < 120; i++) {
      sim.update(1 / 60);
      const alpha = sim.getInterpolationAlpha();
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });

  it('bounds alpha and prevents unbounded debt growth across ten successive 100ms stalls', () => {
    const sim = new Simulation(labLevel, profile);
    for (let i = 0; i < 10; i++) {
      sim.update(0.1);
      const alpha = sim.getInterpolationAlpha();
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
    // The stall's excess wall-clock time is discarded (not silently deferred), and diagnostics
    // record how much was dropped so it's visible rather than hidden.
    expect(sim.getDroppedTimeSeconds()).toBeGreaterThan(0);
  });

  it('recovers to a small alpha after a single stall is followed by ordinary frames', () => {
    const sim = new Simulation(labLevel, profile);
    sim.update(0.1); // one stall
    for (let i = 0; i < 30; i++) {
      sim.update(1 / 60);
    }
    expect(sim.getInterpolationAlpha()).toBeLessThan(1);
  });
});
