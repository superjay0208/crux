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
