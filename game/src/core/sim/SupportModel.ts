import { Climber } from './Climber';
import { LimbId, ProfilePhysics } from '../data/schema';
import { Vec2D, vSub, vNorm, vDot } from '../vec';
import { clamp01 } from '../math';

export class SupportModel {
  static computeCapacity(
    climber: Climber,
    draggedLimb: LimbId,
    dragDir: Vec2D,
    physics: ProfilePhysics
  ): number {
    const m_total = physics.torsoMass + 4 * physics.endpointMass;
    const g = Math.abs(physics.gravity[1]) || 12;

    // Others: attached endpoints excluding the dragged one
    const allLimbIds: LimbId[] = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];
    const attachedOthers = allLimbIds.filter(
      (id) => id !== draggedLimb && climber.limbs[id].status === 'attached'
    );

    const otherCount = attachedOthers.length;
    const gainIndex = Math.min(otherCount, physics.gain.length - 1);
    const gain = physics.gain[gainIndex] ?? 0;

    // If zero support, gain is 0 -> capacity 0
    if (gain === 0 || otherCount === 0) {
      return 0;
    }

    // Leg push calculation for attached feet among others
    const attachedFeet = attachedOthers.filter(
      (id) => id === 'leftFoot' || id === 'rightFoot'
    );

    let legPush = 0;
    const normDragDir = vNorm(dragDir);

    for (const footId of attachedFeet) {
      const hipWorld = climber.getAnchorWorld(footId);
      const footPos = climber.getLimbPosition(footId);
      // Vector from foot to hip (push direction)
      const pushVec = vNorm(vSub(hipWorld, footPos));
      const dot = vDot(pushVec, normDragDir);
      legPush += clamp01(dot);
    }

    const feetDivisor = Math.max(1, attachedFeet.length);
    const legBonusFactor = 1 + (physics.legPushBonus * legPush) / feetDivisor;

    let capacity = m_total * g * gain * legBonusFactor;

    const forceCeiling = physics.forceCeilingG * m_total * g;
    return Math.min(capacity, forceCeiling);
  }
}
