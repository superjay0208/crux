import { SimSnapshot } from '../core/sim/Simulation';
import { ProfileConfig, LimbId, HandId, FootId } from '../core/data/schema';
import { Camera } from './Camera';
import { solveTwoBoneIK } from '../core/ik';
import { Vec2D, vDist, vSub, vNorm, vPerp, vAdd, vScale } from '../core/vec';

export class ClimberRenderer {
  private profile: ProfileConfig;

  constructor(profile: ProfileConfig) {
    this.profile = profile;
  }

  /** Conservative bounds for every painted body part, in physics coordinates. */
  getFramePoints(snap: SimSnapshot): Vec2D[] {
    const p = this.profile.physics;
    const a = snap.torso.angle;
    const local = (x: number, y: number) => ({
      x: snap.torso.pos.x + x * Math.cos(a) - y * Math.sin(a),
      y: snap.torso.pos.y + x * Math.sin(a) + y * Math.cos(a),
    });
    const points: Vec2D[] = [];
    for (const limb of ['leftHand','rightHand','leftFoot','rightFoot'] as LimbId[]) {
      const hand = limb.endsWith('Hand');
      const offset = hand ? p.shoulder : p.hip;
      const anchor = local(offset[0] * (limb.startsWith('left') ? -1 : 1), offset[1]);
      const reach = hand ? p.armReach : p.legReach;
      const end = snap.limbs[limb].pos;
      points.push(anchor, end);
      for (const bendSign of [-1, 1]) points.push(solveTwoBoneIK({anchor,endpoint:end,
        l1:reach*.52,l2:reach*.48,bendSign}).joint);
    }
    const shirtH = p.shoulder[1] * 1.08;
    const shortsH = Math.abs(p.hip[1]) * 1.08;
    for (const x of [-.34,.34]) for (const y of [-shortsH,shirtH]) points.push(local(x,y));
    const head = local(0,shirtH + 19/72*.7);
    for (const x of [-19/72,19/72]) for (const y of [-19/72,19/72]) points.push({x:head.x+x,y:head.y+y});
    const minX = Math.min(...points.map(v=>v.x))-.18;
    const maxX = Math.max(...points.map(v=>v.x))+.18;
    const minY = Math.min(...points.map(v=>v.y))-.18;
    const maxY = Math.max(...points.map(v=>v.y))+.18;
    return [{x:minX,y:minY},{x:maxX,y:maxY}];
  }

  render(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    snap: SimSnapshot,
    activeLimbId: LimbId | null
  ): void {
    const scale = camera.getScale();
    const shadowOffsetX = (3 / 72) * scale;
    const shadowOffsetY = (4 / 72) * scale;

    // Determine front/back sides based on active dragged limb or default to right side front
    const isRightFront = activeLimbId ? activeLimbId.startsWith('right') : true;

    // Draw shadow pass first, then climber pass
    this.drawClimberHierarchy(ctx, camera, snap, activeLimbId, isRightFront, scale, true);
    this.drawClimberHierarchy(ctx, camera, snap, activeLimbId, isRightFront, scale, false);
  }

