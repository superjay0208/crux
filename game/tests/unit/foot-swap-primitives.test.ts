import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Vec2, World } from 'planck';
import { LevelLoader } from '../../src/core/data/levelLoader';
import { LevelData, LimbId } from '../../src/core/data/schema';
import { GripRules } from '../../src/core/rules/GripRules';
import { Climber } from '../../src/core/sim/Climber';

describe('Foot-swap primitives', () => {
  const profile = LevelLoader.validateProfile(
    JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../public/profiles/original_browser.json'),
        'utf-8'
      )
    )
  );
  const labLevel = LevelLoader.validateLevel(
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../fixtures/levels/lab.json'), 'utf-8')
    )
  );

  const cloneLevel = (): LevelData => JSON.parse(JSON.stringify(labLevel)) as LevelData;

  const makeHarness = (level: LevelData = cloneLevel()): { climber: Climber; level: LevelData } => {
    const world = new World(Vec2(profile.physics.gravity[0], profile.physics.gravity[1]));
    const climber = new Climber(world, profile.physics);
    const starts: Array<[LimbId, string | null]> = [
      ['leftHand', level.start.leftHand],
      ['rightHand', level.start.rightHand],
      ['leftFoot', level.start.leftFoot],
      ['rightFoot', level.start.rightFoot],
    ];

    for (const [limbId, holdId] of starts) {
      const hold = level.holds.find((candidate) => candidate.id === holdId);
      if (hold) {
        climber.attach(limbId, hold.id, { x: hold.pos[0], y: hold.pos[1] });
      }
    }

    return { climber, level };
  };

  const moveFootToHold = (
    sim: { climber: Climber; level: LevelData },
    foot: LimbId,
    holdId: string
  ): void => {
    const hold = sim.level.holds.find((candidate) => candidate.id === holdId)!;
    sim.climber.startDragging(foot);
    sim.climber.limbs[foot].body.setPosition({ x: hold.pos[0], y: hold.pos[1] } as any);
  };

  it('accepts only an incoming foot over a capacity-one foothold occupied solely by its opposite foot', () => {
    const leftIncoming = makeHarness();
    moveFootToHold(leftIncoming, 'leftFoot', 'h5');

    const leftCandidate = GripRules.findFootSwapCandidate(
      leftIncoming.climber,
      'leftFoot',
      leftIncoming.level,
      profile
    );
    expect(leftCandidate?.hold.id).toBe('h5');
    expect(leftCandidate?.outgoingFoot).toBe('rightFoot');

    const rightIncoming = makeHarness();
    moveFootToHold(rightIncoming, 'rightFoot', 'h4');
    const rightCandidate = GripRules.findFootSwapCandidate(
      rightIncoming.climber,
      'rightFoot',
      rightIncoming.level,
      profile
    );
    expect(rightCandidate?.hold.id).toBe('h4');
    expect(rightCandidate?.outgoingFoot).toBe('leftFoot');

    expect(
      GripRules.findFootSwapCandidate(
        leftIncoming.climber,
        'leftHand',
        leftIncoming.level,
        profile
      )
    ).toBeNull();

    const unoccupied = makeHarness();
    unoccupied.climber.release('rightFoot');
    moveFootToHold(unoccupied, 'leftFoot', 'h5');
    expect(
      GripRules.findFootSwapCandidate(
        unoccupied.climber,
        'leftFoot',
        unoccupied.level,
        profile
      )
    ).toBeNull();

    const occupiedByIncomingFoot = makeHarness();
    occupiedByIncomingFoot.climber.limbs.leftFoot.body.setPosition({ x: -0.25, y: -0.7 } as any);
    expect(
      GripRules.findFootSwapCandidate(
        occupiedByIncomingFoot.climber,
        'leftFoot',
        occupiedByIncomingFoot.level,
        profile
      )
    ).toBeNull();

    const handOccupied = makeHarness();
    handOccupied.climber.release('rightFoot');
    handOccupied.climber.release('rightHand');
    handOccupied.climber.attach('rightHand', 'h5', { x: 0.25, y: -0.7 });
    moveFootToHold(handOccupied, 'leftFoot', 'h5');
    expect(
      GripRules.findFootSwapCandidate(
        handOccupied.climber,
        'leftFoot',
        handOccupied.level,
        profile
      )
    ).toBeNull();

    const notFootEligibleLevel = cloneLevel();
    notFootEligibleLevel.holds.find((hold) => hold.id === 'h5')!.allowFeet = false;
    const notFootEligible = makeHarness(notFootEligibleLevel);
    moveFootToHold(notFootEligible, 'leftFoot', 'h5');
    expect(
      GripRules.findFootSwapCandidate(
        notFootEligible.climber,
        'leftFoot',
        notFootEligible.level,
        profile
      )
    ).toBeNull();

    const overOccupied = makeHarness();
    overOccupied.climber.release('leftHand');
    overOccupied.climber.attach('leftHand', 'h5', { x: 0.25, y: -0.7 });
    moveFootToHold(overOccupied, 'leftFoot', 'h5');
    expect(
      GripRules.findFootSwapCandidate(
        overOccupied.climber,
        'leftFoot',
        overOccupied.level,
        profile
      )
    ).toBeNull();
  });

  it('uses the hold polygon and capture-inflate distance for swap geometry', () => {
    const sim = makeHarness();
    sim.climber.startDragging('leftFoot');

    // h5's top polygon edge is y=-0.5. Three centimetres above it is within
    // the profile's 0.10 m capture inflation.
    sim.climber.limbs.leftFoot.body.setPosition({ x: 0.25, y: -0.47 } as any);
    const near = GripRules.findFootSwapCandidate(
      sim.climber,
      'leftFoot',
      sim.level,
      profile
    );
    expect(near?.hold.id).toBe('h5');
    expect(near?.distance).toBeCloseTo(0.03, 5);

    // Thirteen centimetres above the same edge is outside the capture region.
    sim.climber.limbs.leftFoot.body.setPosition({ x: 0.25, y: -0.37 } as any);
    expect(
      GripRules.findFootSwapCandidate(sim.climber, 'leftFoot', sim.level, profile)
    ).toBeNull();
  });

  it('keeps ordinary capacity checks strict and treats capacity-two holds as normal attachments', () => {
    const capacityOne = makeHarness();
    moveFootToHold(capacityOne, 'leftFoot', 'h5');

    expect(
      GripRules.findCandidateHold(capacityOne.climber, 'leftFoot', capacityOne.level, profile)
    ).toBeNull();
    expect(
      GripRules.findFootSwapCandidate(capacityOne.climber, 'leftFoot', capacityOne.level, profile)
        ?.hold.id
    ).toBe('h5');

    const capacityTwoLevel = cloneLevel();
    capacityTwoLevel.holds.find((hold) => hold.id === 'h5')!.capacity = 2;
    const capacityTwo = makeHarness(capacityTwoLevel);
    moveFootToHold(capacityTwo, 'leftFoot', 'h5');

    expect(
      GripRules.findCandidateHold(capacityTwo.climber, 'leftFoot', capacityTwo.level, profile)
        ?.hold.id
    ).toBe('h5');
    expect(
      GripRules.findFootSwapCandidate(capacityTwo.climber, 'leftFoot', capacityTwo.level, profile)
    ).toBeNull();
  });

  it('parks a foot without attaching it and safely releases it back to a dynamic body', () => {
    const sim = makeHarness();
    sim.climber.startDragging('leftFoot');
    sim.climber.parkForFootSwap('leftFoot', { x: 0.25, y: -0.7 });

    const parked = sim.climber.limbs.leftFoot;
    expect(parked.status).toBe('swap_pending');
    expect(parked.holdId).toBeNull();
    expect(parked.fromHoldId).toBe('h4');
    expect(parked.body.isKinematic()).toBe(true);
    expect(parked.body.getPosition().x).toBeCloseTo(0.25, 5);
    expect(parked.body.getPosition().y).toBeCloseTo(-0.7, 5);
    expect(sim.climber.attachedCount()).toBe(3);

    sim.climber.release('leftFoot');
    expect(parked.status).toBe('free');
    expect(parked.holdId).toBeNull();
    expect(parked.fromHoldId).toBe('h4');
    expect(parked.body.isDynamic()).toBe(true);

    expect(() =>
      sim.climber.parkForFootSwap('leftHand', { x: 0, y: 0 })
    ).toThrow(/non-foot limb/);
  });

  it('releaseAll includes a parked swap foot and clears every hold id', () => {
    const sim = makeHarness();
    sim.climber.startDragging('leftFoot');
    sim.climber.parkForFootSwap('leftFoot', { x: 0.25, y: -0.7 });

    sim.climber.releaseAll();

    for (const limb of Object.values(sim.climber.limbs)) {
      expect(limb.status).toBe('free');
      expect(limb.holdId).toBeNull();
      expect(limb.body.isDynamic()).toBe(true);
    }
  });
});
