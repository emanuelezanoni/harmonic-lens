import type { AnalysisFrame } from "../dsp/analysis-protocol";

export const formantColors = ["#ff6b6b", "#5cff8a", "#5cc8ff"];
/** F4 and above are computed (the LPC needs them) but not drawn: too unstable to be useful. */
export const shownFormants = formantColors.length;
const pitchMinHz = 60, pitchMaxHz = 800, pitchGridHz = [100, 200, 400];
const pixelsPerSecond = 100;
const dynamicRangeDb = 60;
const maxQueue = 300;

type Rgb = [number, number, number];

export type Overlay = {
  harmonicColors: string[];
  harmonicEnabled: boolean[];
  showFormants: boolean;
};

/**
 * Scrolling spectrogram: one pixel column per 10 ms, newest on the right. Frames are
 * queued by the producer and painted once per animation frame in a single putImageData.
 */
export class SpectrogramView {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly queue: AnalysisFrame[] = [];
  private maxHz = 5000;
  private lastTimeS: number | null = null;
  private reference = -30;
  private readonly ramp: Uint8Array;

  private readonly pitchCtx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly freqAxis: HTMLElement, private readonly timeAxis: HTMLElement, private readonly pitchCanvas: HTMLCanvasElement, pitchAxis: HTMLElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    this.ctx = ctx;
    const pitchCtx = pitchCanvas.getContext("2d");
    if (!pitchCtx) throw new Error("Canvas 2D context unavailable.");
    this.pitchCtx = pitchCtx;
    for (const hz of pitchGridHz) {
      const tick = document.createElement("span");
      tick.textContent = `${hz} Hz`;
      tick.style.bottom = `${this.pitchFraction(hz) * 100}%`;
      pitchAxis.append(tick);
    }
    this.ramp = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i += 1) {
      const t = i / 255;
      this.ramp.set([8 + 170 * t, 10 + 175 * t, 16 + 185 * t], i * 3);
    }
    this.buildTimeAxis();
    this.clear();
  }

  get width(): number { return this.canvas.width; }

  setRange(maxHz: number): void {
    this.maxHz = maxHz;
    this.buildFrequencyAxis();
    this.clear();
  }

  clear(): void {
    this.queue.length = 0;
    this.lastTimeS = null;
    this.ctx.fillStyle = "#050608";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.pitchCtx.fillStyle = "#07090b";
    this.pitchCtx.fillRect(0, 0, this.pitchCanvas.width, this.pitchCanvas.height);
    this.pitchCtx.fillStyle = "rgba(255,255,255,0.12)";
    for (const hz of pitchGridHz) this.pitchCtx.fillRect(0, this.pitchY(hz), this.pitchCanvas.width, 1);
  }

  private pitchFraction(hz: number): number { return Math.log(hz / pitchMinHz) / Math.log(pitchMaxHz / pitchMinHz); }
  private pitchY(hz: number): number { return Math.round((1 - this.pitchFraction(hz)) * (this.pitchCanvas.height - 1)); }

  enqueue(frame: AnalysisFrame): void {
    this.queue.push(frame);
    if (this.queue.length > maxQueue) this.queue.splice(0, this.queue.length - maxQueue);
  }

  discardQueue(): void { this.queue.length = 0; this.lastTimeS = null; }

  /** Paint everything queued; returns number of frames painted. */
  paint(overlay: Overlay): number {
    const frames = this.queue.splice(0);
    if (frames.length === 0) return 0;
    const width = this.canvas.width, height = this.canvas.height;
    const columns: number[] = [];
    let total = 0;
    for (const frame of frames) {
      const dt = this.lastTimeS === null ? 1 / pixelsPerSecond : frame.timeS - this.lastTimeS;
      this.lastTimeS = frame.timeS;
      const dx = Math.max(1, Math.min(width, Math.round(dt * pixelsPerSecond)));
      columns.push(dx);
      total += dx;
    }
    if (total > width) total = width;
    const image = this.ctx.createImageData(total, height);
    const data = image.data;
    let x = 0;
    frames.forEach((frame, index) => {
      const dx = Math.min(columns[index], total - x);
      if (dx <= 0) return;
      this.referenceUpdate(frame.spectrum);
      this.drawColumn(data, total, x, dx, frame, overlay, height);
      x += dx;
    });
    if (total < width) this.ctx.drawImage(this.canvas, total, 0, width - total, height, 0, 0, width - total, height);
    this.ctx.putImageData(image, width - total, 0);
    this.paintPitch(frames, columns, total);
    return frames.length;
  }

  private paintPitch(frames: AnalysisFrame[], columns: number[], total: number): void {
    const width = this.pitchCanvas.width, height = this.pitchCanvas.height;
    if (total < width) this.pitchCtx.drawImage(this.pitchCanvas, total, 0, width - total, height, 0, 0, width - total, height);
    this.pitchCtx.fillStyle = "#07090b";
    this.pitchCtx.fillRect(width - total, 0, total, height);
    this.pitchCtx.fillStyle = "rgba(255,255,255,0.12)";
    for (const hz of pitchGridHz) this.pitchCtx.fillRect(width - total, this.pitchY(hz), total, 1);
    this.pitchCtx.fillStyle = "#ffffff";
    let x = width - total;
    frames.forEach((frame, index) => {
      const dx = Math.min(columns[index], width - x);
      if (frame.f0Hz !== null && frame.f0Hz >= pitchMinHz && frame.f0Hz <= pitchMaxHz) this.pitchCtx.fillRect(x, this.pitchY(frame.f0Hz) - 1, dx, 3);
      x += dx;
    });
  }

  private referenceUpdate(spectrum: Float32Array): void {
    let peak = -200;
    for (const v of spectrum) if (v > peak) peak = v;
    // Fast attack, slow release (~3 dB/s at 100 columns/s) keeps the display stable across silence.
    this.reference = Math.max(peak, this.reference - 0.03);
  }

  private drawColumn(data: Uint8ClampedArray, imageWidth: number, x0: number, dx: number, frame: AnalysisFrame, overlay: Overlay, height: number): void {
    const rows = frame.spectrum.length, floor = this.reference - dynamicRangeDb;
    for (let y = 0; y < height; y += 1) {
      const position = ((height - 1 - y) / (height - 1)) * (rows - 1);
      const lo = Math.floor(position), frac = position - lo;
      const db = frame.spectrum[lo] * (1 - frac) + frame.spectrum[Math.min(rows - 1, lo + 1)] * frac;
      const level = Math.max(0, Math.min(255, Math.round(((db - floor) / dynamicRangeDb) * 255)));
      for (let c = 0; c < dx; c += 1) {
        const o = (y * imageWidth + x0 + c) * 4;
        data[o] = this.ramp[level * 3]; data[o + 1] = this.ramp[level * 3 + 1]; data[o + 2] = this.ramp[level * 3 + 2]; data[o + 3] = 255;
      }
    }
    const mark = (frequencyHz: number | null | undefined, color: string, thickness: number, alpha = 1) => {
      if (frequencyHz === null || frequencyHz === undefined || !Number.isFinite(frequencyHz) || frequencyHz < 0 || frequencyHz > this.maxHz) return;
      const [r, g, b] = hex(color);
      const centre = Math.round((1 - frequencyHz / this.maxHz) * (height - 1));
      for (let dy = -Math.floor(thickness / 2); dy < Math.ceil(thickness / 2); dy += 1) {
        const y = centre + dy;
        if (y < 0 || y >= height) continue;
        for (let c = 0; c < dx; c += 1) {
          const o = (y * imageWidth + x0 + c) * 4;
          data[o] = data[o] * (1 - alpha) + r * alpha; data[o + 1] = data[o + 1] * (1 - alpha) + g * alpha; data[o + 2] = data[o + 2] * (1 - alpha) + b * alpha;
        }
      }
    };
    frame.theoreticalHz.forEach((hz, index) => { if (overlay.harmonicEnabled[index]) mark(hz, overlay.harmonicColors[index], 1, 0.6); });
    mark(frame.f0Hz, "#ffffff", 2);
    if (overlay.showFormants) frame.formants.slice(0, shownFormants).forEach((f, index) => mark(f.frequencyHz, formantColors[index], 3));
  }

  private buildFrequencyAxis(): void {
    this.freqAxis.replaceChildren();
    const step = this.maxHz <= 3000 ? 500 : 1000;
    for (let hz = 0; hz <= this.maxHz; hz += step) {
      const tick = document.createElement("span");
      tick.textContent = hz === 0 ? "0" : hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
      tick.style.bottom = `${(hz / this.maxHz) * 100}%`;
      this.freqAxis.append(tick);
    }
  }

  private buildTimeAxis(): void {
    this.timeAxis.replaceChildren();
    const seconds = Math.floor(this.canvas.width / pixelsPerSecond);
    for (let s = 0; s <= seconds; s += 2) {
      const tick = document.createElement("span");
      tick.textContent = s === 0 ? "now" : `−${s} s`;
      tick.style.right = `${((s * pixelsPerSecond) / this.canvas.width) * 100}%`;
      this.timeAxis.append(tick);
    }
  }
}

function hex(color: string): Rgb {
  return [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16)];
}
