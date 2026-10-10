export type AudioEventName = 'grab' | 'release' | 'fall' | 'finish' | 'click' | 'swap' | 'miss';

export class AudioBank {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private volume = 0.8;

  constructor() {
    // AudioContext created on first gesture or demand
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  unlock(): void {
    this.ensureContext();
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  play(event: AudioEventName): void {
    if (this.isMuted || this.volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      switch (event) {
        case 'swap':
          this.playClick(ctx, now);
          this.playGrab(ctx, now + 0.055);
          break;
        case 'miss':
          this.playRelease(ctx, now);
          this.playRelease(ctx, now + 0.06);
          break;
        case 'grab':
          this.playGrab(ctx, now);
          break;
        case 'release':
          this.playRelease(ctx, now);
          break;
        case 'fall':
          this.playFall(ctx, now);
          break;
        case 'finish':
          this.playFinish(ctx, now);
          break;
        case 'click':
          this.playClick(ctx, now);
          break;
      }
    } catch (e) {
      // Audio playback failed silently
    }
  }

  private playGrab(ctx: AudioContext, t: number): void {
    // Soft low-frequency thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);

    gain.gain.setValueAtTime(0.35 * this.volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  private playRelease(ctx: AudioContext, t: number): void {
    // Very short high-frequency tick/scuff
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.04);

    gain.gain.setValueAtTime(0.15 * this.volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.04);
  }

  private playFall(ctx: AudioContext, t: number): void {
    // Comedic downward glide ("uh!")
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.35);

    gain.gain.setValueAtTime(0.3 * this.volume, t);
    gain.gain.linearRampToValueAtTime(0.35 * this.volume, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  private playFinish(ctx: AudioContext, t: number): void {
    // Cheerful 2-note chime: C5 (523Hz) -> G5 (784Hz)
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.4 * this.volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + dur);
    };

    playTone(523.25, t, 0.25);
    playTone(783.99, t + 0.18, 0.4);
  }

  private playClick(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    gain.gain.setValueAtTime(0.1 * this.volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.02);
  }
}
