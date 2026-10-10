/**
 * Seeded pseudo-random number generator (Mulberry32)
 */
export class Rng {
  private s: number;

  constructor(seed = 123456789) {
    this.s = seed | 0;
  }

  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  choice<T>(items: readonly T[]): T {
    const idx = Math.floor(this.next() * items.length);
    return items[idx];
  }
}
