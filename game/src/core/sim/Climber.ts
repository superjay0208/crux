import { World, Body, Box, Circle, Vec2, RopeJoint } from 'planck';
import { LimbId, ProfilePhysics } from '../data/schema';
import { Vec2D, vec } from '../vec';

export type LimbStatus = 'attached' | 'dragging' | 'swap_pending' | 'free';

export interface LimbState {
  id: LimbId;
  body: Body;
  joint: any;
  status: LimbStatus;
  holdId: string | null;
  fromHoldId: string | null;
  localAnchor: Vec2D;
  maxLength: number;
}

export class Climber {
  readonly torso: Body;
  readonly limbs: Record<LimbId, LimbState>;
  readonly physics: ProfilePhysics;
  private world: World;

  constructor(world: World, physics: ProfilePhysics, initialCenter: Vec2D = { x: 0, y: 0 }) {
    this.physics = physics;
    this.world = world;

    // Create Torso Body
    this.torso = world.createDynamicBody({
      position: Vec2(initialCenter.x, initialCenter.y),
      linearDamping: physics.torsoDamping[0],
      angularDamping: physics.torsoDamping[1],
      fixedRotation: false,
      bullet: false,
    });

    // Torso fixture half-extents scale with the shoulder/hip reach calibration (docs/03 S10):
    // a profile with bigger shoulder/hip offsets gets a proportionally bigger, harder-to-spin
    // torso, keeping the anchor-to-box-edge ratio constant. Baseline (shoulder.y=0.42) maps to
    // the original half-extents (0.25, 0.5); other profiles scale from that baseline.
    const baselineShoulderY = 0.42;
    const bodyScale = physics.shoulder[1] / baselineShoulderY;
    const torsoHalfW = 0.25 * bodyScale;
    const torsoHalfH = 0.5 * bodyScale;
    const torsoArea = 2 * torsoHalfW * 2 * torsoHalfH;
    this.torso.createFixture({
      shape: Box(torsoHalfW, torsoHalfH),
      density: physics.torsoMass / torsoArea,
      filterGroupIndex: -1,
    });

    const shoulderX = physics.shoulder[0];
    const shoulderY = physics.shoulder[1];
    const hipX = physics.hip[0];
    const hipY = physics.hip[1];

    const armReach = physics.armReach;
    const legReach = physics.legReach;

    // Helper to create an endpoint
    const createEndpoint = (
      id: LimbId,
      localAnchor: Vec2D,
      maxLength: number,
      radius: number,
      mass: number
    ): LimbState => {
      const worldAnchor = this.torso.getWorldPoint(Vec2(localAnchor.x, localAnchor.y));
      const body = world.createDynamicBody({
        position: Vec2(worldAnchor.x, worldAnchor.y - maxLength * 0.7),
        linearDamping: physics.endpointDamping,
        fixedRotation: true,
        bullet: false,
      });

      body.createFixture({
        shape: Circle(radius),
        density: mass / (Math.PI * radius * radius),
        filterGroupIndex: -1,
      });

      const joint = world.createJoint(
        new RopeJoint({
          bodyA: this.torso,
          bodyB: body,
          localAnchorA: Vec2(localAnchor.x, localAnchor.y),
          localAnchorB: Vec2(0, 0),
          maxLength: maxLength,
          collideConnected: false,
        })
      );

      return {
        id,
        body,
        joint,
        status: 'free',
        holdId: null,
        fromHoldId: null,
        localAnchor,
        maxLength,
      };
    };

    this.limbs = {
      leftHand: createEndpoint('leftHand', { x: -shoulderX, y: shoulderY }, armReach, 0.12, physics.endpointMass),
      rightHand: createEndpoint('rightHand', { x: shoulderX, y: shoulderY }, armReach, 0.12, physics.endpointMass),
      leftFoot: createEndpoint('leftFoot', { x: -hipX, y: hipY }, legReach, 0.14, physics.endpointMass * 1.2),
      rightFoot: createEndpoint('rightFoot', { x: hipX, y: hipY }, legReach, 0.14, physics.endpointMass * 1.2),
    };
  }

  getLimb(id: LimbId): LimbState {
    return this.limbs[id];
  }

  getLimbPosition(id: LimbId): Vec2D {
    const pos = this.limbs[id].body.getPosition();
    return { x: pos.x, y: pos.y };
  }

  getAnchorWorld(id: LimbId): Vec2D {
    const limb = this.limbs[id];
    const pt = this.torso.getWorldPoint(Vec2(limb.localAnchor.x, limb.localAnchor.y));
    return { x: pt.x, y: pt.y };
  }

