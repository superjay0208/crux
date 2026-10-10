import { ScoreResult } from '../../core/rules/Scoring';
import { HandId, LevelData } from '../../core/data/schema';
import { SimSnapshot } from '../../core/sim/Simulation';
import { Camera } from '../../render/Camera';

export interface PlayHudCallbacks {
  onRetry: () => void;
  onBack: () => void;
  onNext?: () => void;
  onSwapConfirm?: () => void;
}

export class PlayHud {
  private container: HTMLElement;
  private feedbackUntil = 0;
  private hands = new Map<HandId, HTMLElement>();
  private swap: HTMLElement;

  constructor(parent: HTMLElement, private levelName: string, targetMoves: number,
    private callbacks: PlayHudCallbacks, private showCrimpHud = false, private level?: LevelData) {
    this.container = document.createElement('div');
    this.container.className = 'play-hud-overlay';
    this.container.innerHTML = `
      <div class="route-heading"><span>CRUX / ${level?.group === 'PRACTICE' ? 'PRACTICE' : `ROUTE ${String(level?.order ?? 1).padStart(2,'0')}`}</span><h1>${levelName}</h1></div>
      <div class="route-goals" data-testid="route-goals"></div>
      <div class="reach-hint" data-testid="reach-hint" hidden>SWAP TO EXTEND</div>
      <div class="mechanic-feedback" data-testid="mechanic-feedback" role="status" hidden></div>
      <div class="hud-bottom-left">
        <button class="hud-btn" id="hud-back-btn" aria-label="Back to routes" title="Routes">←</button>
        <button class="hud-btn" id="hud-retry-btn" aria-label="Retry route" title="Retry">↻</button>
        <button class="hud-btn" id="hud-help-btn" aria-label="Show controls" title="Controls">?</button>
      </div>
      <div class="hud-controls" data-testid="controls" hidden>Drag limbs · Q / E crimp · Space swap · Esc cancel</div>
      <div class="hud-bottom-right"><div class="hud-moves-count" id="hud-moves-val">0</div><div class="hud-moves-line"></div><div class="hud-target-val">★${targetMoves}</div></div>
      ${this.handMarkup('left','Q')}${this.handMarkup('right','E')}
      <div class="limb-wheel foot-swap-qte" data-testid="foot-swap-qte" hidden>
        <svg class="timing-wheel" data-testid="timing-wheel" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="55" class="deadline-track"/>
          <circle cx="60" cy="60" r="55" pathLength="100" class="swap-deadline" transform="rotate(-90 60 60)"/>
          <circle cx="60" cy="60" r="43" class="wheel-track"/>
          <path class="wheel-green"/>
          <g class="wheel-needle"><path d="M60 60 L60 17"/><circle cx="60" cy="17" r="4"/></g>
        </svg>
        <button class="swap-stop" data-testid="swap-stop" aria-label="Stop foot swap wheel on green">␣</button>
      </div>
      <div class="hud-completion-panel" id="hud-completion" style="display:none"><h2 class="completion-level-name">${levelName}</h2><div class="completion-stat" id="completion-moves"></div><div class="completion-stat" id="completion-time"></div></div>`;
    parent.appendChild(this.container);
    this.swap = this.container.querySelector('[data-testid="foot-swap-qte"]')!;
    this.hands.set('leftHand',this.container.querySelector('[data-testid="crimp-left"]')!);
    this.hands.set('rightHand',this.container.querySelector('[data-testid="crimp-right"]')!);
    const bind = (selector: string, cb: () => void) => {
      const button = this.container.querySelector(selector)!;
      button.addEventListener('pointerdown',event=>event.stopPropagation());
      button.addEventListener('click',cb);
    };
    bind('#hud-back-btn',callbacks.onBack);
    bind('#hud-retry-btn',callbacks.onRetry);
    bind('[data-testid="swap-stop"]',()=>callbacks.onSwapConfirm?.());
    bind('#hud-help-btn',()=>{
      const controls=this.container.querySelector('[data-testid="controls"]') as HTMLElement;
      controls.hidden=!controls.hidden;
    });
  }

  private handMarkup(side: string,key: string): string {
    return `<div class="limb-wheel crimp-ring" data-testid="crimp-${side}" hidden>
      <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" class="grip-track"/><circle cx="32" cy="32" r="26" pathLength="100" class="grip-reserve" transform="rotate(-90 32 32)"/></svg>
      <kbd>${key}</kbd><span class="sr-only" role="progressbar" aria-label="${side} crimp reserve" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"></span></div>`;
  }

  private position(element: HTMLElement,camera: Camera,pos: {x:number;y:number},size: number): void {
    const p=camera.worldToScreen(pos);
    const width=this.container.clientWidth,height=this.container.clientHeight;
    element.style.left=`${Math.max(size/2+4,Math.min(width-size/2-4,p.x))}px`;
    element.style.top=`${Math.max(size/2+4,Math.min(height-size/2-4,p.y))}px`;
  }

