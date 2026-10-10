import { Camera } from '../render/Camera';
import { Simulation } from '../core/sim/Simulation';
import { Vec2D } from '../core/vec';

export class PointerInput {
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private sim: Simulation;
  private activePointerId: number | null = null;
  private disposed = false;

  // AbortController lets every listener (canvas + window + document) be torn down in one call,
  // and guarantees no stale handler can enqueue a command on a destroyed Simulation after
  // dispose() runs (docs/09 J2 / review R-02).
  private abortController = new AbortController();

  constructor(canvas: HTMLCanvasElement, camera: Camera, sim: Simulation) {
    this.canvas = canvas;
    this.camera = camera;
    this.sim = sim;

    this.bindEvents();
  }

  setSimulation(sim: Simulation): void {
    this.sim = sim;
  }

  /** Clears any in-progress drag without attempting a grab — used before Simulation.reset() so a
   * pointer that was already down doesn't leave a stale active pointer across the reset. */
  cancelActive(): void {
    if (this.activePointerId !== null) {
      try {
        this.canvas.releasePointerCapture(this.activePointerId);
      } catch {}
    }
    this.activePointerId = null;
    this.canvas.style.cursor = 'default';
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelActive();
    this.abortController.abort();
  }

  private getCanvasPos(e: PointerEvent): Vec2D {
    const rect = this.canvas.getBoundingClientRect();
    // Use CSS pixels relative to canvas top-left
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private bindEvents(): void {
    const signal = this.abortController.signal;

    this.canvas.addEventListener(
      'pointerdown',
      (e) => {
        // Primary left click or touch
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        this.activePointerId = e.pointerId;
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {}

        const screenPos = this.getCanvasPos(e);
        const worldPos = this.camera.screenToWorld(screenPos);
        this.canvas.style.cursor = this.sim.pickLimb(worldPos) ? 'grabbing' : 'default';

        this.sim.enqueueCommand({
          tick: this.sim.getTick(),
          type: 'down',
          pos: worldPos,
        });
      },
      { signal }
    );

    this.canvas.addEventListener(
      'pointermove',
      (e) => {
        if (this.activePointerId !== e.pointerId) {
          // Not dragging: this is a hover, not a drag input. Give the player a visible cue for
          // where a click actually does something — previously there was none, so a click that
          // missed a limb's small pick radius (and every click on the torso, which is not
          // pickable) looked identical to a working one, i.e. the game appeared unresponsive
          // (docs/09 J3; see TASKS.md log).
          if (this.activePointerId === null && e.pointerType === 'mouse') {
            const worldPos = this.camera.screenToWorld(this.getCanvasPos(e));
            const hovered = this.sim.pickLimb(worldPos);
            this.canvas.style.cursor = hovered ? 'grab' : 'default';
          }
          return;
        }

        const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
        for (const ev of coalesced) {
          const screenPos = this.getCanvasPos(ev);
          const worldPos = this.camera.screenToWorld(screenPos);

          this.sim.enqueueCommand({
            tick: this.sim.getTick(),
            type: 'move',
            pos: worldPos,
          });
        }
      },
      { signal }
    );

    this.canvas.addEventListener(
      'pointerleave',
      () => {
        if (this.activePointerId === null) this.canvas.style.cursor = 'default';
      },
      { signal }
    );

    const handlePointerUp = (e: PointerEvent) => {
      if (this.activePointerId !== e.pointerId) return;

      this.activePointerId = null;
      this.canvas.style.cursor = 'default';
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {}

      const screenPos = this.getCanvasPos(e);
      const worldPos = this.camera.screenToWorld(screenPos);

      this.sim.enqueueCommand({
        tick: this.sim.getTick(),
        type: 'up',
        pos: worldPos,
      });
    };

    this.canvas.addEventListener('pointerup', handlePointerUp, { signal });
    this.canvas.addEventListener('pointercancel', handlePointerUp, { signal });

    // Synthetic up on window blur or visibilitychange
    window.addEventListener(
      'blur',
      () => {
        if (this.activePointerId !== null) {
          this.activePointerId = null;
          this.sim.enqueueCommand({
            tick: this.sim.getTick(),
            type: 'up',
          });
        }
      },
      { signal }
    );

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden && this.activePointerId !== null) {
          this.activePointerId = null;
          this.sim.enqueueCommand({
            tick: this.sim.getTick(),
            type: 'up',
          });
        }
      },
      { signal }
    );

    // Prevent contextmenu
    this.canvas.addEventListener(
      'contextmenu',
      (e) => {
        e.preventDefault();
      },
      { signal }
    );
  }
}
