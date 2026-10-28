/*
 * Complex polynomial root finder: Laguerre's method with deflation, followed
 * by polishing against the undeflated polynomial (same strategy as Praat's
 * Polynomial_to_Roots). SPDX-License-Identifier: GPL-2.0-or-later
 */

export class RootFinder {
  private readonly cr: Float64Array;
  private readonly ci: Float64Array;
  private readonly wr: Float64Array;
  private readonly wi: Float64Array;
  private lr = 0;
  private li = 0;

  constructor(readonly degree: number) {
    this.cr = new Float64Array(degree + 1);
    this.ci = new Float64Array(degree + 1);
    this.wr = new Float64Array(degree + 1);
    this.wi = new Float64Array(degree + 1);
  }

  /**
   * Roots of z^m - c1 z^(m-1) - ... - cm (c = predictor coefficients, 1-based).
   * Writes roots to outRe/outIm (length m).
   */
  solveFromPredictor(c: Float64Array, outRe: Float64Array, outIm: Float64Array): void {
    const m = this.degree;
    for (let j = 0; j <= m; j++) { this.cr[j] = j === m ? 1 : -c[m - j]; this.ci[j] = 0; }
    for (let j = 0; j <= m; j++) { this.wr[j] = this.cr[j]; this.wi[j] = 0; }
    let deg = m;
    for (let r = 0; r < m; r++) {
      this.laguerre(this.wr, this.wi, deg, 0, 0);
      let xr = this.lr;
      let xi = this.li;
      if (Math.abs(xi) <= 2e-14 * Math.abs(xr)) xi = 0;
      outRe[r] = xr; outIm[r] = xi;
      // forward deflation
      let br = this.wr[deg];
      let bi = this.wi[deg];
      for (let j = deg - 1; j >= 0; j--) {
        const cr = this.wr[j], ci = this.wi[j];
        this.wr[j] = br; this.wi[j] = bi;
        const nr = br * xr - bi * xi + cr;
        const ni = br * xi + bi * xr + ci;
        br = nr; bi = ni;
      }
      deg--;
    }
    // polish
    for (let r = 0; r < m; r++) {
      this.laguerre(this.cr, this.ci, m, outRe[r], outIm[r]);
      outRe[r] = this.lr; outIm[r] = this.li;
    }
  }

  private laguerre(pr: Float64Array, pi: Float64Array, m: number, x0r: number, x0i: number): void {
    let xr = x0r, xi = x0i;
    const MR = 8, MT = 10, MAXIT = MR * MT;
    const frac = [0, 0.5, 0.25, 0.75, 0.13, 0.38, 0.62, 0.88, 1.0];
    for (let iter = 1; iter <= MAXIT; iter++) {
      let br = pr[m], bi = pi[m];
      let err = Math.hypot(br, bi);
      let dr = 0, di = 0, fr = 0, fi = 0;
      const abx = Math.hypot(xr, xi);
      for (let j = m - 1; j >= 0; j--) {
        // f = x*f + d
        let t = xr * fr - xi * fi + dr; fi = xr * fi + xi * fr + di; fr = t;
        // d = x*d + b
        t = xr * dr - xi * di + br; di = xr * di + xi * dr + bi; dr = t;
        // b = x*b + a[j]
        t = xr * br - xi * bi + pr[j]; bi = xr * bi + xi * br + pi[j]; br = t;
        err = Math.hypot(br, bi) + abx * err;
      }
      err *= 1e-15;
      const ab = Math.hypot(br, bi);
      if (ab <= err) break;
      // g = d/b
      const b2 = br * br + bi * bi;
      const gr = (dr * br + di * bi) / b2;
      const gi = (di * br - dr * bi) / b2;
      const g2r = gr * gr - gi * gi;
      const g2i = 2 * gr * gi;
      // h = g2 - 2 f/b
      const fbr = (fr * br + fi * bi) / b2;
      const fbi = (fi * br - fr * bi) / b2;
      const hr = g2r - 2 * fbr;
      const hi = g2i - 2 * fbi;
      // sq = sqrt((m-1)(m h - g2))
      const sr0 = (m - 1) * (m * hr - g2r);
      const si0 = (m - 1) * (m * hi - g2i);
      const mag = Math.hypot(sr0, si0);
      let sqr = Math.sqrt(Math.max(0, (mag + sr0) / 2));
      let sqi = Math.sqrt(Math.max(0, (mag - sr0) / 2));
      if (si0 < 0) sqi = -sqi;
      let gpr = gr + sqr, gpi = gi + sqi;
      const gmr = gr - sqr, gmi = gi - sqi;
      let abp = Math.hypot(gpr, gpi);
      const abm = Math.hypot(gmr, gmi);
      if (abp < abm) { gpr = gmr; gpi = gmi; abp = abm; }
      let dxr: number, dxi: number;
      if (abp > 0) {
        const d2 = gpr * gpr + gpi * gpi;
        dxr = (m * gpr) / d2;
        dxi = (-m * gpi) / d2;
      } else {
        const s = 1 + abx;
        dxr = s * Math.cos(iter);
        dxi = s * Math.sin(iter);
      }
      const nxr = xr - dxr, nxi = xi - dxi;
      if (nxr === xr && nxi === xi) break;
      if (iter % MT) { xr = nxr; xi = nxi; }
      else { xr -= frac[iter / MT] * dxr; xi -= frac[iter / MT] * dxi; }
    }
    this.lr = xr; this.li = xi;
  }
}
