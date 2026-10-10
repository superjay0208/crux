import { World, Body, Vec2, MotorJoint } from 'planck';
import { Vec2D } from '../vec';

export interface IDragActuator {
  startDrag(endpointBody: Body, targetWorld: Vec2D, initialCapacity: number): void;
  update(targetWorld: Vec2D, capacity: number): void;
  endDrag(): void;
  isDragging(): boolean;
  getActuatorForce(): number;
}

export class DragActuator implements IDragActuator {
  private world: World;
  private cursorBody: Body;
  private activeJoint: any | null = null;
  private endpointBody: Body | null = null;
  private currentCapacity = 0;
  private correctionFactor: number;

  constructor(world: World, correctionFactor = 0.3) {
    this.world = world;
    this.correctionFactor = correctionFactor;
    // Invisible kinematic cursor body
    this.cursorBody = world.createKinematicBody({
      position: Vec2(0, 0),
      fixedRotation: true,
    });
  }

  startDrag(endpointBody: Body, targetWorld: Vec2D, initialCapacity: number): void {
    this.endDrag();

    this.endpointBody = endpointBody;
    this.currentCapacity = initialCapacity;

    this.cursorBody.setPosition(Vec2(targetWorld.x, targetWorld.y));
    this.cursorBody.setLinearVelocity(Vec2(0, 0));
    this.cursorBody.setAngularVelocity(0);

    this.activeJoint = this.world.createJoint(
      new MotorJoint({
        bodyA: this.cursorBody,
        bodyB: endpointBody,
        linearOffset: Vec2(0, 0),
        angularOffset: 0,
        maxForce: initialCapacity,
        maxTorque: 0,
        correctionFactor: this.correctionFactor,
        collideConnected: false,
      })
    );
  }

  update(targetWorld: Vec2D, capacity: number): void {
    if (!this.activeJoint || !this.endpointBody) return;

    this.currentCapacity = capacity;
    this.cursorBody.setPosition(Vec2(targetWorld.x, targetWorld.y));
    this.cursorBody.setLinearVelocity(Vec2(0, 0));
    this.cursorBody.setAngularVelocity(0);

    // MotorJoint allows setting maxForce directly
    if (typeof this.activeJoint.setMaxForce === 'function') {
      this.activeJoint.setMaxForce(capacity);
    } else {
      this.activeJoint.m_maxForce = capacity;
    }
  }

  endDrag(): void {
    if (this.activeJoint) {
      this.world.destroyJoint(this.activeJoint);
      this.activeJoint = null;
    }
    this.endpointBody = null;
    this.currentCapacity = 0;
  }

  isDragging(): boolean {
    return this.activeJoint !== null;
  }

  getActuatorForce(): number {
    if (!this.activeJoint) return 0;
    try {
      const reaction = this.activeJoint.getReactionForce(120);
      return reaction.length();
    } catch {
      return 0;
    }
  }
}
