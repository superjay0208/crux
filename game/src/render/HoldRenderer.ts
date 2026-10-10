import { HoldData, LevelData, ProfileConfig } from '../core/data/schema';
import { Camera } from './Camera';
import { Vec2D } from '../core/vec';

const COLOR_MAP: Record<string, string> = {
  magenta: '#BB3659',
  purple: '#7B38BD',
  orange: '#FFA600',
  green: '#2A734D',
};

export class HoldRenderer {
  private pathCache = new Map<string, Path2D>();
  private level: LevelData | null = null;
  private profile: ProfileConfig;

  constructor(profile: ProfileConfig) {
    this.profile = profile;
  }

  setLevel(level: LevelData): void {
    this.level = level;
    this.pathCache.clear();
  }

  private getPath(hold: HoldData, camera: Camera): Path2D {
    // Generate screen-space Path2D for the hold polygon
    const scale = camera.getScale();
    const cos = Math.cos(hold.rot);
    const sin = Math.sin(hold.rot);

    const path = new Path2D();
    if (hold.outline.length === 0) return path;

    for (let i = 0; i < hold.outline.length; i++) {
      const [lx, ly] = hold.outline[i];
      const sx = lx * hold.scale;
      const sy = ly * hold.scale;
      // World offset from hold center
      const wx = hold.pos[0] + (sx * cos - sy * sin);
      const wy = hold.pos[1] + (sx * sin + sy * cos);
      const screenPt = camera.worldToScreen({ x: wx, y: wy });

      if (i === 0) {
        path.moveTo(screenPt.x, screenPt.y);
      } else {
        path.lineTo(screenPt.x, screenPt.y);
      }
    }
    path.closePath();
    return path;
  }

