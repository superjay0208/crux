import { ProfileConfig } from '../data/schema';
import { clamp01 } from '../math';

export class StaminaModel {
  private value = 1.0;
  private fadeTimer = 0.0;
  private isVisible = false;

  constructor(private profile: ProfileConfig) {}

  getValue(): number {
    return this.value;
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  reset(): void {
    this.value = 1.0;
    this.fadeTimer = 0.0;
    this.isVisible = false;
  }

  spend(amount: number): void { this.value = clamp01(this.value - amount); }

  updateRealism(dt: number, dragging: boolean, effort: number, armLoad: number, oneHand: boolean,
    crimpHands: number, recovering: boolean): 'exhausted' | null {
    const cfg = this.profile.rules.realism!;
    this.isVisible = true;
    const previous = this.value;
    const loss = cfg.idleDrain + cfg.armLoadDrain * armLoad * armLoad * (oneHand ? 1.7 : 1) +
      crimpHands * .003 + (dragging ? cfg.moveDrain * (1 + armLoad + Math.min(3, effort) * .35) : 0);
    this.value = clamp01(this.value + dt * (recovering ? cfg.shakeRecover - loss : -loss));
    return previous > 0 && this.value <= 1e-9 ? (this.value = 0, 'exhausted') : null;
  }

  /**
   * Updates stamina integration for one tick
   * @returns 'exhausted' if stamina just depleted to 0, otherwise null
   */
  update(
    dt: number,
    isDragging: boolean,
    actuatorForce: number,
    totalMass: number,
    gravity: number
  ): 'exhausted' | null {
    const staminaCfg = this.profile.rules.stamina;
    if (staminaCfg.mode === 'off') {
      this.value = 1.0;
      this.isVisible = false;
      return null;
    }

    if (isDragging) {
      this.isVisible = true;
      this.fadeTimer = staminaCfg.fadeOutSeconds;

      let drainRate = staminaCfg.drainPerSecond;
      if (staminaCfg.drainBase !== undefined && staminaCfg.effortGain !== undefined) {
        const weight = totalMass * gravity;
        const effort = weight > 0 ? actuatorForce / weight : 0;
        drainRate = staminaCfg.drainBase * (1 + staminaCfg.effortGain * effort);
      }

      const prev = this.value;
      this.value = Math.max(0, this.value - drainRate * dt);

      if (prev > 0 && this.value === 0) {
        return 'exhausted';
      }
    } else {
      // Not dragging: refill
      if (this.value < 1.0) {
        this.value = Math.min(1.0, this.value + staminaCfg.refillPerSecond * dt);
        this.isVisible = true;
      } else {
        // At 1.0, count down fade
        if (this.fadeTimer > 0) {
          this.fadeTimer = Math.max(0, this.fadeTimer - dt);
          this.isVisible = this.fadeTimer > 0;
        } else {
          this.isVisible = false;
        }
      }
    }

    return null;
  }
}
