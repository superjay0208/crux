import { Vec2D } from '../core/vec';
import { LevelCamera } from '../core/data/schema';

export class Camera {
  private canvasWidth = 1280;
  private canvasHeight = 720;
  private dpr = 1;

  // Viewport bounds in canvas CSS pixels
  private vpX = 0;
  private vpY = 0;
  private vpW = 1280;
  private vpH = 720;

  // World parameters
  private worldCenterX = 0;
  private worldCenterY = 0;
  private worldHeight = 10;
  private worldAspect = 16 / 9;

  // Scale: canvas CSS pixels per world unit
  private scale = 72;

  updateViewport(
    canvasWidth: number,
    canvasHeight: number,
    cam: LevelCamera,
    dpr = 1
  ): void {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.dpr = dpr;

    this.worldCenterX = cam.center[0];
    this.worldCenterY = cam.center[1];
    this.worldHeight = cam.height;
    this.worldAspect = cam.aspect;

    // Calculate aspect-preserving letterboxed viewport
    const targetAspect = this.worldAspect;
    const windowAspect = canvasWidth / canvasHeight;

    if (windowAspect > targetAspect) {
      // Letterbox left/right
      this.vpH = canvasHeight;
      this.vpW = canvasHeight * targetAspect;
      this.vpX = (canvasWidth - this.vpW) / 2;
      this.vpY = 0;
    } else {
      // Letterbox top/bottom
      this.vpW = canvasWidth;
      this.vpH = canvasWidth / targetAspect;
      this.vpX = 0;
      this.vpY = (canvasHeight - this.vpH) / 2;
    }

    // Scale: world height maps to viewport height
    this.scale = this.vpH / this.worldHeight;
  }

  getScale(): number {
    return this.scale;
  }

  /** Expand only within an attempt. Minimal panning keeps dragging predictable. */
  framePoints(points: Vec2D[], padding = 54): void {
    const finite = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!finite.length) return;
    const minX = Math.min(...finite.map(p => p.x));
    const maxX = Math.max(...finite.map(p => p.x));
    const minY = Math.min(...finite.map(p => p.y));
    const maxY = Math.max(...finite.map(p => p.y));
    const px = Math.min(padding, this.vpW * .15);
    const py = Math.min(padding + 24, this.vpH * .2);
    const safeW = this.vpW - 2 * px;
    const safeH = this.vpH - 2 * py;
    const required = Math.max((maxY - minY) * this.vpH / safeH,
      (maxX - minX) * this.vpH / safeW);
    this.worldHeight = Math.max(this.worldHeight, required);
    this.scale = this.vpH / this.worldHeight;
    const hx = safeW / this.scale / 2;
    const hy = safeH / this.scale / 2;
    this.worldCenterX = Math.max(maxX - hx, Math.min(minX + hx, this.worldCenterX));
    this.worldCenterY = Math.max(maxY - hy, Math.min(minY + hy, this.worldCenterY));
  }

  getDpr(): number {
    return this.dpr;
  }

  getViewport(): { x: number; y: number; w: number; h: number } {
    return { x: this.vpX, y: this.vpY, w: this.vpW, h: this.vpH };
  }

  worldToScreen(worldPos: Vec2D): Vec2D {
    // World: (0, 0) is at worldCenter, +Y is up
    // Screen: (vpX + vpW / 2, vpY + vpH / 2) is center, +Y is down
    const dx = worldPos.x - this.worldCenterX;
    const dy = worldPos.y - this.worldCenterY;

    return {
      x: this.vpX + this.vpW / 2 + dx * this.scale,
      y: this.vpY + this.vpH / 2 - dy * this.scale,
    };
  }

  screenToWorld(screenPos: Vec2D): Vec2D {
    const screenCenterX = this.vpX + this.vpW / 2;
    const screenCenterY = this.vpY + this.vpH / 2;

    const dx = (screenPos.x - screenCenterX) / this.scale;
    const dy = (screenCenterY - screenPos.y) / this.scale;

    return {
      x: this.worldCenterX + dx,
      y: this.worldCenterY + dy,
    };
  }

  worldToScreenDist(dist: number): number {
    return dist * this.scale;
  }
}
