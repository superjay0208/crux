import { Vec2D, vDist, vSub, vNorm, vPerp, vAdd, vScale } from './vec';
import { clamp } from './math';

export interface IKParams {
  anchor: Vec2D;
  endpoint: Vec2D;
  l1: number;
  l2: number;
  bendSign: number; // +1 or -1
  prevDir?: Vec2D;
}

export interface IKResult {
  joint: Vec2D;
  reachRatio: number; // 0 to 1
  isTaut: boolean;
}

export function solveTwoBoneIK(params: IKParams): IKResult {
  const { anchor, endpoint, l1, l2, bendSign } = params;
  const d = vDist(anchor, endpoint);
  const totalLength = l1 + l2;
  const minLength = Math.abs(l1 - l2);
  const eps = 1e-4;

  let u: Vec2D;
  if (d < eps) {
    u = params.prevDir ?? { x: 0, y: -1 };
  } else {
    u = vNorm(vSub(endpoint, anchor));
  }

  // Clamped distance to ensure triangle inequality holds
  const dc = clamp(d, minLength + eps, totalLength - eps);

  // Law of cosines / coordinate along u
  const x = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const hSq = l1 * l1 - x * x;
  const h = Math.sqrt(Math.max(0, hSq));

  const perpU = vPerp(u);
  const joint = vAdd(anchor, vAdd(vScale(u, x), vScale(perpU, bendSign * h)));

  const reachRatio = totalLength > 0 ? clamp(d / totalLength, 0, 1.5) : 0;
  const isTaut = d >= totalLength - 0.01;

  return {
    joint,
    reachRatio,
    isTaut,
  };
}
