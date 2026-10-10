import { LevelData, ProfileConfig } from '../data/schema';

export interface ScoreResult {
  moves: number;
  timeSeconds: number;
  star: boolean; // original profile single star
  moveStar?: boolean; // desktop profile
  timeStar?: boolean;
  elimStar?: boolean | null;
}

export class Scoring {
  private moves = 0;
  private timerSeconds = 0;
  private timerActive = false;
  private holdsUsed = new Set<string>();

  constructor(private level: LevelData, private profile: ProfileConfig) {
    // Record initial starting holds as used
    if (level.start.leftHand) this.holdsUsed.add(level.start.leftHand);
    if (level.start.rightHand) this.holdsUsed.add(level.start.rightHand);
    if (level.start.leftFoot) this.holdsUsed.add(level.start.leftFoot);
    if (level.start.rightFoot) this.holdsUsed.add(level.start.rightFoot);
  }

  getMoves(): number {
    return this.moves;
  }

  getTimeSeconds(): number {
    return this.timerSeconds;
  }

  isTimerActive(): boolean {
    return this.timerActive;
  }

  startTimer(): void {
    this.timerActive = true;
  }

  stopTimer(): void {
    this.timerActive = false;
  }

  tickTimer(dt: number): void {
    if (this.timerActive) {
      this.timerSeconds += dt;
    }
  }

  recordAttach(fromHold: string | null, toHold: string): boolean {
    this.holdsUsed.add(toHold);
    if (fromHold === toHold) {
      // Re-grab or adjustment on same hold does not count
      return false;
    }
    this.moves++;
    return true;
  }

  recordFailedGrab(): void {
    if (this.profile.rules.moveCounting.failedGrabCounts) {
      this.moves++;
    }
  }

  reset(): void {
    this.moves = 0;
    this.timerSeconds = 0;
    this.timerActive = false;
    this.holdsUsed.clear();
    if (this.level.start.leftHand) this.holdsUsed.add(this.level.start.leftHand);
    if (this.level.start.rightHand) this.holdsUsed.add(this.level.start.rightHand);
    if (this.level.start.leftFoot) this.holdsUsed.add(this.level.start.leftFoot);
    if (this.level.start.rightFoot) this.holdsUsed.add(this.level.start.rightFoot);
  }

  evaluateResult(): ScoreResult {
    const isOriginal = this.profile.id === 'original_browser';
    const moveThreshold = this.level.targets.moves;
    const moveStar = this.moves <= moveThreshold;

    let timeStar = false;
    if (this.level.targets.timeSeconds !== null) {
      timeStar = this.timerSeconds <= this.level.targets.timeSeconds;
    }

    let elimStar: boolean | null = null;
    if (this.level.targets.elimination) {
      const elim = this.level.targets.elimination;
      if (elim.hold) {
        elimStar = !this.holdsUsed.has(elim.hold);
      } else if (elim.maxHoldsUsed !== undefined) {
        elimStar = this.holdsUsed.size <= elim.maxHoldsUsed;
      }
    }

    return {
      moves: this.moves,
      timeSeconds: this.timerSeconds,
      star: moveStar,
      moveStar,
      timeStar,
      elimStar,
    };
  }

  static formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
