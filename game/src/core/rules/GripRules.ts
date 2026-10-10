import { Climber } from '../sim/Climber';
import {
  HoldData,
  LimbId,
  LevelData,
  ProfileConfig,
  getHoldWorldPolygon,
  isPointInInflatedPolygon,
  distToPolygon,
  isPointInPolygon,
} from '../data/schema';
import { Vec2D, vDist } from '../vec';
import { FootReachModel } from './FootReachModel';

export interface HoverCandidate {
  hold: HoldData;
  holdWorldPoly: Vec2D[];
  distance: number;
}

export interface FootSwapCandidate extends HoverCandidate {
  /** The currently attached foot that would be released if the swap succeeds. */
  outgoingFoot: LimbId;
}

export class GripRules {
  /**
   * Evaluates which hold (if any) can accept the dragged limb at its current position.
   */
  static findCandidateHold(
    climber: Climber,
    limbId: LimbId,
    level: LevelData,
    profile: ProfileConfig
  ): HoverCandidate | null {
    const isHand = limbId === 'leftHand' || limbId === 'rightHand';
    const isFoot = !isHand;
    const limbPos = climber.getLimbPosition(limbId);
    const inflate = profile.physics.captureInflate ?? 0.10;

    let bestCandidate: HoverCandidate | null = null;
    let minDistance = Infinity;

    for (const hold of level.holds) {
      // Check eligibility
      if (isHand && !hold.allowHands) continue;
      if (isFoot && !hold.allowFeet) continue;
      if (isFoot && !FootReachModel.canReach(limbId as 'leftFoot' | 'rightFoot', limbPos,
        climber.getAnchorWorld(limbId), climber.getTorsoAngle(), climber.physics.legReach, level.movement)) continue;

      // Check capacity
      const capacity = hold.capacity ?? profile.rules.defaultHoldCapacity ?? 1;
      let occupants = 0;
      for (const [otherId, otherState] of Object.entries(climber.limbs)) {
        if (otherId !== limbId && otherState.status === 'attached' && otherState.holdId === hold.id) {
          occupants++;
        }
      }

      if (occupants >= capacity) {
        continue;
      }

      const worldPoly = getHoldWorldPolygon(hold);
      if (isPointInInflatedPolygon(limbPos, worldPoly, inflate)) {
        const d = distToPolygon(limbPos, worldPoly);
        if (d < minDistance) {
          minDistance = d;
          bestCandidate = {
            hold,
            holdWorldPoly: worldPoly,
            distance: d,
          };
        }
      }
    }

    return bestCandidate;
  }

  /**
   * Finds a capacity-one foothold that is occupied solely by the incoming
   * foot's opposite foot. This is intentionally separate from
   * findCandidateHold: a swap is an atomic transfer resolved by the QTE, not a
   * second attachment that bypasses the normal hold-capacity rule.
   */
  static findFootSwapCandidate(
    climber: Climber,
    incomingFoot: LimbId,
    level: LevelData,
    profile: ProfileConfig
  ): FootSwapCandidate | null {
    if (incomingFoot !== 'leftFoot' && incomingFoot !== 'rightFoot') {
      return null;
    }

    const outgoingFoot: LimbId = incomingFoot === 'leftFoot' ? 'rightFoot' : 'leftFoot';
    const incomingPos = climber.getLimbPosition(incomingFoot);
    const inflate = profile.physics.captureInflate ?? 0.10;

    let bestCandidate: FootSwapCandidate | null = null;
    let minDistance = Infinity;

    for (const hold of level.holds) {
      if (!hold.allowFeet) continue;

      const capacity = hold.capacity ?? profile.rules.defaultHoldCapacity ?? 1;
      if (capacity !== 1) continue;

      const occupants = (Object.keys(climber.limbs) as LimbId[]).filter((limbId) => {
        const limb = climber.limbs[limbId];
        return limb.status === 'attached' && limb.holdId === hold.id;
      });

      if (occupants.length !== 1 || occupants[0] !== outgoingFoot) {
        continue;
      }

      const worldPoly = getHoldWorldPolygon(hold);
      if (!isPointInInflatedPolygon(incomingPos, worldPoly, inflate)) {
        continue;
      }

      const distance = distToPolygon(incomingPos, worldPoly);
      if (distance < minDistance) {
        minDistance = distance;
        bestCandidate = {
          hold,
          holdWorldPoly: worldPoly,
          distance,
          outgoingFoot,
        };
      }
    }

    return bestCandidate;
  }

  /**
   * Given an anchor candidate and a limb position, clamps the point into the hold
   */
  static clampAnchorPosition(limbPos: Vec2D, hold: HoldData): Vec2D {
    const poly = getHoldWorldPolygon(hold);
    if (isPointInPolygon(limbPos, poly)) {
      return { ...limbPos };
    }
    // If outside, project to hold center or nearest vertex
    return { x: hold.pos[0], y: hold.pos[1] };
  }

  /**
   * Evaluates the hands rule: returns true if hands rule is violated (0 hands for > grace seconds)
   */
  static checkHandsRuleViolated(
    attachedHandsCount: number,
    noHandsTimerSeconds: number,
    profile: ProfileConfig
  ): boolean {
    if (profile.rules.handsRequiredToHold <= 0) return false;
    if (attachedHandsCount > 0) return false;
    return noHandsTimerSeconds >= profile.rules.handsGraceSeconds;
  }

  /**
   * Evaluates whether the finish condition is met
   */
  static checkFinishCondition(
    climber: Climber,
    level: LevelData,
    profile: ProfileConfig
  ): boolean {
    const finishHold = level.holds.find((h) => h.finish);
    if (!finishHold) return false;

    const leftAttached = climber.limbs.leftHand.status === 'attached' && climber.limbs.leftHand.holdId === finishHold.id;
    const rightAttached = climber.limbs.rightHand.status === 'attached' && climber.limbs.rightHand.holdId === finishHold.id;

    if (profile.rules.finishRequires === 'two_hands') {
      return leftAttached && rightAttached;
    }
    // 'one_hand'
    return leftAttached || rightAttached;
  }
}
