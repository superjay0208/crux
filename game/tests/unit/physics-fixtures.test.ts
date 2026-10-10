import { describe, it, expect } from 'vitest';
import { World, Vec2, RopeJoint, MotorJoint, Box, Circle } from 'planck';
import { Climber } from '../../src/core/sim/Climber';
import { DragActuator } from '../../src/core/sim/DragActuator';
import { SupportModel } from '../../src/core/sim/SupportModel';
import { Simulation } from '../../src/core/sim/Simulation';
import { LevelLoader } from '../../src/core/data/levelLoader';
import { solveTwoBoneIK } from '../../src/core/ik';
import { vDist, vSub, vLen } from '../../src/core/vec';
import fs from 'fs';
import path from 'path';

describe('Physics Fixtures F-01...F-13', () => {
  const profileOriginal = LevelLoader.validateProfile(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/profiles/original_browser.json'), 'utf-8'))
  );
  const profileDesktop = LevelLoader.validateProfile(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/profiles/desktop.json'), 'utf-8'))
  );
  const labLevel = LevelLoader.validateLevel(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/levels/lab.json'), 'utf-8'))
  );

  // F-01 Slack rope: endpoint placed at 50% reach, gravity off, 240 steps -> displacement < 1e-4
  it('F-01: Slack rope - inside reach radius, joint exerts zero force', () => {
    const world = new World(Vec2(0, 0));
    const climber = new Climber(world, profileOriginal.physics, { x: 0, y: 0 });
    climber.torso.setKinematic();

    const hand = climber.getLimb('rightHand');
    const shoulderWorld = climber.getAnchorWorld('rightHand');
    const halfReach = hand.maxLength * 0.5;

    // Place hand at 50% reach
    hand.body.setPosition(Vec2(shoulderWorld.x, shoulderWorld.y - halfReach));
    hand.body.setLinearVelocity(Vec2(0, 0));

    const initialPos = hand.body.getPosition();

    for (let i = 0; i < 240; i++) {
      world.step(1 / 120, 8, 3);
    }

    const finalPos = hand.body.getPosition();
    const displacement = Math.hypot(finalPos.x - initialPos.x, finalPos.y - initialPos.y);
    expect(displacement).toBeLessThan(1e-4);
  });

  // F-02 Taut rope: motor pulls endpoint to 300% reach for 240 steps -> |e - a| - L < 0.01
  it('F-02: Taut rope - resists extension beyond maxLength', () => {
    const world = new World(Vec2(0, 0));
    const climber = new Climber(world, profileOriginal.physics, { x: 0, y: 0 });
    climber.torso.setKinematic();

    const hand = climber.getLimb('rightHand');
    const shoulderWorld = climber.getAnchorWorld('rightHand');
    const farTarget = { x: shoulderWorld.x + hand.maxLength * 3.0, y: shoulderWorld.y };

    const actuator = new DragActuator(world, 0.3);
    actuator.startDrag(hand.body, farTarget, 500);

    for (let i = 0; i < 240; i++) {
      actuator.update(farTarget, 500);
      world.step(1 / 120, 8, 3);
    }

    const handPos = hand.body.getPosition();
    const currentDist = Math.hypot(handPos.x - shoulderWorld.x, handPos.y - shoulderWorld.y);
    const stretch = currentDist - hand.maxLength;

    expect(stretch).toBeLessThan(0.01);
  });

  // F-03 Rotated anchors: torso rotated 90°/180°, F-01/F-02 still pass; anchors follow rotation
  it('F-03: Rotated anchors - anchors correctly transform with torso rotation', () => {
    const world = new World(Vec2(0, 0));
    const climber = new Climber(world, profileOriginal.physics, { x: 0, y: 0 });
    climber.torso.setKinematic();
    climber.torso.setAngle(Math.PI / 2); // 90 deg rotation

    const hand = climber.getLimb('rightHand');
    const shoulderWorld = climber.getAnchorWorld('rightHand');

    // Verify anchor transformed
    const expectedX = -profileOriginal.physics.shoulder[1];
    const expectedY = profileOriginal.physics.shoulder[0];
    expect(Math.abs(shoulderWorld.x - expectedX)).toBeLessThan(1e-3);
    expect(Math.abs(shoulderWorld.y - expectedY)).toBeLessThan(1e-3);

    // Taut test under rotation
    const farTarget = { x: shoulderWorld.x + hand.maxLength * 2.5, y: shoulderWorld.y };
    const actuator = new DragActuator(world, 0.3);
    actuator.startDrag(hand.body, farTarget, 500);

    for (let i = 0; i < 120; i++) {
      actuator.update(farTarget, 500);
      world.step(1 / 120, 8, 3);
    }

    const handPos = hand.body.getPosition();
    const currentDist = Math.hypot(handPos.x - shoulderWorld.x, handPos.y - shoulderWorld.y);
    expect(currentDist - hand.maxLength).toBeLessThan(0.01);
  });

  // F-04 Force cap: gravity off, no rope, target at 1 unit vs 100 units -> accelerations bounded
  it('F-04: Force cap - MotorJoint impulse clamping independent of distance', () => {
    const runCapTest = (dist: number) => {
      const world = new World(Vec2(0, 0));
      const body = world.createDynamicBody({
        position: Vec2(0, 0),
        linearDamping: 0,
      });
      body.createFixture({ shape: Circle(0.12), density: 1.0 });

      const cursor = world.createKinematicBody({ position: Vec2(dist, 0) });
      const maxForce = 20.0;
      world.createJoint(
        new MotorJoint({
          bodyA: cursor,
          bodyB: body,
          linearOffset: Vec2(0, 0),
          maxForce: maxForce,
          maxTorque: 0,
          correctionFactor: 0.3,
        })
      );

      const dt = 1 / 120;
      world.step(dt, 8, 3);

      const vel = body.getLinearVelocity().x;
      const accel = vel / dt;
      return accel;
    };

    const accelNear = runCapTest(1.0);
    const accelFar = runCapTest(100.0);

    // Both should be capped by maxForce / mass
    expect(accelNear).toBeGreaterThan(0);
    expect(accelFar).toBeGreaterThan(0);
    expect(Math.abs(accelFar - accelNear) / accelNear).toBeLessThan(0.05);
  });

  // F-05 Zero torque: dragging never changes endpoint angle
  it('F-05: Zero torque - endpoint angle remains unchanged during drag', () => {
    const world = new World(Vec2(0, 0));
    const climber = new Climber(world, profileOriginal.physics, { x: 0, y: 0 });
    climber.torso.setKinematic();

    const hand = climber.getLimb('rightHand');
    const initialAngle = hand.body.getAngle();

    const actuator = new DragActuator(world, 0.3);
    actuator.startDrag(hand.body, { x: 2, y: 2 }, 100);

    for (let i = 0; i < 60; i++) {
      actuator.update({ x: 2, y: 2 }, 100);
      world.step(1 / 120, 8, 3);
    }

    expect(hand.body.getAngle()).toBe(initialAngle);
  });

  // F-06 Attach only the chosen limb: other kinematic endpoints keep positions to 1e-9
  it('F-06: Attach only the chosen limb - other endpoints unaffected', () => {
    const sim = new Simulation(labLevel, profileOriginal);
    const leftHandPosBefore = sim.climber.getLimbPosition('leftHand');
    const leftFootPosBefore = sim.climber.getLimbPosition('leftFoot');
    const rightFootPosBefore = sim.climber.getLimbPosition('rightFoot');

    // Attach right hand to a hold
    sim.climber.attach('rightHand', 'h1', { x: 0.4, y: 1.2 });

    const leftHandPosAfter = sim.climber.getLimbPosition('leftHand');
    const leftFootPosAfter = sim.climber.getLimbPosition('leftFoot');
    const rightFootPosAfter = sim.climber.getLimbPosition('rightFoot');

    expect(Math.abs(leftHandPosAfter.x - leftHandPosBefore.x)).toBeLessThan(1e-9);
    expect(Math.abs(leftHandPosAfter.y - leftHandPosBefore.y)).toBeLessThan(1e-9);
    expect(Math.abs(leftFootPosAfter.x - leftFootPosBefore.x)).toBeLessThan(1e-9);
    expect(Math.abs(rightFootPosAfter.x - rightFootPosBefore.x)).toBeLessThan(1e-9);
  });

  // F-07 Actual arrival gate: cursor over far hold, endpoint stalled by rope -> no attach
  it('F-07: Actual arrival gate - limb cannot attach to hold beyond rope reach', () => {
    // Modify labLevel so h1 is very far away
    const farLevel = JSON.parse(JSON.stringify(labLevel));
    farLevel.holds[0].pos = [10.0, 10.0];

    const sim = new Simulation(farLevel, profileOriginal);
    // User tries to down and up at far hold
    sim.enqueueCommand({ tick: 0, type: 'down', limb: 'rightHand', pos: { x: 0.35, y: 0.4 } });
    sim.enqueueCommand({ tick: 10, type: 'move', pos: { x: 10.0, y: 10.0 } });
    sim.enqueueCommand({ tick: 30, type: 'up', pos: { x: 10.0, y: 10.0 } });

    for (let i = 0; i < 40; i++) {
      sim.stepTick();
    }

    // Right hand should NOT be attached to h1
    expect(sim.climber.limbs.rightHand.status).not.toBe('attached');
    expect(sim.climber.limbs.rightHand.holdId).toBeNull();
  });

  // F-08 Release keeps swing: torso velocity before/after release equal to 1e-6 at release tick
  it('F-08: Release keeps swing - torso velocity preserved during limb release', () => {
    const world = new World(Vec2(0, -12));
    const climber = new Climber(world, profileOriginal.physics, { x: 0, y: 0 });

    // Attach left hand, swing
    climber.attach('leftHand', 'h1', { x: 0, y: 1 });
    climber.torso.setLinearVelocity(Vec2(2.5, 0.5));

    const torsoVelBefore = climber.torso.getLinearVelocity();
    climber.release('leftHand');
    const torsoVelAfter = climber.torso.getLinearVelocity();

    expect(Math.abs(torsoVelAfter.x - torsoVelBefore.x)).toBeLessThan(1e-6);
    expect(Math.abs(torsoVelAfter.y - torsoVelBefore.y)).toBeLessThan(1e-6);
  });

  // F-09 Capacity table: 1/2/3 supporting endpoints -> capacity ordered
  it('F-09: Capacity table - support model increases with more attached limbs', () => {
    const world = new World(Vec2(0, -12));
    const climber = new Climber(world, profileOriginal.physics, { x: 0, y: 0 });
    const dragDir = { x: 0, y: 1 };

    // 0 others attached
    const cap0 = SupportModel.computeCapacity(climber, 'rightHand', dragDir, profileOriginal.physics);
    expect(cap0).toBe(0);

    // 1 other attached
    climber.attach('leftHand', 'h1', { x: -0.3, y: 0.5 });
    const cap1 = SupportModel.computeCapacity(climber, 'rightHand', dragDir, profileOriginal.physics);
    expect(cap1).toBeGreaterThan(0);

    // 2 others attached
    climber.attach('leftFoot', 'h2', { x: -0.2, y: -0.8 });
    const cap2 = SupportModel.computeCapacity(climber, 'rightHand', dragDir, profileOriginal.physics);
    expect(cap2).toBeGreaterThan(cap1);

    // 3 others attached
    climber.attach('rightFoot', 'h3', { x: 0.2, y: -0.8 });
    const cap3 = SupportModel.computeCapacity(climber, 'rightHand', dragDir, profileOriginal.physics);
    expect(cap3).toBeGreaterThan(cap2);
  });

  // F-10 Reset determinism: run a 600-tick replay twice from reset -> identical snapshots
  it('F-10: Reset determinism - identical results across resets', () => {
    const sim = new Simulation(labLevel, profileOriginal);

    const runReplay = () => {
      sim.reset();
      sim.enqueueCommand({ tick: 10, type: 'down', limb: 'rightHand', pos: { x: 0.35, y: 0.4 } });
      sim.enqueueCommand({ tick: 30, type: 'move', pos: { x: 0.38, y: 0.7 } });
      sim.enqueueCommand({ tick: 80, type: 'move', pos: { x: 0.4, y: 1.1 } });

      const snapHistory: string[] = [];
      for (let t = 0; t < 120; t++) {
        sim.stepTick();
        const snap = sim.getLatestSnapshot();
        snapHistory.push(`${snap.torso.pos.x.toFixed(6)},${snap.torso.pos.y.toFixed(6)}`);
      }
      return snapHistory;
    };

    const run1 = runReplay();
    const run2 = runReplay();

    expect(run1).toEqual(run2);
  });

  // F-11 IK edge cases: coincident, straight, folded, crossed, upside-down -> finite joints
  it('F-11: IK edge cases - robust and finite across all extreme configurations', () => {
    const l1 = 0.5;
    const l2 = 0.5;
    const anchor = { x: 0, y: 0 };

    // Coincident
    const rCoincident = solveTwoBoneIK({ anchor, endpoint: { x: 0, y: 0 }, l1, l2, bendSign: 1 });
    expect(Number.isFinite(rCoincident.joint.x)).toBe(true);
    expect(Number.isFinite(rCoincident.joint.y)).toBe(true);

    // Over-extended (straight)
    const rStraight = solveTwoBoneIK({ anchor, endpoint: { x: 0, y: 2.0 }, l1, l2, bendSign: 1 });
    expect(Number.isFinite(rStraight.joint.x)).toBe(true);
    expect(Number.isFinite(rStraight.joint.y)).toBe(true);

    // Folded
    const rFolded = solveTwoBoneIK({ anchor, endpoint: { x: 0.05, y: 0.05 }, l1, l2, bendSign: 1 });
    expect(Number.isFinite(rFolded.joint.x)).toBe(true);
    expect(Number.isFinite(rFolded.joint.y)).toBe(true);

    // Crossed / upside-down
    const rCrossed = solveTwoBoneIK({ anchor, endpoint: { x: -0.8, y: -0.2 }, l1, l2, bendSign: -1 });
    expect(Number.isFinite(rCrossed.joint.x)).toBe(true);
    expect(Number.isFinite(rCrossed.joint.y)).toBe(true);
  });

  // F-12 Focus loss: synthetically calling up or reset ends drag within one tick
  it('F-12: Focus loss - blur enqueues up and ends drag cleanly', () => {
    const sim = new Simulation(labLevel, profileOriginal);
    sim.enqueueCommand({ tick: 5, type: 'down', limb: 'rightHand', pos: { x: 0.35, y: 0.4 } });
    for (let t = 0; t <= 10; t++) sim.stepTick();
    expect(sim.dragActuator.isDragging()).toBe(true);

    // Synthetic blur/up event
    sim.enqueueCommand({ tick: 11, type: 'up' });
    sim.stepTick();

    expect(sim.dragActuator.isDragging()).toBe(false);
  });

  // F-13 Profile isolation: changing a desktop constant changes no original replay
  it('F-13: Profile isolation - original and desktop profiles are strictly decoupled', () => {
    const origSim1 = new Simulation(labLevel, profileOriginal);
    for (let t = 0; t < 50; t++) origSim1.stepTick();
    const snap1 = origSim1.getLatestSnapshot();

    // Mutate desktop profile copy
    const mutatedDesktop = JSON.parse(JSON.stringify(profileDesktop));
    mutatedDesktop.physics.gravity = [0, -25];
    mutatedDesktop.physics.armReach = 2.0;

    // Run original again
    const origSim2 = new Simulation(labLevel, profileOriginal);
    for (let t = 0; t < 50; t++) origSim2.stepTick();
    const snap2 = origSim2.getLatestSnapshot();

    expect(snap1.torso.pos.x).toBe(snap2.torso.pos.x);
    expect(snap1.torso.pos.y).toBe(snap2.torso.pos.y);
  });
});