  update(moves: number): void { this.container.querySelector('#hud-moves-val')!.textContent=String(moves); }

  updateMechanics(snap: SimSnapshot,camera: Camera): void {
    (this.container.querySelector('[data-testid="reach-hint"]') as HTMLElement).hidden=!snap.reachLimited;
    const feedback=this.container.querySelector('[data-testid="mechanic-feedback"]') as HTMLElement;
    if(performance.now()>this.feedbackUntil)feedback.hidden=true;
    const goals: string[]=[];
    if(this.level?.goals?.crimpHold)goals.push(`${snap.goals.crimp?'✓':'○'} GRIP`);
    if(this.level?.goals?.footSwaps)goals.push(`${snap.goals.footSwaps}/${this.level.goals.footSwaps} SWAP`);
    if(this.level?.finishSupportHold)goals.push(`${snap.goals.support?'✓':'○'} FOOT`);
    if(this.level?.goals?.checkpoints?.length)goals.push(`${snap.goals.checkpoints.length}/${this.level.goals.checkpoints.length} CONTACTS`);
    this.container.querySelector('[data-testid="route-goals"]')!.textContent=goals.join(' · ');
    for(const [hand,element] of this.hands) {
      const state=snap.crimp[hand];
      element.hidden=!this.showCrimpHud||(!state.onCrimp&&!state.intent&&state.reserve>=.999);
      this.position(element,camera,snap.limbs[hand].pos,58);
      const reserve=Math.max(0,Math.min(1,state.reserve));
      element.dataset.state=state.onCrimp?(state.engaged?'engaged':'grace'):state.reserve<.999?'recovering':'ready';
      element.dataset.warning=String(state.onCrimp&&(!state.engaged||reserve<.22));
      element.style.setProperty('--grip-color',`hsl(${state.onCrimp&&!state.engaged?0:reserve*125} 85% 61%)`);
      element.querySelector('.grip-reserve')!.setAttribute('stroke-dasharray',`${reserve*100} 100`);
      const progress=element.querySelector('[role="progressbar"]')!;
      progress.setAttribute('aria-valuenow',String(Math.round(reserve*100)));
      progress.setAttribute('aria-valuetext',`${state.engaged?'Full crimp':state.onCrimp?'Open grip':'Recovering'}, ${state.availableSeconds.toFixed(1)} seconds`);
      element.title=`${hand==='leftHand'?'Q':'E'} · ${state.availableSeconds.toFixed(1)}s`;
    }
    const swap=snap.footSwap;
    this.swap.hidden=!swap;
    if(!swap)return;
    this.position(this.swap,camera,snap.limbs[swap.incoming].pos,96);
    this.swap.dataset.limb=swap.incoming;
    this.swap.dataset.phase=swap.phase.toFixed(4);
    this.swap.dataset.inGreen=String(swap.inGreen);
    this.swap.querySelector('.wheel-needle')!.setAttribute('transform',`rotate(${swap.phase*360} 60 60)`);
    const point=(phase:number)=>`${60+43*Math.sin(phase*Math.PI*2)} ${60-43*Math.cos(phase*Math.PI*2)}`;
    this.swap.querySelector('.wheel-green')!.setAttribute('d',`M ${point(swap.targetCenter-swap.targetWidth/2)} A 43 43 0 ${swap.targetWidth>.5?1:0} 1 ${point(swap.targetCenter+swap.targetWidth/2)}`);
    this.swap.querySelector('.swap-deadline')!.setAttribute('stroke-dasharray',`${swap.remainingSeconds/swap.totalSeconds*100} 100`);
    this.swap.setAttribute('aria-label',`Foot swap, ${swap.remainingSeconds.toFixed(1)} seconds. Press Space on green.`);
  }

  showFeedback(text: string,good=true): void {
    const element=this.container.querySelector('[data-testid="mechanic-feedback"]') as HTMLElement;
    element.textContent=text;element.dataset.good=String(good);element.hidden=false;
    this.feedbackUntil=performance.now()+1000;
  }
  showCompletion(result: ScoreResult): void {
    this.container.querySelector('#completion-moves')!.textContent=`${result.moves} moves`;
    this.container.querySelector('#completion-time')!.textContent=`${Math.floor(result.timeSeconds/60)}:${String(Math.floor(result.timeSeconds%60)).padStart(2,'0')}`;
    (this.container.querySelector('#hud-completion') as HTMLElement).style.display='flex';
  }
  hideCompletion(): void {
    (this.container.querySelector('#hud-completion') as HTMLElement).style.display='none';
    this.feedbackUntil=0;
  }
  destroy(): void { this.container.remove(); }
}