  private drawClimberHierarchy(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    snap: SimSnapshot,
    activeLimbId: LimbId | null,
    isRightFront: boolean,
    scale: number,
    isShadow: boolean
  ): void {
    ctx.save();
    if (isShadow) {
      const shadowOffsetX = (3 / 72) * scale;
      const shadowOffsetY = (4 / 72) * scale;
      ctx.translate(shadowOffsetX, shadowOffsetY);
      ctx.fillStyle = 'rgba(70, 50, 30, 0.18)';
      ctx.strokeStyle = 'rgba(70, 50, 30, 0.18)';
    }

    const skinColor = isShadow ? 'rgba(0,0,0,0.22)' : this.profile.visual.palette.skin ?? '#d5aa88';
    const shirtColor = isShadow ? 'rgba(0,0,0,0.22)' : this.profile.visual.palette.shirt ?? '#62bea8';
    const shortsColor = isShadow ? 'rgba(0,0,0,0.22)' : this.profile.visual.palette.shorts ?? '#152129';
    const shoeColor = isShadow ? 'rgba(0,0,0,0.22)' : this.profile.visual.palette.shoes ?? '#cedcd1';

    // Torso screen position & rotation
    const torsoScreen = camera.worldToScreen(snap.torso.pos);
    const torsoAngle = -snap.torso.angle; // Canvas Y is inverted relative to physics Y

    // Compute shoulder and hip screen positions
    const shX = this.profile.physics.shoulder[0];
    const shY = this.profile.physics.shoulder[1];
    const hipX = this.profile.physics.hip[0];
    const hipY = this.profile.physics.hip[1];

    const cosA = Math.cos(torsoAngle);
    const sinA = Math.sin(torsoAngle);

    const getScreenAnchor = (lx: number, ly: number): Vec2D => {
      // In torso frame: +X right, +Y up (physics). Screen: +X right, +Y down.
      // ly in screen is -ly
      const rx = lx * cosA - (-ly) * sinA;
      const ry = lx * sinA + (-ly) * cosA;
      return {
        x: torsoScreen.x + rx * scale,
        y: torsoScreen.y + ry * scale,
      };
    };

    const leftShoulder = getScreenAnchor(-shX, shY);
    const rightShoulder = getScreenAnchor(shX, shY);
    const leftHip = getScreenAnchor(-hipX, hipY);
    const rightHip = getScreenAnchor(hipX, hipY);

    const leftHandScreen = camera.worldToScreen(snap.limbs.leftHand.pos);
    const rightHandScreen = camera.worldToScreen(snap.limbs.rightHand.pos);
    const leftFootScreen = camera.worldToScreen(snap.limbs.leftFoot.pos);
    const rightFootScreen = camera.worldToScreen(snap.limbs.rightFoot.pos);

    // Arm and leg stroke widths
    const armStroke = (16 / 72) * scale;
    const legStroke = (18 / 72) * scale;

    // Limb lengths in screen pixels
    const armReachPx = this.profile.physics.armReach * scale;
    const legReachPx = this.profile.physics.legReach * scale;
    const l1Arm = armReachPx * 0.52;
    const l2Arm = armReachPx * 0.48;
    const l1Leg = legReachPx * 0.52;
    const l2Leg = legReachPx * 0.48;

    // Draw Limb helper
    const drawLimb = (
      start: Vec2D,
      end: Vec2D,
      l1: number,
      l2: number,
      bendSign: number,
      strokeWidth: number,
      isLeg: boolean,
      limbId: LimbId
    ) => {
      const ik = solveTwoBoneIK({
        anchor: start,
        endpoint: end,
        l1,
        l2,
        bendSign,
      });

      ctx.save();
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = skinColor;

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(ik.joint.x, ik.joint.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Hand or Foot endpoint
      if (isLeg) {
        ctx.fillStyle = shoeColor;
        ctx.beginPath();
        const shoeW = (18 / 72) * scale;
        const shoeH = (12 / 72) * scale;
        ctx.arc(end.x, end.y, shoeH / 2, 0, Math.PI * 2);
        ctx.fill();

        // Swap pending feedback: an amber accent ring on the parked shoe
        if (!isShadow && snap.limbs[limbId]?.status === 'swap_pending') {
          ctx.strokeStyle = '#FFA600';
          ctx.lineWidth = Math.max(2, (2.5 / 72) * scale);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(end.x, end.y, (8 / 72) * scale, 0, Math.PI * 2);
        ctx.fill();

        // Full-crimp tension knuckle: inner accent dot indicating engaged grip lock
        if (!isShadow && snap.crimp[limbId as HandId]?.engaged) {
          ctx.fillStyle = '#2B2A3C';
          ctx.beginPath();
          ctx.arc(end.x, end.y, (3 / 72) * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };

    // Layering: back arm, back leg, shorts, shirt, head, front leg, front arm
    const backArm = isRightFront
      ? { start: leftShoulder, end: leftHandScreen, bend: 1, limbId: 'leftHand' as const }
      : { start: rightShoulder, end: rightHandScreen, bend: -1, limbId: 'rightHand' as const };
    const frontArm = isRightFront
      ? { start: rightShoulder, end: rightHandScreen, bend: -1, limbId: 'rightHand' as const }
      : { start: leftShoulder, end: leftHandScreen, bend: 1, limbId: 'leftHand' as const };

    const backLeg = isRightFront
      ? { start: leftHip, end: leftFootScreen, bend: -1, limbId: 'leftFoot' as const }
      : { start: rightHip, end: rightFootScreen, bend: 1, limbId: 'rightFoot' as const };
    const frontLeg = isRightFront
      ? { start: rightHip, end: rightFootScreen, bend: 1, limbId: 'rightFoot' as const }
      : { start: leftHip, end: leftFootScreen, bend: -1, limbId: 'leftFoot' as const };

    // 1. Back Arm
    drawLimb(backArm.start, backArm.end, l1Arm, l2Arm, backArm.bend, armStroke, false, backArm.limbId);

    // 2. Back Leg
    drawLimb(backLeg.start, backLeg.end, l1Leg, l2Leg, backLeg.bend, legStroke, true, backLeg.limbId);

    // 3. Torso (Shirt + Shorts + Head)
    ctx.save();
    ctx.translate(torsoScreen.x, torsoScreen.y);
    ctx.rotate(torsoAngle);

    // Shirt/shorts vertical extent is derived from the profile's own shoulder/hip anchors
    // (physics-authoritative, same values Climber.ts uses for the arm/leg joints) rather than a
    // fixed pixel size, so a recalibrated profile can't leave the drawn fabric short of where the
    // limbs actually attach — the previous fixed 28px shorts height left a visible gap above the
    // legs once P3 rescaled hip.y from -0.52 to -0.78 (docs/09 R-04). A small margin (1.08x) lets
    // the anchor sit just inside the fabric edge instead of exactly on its boundary.
    const shirtW = (46 / 72) * scale;
    const shirtH = shY * scale * 1.08;
    const shortsW = (48 / 72) * scale;
    const shortsH = Math.abs(hipY) * scale * 1.08;
    const headR = (19 / 72) * scale;

    // Shorts
    ctx.fillStyle = shortsColor;
    ctx.beginPath();
    ctx.roundRect(-shortsW / 2, 0, shortsW, shortsH, (6 / 72) * scale);
    ctx.fill();

    // Shirt
    ctx.fillStyle = shirtColor;
    ctx.beginPath();
    ctx.roundRect(-shirtW / 2, -shirtH, shirtW, shirtH, (8 / 72) * scale);
    ctx.fill();

    // Head
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, -shirtH - headR * 0.7, headR, 0, Math.PI * 2);
    ctx.fill();

    // Eye: single dark dot tracking active limb
    if (!isShadow) {
      ctx.fillStyle = '#2B2A3C';
      let eyeOffsetX = 0;
      let eyeOffsetY = 0;
      if (activeLimbId) {
        const activePos = camera.worldToScreen(snap.limbs[activeLimbId].pos);
        const dx = activePos.x - torsoScreen.x;
        const dy = activePos.y - torsoScreen.y;
        const eyeAngle = Math.atan2(dy, dx) - torsoAngle;
        const eyeR = headR * 0.45;
        eyeOffsetX = Math.cos(eyeAngle) * eyeR;
        eyeOffsetY = Math.sin(eyeAngle) * eyeR;
      }
      ctx.beginPath();
      ctx.arc(eyeOffsetX, -shirtH - headR * 0.7 + eyeOffsetY, (2.5 / 72) * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 4. Front Leg
    drawLimb(frontLeg.start, frontLeg.end, l1Leg, l2Leg, frontLeg.bend, legStroke, true, frontLeg.limbId);

    // 5. Front Arm
    drawLimb(frontArm.start, frontArm.end, l1Arm, l2Arm, frontArm.bend, armStroke, false, frontArm.limbId);

    ctx.restore();
  }
}
