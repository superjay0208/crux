import { ProfileConfig } from '../core/data/schema';
import { Camera } from './Camera';

export class WallRenderer {
  private wallColor: string;

  constructor(profile: ProfileConfig) {
    this.wallColor = profile.visual.palette.wall ?? (profile.id === 'original_browser' ? '#DDD0B4' : '#F8F8F8');
  }

  render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, camera: Camera): void {
    // Fill full canvas with wall color so letterboxing blends seamlessly without black bars
    ctx.fillStyle = this.wallColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = 'rgba(164,192,202,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvasWidth; x += 220) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 50, canvasHeight); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(164,192,202,0.13)';
    for (let x = 28; x < canvasWidth; x += 80) for (let y = 28; y < canvasHeight; y += 80) {
      ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill();
    }
  }
}