  render(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    hoverHoldId: string | null,
    hoverFootSwapHoldId: string | null = null,
    completedCheckpoints: string[] = []
  ): void {
    if (!this.level) return;

    const scale = camera.getScale();
    const shadowOffsetX = (3 / 72) * scale;
    const shadowOffsetY = (4 / 72) * scale;

    // 1. Draw All Shadows first
    ctx.save();
    ctx.fillStyle = 'rgba(90, 70, 40, 0.25)';
    for (const hold of this.level.holds) {
      ctx.save();
      ctx.translate(shadowOffsetX, shadowOffsetY);
      const path = this.getPath(hold, camera);
      ctx.fill(path);
      ctx.restore();
    }
    ctx.restore();

    // 2. Draw Hold Bodies
    for (const hold of this.level.holds) {
      const path = this.getPath(hold, camera);
      const fillColor = COLOR_MAP[hold.color] ?? hold.color;

      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.fill(path);

      // Desktop outline if enabled
      if (this.profile.visual.outline) {
        ctx.strokeStyle = '#1B1B1B';
        ctx.lineWidth = Math.max(2, (3 / 72) * scale);
        ctx.stroke(path);
      }

      // Hover candidate highlight (white outline ~4px)
      if (hold.id === hoverHoldId) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(3, (4 / 72) * scale);
        ctx.lineJoin = 'round';
        ctx.stroke(path);
      }

      // A capacity-one foothold remains a valid swap target even though normal attachment is
      // full. A dashed amber outline communicates the special transfer without relaxing capacity.
      if (hold.id === hoverFootSwapHoldId) {
        ctx.save();
        ctx.setLineDash([
          Math.max(5, (7 / 72) * scale),
          Math.max(3, (4 / 72) * scale),
        ]);
        ctx.strokeStyle = '#FFA600';
        ctx.lineWidth = Math.max(3, (4 / 72) * scale);
        ctx.lineJoin = 'round';
        ctx.stroke(path);
        ctx.restore();
      }

      // Bolts: 1 dot near center, 2 dots if capacity >= 2
      const centerScreen = camera.worldToScreen({ x: hold.pos[0], y: hold.pos[1] });
      const boltRadius = Math.max(2.5, (3.5 / 72) * scale);
      ctx.fillStyle = 'rgba(74, 42, 42, 0.55)';

      const capacity = hold.capacity ?? 1;
      if (capacity >= 2) {
        // Two horizontal bolts
        const offset = boltRadius * 2.2;
        ctx.beginPath();
        ctx.arc(centerScreen.x - offset, centerScreen.y, boltRadius, 0, Math.PI * 2);
        ctx.arc(centerScreen.x + offset, centerScreen.y, boltRadius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Single bolt
        ctx.beginPath();
        ctx.arc(centerScreen.x, centerScreen.y, boltRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (hold.allowHands) this.renderGripMark(ctx, hold, centerScreen, scale);
      const checkpoint = this.level.goals?.checkpoints?.indexOf(hold.id) ?? -1;
      if (checkpoint >= 0) {
        ctx.font='12px "Barlow Condensed",sans-serif';ctx.textAlign='center';
        ctx.fillStyle=completedCheckpoints.includes(hold.id)?'#8cdec1':'#bbcbd0';
        ctx.fillText(completedCheckpoints.includes(hold.id)?'✓':String(checkpoint+1),centerScreen.x,centerScreen.y-.36*scale);
      }

      // Finish hold rays
      if (hold.finish) {
        ctx.font = '600 13px "Barlow Condensed",sans-serif';
        ctx.fillStyle = '#e7f0e7';
        ctx.textAlign = 'center';
        ctx.fillText('TOP', centerScreen.x, centerScreen.y - 0.43 * scale);
      }
      if (hold.id === this.level.finishSupportHold) {
        ctx.font = '12px "Barlow Condensed",sans-serif';
        ctx.fillStyle = '#b9d6dc';
        ctx.textAlign = 'center';
        ctx.fillText('EXIT FOOT', centerScreen.x, centerScreen.y + 0.30 * scale);
      }

      ctx.restore();
    }
  }

  private renderGripMark(
    ctx: CanvasRenderingContext2D,
    hold: HoldData,
    centerScreen: Vec2D,
    scale: number
  ): void {
    // Only explicit types receive a mark. Legacy campaign holds omit `grip`, resolve to jug in
    // rules, and keep their existing pixels/golden comparison unchanged.
    if (!hold.grip) return;

    ctx.save();
    ctx.translate(centerScreen.x, centerScreen.y);
    ctx.rotate(-hold.rot);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (hold.grip === 'crimp') {
      const halfWidth = Math.max(9, hold.scale * (24 / 72) * scale);
      const lipDepth = Math.max(3, (4 / 72) * scale);
      ctx.strokeStyle = 'rgba(70, 36, 44, 0.72)';
      ctx.lineWidth = Math.max(2, (2.5 / 72) * scale);
      ctx.beginPath();
      ctx.moveTo(-halfWidth, -lipDepth);
      ctx.lineTo(halfWidth, -lipDepth);
      ctx.lineTo(halfWidth * 0.82, lipDepth);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.70)';
      ctx.lineWidth = Math.max(1.5, (1.8 / 72) * scale);
      ctx.beginPath();
      ctx.moveTo(-halfWidth * 0.86, -lipDepth * 1.5);
      ctx.lineTo(halfWidth * 0.86, -lipDepth * 1.5);
      ctx.stroke();
    } else {
      const radiusX = Math.max(8, hold.scale * (16 / 72) * scale);
      const radiusY = Math.max(3, hold.scale * (6 / 72) * scale);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.48)';
      ctx.lineWidth = Math.max(1.5, (2 / 72) * scale);
      ctx.beginPath();
      ctx.ellipse(0, -radiusY * 0.3, radiusX, radiusY, 0, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderFinishRays(
    ctx: CanvasRenderingContext2D,
    centerScreen: Vec2D,
    scale: number
  ): void {
    // 4 rounded rays fanning above: green, orange, purple, magenta
    // rotated -40°, -15°, +10°, +35°
    const rayColors = ['#2A734D', '#FFA600', '#7B38BD', '#BB3659'];
    const angles = [-40, -15, 10, 35];
    const rayW = (6 / 72) * scale;
    const rayH = (22 / 72) * scale;
    const gap = (28 / 72) * scale;

    ctx.save();
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(centerScreen.x, centerScreen.y);
      ctx.rotate((angles[i] * Math.PI) / 180);
      ctx.translate(0, -gap - rayH / 2);

      ctx.fillStyle = rayColors[i];
      // Rounded pill ray
      ctx.beginPath();
      const r = rayW / 2;
      ctx.roundRect(-rayW / 2, -rayH / 2, rayW, rayH, r);
      ctx.fill();

      ctx.restore();
    }
    ctx.restore();
  }
}
