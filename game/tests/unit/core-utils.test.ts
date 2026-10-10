import { describe, it, expect } from 'vitest';
import { clamp, clamp01, lerp, degToRad, radToDeg, normalizeAngle, signWithHysteresis } from '../../src/core/math';
import {
  vec,
  vAdd,
  vSub,
  vScale,
  vDot,
  vCross,
  vLenSq,
  vLen,
  vDistSq,
  vDist,
  vNorm,
  vPerp,
  vRotate,
  vLerp,
} from '../../src/core/vec';
import { Rng } from '../../src/core/rng';
import { Simulation } from '../../src/core/sim/Simulation';
import { LevelLoader } from '../../src/core/data/levelLoader';
import fs from 'fs';
import path from 'path';

describe('Core Utilities Unit Tests', () => {
  it('tests math helpers', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(degToRad(180)).toBeCloseTo(Math.PI);
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(signWithHysteresis(0.01, -1, 0.05)).toBe(-1);
    expect(signWithHysteresis(0.1, -1, 0.05)).toBe(1);
  });

  it('tests 2D vector helpers', () => {
    const a = vec(3, 4);
    const b = vec(1, 2);
    expect(vAdd(a, b)).toEqual({ x: 4, y: 6 });
    expect(vSub(a, b)).toEqual({ x: 2, y: 2 });
    expect(vScale(a, 2)).toEqual({ x: 6, y: 8 });
    expect(vDot(a, b)).toBe(11);
    expect(vCross(a, b)).toBe(2);
    expect(vLenSq(a)).toBe(25);
    expect(vLen(a)).toBe(5);
    expect(vDist(a, b)).toBeCloseTo(Math.sqrt(8));
    expect(vDistSq(a, b)).toBe(8);

    const norm = vNorm(a);
    expect(norm.x).toBeCloseTo(0.6);
    expect(norm.y).toBeCloseTo(0.8);
    expect(vNorm(vec(0, 0))).toEqual({ x: 0, y: 1 });

    const perp = vPerp(vec(1, 0));
    expect(perp).toEqual({ x: -0, y: 1 });

    const rot = vRotate(vec(1, 0), Math.PI / 2);
    expect(rot.x).toBeCloseTo(0);
    expect(rot.y).toBeCloseTo(1);

    const lerped = vLerp(vec(0, 0), vec(10, 20), 0.5);
    expect(lerped).toEqual({ x: 5, y: 10 });
  });

  it('tests seeded RNG', () => {
    const rng1 = new Rng(42);
    const rng2 = new Rng(42);
    const v1 = [rng1.next(), rng1.next(), rng1.next()];
    const v2 = [rng2.next(), rng2.next(), rng2.next()];
    expect(v1).toEqual(v2);

    const valInRange = rng1.range(5, 10);
    expect(valInRange).toBeGreaterThanOrEqual(5);
    expect(valInRange).toBeLessThanOrEqual(10);

    const item = rng1.choice(['a', 'b', 'c']);
    expect(['a', 'b', 'c']).toContain(item);
  });

  it('tests Simulation snapshot interpolation and update loop', () => {
    const profile = LevelLoader.validateProfile(
      JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/profiles/original_browser.json'), 'utf-8'))
    );
    const level = LevelLoader.validateLevel(
      JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/levels/lab.json'), 'utf-8'))
    );

    const sim = new Simulation(level, profile);
    sim.update(1 / 60); // steps 2 ticks (at 120Hz)
    expect(sim.getTick()).toBe(2);

    const alpha = sim.getInterpolationAlpha();
    expect(Number.isFinite(alpha)).toBe(true);

    const interpolated = sim.getInterpolatedSnapshot(0.5);
    expect(interpolated).toBeDefined();
    expect(Number.isFinite(interpolated.torso.pos.x)).toBe(true);
  });
});

