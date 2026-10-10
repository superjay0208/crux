import { LevelData, ProfileConfig } from './schema';

export class LevelLoader {
  static validateLevel(data: any): LevelData {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid level data: not an object');
    }
    if (typeof data.id !== 'string') throw new Error('Level missing id');
    if (!Array.isArray(data.holds)) throw new Error('Level missing holds array');
    if (!data.start || typeof data.start !== 'object') throw new Error('Level missing start object');
    if (!data.camera || typeof data.camera !== 'object') throw new Error('Level missing camera object');

    for (const hold of data.holds) {
      if (!hold || typeof hold !== 'object') {
        throw new Error('Level contains an invalid hold');
      }
      if (hold.grip !== undefined && hold.grip !== 'jug' && hold.grip !== 'crimp') {
        const holdLabel = typeof hold.id === 'string' ? ` ${hold.id}` : '';
        throw new Error(`Hold${holdLabel} has invalid grip: ${String(hold.grip)}`);
      }
    }

    const finishHolds = data.holds.filter((h: any) => h.finish);
    if (finishHolds.length !== 1) {
      throw new Error(`Level must contain exactly 1 finish hold, found ${finishHolds.length}`);
    }
    if (data.movement) {
      this.requireFiniteNumberAbove(data.movement.crossedReachFraction, 0, 'movement.crossedReachFraction');
      if (data.movement.crossedReachFraction > 1) throw new Error('crossedReachFraction must be at most 1');
      this.requireFiniteNumberAbove(data.movement.crossTransition, 0, 'movement.crossTransition');
    }
    if (finishHolds[0].capacity < 2 || !finishHolds[0].allowHands) throw new Error('Finish must allow two hands');
    for (const id of [data.goals?.crimpHold, data.finishSupportHold]) {
      if (id && !data.holds.some((hold: any) => hold.id === id)) throw new Error(`Unknown goal/support hold ${id}`);
    }
    if (data.goals?.crimpHold && !data.holds.some((h: any) => h.id === data.goals.crimpHold && h.grip === 'crimp' && h.allowHands)) throw new Error('Crimp goal must reference a hand crimp');
    if (data.finishSupportHold && !data.holds.some((h: any) => h.id === data.finishSupportHold && h.allowFeet)) throw new Error('Finish support must allow feet');
    if (data.goals?.footSwaps !== undefined && (!Number.isInteger(data.goals.footSwaps) || data.goals.footSwaps < 0)) throw new Error('footSwaps must be a non-negative integer');
    if (data.goals?.checkpoints !== undefined && (!Array.isArray(data.goals.checkpoints) || new Set(data.goals.checkpoints).size !== data.goals.checkpoints.length || data.goals.checkpoints.some((id: unknown)=>typeof id!=='string'||!data.holds.some((h:any)=>h.id===id)))) throw new Error('checkpoints must be unique known hold ids');

    return data as LevelData;
  }

  static validateProfile(data: any): ProfileConfig {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid profile data');
    }
    if (!data.id || !data.physics || !data.rules) {
      throw new Error('Profile missing required physics/rules fields');
    }
    if (!['original_browser','desktop','realism'].includes(data.id)) throw new Error('Unknown profile id');
    if (data.rules.finishEstablishSeconds !== undefined) this.requireFiniteNumberAtLeast(data.rules.finishEstablishSeconds, 0, 'finishEstablishSeconds');
    if (data.id === 'realism' && !data.rules.realism) throw new Error('Realism profile requires realism rules');
    if (data.rules.realism) {
      for (const key of ['idleDrain','armLoadDrain','moveDrain','handMoveCost','footMoveCost','shakeRecover',
        'restMinFootLoad','restMaxSpeed','finishMinFootLoad','legStiffness','legDamping','legForceCap','footFriction','footReachGraceSeconds']) {
        this.requireFiniteNumberAbove(data.rules.realism[key], 0, `realism.${key}`);
      }
      for (const key of ['restMinFootLoad','finishMinFootLoad','legForceCap']) if (data.rules.realism[key] > .92) throw new Error(`realism.${key} exceeds support limit`);
    }

    const crimp = data.rules.crimp;
    if (!crimp || typeof crimp !== 'object') {
      throw new Error('Profile missing required rules.crimp configuration');
    }
    this.requireFiniteNumberAbove(crimp.drainPerSecond, 0, 'rules.crimp.drainPerSecond');
    this.requireFiniteNumberAbove(crimp.recoverPerSecond, 0, 'rules.crimp.recoverPerSecond');
    this.requireFiniteNumberAtLeast(
      crimp.openGripGraceSeconds,
      0,
      'rules.crimp.openGripGraceSeconds'
    );
    this.requireFiniteNumberAbove(crimp.reengageFraction, 0, 'rules.crimp.reengageFraction');
    if (crimp.reengageFraction > 1) {
      throw new Error('Profile rules.crimp.reengageFraction must be at most 1');
    }

    const footSwap = data.rules.footSwap;
    if (!footSwap || typeof footSwap !== 'object') {
      throw new Error('Profile missing required rules.footSwap configuration');
    }
    if (typeof footSwap.enabled !== 'boolean') {
      throw new Error('Profile rules.footSwap.enabled must be a boolean');
    }
    this.requireFiniteNumberAbove(footSwap.windowSeconds, 0, 'rules.footSwap.windowSeconds');
    if (footSwap.revolutionsPerSecond !== undefined) this.requireFiniteNumberAbove(footSwap.revolutionsPerSecond, 0, 'rules.footSwap.revolutionsPerSecond');
    if (footSwap.targetCenter !== undefined && (!Number.isFinite(footSwap.targetCenter) || footSwap.targetCenter < 0 || footSwap.targetCenter >= 1)) throw new Error('targetCenter must be in [0,1)');
    if (footSwap.targetWidth !== undefined && (!Number.isFinite(footSwap.targetWidth) || footSwap.targetWidth <= 0 || footSwap.targetWidth > 1)) throw new Error('targetWidth must be in (0,1]');

    return data as ProfileConfig;
  }

  private static requireFiniteNumberAbove(value: unknown, minimum: number, path: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= minimum) {
      throw new Error(`Profile ${path} must be a finite number greater than ${minimum}`);
    }
  }

  private static requireFiniteNumberAtLeast(value: unknown, minimum: number, path: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
      throw new Error(`Profile ${path} must be a finite number at least ${minimum}`);
    }
  }
}
