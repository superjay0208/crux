/**
 * Math utilities for Crux sim and rendering
 */

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function normalizeAngle(rad: number): number {
  let a = rad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Sign with hysteresis: keeps previous sign if within threshold
 */
export function signWithHysteresis(val: number, prevSign: number, threshold = 0.05): number {
  if (Math.abs(val) < threshold) {
    return prevSign !== 0 ? prevSign : (val >= 0 ? 1 : -1);
  }
  return val >= 0 ? 1 : -1;
}
