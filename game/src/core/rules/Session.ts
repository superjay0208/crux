import { FootId, HandId, LimbId } from '../data/schema';
import { ScoreResult } from './Scoring';

export type SessionState = 'Playing' | 'Falling' | 'Finished' | 'Paused' | 'Resetting';

export type GameEvent =
  | { type: 'Attached'; limb: LimbId; fromHold: string | null; toHold: string }
  | { type: 'Released'; limb: LimbId; hold: string | null }
  | { type: 'DragStarted'; limb: LimbId }
  | { type: 'DragEnded'; limb: LimbId }
  | { type: 'MoveCounted'; moves: number }
  | { type: 'CrimpSlipped'; hand: HandId; hold: string }
  | { type: 'FootSwapStarted'; incoming: FootId; outgoing: FootId; hold: string }
  | { type: 'FootSwapProgress'; incoming: FootId; progress: number; total: number }
  | { type: 'FootSwapCompleted'; incoming: FootId; outgoing: FootId; hold: string }
  | {
      type: 'FootSwapFailed';
      incoming: FootId;
      outgoing: FootId;
      hold: string;
      reason: 'miss' | 'timeout' | 'cancelled';
    }
  | { type: 'Exhausted' }
  | { type: 'Fell' }
  | { type: 'Finished'; result: ScoreResult }
  | { type: 'Reset' };

export type GameEventListener = (event: GameEvent) => void;

export class Session {
  private state: SessionState = 'Playing';
  private fallTimer = 0.0;
  private listeners: GameEventListener[] = [];

  readonly respawnDelay = 2.3; // Measured in original: ~2.3s

  getState(): SessionState {
    return this.state;
  }

  setState(newState: SessionState): void {
    this.state = newState;
    if (newState === 'Falling') {
      this.fallTimer = 0.0;
    }
  }

  isInteractive(): boolean {
    return this.state === 'Playing';
  }

  updateFall(dt: number): boolean {
    if (this.state === 'Falling') {
      this.fallTimer += dt;
      if (this.fallTimer >= this.respawnDelay) {
        return true; // Trigger reset
      }
    }
    return false;
  }

  addListener(listener: GameEventListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: GameEventListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  emit(event: GameEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in event listener:', err);
      }
    }
  }
}
