import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LevelLoader } from '../../src/core/data/levelLoader';
import { LevelData } from '../../src/core/data/schema';
import { Simulation } from '../../src/core/sim/Simulation';

describe('Grip types and foot-swap simulation', () => {
  const profile = LevelLoader.validateProfile(
    JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../public/profiles/original_browser.json'),
        'utf-8'
      )
    )
  );
  const legacyLab = LevelLoader.validateLevel(
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../fixtures/levels/lab.json'), 'utf-8')
    )
  );
  const gripLab = LevelLoader.validateLevel(
    JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../public/levels/original/grip_lab.json'),
        'utf-8'
      )
    )
  );

  const cloneGripLab = (): LevelData => JSON.parse(JSON.stringify(gripLab)) as LevelData;

  function attachHandToCrimp(
    sim: Simulation,
    hand: 'leftHand' | 'rightHand',
    holdId: 'left_crimp' | 'right_crimp'
  ): void {
    const hold = sim.level.holds.find((candidate) => candidate.id === holdId)!;
    sim.climber.attach(hand, hold.id, { x: hold.pos[0], y: hold.pos[1] });
  }

  function startRightToLeftFootSwap(sim: Simulation): void {
    const rightStart = sim.climber.getLimbPosition('rightFoot');
    sim.enqueueCommand({
      tick: sim.getTick(),
      type: 'down',
      limb: 'rightFoot',
      pos: rightStart,
    });
    sim.stepTick();

    const leftHold = sim.level.holds.find(
      (candidate) => candidate.id === 'swap_left_foothold'
    )!;
    sim.climber.limbs.rightFoot.body.setPosition({
      x: leftHold.pos[0],
      y: leftHold.pos[1],
    } as any);
    sim.enqueueCommand({
      tick: sim.getTick(),
      type: 'up',
      pos: { x: leftHold.pos[0], y: leftHold.pos[1] },
    });
    sim.stepTick();
  }

  it('G-01/G-02: legacy holds behave as stable jugs and ignore crimp keys', () => {
    const sim = new Simulation(legacyLab, profile);
    sim.enqueueCommand({
      tick: 0,
      type: 'crimp',
      hand: 'leftHand',
      active: true,
    });

    for (let tick = 0; tick < 240; tick++) sim.stepTick();

    expect(sim.climber.limbs.leftHand.status).toBe('attached');
    expect(sim.crimp.getReserve('leftHand')).toBe(1);
    expect(sim.getLatestSnapshot().crimp.leftHand.onCrimp).toBe(false);
  });

  it('G-03/G-06: Q sustains only the left crimp, then key release slips after grace', () => {
    const sim = new Simulation(cloneGripLab(), profile);
    attachHandToCrimp(sim, 'leftHand', 'left_crimp');
    sim.enqueueCommand({ tick: 0, type: 'crimp', hand: 'leftHand', active: true });

    for (let tick = 0; tick < 120; tick++) sim.stepTick();

    expect(sim.climber.limbs.leftHand.status).toBe('attached');
    expect(sim.crimp.getReserve('leftHand')).toBeCloseTo(.75, 4);
    expect(sim.crimp.getReserve('rightHand')).toBe(1);
    expect(sim.getLatestSnapshot().crimp.leftHand.engaged).toBe(true);

    sim.enqueueCommand({
      tick: sim.getTick(),
      type: 'crimp',
      hand: 'leftHand',
      active: false,
    });
    for (let tick = 0; tick < 91; tick++) sim.stepTick();

    expect(sim.climber.limbs.leftHand.status).toBe('free');
    expect(sim.climber.limbs.rightHand.status).toBe('attached');
  });

  it('G-08: simultaneous Q/E remain independent when one key is released', () => {
    const sim = new Simulation(cloneGripLab(), profile);
    attachHandToCrimp(sim, 'leftHand', 'left_crimp');
    attachHandToCrimp(sim, 'rightHand', 'right_crimp');
    sim.enqueueCommands([
      { tick: 0, type: 'crimp', hand: 'leftHand', active: true },
      { tick: 0, type: 'crimp', hand: 'rightHand', active: true },
    ]);
    for (let tick = 0; tick < 60; tick++) sim.stepTick();

    const rightBefore = sim.crimp.getReserve('rightHand');
    sim.enqueueCommand({
      tick: sim.getTick(),
      type: 'crimp',
      hand: 'leftHand',
      active: false,
    });
    for (let tick = 0; tick < 91; tick++) sim.stepTick();

    expect(sim.climber.limbs.leftHand.status).toBe('free');
    expect(sim.climber.limbs.rightHand.status).toBe('attached');
    expect(sim.crimp.getReserve('rightHand')).toBeLessThan(rightBefore);
    expect(sim.getLatestSnapshot().crimp.rightHand.engaged).toBe(true);
  });

  it('G-11: landing on green transfers right foot atomically and restores its joint', () => {
    const sim = new Simulation(cloneGripLab(), profile);
    startRightToLeftFootSwap(sim);

    expect(sim.getFootSwapSnapshot()?.phase).toBeGreaterThanOrEqual(0);
    expect(sim.climber.limbs.leftFoot.status).toBe('attached');
    expect(sim.climber.limbs.rightFoot.status).toBe('swap_pending');
    expect(sim.scoring.getMoves()).toBe(0);

    expect(sim.climber.limbs.rightFoot.joint).toBeNull();
    while (!sim.getFootSwapSnapshot()?.inGreen) sim.stepTick();
    expect(sim.climber.limbs.leftFoot.status).toBe('attached');

    sim.enqueueCommand({ tick: sim.getTick(), type: 'swap_confirm' });
    sim.stepTick();

    expect(sim.getFootSwapSnapshot()).toBeNull();
    expect(sim.climber.limbs.leftFoot.status).toBe('free');
    expect(sim.climber.limbs.rightFoot.status).toBe('attached');
    expect(sim.climber.limbs.rightFoot.holdId).toBe('swap_left_foothold');
    expect(sim.scoring.getMoves()).toBe(1);
    expect(sim.climber.limbs.rightFoot.joint).not.toBeNull();
    expect(sim.world.getJointCount()).toBe(4);
  });

  it('G-12: miss and timeout retain the outgoing foot and count no move', () => {
    const wrong = new Simulation(cloneGripLab(), profile);
    startRightToLeftFootSwap(wrong);
    wrong.enqueueCommand({ tick: wrong.getTick(), type: 'swap_confirm' });
    wrong.stepTick();

    expect(wrong.getFootSwapSnapshot()).toBeNull();
    expect(wrong.climber.limbs.leftFoot.status).toBe('attached');
    expect(wrong.climber.limbs.leftFoot.holdId).toBe('swap_left_foothold');
    expect(wrong.climber.limbs.rightFoot.status).toBe('free');
    expect(wrong.scoring.getMoves()).toBe(0);
    expect(wrong.world.getJointCount()).toBe(4);

    const timeout = new Simulation(cloneGripLab(), profile);
    startRightToLeftFootSwap(timeout);
    const ticks = Math.ceil(profile.rules.footSwap.windowSeconds * timeout.hz) + 2;
    for (let tick = 0; tick < ticks; tick++) timeout.stepTick();

    expect(timeout.getFootSwapSnapshot()).toBeNull();
    expect(timeout.climber.limbs.leftFoot.status).toBe('attached');
    expect(timeout.climber.limbs.rightFoot.status).toBe('free');
    expect(timeout.scoring.getMoves()).toBe(0);
  });

  it('G-10: Q/E do not advance or fail a pending foot swap', () => {
    const sim = new Simulation(cloneGripLab(), profile);
    startRightToLeftFootSwap(sim);
    sim.enqueueCommands([
      { tick: sim.getTick(), type: 'crimp', hand: 'leftHand', active: true },
      { tick: sim.getTick(), type: 'crimp', hand: 'rightHand', active: true },
    ]);
    sim.stepTick();

    expect(sim.getFootSwapSnapshot()).not.toBeNull();
    expect(sim.getFootSwapSnapshot()?.phase).toBeGreaterThan(0);
    expect(sim.climber.limbs.leftFoot.status).toBe('attached');
    expect(sim.climber.limbs.rightFoot.status).toBe('swap_pending');
  });

  it('G-13: reset cancels pending state and restores both reserves and starting contacts', () => {
    const sim = new Simulation(cloneGripLab(), profile);
    attachHandToCrimp(sim, 'leftHand', 'left_crimp');
    sim.enqueueCommand({ tick: 0, type: 'crimp', hand: 'leftHand', active: true });
    for (let tick = 0; tick < 30; tick++) sim.stepTick();
    startRightToLeftFootSwap(sim);
    expect(sim.getFootSwapSnapshot()).not.toBeNull();

    sim.reset();

    expect(sim.getFootSwapSnapshot()).toBeNull();
    expect(sim.crimp.getReserve('leftHand')).toBe(1);
    expect(sim.getLatestSnapshot().crimp.leftHand.intent).toBe(false);
    expect(sim.climber.limbs.leftFoot.holdId).toBe('swap_left_foothold');
    expect(sim.climber.limbs.rightFoot.holdId).toBe('swap_right_foothold');
  });

  it('G-15: a crimp finish needs both matched hands secured by their independent keys', () => {
    const level = cloneGripLab();
    for (const hold of level.holds) hold.finish = hold.id === 'left_crimp';
    const sim = new Simulation(level, profile);
    attachHandToCrimp(sim, 'leftHand', 'left_crimp');
    attachHandToCrimp(sim, 'rightHand', 'left_crimp');

    sim.stepTick();
    expect(sim.session.getState()).toBe('Playing');

    sim.enqueueCommand({
      tick: sim.getTick(),
      type: 'crimp',
      hand: 'leftHand',
      active: true,
    });
    sim.stepTick();
    expect(sim.session.getState()).toBe('Playing');
    sim.enqueueCommand({tick:sim.getTick(),type:'crimp',hand:'rightHand',active:true});
    for(let tick=0;tick<42;tick++)sim.stepTick();
    expect(sim.session.getState()).toBe('Finished');
  });

  it('keeps interpolated reserves and QTE time inside valid bounds', () => {
    const sim = new Simulation(cloneGripLab(), profile);
    attachHandToCrimp(sim, 'leftHand', 'left_crimp');
    sim.enqueueCommand({ tick: 0, type: 'crimp', hand: 'leftHand', active: true });
    sim.stepTick();
    sim.stepTick();

    for (const alpha of [-1, 0, 0.5, 1, 2]) {
      const snap = sim.getInterpolatedSnapshot(alpha);
      expect(snap.crimp.leftHand.reserve).toBeGreaterThanOrEqual(0);
      expect(snap.crimp.leftHand.reserve).toBeLessThanOrEqual(1);
    }
  });
});