  getTorsoPosition(): Vec2D {
    const p = this.torso.getPosition();
    return { x: p.x, y: p.y };
  }

  getTorsoAngle(): number {
    return this.torso.getAngle();
  }

  attachedCount(): number {
    let count = 0;
    for (const id of Object.keys(this.limbs) as LimbId[]) {
      if (this.limbs[id].status === 'attached') count++;
    }
    return count;
  }

  attachedHandsCount(): number {
    let count = 0;
    if (this.limbs.leftHand.status === 'attached') count++;
    if (this.limbs.rightHand.status === 'attached') count++;
    return count;
  }

  attachedFeetCount(): number {
    let count = 0;
    if (this.limbs.leftFoot.status === 'attached') count++;
    if (this.limbs.rightFoot.status === 'attached') count++;
    return count;
  }

  isAnyLimbFree(): boolean {
    for (const id of Object.keys(this.limbs) as LimbId[]) {
      if (this.limbs[id].status === 'free') return true;
    }
    return false;
  }

  attach(id: LimbId, holdId: string, anchorWorld: Vec2D): void {
    const limb = this.limbs[id];
    this.restoreLimbJoint(id);
    limb.body.setLinearVelocity(Vec2(0, 0));
    limb.body.setAngularVelocity(0);
    limb.body.setKinematic();
    limb.body.setPosition(Vec2(anchorWorld.x, anchorWorld.y));
    limb.status = 'attached';
    limb.holdId = holdId;
  }

  /**
   * Parks the incoming foot at the candidate foothold while the swap QTE is
   * active. A parked limb is kinematic, but is deliberately not attached and
   * carries no hold id, so it cannot contribute support or consume capacity.
   */
  parkForFootSwap(id: LimbId, anchorWorld: Vec2D): void {
    if (id !== 'leftFoot' && id !== 'rightFoot') {
      throw new Error(`Cannot park non-foot limb ${id} for a foot swap`);
    }

    const limb = this.limbs[id];
    if (limb.status === 'attached') {
      limb.fromHoldId = limb.holdId;
    }
    limb.body.setLinearVelocity(Vec2(0, 0));
    limb.body.setAngularVelocity(0);
    limb.body.setKinematic();
    limb.body.setPosition(Vec2(anchorWorld.x, anchorWorld.y));
    limb.status = 'swap_pending';
    limb.holdId = null;
    // A parked endpoint is visual staging only. Its rope must not pin the torso a second time.
    if (limb.joint) this.world.destroyJoint(limb.joint);
    limb.joint = null;
  }

  private restoreLimbJoint(id: LimbId): void {
    const limb = this.limbs[id];
    if (limb.joint) return;
    limb.joint = this.world.createJoint(new RopeJoint({ bodyA: this.torso, bodyB: limb.body,
      localAnchorA: Vec2(limb.localAnchor.x, limb.localAnchor.y), localAnchorB: Vec2(0, 0),
      maxLength: limb.maxLength, collideConnected: false }));
  }

  release(id: LimbId): void {
    const limb = this.limbs[id];
    this.restoreLimbJoint(id);
    if (limb.status === 'attached') {
      limb.fromHoldId = limb.holdId;
    }
    limb.holdId = null;
    limb.status = 'free';
    limb.body.setDynamic();
    limb.body.setAwake(true);

    // Endpoint inherits velocity from torso anchor
    const anchorWorld = this.torso.getWorldPoint(Vec2(limb.localAnchor.x, limb.localAnchor.y));
    const vel = this.torso.getLinearVelocityFromWorldPoint(anchorWorld);
    limb.body.setLinearVelocity(vel);
  }

  releaseAll(): void {
    for (const id of Object.keys(this.limbs) as LimbId[]) {
      if (
        this.limbs[id].status === 'attached' ||
        this.limbs[id].status === 'dragging' ||
        this.limbs[id].status === 'swap_pending'
      ) {
        this.release(id);
      }
    }
  }

  startDragging(id: LimbId): void {
    const limb = this.limbs[id];
    if (limb.status === 'attached') {
      limb.fromHoldId = limb.holdId;
      limb.holdId = null;
    }
    limb.status = 'dragging';
    limb.body.setDynamic();
    limb.body.setAwake(true);

    const anchorWorld = this.torso.getWorldPoint(Vec2(limb.localAnchor.x, limb.localAnchor.y));
    const vel = this.torso.getLinearVelocityFromWorldPoint(anchorWorld);
    limb.body.setLinearVelocity(vel);
  }
}
