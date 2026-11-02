/**
 * 1€ (One Euro) Filter
 *
 * An adaptive first-order low-pass filter designed to remove jitter
 * at low speeds while eliminating lag at high speeds.
 * Reference: Casiez, Roussel, Vogel (CHI 2012)
 */

export interface OneEuroFilterParams {
  /**
   * Minimum cutoff frequency in Hz. Lower values reduce more jitter at low speeds.
   * Default: 1.0
   */
  minCutoff?: number;

  /**
   * Speed coefficient. Higher values reduce lag during fast movements.
   * Default: 0.007
   */
  beta?: number;

  /**
   * Cutoff frequency for derivative in Hz.
   * Default: 1.0
   */
  dCutoff?: number;
}

export class OneEuroFilter {
  public minCutoff: number;
  public beta: number;
  public dCutoff: number;

  private lastTimeMs: number | null = null;
  private xPrev: number | null = null;
  private dxPrev = 0;

  constructor(params: OneEuroFilterParams = {}) {
    this.minCutoff = params.minCutoff ?? 1.0;
    this.beta = params.beta ?? 0.007;
    this.dCutoff = params.dCutoff ?? 1.0;
  }

  /**
   * Calculates exponential smoothing factor alpha:
   * alpha = 1 / (1 + tau / dt), where tau = 1 / (2 * pi * cutoff)
   */
  private getAlpha(dtSec: number, cutoffHz: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoffHz);
    return 1.0 / (1.0 + tau / dtSec);
  }

  /**
   * Smooths the scalar signal `x` at given timestamp in milliseconds.
   *
   * @param x Current scalar measurement
   * @param timestampMs Timestamp in milliseconds
   * @returns Filtered (smoothed) scalar value
   */
  public filter(x: number, timestampMs: number): number {
    // Initial sample
    if (this.lastTimeMs === null || this.xPrev === null) {
      this.lastTimeMs = timestampMs;
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }

    const dtSec = (timestampMs - this.lastTimeMs) / 1000.0;
    this.lastTimeMs = timestampMs;

    // Reject non-positive delta time to prevent division by zero or negative smoothing
    if (dtSec <= 0) {
      return this.xPrev;
    }

    // 1. Estimate rate of change (derivative)
    const dx = (x - this.xPrev) / dtSec;

    // 2. Filter derivative with fixed cutoff dCutoff
    const alphaD = this.getAlpha(dtSec, this.dCutoff);
    const dxHat = alphaD * dx + (1.0 - alphaD) * this.dxPrev;
    this.dxPrev = dxHat;

    // 3. Adaptive cutoff frequency based on movement speed
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);

    // 4. Filter the signal with adaptive cutoff
    const alpha = this.getAlpha(dtSec, cutoff);
    const xHat = alpha * x + (1.0 - alpha) * this.xPrev;
    this.xPrev = xHat;

    return xHat;
  }

  /**
   * Reset filter internal state.
   */
  public reset(): void {
    this.lastTimeMs = null;
    this.xPrev = null;
    this.dxPrev = 0;
  }
}
