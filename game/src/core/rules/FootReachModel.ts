import { FootId, LevelData } from '../data/schema';
import { Vec2D } from '../vec';

export class FootReachModel {
  static localDelta(target: Vec2D, hip: Vec2D, angle: number): Vec2D {
    const x = target.x - hip.x;
    const y = target.y - hip.y;
    return { x: x * Math.cos(angle) + y * Math.sin(angle), y: -x * Math.sin(angle) + y * Math.cos(angle) };
  }

  static radius(foot: FootId, local: Vec2D, legLength: number, config: NonNullable<LevelData['movement']>): number {
    const ownSide = foot === 'rightFoot' ? 1 : -1;
    const crossDepth = Math.max(0, -local.x * ownSide);
    const blend = Math.min(1, crossDepth / config.crossTransition);
    const smooth = blend * blend * (3 - 2 * blend);
    return legLength * (1 - (1 - config.crossedReachFraction) * smooth);
  }

  static canReach(foot: FootId, target: Vec2D, hip: Vec2D, angle: number, legLength: number, config: LevelData['movement'], tolerance = 0.06): boolean {
    if (!config) return true;
    const local = this.localDelta(target, hip, angle);
    return Math.hypot(local.x, local.y) <= this.radius(foot, local, legLength, config) + tolerance;
  }

  static clamp(foot: FootId, target: Vec2D, hip: Vec2D, angle: number, legLength: number, config: LevelData['movement']): { target: Vec2D; limited: boolean } {
    if (!config) return { target, limited: false };
    const local = this.localDelta(target, hip, angle);
    const distance = Math.hypot(local.x, local.y);
    // Solve along the original ray. Radius depends on x, so a single radial projection can
    // change its own limit. Bisection gives a consistent envelope without endpoint teleports.
    if (distance <= this.radius(foot, local, legLength, config)) return { target, limited: false };
    let low = 0;
    let high = 1;
    for (let step = 0; step < 24; step++) {
      const t = (low + high) / 2;
      const point = { x: local.x * t, y: local.y * t };
      if (distance * t <= this.radius(foot, point, legLength, config)) low = t;
      else high = t;
    }
    const x = local.x * low;
    const y = local.y * low;
    return { target: { x: hip.x + x * Math.cos(angle) - y * Math.sin(angle), y: hip.y + x * Math.sin(angle) + y * Math.cos(angle) }, limited: true };
  }
}
