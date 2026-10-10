import { HandId, ProfileRules } from '../data/schema';
import { clamp01 } from '../math';

export interface CrimpHandState {
  reserve: number;
  intent: boolean;
  onCrimp: boolean;
  engaged: boolean;
  graceRemaining: number;
  exhausted: boolean;
  availableSeconds: number;
}

export type CrimpSnapshot = Record<HandId, CrimpHandState>;
export type HoldingCrimpByHand = Record<HandId, boolean>;

interface MutableCrimpHandState {
  reserve: number;
  intent: boolean;
  onCrimp: boolean;
  graceRemaining: number;
  exhausted: boolean;
  slipIssued: boolean;
}

const HANDS: readonly HandId[] = ['leftHand', 'rightHand'];

/**
 * Fixed-step, Planck-free model for the two independent full-crimp resources.
 * The caller owns contact state and releases any hands returned by update().
 */
export class CrimpModel {
  private readonly hands: Record<HandId, MutableCrimpHandState> = {
    leftHand: this.createInitialHandState(),
    rightHand: this.createInitialHandState(),
  };

  constructor(private readonly config: ProfileRules['crimp']) {}

  setIntent(hand: HandId, active: boolean): void {
    this.hands[hand].intent = active;
  }

  /**
   * Advances both hands by one fixed step and returns newly slipped hands.
   * A hand slips once when its grace reaches the exact zero boundary.
   */
  update(dt: number, holdingCrimpByHand: HoldingCrimpByHand): HandId[] {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error('CrimpModel dt must be a finite, non-negative number');
    }

    const slipped: HandId[] = [];

    for (const hand of HANDS) {
      const state = this.hands[hand];
      const holdingCrimp = holdingCrimpByHand[hand];

      if (holdingCrimp && !state.onCrimp) {
        state.onCrimp = true;
        state.graceRemaining = this.config.openGripGraceSeconds;
        state.slipIssued = false;
      } else if (!holdingCrimp && state.onCrimp) {
        state.onCrimp = false;
        state.graceRemaining = 0;
        state.slipIssued = false;
      }

      if (!state.onCrimp) {
        state.reserve = clamp01(state.reserve + this.config.recoverPerSecond * dt);
        if (state.exhausted && !state.intent && state.reserve >= this.config.reengageFraction) {
          state.exhausted = false;
        }
        continue;
      }

      const engagedAtStart = state.intent && !state.exhausted && state.reserve > 0;
      if (engagedAtStart) {
        // An engaged crimp continually restores the short open-grip transition window.
        state.graceRemaining = this.config.openGripGraceSeconds;
        state.reserve = clamp01(state.reserve - this.config.drainPerSecond * dt);
        if (state.reserve === 0) {
          state.exhausted = true;
        }
        continue;
      }

      // The epsilon keeps a nominal N-tick duration from taking N+1 ticks because
      // values such as 0.75 and 1/120 are not exactly representable in binary.
      const reachesBoundary = state.graceRemaining <= dt + 1e-12;
      state.graceRemaining = reachesBoundary ? 0 : state.graceRemaining - dt;
      if (reachesBoundary && !state.slipIssued) {
        state.slipIssued = true;
        slipped.push(hand);
      }
    }

    return slipped;
  }

  reset(): void {
    for (const hand of HANDS) {
      this.hands[hand] = this.createInitialHandState();
    }
  }

  getReserve(hand: HandId): number {
    return this.hands[hand].reserve;
  }

  getAvailableSeconds(hand: HandId): number {
    return this.hands[hand].reserve / this.config.drainPerSecond;
  }

  isEngaged(hand: HandId): boolean {
    const state = this.hands[hand];
    return state.onCrimp && state.intent && !state.exhausted && state.reserve > 0;
  }

  getState(hand: HandId): CrimpHandState {
    const state = this.hands[hand];
    return {
      reserve: state.reserve,
      intent: state.intent,
      onCrimp: state.onCrimp,
      engaged: this.isEngaged(hand),
      graceRemaining: state.graceRemaining,
      exhausted: state.exhausted,
      availableSeconds: this.getAvailableSeconds(hand),
    };
  }

  snapshot(): CrimpSnapshot {
    return {
      leftHand: this.getState('leftHand'),
      rightHand: this.getState('rightHand'),
    };
  }

  private createInitialHandState(): MutableCrimpHandState {
    return {
      reserve: 1,
      intent: false,
      onCrimp: false,
      graceRemaining: 0,
      exhausted: false,
      slipIssued: false,
    };
  }
}
