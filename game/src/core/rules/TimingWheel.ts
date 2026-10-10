/** All values are turns; zero is twelve o'clock and positive rotation is clockwise. */
export function wrapPhase(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function isInGreen(phase: number, center: number, width: number): boolean {
  const distance = Math.abs(wrapPhase(phase - center + 0.5) - 0.5);
  return distance <= width / 2 + 1e-12;
}
