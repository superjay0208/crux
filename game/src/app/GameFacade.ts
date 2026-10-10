import { Simulation } from '../core/sim/Simulation';
import { Camera } from '../render/Camera';
import { WallRenderer } from '../render/WallRenderer';
import { HoldRenderer } from '../render/HoldRenderer';
import { ClimberRenderer } from '../render/ClimberRenderer';
import { EffectsRenderer } from '../render/EffectsRenderer';
import { PointerInput } from '../input/PointerInput';
import { KeyboardInput } from '../input/KeyboardInput';
import { PlayHud } from '../ui/screens/PlayHud';
import { LevelData, ProfileConfig } from '../core/data/schema';

export interface GameFacadeOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  level: LevelData;
  profile: ProfileConfig;
  onBack: () => void;
  onFinished?: () => void;
}

export class GameFacade {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly container: HTMLElement;
  readonly profile: ProfileConfig;

  private level: LevelData;
  private sim: Simulation;
  private camera: Camera;
  private wallRenderer: WallRenderer;
  private holdRenderer: HoldRenderer;
  private climberRenderer: ClimberRenderer;
  private effectsRenderer: EffectsRenderer;
  private pointerInput: PointerInput;
  private keyboardInput: KeyboardInput;
  private hud: PlayHud;

  private animFrameId: number | null = null;
  private lastTime = 0;
  private isRunning = false;

  // Bumped on every reset() so a stale "return to menu after Finished" timer (see Router) can
  // tell whether the player has since retried into a new attempt (docs/09 J2).
  private attemptId = 0;

  constructor(options: GameFacadeOptions) {
    this.canvas = options.canvas;
    this.container = options.container;
    this.level = options.level;
    this.profile = options.profile;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2D context');
    this.ctx = ctx;

    this.camera = new Camera();
    this.wallRenderer = new WallRenderer(this.profile);
    this.holdRenderer = new HoldRenderer(this.profile);
    this.climberRenderer = new ClimberRenderer(this.profile);
    this.effectsRenderer = new EffectsRenderer(this.profile, this.level);

    this.sim = new Simulation(this.level, this.profile);
    this.holdRenderer.setLevel(this.level);

    this.pointerInput = new PointerInput(this.canvas, this.camera, this.sim);
    this.keyboardInput = new KeyboardInput(this.sim);

    this.hud = new PlayHud(
      this.container,
      this.level.name,
      this.level.targets.moves,
      {
        onRetry: () => this.reset(),
        onBack: () => options.onBack(),
        onSwapConfirm: () => this.sim.enqueueCommand({ tick: this.sim.getTick(), type: 'swap_confirm' }),
      },
      this.level.holds.some((hold) => hold.grip === 'crimp'),
      this.level,
      !!this.profile.rules.realism
    );

    this.sim.session.addListener((event) => {
      this.effectsRenderer.handleEvent(event, this.sim.getTick(), this.sim.climber);
      if (event.type === 'FootSwapCompleted') this.hud.showFeedback('CLEAN SWAP · Leg freed');
      if (event.type === 'FootSwapFailed' && event.reason !== 'cancelled') this.hud.showFeedback(event.reason === 'timeout' ? 'TOO LATE · Support kept' : 'MISSED GREEN · Support kept', false);
      if (event.type === 'MoveCounted') {
        this.hud.update(event.moves);
      } else if (event.type === 'Finished') {
        this.hud.showCompletion(event.result);
        if (options.onFinished) options.onFinished();
      } else if (event.type === 'Reset') {
        this.effectsRenderer.clear();
        this.hud.hideCompletion();
        this.hud.update(0);
      }
    });

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.handleResize();
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  private handleVisibility = (): void => {
    this.lastTime = performance.now();
    if (document.hidden) { this.pointerInput.cancelActive(); this.keyboardInput.cancelActive(); }
  };

  getSimulation(): Simulation {
    return this.sim;
  }

  getAttemptId(): number {
    return this.attemptId;
  }

  getCamera(): Camera {
    return this.camera;
  }

  handleResize(): void {
    const dpr = window.devicePixelRatio || 1;

    // Measure the container, never the canvas itself. The canvas carries no CSS size, so its
    // width/height attributes double as its layout size — measuring the canvas and writing
    // (measured * dpr) back into it scaled the element up by dpr on every call, while the camera
    // kept modelling the pre-multiplied size. At 125% display scaling that painted the world 1.25x
    // larger than the camera's model, so screenToWorld converted clicks with the wrong scale and
    // every limb sat ~180px away from where clicking said it was (see TASKS.md).
    const rect = this.container.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width || 1280));
    const cssH = Math.max(1, Math.round(rect.height || 720));

    // Explicit CSS size decouples layout size from buffer size, so this is idempotent.
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);

    this.camera.updateViewport(cssW, cssH, this.level.camera, dpr);
  }

  loadLevel(level: LevelData): void {
    this.level = level;
    this.sim = new Simulation(level, this.profile);
    this.holdRenderer.setLevel(level);
    this.pointerInput.setSimulation(this.sim);
    this.keyboardInput.setSimulation(this.sim);
    this.handleResize();
    this.reset();
  }

  reset(): void {
    this.attemptId++;
    this.pointerInput.cancelActive();
    this.keyboardInput.cancelActive();
    this.sim.reset();
    this.handleResize();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private loop(now: number): void {
    if (!this.isRunning) return;

    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // Step fixed simulation
    if (!document.hidden) this.sim.update(dt);

    // Render interpolated frame
    this.render();

    this.animFrameId = requestAnimationFrame(this.loop);
  }

  render(): void {
    const dpr = this.camera.getDpr();
    const alpha = this.sim.getInterpolationAlpha();
    const snap = this.sim.getInterpolatedSnapshot(alpha);

    if (snap.sessionState === 'Playing' || snap.sessionState === 'Finished') {
      this.camera.framePoints([...this.climberRenderer.getFramePoints(snap),
        ...this.level.holds.flatMap(h => [{x:h.pos[0]-.35,y:h.pos[1]-.35}, {x:h.pos[0]+.35,y:h.pos[1]+.35}])]);
    }

    this.ctx.save();
    this.ctx.scale(dpr, dpr);

    const vp = this.camera.getViewport();
    const canvasCssW = this.canvas.width / dpr;
    const canvasCssH = this.canvas.height / dpr;

    // 1. Wall Background
    this.wallRenderer.render(this.ctx, canvasCssW, canvasCssH, this.camera);

    // 2. Holds
    this.holdRenderer.render(
      this.ctx,
      this.camera,
      snap.hoverCandidateHoldId,
      snap.hoverFootSwapHoldId,
      snap.goals.checkpoints
    );

    // 3. Climber
    const activeLimb = (this.sim as any).activeDraggedLimb ?? null;
    this.climberRenderer.render(this.ctx, this.camera, snap, activeLimb);

    // 4. Effects (Stamina wheel)
    this.effectsRenderer.render(this.ctx, this.camera, snap);

    this.hud.updateMechanics(snap, this.camera);

    this.ctx.restore();
  }

  destroy(): void {
    this.stop();
    this.pointerInput.dispose();
    this.keyboardInput.dispose();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.hud.destroy();
  }
}

