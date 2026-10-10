import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LevelLoader } from '../../src/core/data/levelLoader';
import { ProfileRules } from '../../src/core/data/schema';
import { CrimpModel } from '../../src/core/rules/CrimpModel';

const config: ProfileRules['crimp'] = {
  drainPerSecond: 0.1666667,
  recoverPerSecond: 0.25,
  openGripGraceSeconds: 0.75,
  reengageFraction: 0.15,
};

const dt = 1 / 120;
const neitherHolding = { leftHand: false, rightHand: false } as const;
const leftHolding = { leftHand: true, rightHand: false } as const;
const bothHolding = { leftHand: true, rightHand: true } as const;

describe('CrimpModel', () => {
  it('maps Q/E intent semantics independently to left and right state', () => {
    const model = new CrimpModel(config);

    model.setIntent('leftHand', true);
    model.update(dt, bothHolding);

    expect(model.getState('leftHand').engaged).toBe(true);
    expect(model.getState('rightHand').engaged).toBe(false);
    expect(model.getReserve('leftHand')).toBeLessThan(1);
    expect(model.getReserve('rightHand')).toBe(1);

    model.setIntent('rightHand', true);
    model.update(dt, bothHolding);
    expect(model.getState('leftHand').engaged).toBe(true);
    expect(model.getState('rightHand').engaged).toBe(true);
  });

  it('drains deterministically to zero after six seconds and clamps the reserve', () => {
    const model = new CrimpModel(config);
    model.setIntent('leftHand', true);

    for (let tick = 0; tick < 719; tick++) model.update(dt, leftHolding);
    expect(model.getReserve('leftHand')).toBeGreaterThan(0);

    model.update(dt, leftHolding);
    expect(model.getReserve('leftHand')).toBe(0);
    expect(model.getState('leftHand').exhausted).toBe(true);
    expect(model.getState('leftHand').engaged).toBe(false);
    expect(model.getAvailableSeconds('leftHand')).toBe(0);

    for (let tick = 0; tick < 10; tick++) model.update(dt, leftHolding);
    expect(model.getReserve('leftHand')).toBe(0);
  });

  it('slips exactly at the open-grip grace boundary and reports the slip once', () => {
    const model = new CrimpModel(config);

    for (let tick = 0; tick < 89; tick++) {
      expect(model.update(dt, leftHolding)).toEqual([]);
    }
    expect(model.getState('leftHand').graceRemaining).toBeGreaterThan(0);

    expect(model.update(dt, leftHolding)).toEqual(['leftHand']);
    expect(model.getState('leftHand').graceRemaining).toBe(0);
    expect(model.update(dt, leftHolding)).toEqual([]);

    model.update(dt, neitherHolding);
    expect(model.update(0.75, leftHolding)).toEqual(['leftHand']);
  });

  it('restores grace while engaged and begins a full grace window after key release', () => {
    const model = new CrimpModel(config);
    model.setIntent('leftHand', true);

    for (let tick = 0; tick < 60; tick++) model.update(dt, leftHolding);
    expect(model.getState('leftHand').graceRemaining).toBe(config.openGripGraceSeconds);

    model.setIntent('leftHand', false);
    for (let tick = 0; tick < 89; tick++) {
      expect(model.update(dt, leftHolding)).toEqual([]);
    }
    expect(model.update(dt, leftHolding)).toEqual(['leftHand']);
  });

  it('recovers only off a crimp and requires key release plus threshold to unlatch exhaustion', () => {
    const model = new CrimpModel(config);
    model.setIntent('leftHand', true);
    for (let tick = 0; tick < 720; tick++) model.update(dt, leftHolding);

    // Staying on the edge cannot regenerate reserve.
    for (let tick = 0; tick < 120; tick++) model.update(dt, leftHolding);
    expect(model.getReserve('leftHand')).toBe(0);

    // Off-edge recovery proceeds, but a still-held key keeps exhaustion latched.
    for (let tick = 0; tick < 120; tick++) model.update(dt, neitherHolding);
    expect(model.getReserve('leftHand')).toBeCloseTo(0.25, 8);
    expect(model.getState('leftHand').exhausted).toBe(true);

    model.setIntent('leftHand', false);
    model.update(0, neitherHolding);
    expect(model.getState('leftHand').exhausted).toBe(false);

    model.setIntent('leftHand', true);
    model.update(dt, leftHolding);
    expect(model.getState('leftHand').engaged).toBe(true);
  });

  it('resets both hands and returns defensive snapshots', () => {
    const model = new CrimpModel(config);
    model.setIntent('leftHand', true);
    model.update(1, leftHolding);

    const first = model.snapshot();
    first.leftHand.reserve = 0;
    expect(model.getReserve('leftHand')).toBeGreaterThan(0);

    model.reset();
    expect(model.snapshot()).toEqual({
      leftHand: {
        reserve: 1,
        intent: false,
        onCrimp: false,
        engaged: false,
        graceRemaining: 0,
        exhausted: false,
        availableSeconds: expect.closeTo(5.9999988, 5),
      },
      rightHand: {
        reserve: 1,
        intent: false,
        onCrimp: false,
        engaged: false,
        graceRemaining: 0,
        exhausted: false,
        availableSeconds: expect.closeTo(5.9999988, 5),
      },
    });
  });

  it('rejects invalid time steps', () => {
    const model = new CrimpModel(config);
    expect(() => model.update(-dt, neitherHolding)).toThrow(/non-negative/);
    expect(() => model.update(Number.NaN, neitherHolding)).toThrow(/finite/);
  });
});

describe('Grip/profile data validation', () => {
  const profilePath = path.resolve(__dirname, '../../public/profiles/original_browser.json');
  const levelPath = path.resolve(__dirname, '../fixtures/levels/lab.json');

  it('accepts missing, jug, and crimp hold grip values', () => {
    const legacy = JSON.parse(fs.readFileSync(levelPath, 'utf-8'));
    expect(LevelLoader.validateLevel(legacy).holds[0].grip).toBeUndefined();

    legacy.holds[0].grip = 'jug';
    legacy.holds[1].grip = 'crimp';
    expect(LevelLoader.validateLevel(legacy).holds.map((hold) => hold.grip).slice(0, 2)).toEqual([
      'jug',
      'crimp',
    ]);
  });

  it('rejects unknown explicit grip values with the hold id', () => {
    const level = JSON.parse(fs.readFileSync(levelPath, 'utf-8'));
    level.holds[0].grip = 'sloper';
    expect(() => LevelLoader.validateLevel(level)).toThrow(
      new RegExp(`Hold ${level.holds[0].id} has invalid grip`)
    );
  });

  it('requires finite crimp and foot-swap tuning values', () => {
    const valid = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    expect(LevelLoader.validateProfile(valid).rules.footSwap.windowSeconds).toBe(3.6);

    const missing = structuredClone(valid);
    delete missing.rules.crimp;
    expect(() => LevelLoader.validateProfile(missing)).toThrow(/rules\.crimp/);

    const badThreshold = structuredClone(valid);
    badThreshold.rules.crimp.reengageFraction = 1.1;
    expect(() => LevelLoader.validateProfile(badThreshold)).toThrow(/at most 1/);

    const badWindow = structuredClone(valid);
    badWindow.rules.footSwap.windowSeconds = 0;
    expect(() => LevelLoader.validateProfile(badWindow)).toThrow(/windowSeconds/);
  });
});
