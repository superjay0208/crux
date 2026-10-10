import { LevelData, ProfileConfig, ReplayData } from '../../core/data/schema';
import { Simulation } from '../../core/sim/Simulation';
import { assetUrl } from '../../core/data/assets';
import { Camera } from '../../render/Camera';
import { WallRenderer } from '../../render/WallRenderer';
import { HoldRenderer } from '../../render/HoldRenderer';
import { ClimberRenderer } from '../../render/ClimberRenderer';
import { EffectsRenderer } from '../../render/EffectsRenderer';

/** Decorative replay player. Never creates gameplay inputs, audio or save listeners. */
export class StartScreen {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera = new Camera();
  private wall: WallRenderer;
  private holds: HoldRenderer;
  private climber: ClimberRenderer;
  private effects: EffectsRenderer;
  private sim: Simulation;
  private playlist: ReplayData[] = [];
  private index = 0;
  private last = 0;
  private pause = 0;
  private raf = 0;
  private disposed = false;
  private abort = new AbortController();
  private motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(parent: HTMLElement, private levels: LevelData[], private profile: ProfileConfig, onPlay: () => void) {
    this.root=document.createElement('section');
    this.root.className='start-screen';
    this.root.innerHTML=`<canvas class="demo-canvas" aria-hidden="true"></canvas><div class="start-shade"></div>
      <div class="start-content"><div class="eyebrow">ONE MOVE AT A TIME</div><h1>CRUX<span>↗</span></h1><p>Find your way up.</p>
      <button class="start-play" data-testid="start-play">PLAY <span>↗</span></button>
      <button class="start-controls" data-testid="start-controls" aria-expanded="false">Controls</button>
      <div class="start-control-copy" hidden>Drag a hand or shoe.<br>Hold Q / E on crimps.<br>Press Space on green to swap feet.</div></div>
      <div class="start-demo-label">LIVE CLIMB <span data-testid="demo-route"></span></div>`;
    parent.appendChild(this.root);
    this.canvas=this.root.querySelector('canvas')!;
    this.ctx=this.canvas.getContext('2d')!;
    this.wall=new WallRenderer(profile);this.holds=new HoldRenderer(profile);
    this.climber=new ClimberRenderer(profile);this.effects=new EffectsRenderer(profile);
    this.sim=new Simulation(levels[0],profile);this.holds.setLevel(levels[0]);
    this.root.querySelector('[data-testid="start-play"]')!.addEventListener('click',onPlay);
    this.root.querySelector('[data-testid="start-controls"]')!.addEventListener('click',event=>{
      const text=this.root.querySelector('.start-control-copy') as HTMLElement;text.hidden=!text.hidden;
      (event.currentTarget as HTMLElement).setAttribute('aria-expanded',String(!text.hidden));
    });
    window.addEventListener('resize',this.resize);
    document.addEventListener('visibilitychange',this.visibility);
    this.motion.addEventListener('change',this.motionChanged);
    this.resize();this.frame(performance.now());
    this.load();
  }

  private async load(): Promise<void> {
    try {
      const res=await fetch(assetUrl('demos/playlist.json'),{signal:this.abort.signal});
      if(!res.ok)throw new Error(`Demo HTTP ${res.status}`);
      const files=await res.json() as string[];
      this.playlist=await Promise.all(files.map(async file=>{
        const response=await fetch(assetUrl(`demos/${file}`),{signal:this.abort.signal});
        if(!response.ok)throw new Error(`Demo HTTP ${response.status}`);
        return response.json() as Promise<ReplayData>;
      }));
      if(!this.disposed&&this.playlist.length)this.setDemo();
    } catch(error) {
      if(!this.disposed)console.warn('Demo unavailable; showing still climbing wall.',error);
    }
  }

  private setDemo(): void {
    const replay=this.playlist[this.index];
    const level=this.levels.find(l=>l.id===replay.levelId)!;
    this.sim=new Simulation(level,this.profile);
    this.sim.enqueueCommands(replay.commands.map(c=>({...c,pos:c.pos?{x:c.pos[0],y:c.pos[1]}:undefined})));
    // Replays begin with a settling interval. Show its stable pose immediately, including
    // when reduced motion requests a still image rather than autoplay.
    const firstTick=Math.min(...replay.commands.map(c=>c.tick));
    for(let tick=0;tick<Math.min(30,firstTick);tick++)this.sim.stepTick();
    this.holds.setLevel(level);this.effects.clear();this.pause=0;
    this.sim.session.addListener(event=>this.effects.handleEvent(event,this.sim.getTick(),this.sim.climber));
    this.root.querySelector('[data-testid="demo-route"]')!.textContent=level.name;
    this.resize();
  }

  private resize = (): void => {
    const width=this.root.clientWidth,height=this.root.clientHeight,dpr=window.devicePixelRatio||1;
    this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);
    // Right side of the title screen gets its own world viewport.
    this.camera.updateViewport(width*.68,height,{...this.sim.level.camera,aspect:width*.68/height},dpr);
    this.paint();
  };
  private paint(): void {
    const w=this.root.clientWidth,h=this.root.clientHeight,dpr=this.camera.getDpr();
    const snap=this.sim.getInterpolatedSnapshot(this.sim.getInterpolationAlpha());
    this.camera.framePoints([...this.climber.getFramePoints(snap),...this.sim.level.holds.map(v=>({x:v.pos[0],y:v.pos[1]}))],30);
    this.ctx.save();this.ctx.scale(dpr,dpr);
    this.ctx.fillStyle='#202c35';this.ctx.fillRect(0,0,w,h);this.ctx.translate(w*.27,0);
    this.wall.render(this.ctx,w*.68,h,this.camera);this.holds.render(this.ctx,this.camera,snap.hoverCandidateHoldId,snap.hoverFootSwapHoldId);
    this.climber.render(this.ctx,this.camera,snap,null);this.effects.render(this.ctx,this.camera,snap);
    this.ctx.restore();this.root.dataset.demoTick=String(snap.tick);
  }
  private frame = (now: number): void => {
    if(this.disposed)return;
    const dt=this.last?Math.min((now-this.last)/1000,.05):0;this.last=now;
    if(!document.hidden&&!this.motion.matches) {
      this.sim.update(dt*.8);
      if(this.sim.session.getState()==='Finished'||this.sim.session.getState()==='Falling') {
        this.pause+=dt;
        if(this.pause>1.8&&this.playlist.length){this.index=(this.index+1)%this.playlist.length;this.setDemo();}
      }
    }
    this.paint();
    if(!this.motion.matches&&!document.hidden)this.raf=requestAnimationFrame(this.frame);
  };
  private visibility = (): void => {
    cancelAnimationFrame(this.raf);this.last=0;
    if(!document.hidden)this.frame(performance.now());
  };
  private motionChanged = (): void => {cancelAnimationFrame(this.raf);this.last=0;this.frame(performance.now());};
  destroy(): void {
    this.disposed=true;this.abort.abort();cancelAnimationFrame(this.raf);
    window.removeEventListener('resize',this.resize);document.removeEventListener('visibilitychange',this.visibility);
    this.motion.removeEventListener('change',this.motionChanged);this.root.remove();
  }
}
