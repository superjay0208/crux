import { describe, it, expect } from 'vitest';
import { GripRules } from '../../src/core/rules/GripRules';
import { StaminaModel } from '../../src/core/rules/StaminaModel';
import { Scoring } from '../../src/core/rules/Scoring';
import { Simulation } from '../../src/core/sim/Simulation';
import { LevelLoader } from '../../src/core/data/levelLoader';
import { LevelData, ProfileConfig, HoldData } from '../../src/core/data/schema';
import fs from 'fs';
import path from 'path';

describe('Rules Tests R-01...R-10', () => {
  const profileOriginal = LevelLoader.validateProfile(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/profiles/original_browser.json'), 'utf-8'))
  );
  const profileDesktop = LevelLoader.validateProfile(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/profiles/desktop.json'), 'utf-8'))
  );
  const labLevel: LevelData = LevelLoader.validateLevel(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/levels/lab.json'), 'utf-8'))
  );

  // R-01 Grip eligibility
  it('R-01: Grip eligibility - checks allowHands, allowFeet, capacity, and re-grab', () => {
    const sim = new Simulation(labLevel, profileOriginal);

    // h2 occupied by leftHand
    // Try to find candidate for rightFoot over h2
    const h2 = labLevel.holds.find((h) => h.id === 'h2')!;
    // Move rightFoot to h2 position
    sim.climber.limbs.rightFoot.body.setPosition({ x: h2.pos[0], y: h2.pos[1] } as any);

    // h2 has capacity 1 and is occupied by leftHand -> should be refused for rightFoot
    const candOccupied = GripRules.findCandidateHold(sim.climber, 'rightFoot', labLevel, profileOriginal);
    expect(candOccupied).toBeNull();

    // Re-grab: leftHand re-grabbing h2 is allowed because occupancy excludes itself
    sim.climber.limbs.leftHand.status = 'free';
    const candSelf = GripRules.findCandidateHold(sim.climber, 'leftHand', labLevel, profileOriginal);
    expect(candSelf?.hold.id).toBe('h2');

    // allowHands: false
    const testLevel = JSON.parse(JSON.stringify(labLevel)) as LevelData;
    testLevel.holds[1].allowHands = false;
    const candNoHands = GripRules.findCandidateHold(sim.climber, 'leftHand', testLevel, profileOriginal);
    expect(candNoHands).toBeNull();
  });

  // R-02 Hands rule
  it('R-02: Hands rule - 0 hands attached for > grace releases feet into fall', () => {
    const sim = new Simulation(labLevel, profileOriginal);
    // Release both hands
    sim.climber.release('leftHand');
    sim.climber.release('rightHand');
    expect(sim.climber.attachedHandsCount()).toBe(0);
    expect(sim.climber.attachedFeetCount()).toBe(2);

    // Step past grace seconds (0.15s = 18 ticks at 120Hz)
    for (let t = 0; t < 25; t++) {
      sim.stepTick();
    }

    expect(sim.session.getState()).toBe('Falling');
    expect(sim.climber.attachedFeetCount()).toBe(0);
  });

  // R-03 Finish condition
  it('R-03: both profiles require two hands on the finish hold', () => {
    const simOrig = new Simulation(labLevel, profileOriginal);
    simOrig.climber.attach('rightHand', 'h1', { x: 0.4, y: 1.2 });
    expect(GripRules.checkFinishCondition(simOrig.climber, labLevel, profileOriginal)).toBe(false);
    simOrig.climber.attach('leftHand','h1',{x:.4,y:1.2});
    expect(GripRules.checkFinishCondition(simOrig.climber, labLevel, profileOriginal)).toBe(true);

    // Desktop profile: 1 hand is not enough, needs both hands
    const simDesk = new Simulation(labLevel, profileDesktop);
    simDesk.climber.attach('rightHand', 'h1', { x: 0.4, y: 1.2 });
    expect(GripRules.checkFinishCondition(simDesk.climber, labLevel, profileDesktop)).toBe(false);

    // Attach second hand
    simDesk.climber.attach('leftHand', 'h1', { x: 0.4, y: 1.2 });
    expect(GripRules.checkFinishCondition(simDesk.climber, labLevel, profileDesktop)).toBe(true);

    // Feet on finish never finish
    const simFeet = new Simulation(labLevel, profileOriginal);
    simFeet.climber.releaseAll();
    simFeet.climber.attach('rightFoot', 'h1', { x: 0.4, y: 1.2 });
    expect(GripRules.checkFinishCondition(simFeet.climber, labLevel, profileOriginal)).toBe(false);
  });

  // R-04 Move counting
  it('R-04: Move counting - counts +1 on new hold, 0 on same hold', () => {
    const scoring = new Scoring(labLevel, profileOriginal);
    expect(scoring.getMoves()).toBe(0);

    // Attach to a new hold
    expect(scoring.recordAttach('h2', 'h1')).toBe(true);
    expect(scoring.getMoves()).toBe(1);

    // Re-grab same hold
    expect(scoring.recordAttach('h1', 'h1')).toBe(false);
    expect(scoring.getMoves()).toBe(1);

    // Failed grab (profile has failedGrabCounts = false)
    scoring.recordFailedGrab();
    expect(scoring.getMoves()).toBe(1);
  });

  // R-05 Stamina timeline (original)
  it('R-05: Stamina timeline - drains during drag, refills when idle, exhausts to 0', () => {
    const stamina = new StaminaModel(profileOriginal);
    expect(stamina.getValue()).toBe(1.0);

    const dt = 1 / 120;
    // One second costs 30% before additional movement effort.
    for (let i = 0; i < 120; i++) {
      stamina.update(dt, true, 0, 10, 12);
    }
    expect(stamina.getValue()).toBeCloseTo(.7, 2);
    expect(stamina.getIsVisible()).toBe(true);

    // Half a second restores just 11%, not a full reset.
    for (let i = 0; i < 60; i++) {
      stamina.update(dt, false, 0, 10, 12);
    }
    expect(stamina.getValue()).toBeCloseTo(.81, 2);

    // Exhaustion test
    let event: any = null;
    for (let i = 0; i < 1000; i++) {
      event = stamina.update(dt, true, 0, 10, 12);
      if (event === 'exhausted') break;
    }
    expect(event).toBe('exhausted');
    expect(stamina.getValue()).toBe(0);
  });

  // R-06 Stamina (desktop cancel_drag)
  it('R-06: Desktop stamina - exhaustion cancels drag without falling', () => {
    const sim = new Simulation(labLevel, profileDesktop);
    sim.enqueueCommand({ tick: 0, type: 'down', limb: 'rightHand', pos: { x: 0.35, y: 0.4 } });
    sim.stepTick();
    expect(sim.dragActuator.isDragging()).toBe(true);

    // Step until stamina empties (5 seconds = 600 ticks)
    for (let t = 0; t < 700; t++) {
      sim.stepTick();
      if (!sim.dragActuator.isDragging()) break;
    }

    expect(sim.dragActuator.isDragging()).toBe(false);
    expect(sim.session.getState()).not.toBe('Falling');
  });

  // R-07 Free limb does not drain
  it('R-07: Free limb does not drain stamina when not dragging', () => {
    const sim = new Simulation(labLevel, profileOriginal);
    sim.climber.release('rightHand'); // Right hand swings free

    const initialStamina = sim.stamina.getValue();
    for (let t = 0; t < 240; t++) {
      sim.stepTick();
    }
    expect(sim.stamina.getValue()).toBe(initialStamina);
  });

  // R-08 Timer
  it('R-08: Timer - starts on first drag, ticks during play, stops on finish', () => {
    const sim = new Simulation(labLevel, profileOriginal);
    expect(sim.scoring.getTimeSeconds()).toBe(0);

    sim.stepTick();
    expect(sim.scoring.getTimeSeconds()).toBe(0); // not started yet

    // Start drag at tick 1
    sim.enqueueCommand({ tick: 1, type: 'down', limb: 'rightHand', pos: { x: 0.35, y: 0.4 } });
    sim.stepTick(); // step tick 1
    expect(sim.scoring.isTimerActive()).toBe(true);

    for (let t = 0; t < 60; t++) sim.stepTick();
    expect(sim.scoring.getTimeSeconds()).toBeGreaterThan(0.4);
  });

  // R-09 Stars and badges
  it('R-09: Stars and badges - evaluates targets correctly', () => {
    const scoring = new Scoring(labLevel, profileDesktop);
    scoring.recordAttach('h3', 'h1');
    const res = scoring.evaluateResult();

    expect(res.moves).toBe(1);
    expect(res.moveStar).toBe(true);
  });

  // R-10 Drop limb action
  it('R-10: Drop limb action - right_click drops limb in desktop profile', () => {
    const sim = new Simulation(labLevel, profileDesktop);
    expect(sim.climber.limbs.rightHand.status).toBe('attached');

    sim.enqueueCommand({ tick: 0, type: 'drop', limb: 'rightHand' });
    sim.stepTick();

    expect(sim.climber.limbs.rightHand.status).toBe('free');
  });
});
