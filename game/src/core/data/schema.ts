import { Vec2D, vDist, vDistSq, vSub, vDot, vLenSq, vLen } from '../vec';

export type ProfileId = 'original_browser' | 'desktop' | 'realism';
export type HandId = 'leftHand' | 'rightHand';
export type FootId = 'leftFoot' | 'rightFoot';
export type LimbId = HandId | FootId;
export type HoldGrip = 'jug' | 'crimp';
export type FootSwapKey = 'KeyA' | 'KeyD';

export interface ProfilePhysics {
  gravity: [number, number];
  hz: number;
  torsoMass: number;
  endpointMass: number;
  torsoDamping: [number, number];
  endpointDamping: number;
  armReach: number;
  legReach: number;
  shoulder: [number, number];
  hip: [number, number];
  correctionFactor: number;
  gain: number[];
  legPushBonus: number;
  forceCeilingG: number;
  captureInflate: number;
}

export interface ProfileRules {
  finishRequires: 'one_hand' | 'two_hands';
  finishEstablishSeconds?: number;
  handsRequiredToHold: number;
  handsGraceSeconds: number;
  defaultHoldCapacity: number;
  stamina: {
    mode: 'fall' | 'cancel_drag' | 'off';
    drainPerSecond: number;
    refillPerSecond: number;
    drainWhile: 'any_limb_free' | 'dragging';
    fadeOutSeconds: number;
    drainBase?: number;
    effortGain?: number;
  };
  moveCounting: {
    returnToSameHoldCounts: boolean;
    failedGrabCounts: boolean;
  };
  starComparator: 'lte' | 'gte';
  unlock: 'sequential' | 'all';
  dropLimbAction: 'none' | 'right_click';
  rightClickSwap: boolean;
  crimp: {
    drainPerSecond: number;
    recoverPerSecond: number;
    openGripGraceSeconds: number;
    reengageFraction: number;
  };
  footSwap: {
    enabled: boolean;
    windowSeconds: number;
    revolutionsPerSecond?: number;
    targetCenter?: number;
    targetWidth?: number;
  };
  realism?: RealismRules;
}

/** Tunable game approximations, not human physiological measurements. */
export interface RealismRules {
  idleDrain: number;
  armLoadDrain: number;
  moveDrain: number;
  handMoveCost: number;
  footMoveCost: number;
  shakeRecover: number;
  restMinFootLoad: number;
  restMaxSpeed: number;
  finishMinFootLoad: number;
  legStiffness: number;
  legDamping: number;
  legForceCap: number;
  footFriction: number;
  footReachGraceSeconds: number;
}

export interface ProfileVisual {
  wall: 'beige' | 'facets';
  outline: boolean;
  fonts: Record<string, string>;
  palette: {
    wall?: string;
    skin?: string;
    shirt?: string;
    shorts?: string;
    shoes?: string;
    holds?: string[];
    stamina?: string[];
  };
}

export interface ProfileConfig {
  id: ProfileId;
  schemaVersion: number;
  viewport: { w: number; h: number };
  physics: ProfilePhysics;
  rules: ProfileRules;
  visual: ProfileVisual;
  audio?: {
    events?: Record<string, string | string[]>;
  };
}

export interface HoldData {
  id: string;
  shape: string;
  color: string;
  pos: [number, number];
  rot: number;
  scale: number;
  capacity: number;
  allowHands: boolean;
  allowFeet: boolean;
  finish: boolean;
  /** Missing on legacy levels means a stable jug. */
  grip?: HoldGrip;
  outline: [number, number][]; // Local polygon vertices
}

export interface LevelCamera {
  center: [number, number];
  height: number;
  aspect: number;
}

export interface LevelStart {
  leftHand: string | null;
  rightHand: string | null;
  leftFoot: string | null;
  rightFoot: string | null;
}

export interface LevelTargets {
  moves: number;
  timeSeconds: number | null;
  elimination: { hold?: string; maxHoldsUsed?: number } | null;
}

export interface LevelData {
  schemaVersion: number;
  id: string;
  profile: ProfileId;
  name: string;
  group: string | null;
  order: number;
  camera: LevelCamera;
  holds: HoldData[];
  start: LevelStart;
  targets: LevelTargets;
  tutorial?: Array<{ type: string; hold?: string; text?: string }>;
  sourceConfidence?: string;
  sourceNotes?: string;
  movement?: { crossedReachFraction: number; crossTransition: number };
  goals?: { crimpHold?: string; footSwaps?: number; checkpoints?: string[] };
  finishSupportHold?: string;
}

export interface ReplayCommand {
  tick: number;
  type: 'down' | 'move' | 'up' | 'drop' | 'reset' | 'crimp' | 'shake' | 'swap_key' | 'swap_confirm' | 'swap_cancel';
  limb?: LimbId;
  pos?: [number, number];
  hand?: HandId;
  active?: boolean;
  key?: FootSwapKey;
}

export interface ReplayData {
  schemaVersion: number;
  profile: ProfileId;
  levelId: string;
  levelHash?: string;
  physicsHz: number;
  commands: ReplayCommand[];
  expected?: {
    finishedAtTick?: number;
    moves?: number;
  };
}

// Geometry helper: Ray-casting point-in-polygon
export function isPointInPolygon(pt: Vec2D, polygon: Vec2D[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Distance from point to line segment
export function distToSegmentSq(p: Vec2D, v: Vec2D, w: Vec2D): number {
  const l2 = vDistSq(v, w);
  if (l2 === 0) return vDistSq(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj: Vec2D = {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y),
  };
  return vDistSq(p, proj);
}

// Shortest distance from point to polygon boundary
export function distToPolygon(pt: Vec2D, polygon: Vec2D[]): number {
  if (polygon.length === 0) return Infinity;
  let minD2 = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const next = (i + 1) % polygon.length;
    const d2 = distToSegmentSq(pt, polygon[i], polygon[next]);
    if (d2 < minD2) minD2 = d2;
  }
  return Math.sqrt(minD2);
}

// Checks if a point is inside or within inflate distance of polygon
export function isPointInInflatedPolygon(pt: Vec2D, polygon: Vec2D[], inflate: number): boolean {
  if (isPointInPolygon(pt, polygon)) return true;
  return distToPolygon(pt, polygon) <= inflate;
}

// Transforms a hold's local outline into world space
export function getHoldWorldPolygon(hold: HoldData): Vec2D[] {
  const cos = Math.cos(hold.rot);
  const sin = Math.sin(hold.rot);
  return hold.outline.map(([lx, ly]) => {
    const sx = lx * hold.scale;
    const sy = ly * hold.scale;
    return {
      x: hold.pos[0] + (sx * cos - sy * sin),
      y: hold.pos[1] + (sx * sin + sy * cos),
    };
  });
}
