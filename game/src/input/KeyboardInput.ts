import { HandId, FootSwapKey } from '../core/data/schema';
import { Simulation } from '../core/sim/Simulation';

const CRIMP_KEYS: Readonly<Record<string, HandId>> = {
  KeyQ: 'leftHand',
  KeyE: 'rightHand',
};
const SHAKE_KEYS: Readonly<Record<string, HandId>> = { KeyZ: 'leftHand', KeyC: 'rightHand' };

const SWAP_KEYS = new Set<FootSwapKey>(['KeyA', 'KeyD']);

/**
 * Converts browser keyboard state into deterministic fixed-step commands.
 * The handler exists only while a PlayScreen is alive and owns all lifecycle cleanup.
 */
export class KeyboardInput {
  private pressedCrimpCodes = new Set<string>();
  private pressedShakeCodes = new Set<string>();
  private disposed = false;
  private abortController = new AbortController();

  constructor(private sim: Simulation) {
    this.bindEvents();
  }

  setSimulation(sim: Simulation): void {
    this.cancelActive();
    this.sim = sim;
  }

  cancelActive(): void {
    for (const code of this.pressedCrimpCodes) {
      const hand = CRIMP_KEYS[code];
      if (hand) this.enqueueCrimp(hand, false);
    }
    this.pressedCrimpCodes.clear();
    this.pressedShakeCodes.clear();
    this.sim.enqueueCommand({ tick: this.sim.getTick(), type: 'shake', active: false });
    this.sim.enqueueCommand({ tick: this.sim.getTick(), type: 'swap_cancel' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelActive();
    this.abortController.abort();
  }

  private enqueueCrimp(hand: HandId, active: boolean): void {
    this.sim.enqueueCommand({
      tick: this.sim.getTick(),
      type: 'crimp',
      hand,
      active,
    });
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    );
  }

  private bindEvents(): void {
    const signal = this.abortController.signal;

    window.addEventListener(
      'keydown',
      (event) => {
        if (
          this.isEditableTarget(event.target) ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        ) {
          return;
        }

        const hand = CRIMP_KEYS[event.code];
        if (hand) {
          event.preventDefault();
          if (event.repeat || this.pressedCrimpCodes.has(event.code)) return;
          this.pressedCrimpCodes.add(event.code);
          this.enqueueCrimp(hand, true);
          return;
        }

        const shake = SHAKE_KEYS[event.code];
        if (shake && this.sim.profile.rules.realism) {
          event.preventDefault();
          if (event.repeat || this.pressedShakeCodes.has(event.code)) return;
          this.pressedShakeCodes.add(event.code);
          this.sim.enqueueCommand({ tick: this.sim.getTick(), type: 'shake', hand: shake, active: true });
          return;
        }

        if (event.code === 'Space') {
          event.preventDefault();
          if (event.repeat) return;
          this.sim.enqueueCommand({
            tick: this.sim.getTick(),
            type: 'swap_confirm',
          });
          return;
        }

        if (event.code === 'Escape') {
          this.sim.enqueueCommand({ tick: this.sim.getTick(), type: 'swap_cancel' });
        }
      },
      { signal }
    );

    window.addEventListener(
      'keyup',
      (event) => {
        const shake = SHAKE_KEYS[event.code];
        if (shake && this.pressedShakeCodes.delete(event.code)) {
          event.preventDefault();
          this.sim.enqueueCommand({ tick: this.sim.getTick(), type: 'shake', hand: shake, active: false });
        }
        const hand = CRIMP_KEYS[event.code];
        if (!hand || !this.pressedCrimpCodes.has(event.code)) return;
        event.preventDefault();
        this.pressedCrimpCodes.delete(event.code);
        this.enqueueCrimp(hand, false);
      },
      { signal }
    );

    window.addEventListener('blur', () => this.cancelActive(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.cancelActive();
      },
      { signal }
    );
  }
}
