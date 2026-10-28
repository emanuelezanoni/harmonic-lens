/*
 * Burg linear-prediction analysis (algorithm as in Praat's LPC Burg:
 * melder/LPC + fon/Sound_to_LPC.cpp, Marple-style reflection coefficients).
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

export class Burg {
  private readonly b1: Float64Array;
  private readonly b2: Float64Array;
  private readonly aa: Float64Array;

  constructor(maxSamples: number, readonly order: number) {
    this.b1 = new Float64Array(maxSamples);
    this.b2 = new Float64Array(maxSamples);
    this.aa = new Float64Array(order + 1);
  }

  /**
   * Predictor coefficients a[1..order] such that x[n] ~ sum a[j] x[n-j].
   * `a` has length order+1 (index 0 unused). Returns false when degenerate.
   */
  run(x: Float64Array, n: number, a: Float64Array): boolean {
    const m = this.order;
    if (n <= m + 1) return false;
    const { b1, b2, aa } = this;
    a.fill(0);
    let energy = 0;
    for (let i = 0; i < n; i++) energy += x[i] * x[i];
    if (!(energy > 1e-20)) return false;
    b1[0] = x[0];
    b2[n - 2] = x[n - 1];
    for (let j = 1; j < n - 1; j++) { b1[j] = x[j]; b2[j - 1] = x[j]; }
    for (let i = 1; i <= m; i++) {
      let num = 0;
      let den = 0;
      const lim = n - i;
      for (let j = 0; j < lim; j++) {
        num += b1[j] * b2[j];
        den += b1[j] * b1[j] + b2[j] * b2[j];
      }
      if (!(den > 0)) return false;
      const k = (2 * num) / den;
      a[i] = k;
      for (let j = 1; j < i; j++) aa[j] = a[j];
      for (let j = 1; j < i; j++) a[j] = aa[j] - k * aa[i - j];
      if (i < m) {
        for (let j = 0; j < lim - 1; j++) {
          b1[j] -= k * b2[j];
          b2[j] = b2[j + 1] - k * b1[j + 1];
        }
      }
    }
    return true;
  }
}
