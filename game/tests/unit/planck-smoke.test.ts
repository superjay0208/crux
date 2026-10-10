import { describe, it, expect } from 'vitest';
import { World, Vec2, RopeJoint, MotorJoint, Circle, Box } from 'planck';

describe('Planck.js Smoke Test', () => {
  it('creates world, dynamic and kinematic bodies, RopeJoint, MotorJoint, steps 10 ticks and asserts finite positions', () => {
    const world = new World(Vec2(0, -12));

    // Dynamic torso
    const torso = world.createDynamicBody({
      position: Vec2(0, 0),
      linearDamping: 0.6,
      angularDamping: 1.2,
    });
    torso.createFixture({
      shape: Box(0.25, 0.5),
      density: 8.0,
      filterGroupIndex: -1,
    });

    // Kinematic anchor (cursor or hold)
    const anchor = world.createKinematicBody({
      position: Vec2(0, 1),
    });

    // Dynamic endpoint (hand)
    const hand = world.createDynamicBody({
      position: Vec2(0, 0.8),
      linearDamping: 1.5,
    });
    hand.createFixture({
      shape: Circle(0.12),
      density: 0.5,
      filterGroupIndex: -1,
    });

    // RopeJoint: reach constraint between torso shoulder and hand
    const ropeJoint = world.createJoint(
      new RopeJoint({
        bodyA: torso,
        bodyB: hand,
        localAnchorA: Vec2(0.26, 0.42),
        localAnchorB: Vec2(0, 0),
        maxLength: 0.95,
        collideConnected: false,
      })
    );
    expect(ropeJoint).toBeDefined();

    // MotorJoint: drag actuator from cursor/anchor to hand
    const motorJoint = world.createJoint(
      new MotorJoint({
        bodyA: anchor,
        bodyB: hand,
        linearOffset: Vec2(0, 0),
        angularOffset: 0,
        maxForce: 50.0,
        maxTorque: 0,
        correctionFactor: 0.3,
        collideConnected: false,
      })
    );
    expect(motorJoint).toBeDefined();

    // Step 10 ticks at 120 Hz
    const dt = 1 / 120;
    for (let i = 0; i < 10; i++) {
      world.step(dt, 8, 3);
    }

    const torsoPos = torso.getPosition();
    const handPos = hand.getPosition();

    expect(Number.isFinite(torsoPos.x)).toBe(true);
    expect(Number.isFinite(torsoPos.y)).toBe(true);
    expect(Number.isFinite(handPos.x)).toBe(true);
    expect(Number.isFinite(handPos.y)).toBe(true);
  });
});

