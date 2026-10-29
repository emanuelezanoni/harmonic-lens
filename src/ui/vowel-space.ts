import type { AnalysisFrame } from "../dsp/analysis-protocol";

/** Indicative Italian vowel targets, adult male voice (F1/F2 in Hz). Scaled for shorter vocal tracts. */
export const vowelTargets = [
  { symbol: "i", f1: 290, f2: 2250 },
  { symbol: "e", f1: 400, f2: 2000 },
  { symbol: "ɛ", f1: 540, f2: 1850 },
  { symbol: "a", f1: 750, f2: 1300 },
  { symbol: "ɔ", f1: 560, f2: 1000 },
  { symbol: "o", f1: 420, f2: 850 },
  { symbol: "u", f1: 320, f2: 750 }
] as const;

/** Vocal-tract scaling of the targets by the selected voice type (max formant setting). */
export function voiceScale(maxFormantHz: number): number {
  if (maxFormantHz <= 5000) return 1;
  if (maxFormantHz <= 5500) return 1.13;
  return 1.35;
}

const bark = (hz: number) => (26.81 * hz) / (1960 + hz) - 0.53;
const f1Range = [180, 1000] as const;
const f2Range = [500, 3100] as const;

/** Classic vowel chart: F2 grows to the left, F1 grows downward; Bark spacing keeps /i e a o u/ spread out. */
export function vowelPosition(f1: number, f2: number): { x: number; y: number } {
  const x = 1 - (bark(clamp(f2, ...f2Range)) - bark(f2Range[0])) / (bark(f2Range[1]) - bark(f2Range[0]));
  const y = (bark(clamp(f1, ...f1Range)) - bark(f1Range[0])) / (bark(f1Range[1]) - bark(f1Range[0]));
  return { x, y };
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

/** Nearest target in chart space (so the match follows what the eye sees), with its normalised distance. */
export function nearestVowel(f1: number, f2: number, scale = 1): { symbol: string; distance: number } {
  const p = vowelPosition(f1, f2);
  let best = { symbol: vowelTargets[0].symbol as string, distance: Infinity };
  for (const t of vowelTargets) {
    const q = vowelPosition(t.f1 * scale, t.f2 * scale);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.distance) best = { symbol: t.symbol, distance: d };
  }
  return best;
}

type Point = { f1: number; f2: number; at: number };
const trailMs = 1400;
const matchRadius = 0.09;

/** F1 x F2 plane with a fading trail of recent voiced frames and the indicative target regions. */
export class VowelSpace {
  private readonly ctx: CanvasRenderingContext2D;
  private points: Point[] = [];
  private scale = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    this.ctx = ctx;
  }

  setVoiceScale(maxFormantHz: number): void { this.scale = voiceScale(maxFormantHz); }
  clear(): void { this.points = []; }

  push(frame: AnalysisFrame, now: number): void {
    const [a, b] = frame.formants;
    if (!a || !b || a.frequencyHz < 150 || a.frequencyHz > f1Range[1] || b.frequencyHz > f2Range[1] || b.frequencyHz < a.frequencyHz + 200) return;
    this.points.push({ f1: a.frequencyHz, f2: b.frequencyHz, at: now });
    if (this.points.length > 400) this.points.splice(0, this.points.length - 400);
  }

  /** Median of the last 5 points: one stray frame (onset/offset glitch) cannot move the "you are here" marker. */
  private current(): { f1: number; f2: number } | null {
    const recent = this.points.slice(-5);
    if (recent.length < 3) return null;
    const med = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1];
    return { f1: med(recent.map((p) => p.f1)), f2: med(recent.map((p) => p.f2)) };
  }

  draw(now: number): void {
    const { canvas, ctx } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w === 0 || h === 0) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const pad = 28 * dpr, W = w - 2 * pad, H = h - 2 * pad;
    const px = (p: { x: number; y: number }) => [pad + p.x * W, pad + p.y * H] as const;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a0d12"; ctx.fillRect(0, 0, w, h);
    // axes
    ctx.font = `${11 * dpr}px system-ui, sans-serif`; ctx.fillStyle = "#a9b6c6"; ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = dpr;
    for (const f2 of [2500, 2000, 1500, 1000, 700]) { const [x] = px(vowelPosition(1000, f2)); ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, pad + H); ctx.stroke(); ctx.textAlign = "center"; ctx.fillText(String(f2), x, h - 6 * dpr); }
    for (const f1 of [300, 500, 700, 900]) { const [, y] = px(vowelPosition(f1, 1500)); ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + W, y); ctx.stroke(); ctx.textAlign = "left"; ctx.fillText(String(f1), 3 * dpr, y - 3 * dpr); }
    ctx.fillStyle = "#c3cedb"; ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = "right"; ctx.fillText("← F2 (Hz)", w - 6 * dpr, 13 * dpr);
    ctx.textAlign = "left"; ctx.fillText("F1 (Hz) ↓", 6 * dpr, 13 * dpr);
    // fresh points, newest last
    this.points = this.points.filter((p) => now - p.at < trailMs);
    const last = this.current();
    const near = last ? nearestVowel(last.f1, last.f2, this.scale) : null;
    // targets
    for (const t of vowelTargets) {
      const [x, y] = px(vowelPosition(t.f1 * this.scale, t.f2 * this.scale));
      const hit = near !== null && near.symbol === t.symbol && near.distance < matchRadius;
      ctx.beginPath(); ctx.arc(x, y, matchRadius * W * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = hit ? "rgba(103,217,120,0.30)" : "rgba(111,211,255,0.12)"; ctx.fill();
      ctx.strokeStyle = hit ? "#67d978" : "rgba(111,211,255,0.55)"; ctx.lineWidth = (hit ? 2.5 : 1.5) * dpr; ctx.stroke();
      ctx.fillStyle = hit ? "#f2fff6" : "#d3deec"; ctx.font = `${(hit ? 20 : 17) * dpr}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(t.symbol, x, y); ctx.textBaseline = "alphabetic";
    }
    // trail
    for (const p of this.points) {
      const [x, y] = px(vowelPosition(p.f1, p.f2)); const age = (now - p.at) / trailMs;
      ctx.beginPath(); ctx.arc(x, y, (2 + 3 * (1 - age)) * dpr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(235,244,255,${(0.28 + 0.55 * (1 - age)).toFixed(3)})`; ctx.fill();
    }
    if (last) {
      const [x, y] = px(vowelPosition(last.f1, last.f2));
      ctx.beginPath(); ctx.arc(x, y, 7 * dpr, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.stroke();
    }
  }
}
