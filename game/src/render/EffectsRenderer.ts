import { SimSnapshot } from '../core/sim/Simulation';
import { ProfileConfig, LevelData } from '../core/data/schema';
import { Camera } from './Camera';
import { lerp } from '../core/math';
import { GameEvent } from '../core/rules/Session';
import { Climber } from '../core/sim/Climber';
import { Vec2D } from '../core/vec';
import { FootReachModel } from '../core/rules/FootReachModel';

export class EffectsRenderer {
  private profile: ProfileConfig;
  private bursts: Array<{ pos: Vec2D; tick: number; color: string; swap: boolean }> = [];
  private reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(profile: ProfileConfig, private level?: LevelData) {
    this.profile = profile;
  }

  render(ctx: CanvasRenderingContext2D, camera: Camera, snap: SimSnapshot): void {
    this.renderContacts(ctx, camera, snap);
    // The reserve ring is DOM-rendered at the hip for stable readable size at every zoom.
  }

  clear(): void { this.bursts = []; }

  handleEvent(event: GameEvent, tick: number, climber: Climber): void {
    if (event.type === 'Reset') { this.clear(); return; }
    const limb = event.type === 'Attached' ? event.limb : event.type === 'FootSwapCompleted' ? event.incoming : event.type === 'CrimpSlipped' ? event.hand : null;
    if (!limb) return;
    this.bursts.push({ pos: climber.getLimbPosition(limb), tick, color: event.type === 'CrimpSlipped' ? '#ffb86b' : '#e7f0e7', swap: event.type === 'FootSwapCompleted' });
    if (this.bursts.length > 24) this.bursts.shift();
  }

  private renderContacts(ctx: CanvasRenderingContext2D, camera: Camera, snap: SimSnapshot): void {
    ctx.save();
    const scale = camera.getScale();
    if (snap.support) for (const foot of ['leftFoot','rightFoot'] as const) {
      if (snap.limbs[foot].status !== 'attached') continue;
      const load = snap.support.feet[foot], p = camera.worldToScreen(snap.limbs[foot].pos);
      ctx.strokeStyle = load.load > .03 ? '#8cdec1' : '#ffb86b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(9,.17*scale),0,Math.PI*2); ctx.stroke();
      if (load.load > .03) { ctx.beginPath(); ctx.moveTo(p.x,p.y+9); ctx.lineTo(p.x,p.y+9+load.load*18); ctx.stroke(); }
    }
    if (snap.shake.hand && snap.shake.active) {
      const p = camera.worldToScreen(snap.limbs[snap.shake.hand].pos);
      const offset = this.reducedMotion ? 0 : Math.sin(snap.tick*.45)*3;
      ctx.strokeStyle = snap.shake.recovering ? '#8cdec1' : '#ffb86b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x+offset,p.y,13,Math.PI*.15,Math.PI*1.85); ctx.stroke();
    }
    if (snap.reachLimited && this.level?.movement) {
      const foot=snap.reachLimited;
      const angle=snap.torso.angle;
      const localHipX=this.profile.physics.hip[0]*(foot==='rightFoot'?1:-1);
      const localHipY=this.profile.physics.hip[1];
      const hip={x:snap.torso.pos.x+localHipX*Math.cos(angle)-localHipY*Math.sin(angle), y:snap.torso.pos.y+localHipX*Math.sin(angle)+localHipY*Math.cos(angle)};
      ctx.beginPath();
      for(let i=0;i<=100;i++) {
        const ray=i/100*Math.PI*2;
        const target={x:hip.x+Math.cos(ray)*3,y:hip.y+Math.sin(ray)*3};
        const p=camera.worldToScreen(FootReachModel.clamp(foot,target,hip,angle,this.profile.physics.legReach,this.level.movement).target);
        if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
      }
      ctx.closePath();ctx.strokeStyle='rgba(255,184,107,.45)';ctx.lineWidth=1.5;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);
    }
    for (const hand of ['leftHand', 'rightHand'] as const) {
      const grip = snap.crimp[hand];
      if (!grip.onCrimp) continue;
      const p = camera.worldToScreen(snap.limbs[hand].pos);
      ctx.strokeStyle = grip.engaged ? '#ffcf8e' : '#f28d66';
      ctx.globalAlpha = this.reducedMotion ? 0.85 : 0.7 + 0.18 * Math.sin(snap.tick * 0.09);
      ctx.lineWidth = grip.engaged ? 3 : 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.2 * scale, 0, Math.PI * 2); ctx.stroke();
      if (grip.engaged) {
        for (let finger = 0; finger < 3; finger++) {
          const x = p.x + (finger - 1) * 4;
          ctx.beginPath(); ctx.moveTo(x, p.y - 7); ctx.lineTo(x + 1, p.y + 3); ctx.stroke();
        }
      }
    }
    this.bursts = this.bursts.filter(burst => snap.tick - burst.tick < 84);
    for (const burst of this.bursts) {
      const age = Math.max(0, (snap.tick - burst.tick) / 84);
      const p = camera.worldToScreen(burst.pos);
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = burst.color;
      ctx.strokeStyle = burst.swap ? '#8cdec1' : burst.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, (0.18 + (this.reducedMotion ? 0 : age * 0.35)) * scale, 0, Math.PI * 2); ctx.stroke();
      if (!this.reducedMotion) for (let i = 0; i < 9; i++) {
        const angle = i * 2.399;
        const distance = age * (0.22 + (i % 3) * 0.12) * scale;
        ctx.beginPath(); ctx.arc(p.x + Math.cos(angle) * distance, p.y + Math.sin(angle) * distance + age * age * 12, 1.8 * (1 - age), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
}
