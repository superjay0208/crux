/**
 * 2D vector operations
 */

export interface Vec2D {
  x: number;
  y: number;
}

export function vec(x = 0, y = 0): Vec2D {
  return { x, y };
}

export function vAdd(a: Vec2D, b: Vec2D): Vec2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vSub(a: Vec2D, b: Vec2D): Vec2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vScale(v: Vec2D, s: number): Vec2D {
  return { x: v.x * s, y: v.y * s };
}

export function vDot(a: Vec2D, b: Vec2D): number {
  return a.x * b.x + a.y * b.y;
}

export function vCross(a: Vec2D, b: Vec2D): number {
  return a.x * b.y - a.y * b.x;
}

export function vLenSq(v: Vec2D): number {
  return v.x * v.x + v.y * v.y;
}

export function vLen(v: Vec2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vDistSq(a: Vec2D, b: Vec2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function vDist(a: Vec2D, b: Vec2D): number {
  return Math.sqrt(vDistSq(a, b));
}

export function vNorm(v: Vec2D, fallback: Vec2D = { x: 0, y: 1 }): Vec2D {
  const l = vLen(v);
  if (l < 1e-7) return { ...fallback };
  return { x: v.x / l, y: v.y / l };
}

/**
 * Returns perpendicular vector (-y, x) (CCW rotation by 90 deg)
 */
export function vPerp(v: Vec2D): Vec2D {
  return { x: -v.y, y: v.x };
}

export function vRotate(v: Vec2D, angleRad: number): Vec2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
}

export function vLerp(a: Vec2D, b: Vec2D, t: number): Vec2D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}
