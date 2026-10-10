import { FootId, LevelData, RealismRules } from '../data/schema';
import { Vec2D } from '../vec';
import { Climber } from './Climber';
import { FootReachModel } from '../rules/FootReachModel';
import { clamp01 } from '../math';

export interface FootSupport {
  quality: number;
  load: number;
  force: Vec2D;
  reason: 'free' | 'high' | 'folded' | 'reach' | 'direction' | 'unweighted' | 'loaded';
}
export interface StanceSupport {
  feet: Record<FootId, FootSupport>;
  footLoad: number;
  armLoad: number;
  balanced: boolean;
}
export interface FootGeometry {
  hip: Vec2D;
  foot: Vec2D;
  velocity: Vec2D;
  length: number;
  reachable: boolean;
  rotation: number;
  weight: number;
}

const empty = (reason: FootSupport['reason']): FootSupport => ({ quality: 0, load: 0, force: { x: 0, y: 0 }, reason });

/** Ordinary toe support is compression only. No heel/toe-hook force is inferred. */
export class FootSupportModel {
  static evaluateFoot(g: FootGeometry, rules: RealismRules): FootSupport {
    const dx = g.hip.x - g.foot.x, dy = g.hip.y - g.foot.y;
    if (![dx,dy,g.length,g.weight,g.velocity.x,g.velocity.y,g.rotation].every(Number.isFinite) || g.length <= 0 || g.weight <= 0) return empty('unweighted');
    const distance = Math.hypot(dx, dy);
    if (!g.reachable || distance > g.length + .06) return empty('reach');
    if (dy <= .05) return empty('high');
    if (distance < g.length * .16) return empty('folded');
    const axis = { x: dx / distance, y: dy / distance };
    const normal = { x: -Math.sin(g.rotation), y: Math.cos(g.rotation) };
    const n = axis.x * normal.x + axis.y * normal.y;
    const tangent = Math.abs(axis.x * normal.y - axis.y * normal.x);
    if (n <= 0 || tangent > rules.footFriction * n) return empty('direction');
    const extension = clamp01((distance / g.length - .16) / .27);
    const alignment = clamp01((axis.y - .15) / .65);
    const frictionMargin = clamp01((rules.footFriction - tangent / n) / .4);
    const quality = extension * alignment * frictionMargin;
    const radialSpeed = g.velocity.x * axis.x + g.velocity.y * axis.y;
    const forceMagnitude = Math.min(g.weight * rules.legForceCap * quality,
      Math.max(0, rules.legStiffness * (g.length * .98 - distance) - rules.legDamping * radialSpeed));
    const force = { x: axis.x * forceMagnitude, y: axis.y * forceMagnitude };
    const load = clamp01(force.y / g.weight);
    return { quality, load, force, reason: load > .03 ? 'loaded' : 'unweighted' };
  }

  static evaluate(climber: Climber, level: LevelData, rules: RealismRules): StanceSupport {
    const weight = (climber.physics.torsoMass + 4.4 * climber.physics.endpointMass) * Math.abs(climber.physics.gravity[1]);
    const feet = {} as Record<FootId, FootSupport>;
    const contactXs: number[] = [];
    const transferXs: number[] = [];
    for (const id of ['leftFoot', 'rightFoot'] as const) {
      const limb = climber.getLimb(id), hip = climber.getAnchorWorld(id), foot = climber.getLimbPosition(id);
      const hold = level.holds.find(h => h.id === limb.holdId);
      if (limb.status !== 'attached' || !hold) { feet[id] = empty('free'); continue; }
      const velocity = climber.torso.getLinearVelocityFromWorldPoint(hip);
      feet[id] = this.evaluateFoot({ hip, foot, velocity, length: limb.maxLength,
        reachable: FootReachModel.canReach(id, foot, hip, climber.getTorsoAngle(), limb.maxLength, level.movement),
        rotation: hold.rot, weight }, rules);
      if (feet[id].load > .03) contactXs.push(foot.x);
      if (feet[id].reason !== 'reach' && feet[id].reason !== 'high' && feet[id].reason !== 'folded') transferXs.push(foot.x);
    }
    const total = feet.leftFoot.load + feet.rightFoot.load;
    // Keep some hand demand, and bound the physical forces as well as their telemetry.
    const scale = total > .92 ? .92 / total : 1;
    for (const foot of Object.values(feet)) {
      foot.load *= scale; foot.force.x *= scale; foot.force.y *= scale;
    }
    const center = climber.getTorsoPosition();
    // An articulated human can steer the reaction within the shoe friction cone using
    // hip/knee moments. Approximate that bounded active balance, otherwise axial springs
    // form an unstable inverted pendulum on this endpoint-only body.
    let footLoad = Math.min(.92, total);
    if (footLoad > .01) {
      const targetX = transferXs.reduce((sum,x)=>sum+x,0) / Math.max(1,transferXs.length);
      const velocity = climber.torso.getLinearVelocity();
      const desiredX = Math.max(-footLoad * weight * .5, Math.min(footLoad * weight * .5,
        (targetX - center.x) * 60 - velocity.x * 25));
      for (const foot of Object.values(feet)) foot.force.x = desiredX * foot.load / footLoad;
    }
    // Steered reactions must still obey the hold's rotated support cone and force cap.
    for (const id of ['leftFoot','rightFoot'] as const) {
      const foot=feet[id],hold=level.holds.find(h=>h.id===climber.getLimb(id).holdId);
      if(!hold||foot.load===0)continue;
      const nx=-Math.sin(hold.rot),ny=Math.cos(hold.rot),tx=ny,ty=-nx;
      const normal=foot.force.x*nx+foot.force.y*ny;
      const tangent=foot.force.x*tx+foot.force.y*ty;
      if(normal<=0) {feet[id]=empty('direction');continue;}
      const boundedTangent=Math.max(-rules.footFriction*normal,Math.min(rules.footFriction*normal,tangent));
      foot.force={x:normal*nx+boundedTangent*tx,y:Math.max(0,normal*ny+boundedTangent*ty)};
      const cap=weight*rules.legForceCap*foot.quality;
      const magnitude=Math.hypot(foot.force.x,foot.force.y);
      if(magnitude>cap){foot.force.x*=cap/magnitude;foot.force.y*=cap/magnitude;}
      foot.load=clamp01(foot.force.y/weight);foot.reason=foot.load>.03?'loaded':'unweighted';
    }
    footLoad=feet.leftFoot.load+feet.rightFoot.load;
    if(footLoad>.92){for(const f of Object.values(feet)){f.force.x*=.92/footLoad;f.force.y*=.92/footLoad;f.load*=.92/footLoad;}footLoad=.92;}
    const balanced = contactXs.length > 0 && center.x >= Math.min(...contactXs) - .65 && center.x <= Math.max(...contactXs) + .65;
    return { feet, footLoad, armLoad: 1 - footLoad, balanced };
  }
}
