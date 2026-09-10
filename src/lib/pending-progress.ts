/**
 * Continuous in-flight progress that never freezes at a fixed percent.
 *
 * Maps elapsed time → [0, 1) with fast early motion, then diminishing
 * returns that keep creeping while work is still running. Reaches ~63% at
 * `characteristicMs`, ~86% at 2×, ~95% at 3× — always advancing, never
 * parking at a magic cap like 92%.
 *
 * Callers should animate to 1 only after real work completes.
 */
export function asymptoticPendingProgress(
  elapsedMs: number,
  characteristicMs: number,
): number {
  if (elapsedMs <= 0 || characteristicMs <= 0) {
    return 0;
  }

  // Primary ease: 1 - e^(-t/τ) — always has positive velocity.
  const primary = 1 - Math.exp(-elapsedMs / characteristicMs);

  // Extra slow creep so long waits keep ticking past mid/high nineties
  // instead of visually stalling when the exponential flattens.
  const creep =
    0.06 * (1 - 1 / (1 + elapsedMs / (characteristicMs * 3)));

  return Math.min(0.994, primary * 0.94 + creep);
}
