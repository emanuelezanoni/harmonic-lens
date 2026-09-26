import "./styles.css";
import { emptyAnalysisResult, type AnalysisResult, type MeasuredPeak } from "./analysis-result";
import { AnalysisWindowBuffer } from "./dsp/spectrogram-backend";
import { PraatRuntimeBackend, type RuntimeBackendState } from "./dsp/praat-runtime-backend";

type WorkletMessage = {
  frame: Float32Array;
  sampleRate: number;
  timestamp: number;
};

const fftSize = 2048;
const hopSize = 512;
const minDb = -96;
const maxDb = -18;
const partialCount = 8;
const minPitchHz = 70;
const maxPitchHz = 400;
const pitchConfidenceThreshold = 0.18;
const peakSearchRadiusBins = 2;
const panelRefreshMs = 100;
const harmonicColors = ["#ff5c8a", "#ff9f43", "#f6d743", "#67d978", "#38c8e8", "#6395ff", "#a77bff", "#ef72e8"];

const canvas = requiredElement<HTMLCanvasElement>("#spectrogram");
const startButton = requiredElement<HTMLButtonElement>("#startButton");
const stopButton = requiredElement<HTMLButtonElement>("#stopButton");
const statusEl = requiredElement<HTMLElement>("#status");
const permissionEl = requiredElement<HTMLElement>("#permission");
const sampleRateEl = requiredElement<HTMLElement>("#sampleRate");
const framesPerSecondEl = requiredElement<HTMLElement>("#framesPerSecond");
const latencyEl = requiredElement<HTMLElement>("#latency");
const levelEl = requiredElement<HTMLElement>("#level");
const pitchStateEl = requiredElement<HTMLElement>("#pitchState");
const harmonicTogglesEl = requiredElement<HTMLElement>("#harmonicToggles");
const harmonicRowsEl = requiredElement<HTMLTableSectionElement>("#harmonicRows");
const ctx = requiredCanvasContext(canvas);

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let workletNode: AudioWorkletNode | null = null;
let silentSink: GainNode | null = null;
let praatBackend: PraatRuntimeBackend | null = null;
let stopping: Promise<void> | null = null;
let sampleRate = 0;
let inputBuffer = new AnalysisWindowBuffer(fftSize, hopSize);
let framesThisSecond = 0;
let lastFrameCounterUpdate = performance.now();
let peakLatencyMs = 0;
let animationFrame = 0;
const enabledPartials = Array.from({ length: partialCount }, () => true);
let lastAnalysis: AnalysisResult = emptyAnalysisResult(partialCount);
let lastMeasurements: HarmonicMeasurement[] = emptyMeasurements();
let lastPanelRender = 0;
// Results from a previous start must never paint into a restarted capture.
let analysisGeneration = 0;

const windowFn = makeHannWindow(fftSize);
const real = new Float32Array(fftSize);
const imag = new Float32Array(fftSize);

paintEmptySpectrogram();
createHarmonicControls();
renderHarmonicPanel(lastAnalysis);
updatePermissionStatus();

startButton.addEventListener("click", () => {
  void start();
});

stopButton.addEventListener("click", () => {
  void stop();
});

async function start(): Promise<void> {
  setStatus("Requesting microphone permission...");
  startButton.disabled = true;

  try {
    if (!window.isSecureContext) {
      throw new Error("Microphone access requires HTTPS or localhost.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone capture.");
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    audioContext = new AudioContext({ latencyHint: "interactive" });
    sampleRate = audioContext.sampleRate;
    createPraatBackend();
    await audioContext.audioWorklet.addModule(new URL("./audio-processor.js", window.location.href).toString());
    await audioContext.resume();

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioContext, "microphone-processor");
    workletNode.port.onmessage = (event: MessageEvent<WorkletMessage>) => handleAudioFrame(event.data);
    workletNode.onprocessorerror = () => {
      setStatus("Audio processor stopped unexpectedly.");
      void stop(false);
    };
    // Keep graph rendered without passing microphone sound to speakers.
    silentSink = audioContext.createGain();
    silentSink.gain.value = 0;
    sourceNode.connect(workletNode);
    workletNode.connect(silentSink);
    silentSink.connect(audioContext.destination);

    setStatus("Listening");
    stopButton.disabled = false;
    sampleRateEl.textContent = `${sampleRate.toLocaleString()} Hz`;
    animationFrame = requestAnimationFrame(updateDiagnostics);
    await updatePermissionStatus();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Microphone start failed.");
    startButton.disabled = false;
    stopButton.disabled = true;
    await stop(false);
  }
}

async function stop(updateStatus = true): Promise<void> {
  if (stopping) {
    await stopping;
    return;
  }

  stopping = stopInternal(updateStatus);
  try {
    await stopping;
  } finally {
    stopping = null;
  }
}

async function stopInternal(updateStatus: boolean): Promise<void> {
  stopButton.disabled = true;
  cancelAnimationFrame(animationFrame);
  workletNode?.disconnect();
  sourceNode?.disconnect();
  silentSink?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  try {
    await audioContext?.close();
  } catch {
    // Nodes/tracks already detached; continue UI cleanup after a close failure.
  }

  analysisGeneration += 1;
  praatBackend?.close();
  praatBackend = null;

  audioContext = null;
  mediaStream = null;
  sourceNode = null;
  workletNode = null;
  silentSink = null;
  inputBuffer = new AnalysisWindowBuffer(fftSize, hopSize);
  framesThisSecond = 0;
  lastFrameCounterUpdate = performance.now();
  peakLatencyMs = 0;
  lastAnalysis = emptyAnalysisResult(partialCount);
  lastMeasurements = emptyMeasurements();
  lastPanelRender = 0;
  sampleRate = 0;
  sampleRateEl.textContent = "--";
  framesPerSecondEl.textContent = "--";
  latencyEl.textContent = "--";
  levelEl.textContent = "--";
  paintEmptySpectrogram();
  renderHarmonicPanel(lastAnalysis);
  startButton.disabled = false;
  stopButton.disabled = true;

  if (updateStatus) {
    setStatus("Stopped");
  }
  await updatePermissionStatus();
}

function handleAudioFrame(message: WorkletMessage): void {
  framesThisSecond += 1;
  sampleRate = message.sampleRate;

  const outputLatency = audioContext?.outputLatency ?? 0;
  peakLatencyMs = Math.max(peakLatencyMs, Math.max(0, audioContext ? (audioContext.currentTime - message.timestamp + outputLatency) * 1000 : 0));

  let sumSquares = 0;
  for (const sample of message.frame) {
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / message.frame.length);
  levelEl.textContent = `${Math.round(20 * Math.log10(Math.max(rms, 0.00001)))} dBFS`;

  inputBuffer.push(message.frame);
  inputBuffer.drain(sampleRate, ({ samples }) => analyzeAndDrawWindow(samples));
}

function updateDiagnostics(now = performance.now()): void {
  if (now - lastFrameCounterUpdate >= 1000) {
    framesPerSecondEl.textContent = `${framesThisSecond}`;
    latencyEl.textContent = peakLatencyMs > 0 ? `${Math.round(peakLatencyMs)} ms` : "--";
    framesThisSecond = 0;
    peakLatencyMs = 0;
    lastFrameCounterUpdate = now;
  }

  animationFrame = requestAnimationFrame(updateDiagnostics);
}

function createPraatBackend(): void {
  const generation = analysisGeneration;
  try {
    praatBackend = new PraatRuntimeBackend({
      partialCount,
      onStateChange: (state, detail) => handlePraatState(state, detail, generation)
    });
  } catch (error) {
    // Worker construction itself can fail (for example a hardened browser CSP).
    praatBackend = null;
    setStatus(`Listening · FFT fallback (${error instanceof Error ? error.message : "Praat unavailable"})`);
  }
}

function handlePraatState(state: RuntimeBackendState, detail: string | undefined, generation: number): void {
  if (generation !== analysisGeneration || !audioContext) return;
  if (state === "ready") setStatus("Listening · Praat WASM");
  else if (state === "loading") setStatus("Listening · loading Praat WASM (FFT fallback)");
  else if (state === "failed") setStatus(`Listening · FFT fallback (${detail ?? "Praat failed"})`);
  else if (state === "overloaded") setStatus("Listening · Praat catching up");
}

function analyzeAndDrawWindow(samples: Float32Array): void {
  for (let i = 0; i < fftSize; i += 1) {
    real[i] = samples[i] * windowFn[i];
    imag[i] = 0;
  }

  fft(real, imag);
  const hadPitch = lastAnalysis.f0Hz !== null;
  // The canvas still needs a local FFT magnitude image. Its F0/peaks are used
  // only while the asynchronously loaded Praat runtime cannot produce data.
  const useFallback = praatBackend?.state !== "ready";
  const analysis = useFallback ? fallbackAnalysisResult(estimatePitch(real, imag)) : lastAnalysis;
  if (useFallback) applyAnalysis(analysis, hadPitch);
  const image = ctx.getImageData(1, 0, canvas.width - 1, canvas.height);
  ctx.putImageData(image, 0, 0);

  const nyquistBin = fftSize / 2;
  for (let y = 0; y < canvas.height; y += 1) {
    const bin = Math.min(nyquistBin - 1, Math.round(((canvas.height - 1 - y) / (canvas.height - 1)) * nyquistBin));
    const magnitude = Math.hypot(real[bin], imag[bin]) / fftSize;
    const db = 20 * Math.log10(Math.max(magnitude, 0.000001));
    const color = colorForDb(db);
    ctx.fillStyle = color;
    ctx.fillRect(canvas.width - 1, y, 1, 1);
  }

  drawHarmonicTracks(lastMeasurements);

  if (!praatBackend || praatBackend.state !== "ready") return;
  const generation = analysisGeneration;
  void praatBackend.analyze({ samples, sampleRate }).then((result) => {
    if (generation !== analysisGeneration) return;
    applyAnalysis(result, lastAnalysis.f0Hz !== null);
  }).catch(() => {
    // A failed runtime transitions its state to failed; the next window uses
    // the FFT fallback. Do not let an obsolete rejection alter a restart.
  });
}

function applyAnalysis(analysis: AnalysisResult, hadPitch: boolean): void {
  lastAnalysis = analysis;
  lastMeasurements = measureHarmonics(analysis);
  // Clear stale values immediately on pitch loss; throttle normal live updates.
  if ((analysis.f0Hz === null && hadPitch) || performance.now() - lastPanelRender >= panelRefreshMs) {
    renderHarmonicPanel(analysis, lastMeasurements);
    lastPanelRender = performance.now();
  }
}

type PitchEstimate = { frequency: number; confidence: number };
type HarmonicMeasurement = {
  partial: number;
  enabled: boolean;
  theory: number | null;
  peak: MeasuredPeak | null;
};

function estimatePitch(re: Float32Array, im: Float32Array): PitchEstimate | null {
  const binHz = sampleRate / fftSize;
  const minBin = Math.max(1, Math.ceil(minPitchHz / binHz));
  const maxBin = Math.min(fftSize / 2 - 1, Math.floor(maxPitchHz / binHz));
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  let bestBin = 0;

  // Spectral harmonic summation: bounded, renderer-side MVP F0 estimate.
  for (let bin = minBin; bin <= maxBin; bin += 1) {
    let score = 0;
    let count = 0;
    for (let harmonic = 1; harmonic <= partialCount && harmonic * bin < fftSize / 2; harmonic += 1) {
      const center = harmonic * bin;
      const magnitude = Math.max(
        Math.hypot(re[center - 1], im[center - 1]),
        Math.hypot(re[center], im[center]),
        Math.hypot(re[center + 1], im[center + 1])
      );
      score += Math.log1p(magnitude) / harmonic;
      count += 1 / harmonic;
    }
    score /= count;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestBin = bin;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  const confidence = bestScore > 0 ? Math.max(0, (bestScore - secondScore) / bestScore) : 0;
  if (!Number.isFinite(confidence) || confidence < pitchConfidenceThreshold) return null;
  return { frequency: refinedPitchBin(bestBin, re, im) * binHz, confidence };
}

function refinedPitchBin(baseBin: number, re: Float32Array, im: Float32Array): number {
  let weightedBin = 0;
  let weightTotal = 0;
  for (let harmonic = 1; harmonic <= partialCount && harmonic * baseBin < fftSize / 2 - 1; harmonic += 1) {
    const center = harmonic * baseBin;
    const left = Math.hypot(re[center - 1], im[center - 1]);
    const middle = Math.hypot(re[center], im[center]);
    const right = Math.hypot(re[center + 1], im[center + 1]);
    const denominator = left - 2 * middle + right;
    const offset = denominator === 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator));
    const weight = middle / harmonic;
    weightedBin += ((center + offset) / harmonic) * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? weightedBin / weightTotal : baseBin;
}

function fallbackAnalysisResult(pitch: PitchEstimate | null): AnalysisResult {
  if (!pitch) return emptyAnalysisResult(partialCount);
  const theoreticalPeaksHz = Array.from({ length: partialCount }, (_, index) => (index + 1) * pitch.frequency);
  return {
    f0Hz: pitch.frequency,
    confidence: pitch.confidence,
    hnrDb: null,
    theoreticalPeaksHz,
    measuredPeaks: theoreticalPeaksHz.map((frequencyHz) => localPeak(frequencyHz))
  };
}

function measureHarmonics(analysis: AnalysisResult): HarmonicMeasurement[] {
  return Array.from({ length: partialCount }, (_, index) => {
    const theory = analysis.theoreticalPeaksHz[index] ?? null;
    return {
      partial: index + 1,
      enabled: enabledPartials[index],
      theory,
      peak: analysis.measuredPeaks[index] ?? null
    };
  });
}

function emptyMeasurements(): HarmonicMeasurement[] {
  return Array.from({ length: partialCount }, (_, index) => ({
    partial: index + 1,
    enabled: enabledPartials[index],
    theory: null,
    peak: null
  }));
}

function drawHarmonicTracks(measurements: HarmonicMeasurement[]): void {
  for (const measurement of measurements) {
    if (!measurement.enabled || measurement.theory === null) continue;
    const color = harmonicColors[measurement.partial - 1];
    drawTrackPoint(measurement.theory, color, 0.58, 1);
    if (measurement.peak) {
      // Coloured caps mark measured peak; faint centre stays theoretical guide.
      drawPeakMarker(measurement.peak.frequencyHz, color);
    }
  }
}

function drawPeakMarker(frequency: number, color: string): void {
  if (!Number.isFinite(frequency) || frequency < 0 || frequency >= sampleRate / 2) return;
  const y = Math.round((1 - frequency / (sampleRate / 2)) * (canvas.height - 1));
  if (y > 0) drawTrackPointAtY(y - 1, color, 1);
  if (y < canvas.height - 1) drawTrackPointAtY(y + 1, color, 1);
}

function drawTrackPoint(frequency: number, color: string, alpha: number, height: number): void {
  if (!Number.isFinite(frequency) || frequency < 0 || frequency >= sampleRate / 2) return;
  const y = Math.round((1 - frequency / (sampleRate / 2)) * (canvas.height - 1));
  for (let offset = 0; offset < height; offset += 1) {
    drawTrackPointAtY(Math.max(0, Math.min(canvas.height - 1, y - Math.floor(height / 2) + offset)), color, alpha);
  }
}

function drawTrackPointAtY(y: number, color: string, alpha: number): void {
  ctx.fillStyle = colorWithAlpha(color, alpha);
  ctx.fillRect(canvas.width - 1, y, 1, 1);
}

function createHarmonicControls(): void {
  for (let index = 0; index < partialCount; index += 1) {
    const partial = index + 1;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "harmonic-toggle";
    button.style.setProperty("--harmonic-color", harmonicColors[index]);
    button.setAttribute("aria-pressed", "true");
    button.setAttribute("aria-label", `Toggle H${partial} harmonic guide`);
    button.innerHTML = `<span class="harmonic-dot" aria-hidden="true"></span>H${partial}`;
    button.addEventListener("click", () => {
      enabledPartials[index] = !enabledPartials[index];
      button.setAttribute("aria-pressed", String(enabledPartials[index]));
      lastMeasurements = measureHarmonics(lastAnalysis);
      renderHarmonicPanel(lastAnalysis, lastMeasurements);
    });
    harmonicTogglesEl.append(button);
  }
}

function renderHarmonicPanel(analysis: AnalysisResult, measurements = lastMeasurements): void {
  pitchStateEl.textContent = analysis.f0Hz !== null
    ? `F0 ${formatHz(analysis.f0Hz)} Hz · confidence ${analysis.confidence === null ? "--" : `${Math.round(analysis.confidence * 100)}%`} · HNR ${analysis.hnrDb === null ? "--" : `${formatDb(analysis.hnrDb)} dB`}`
    : "No pitch / low confidence";
  harmonicRowsEl.replaceChildren();
  for (const measurement of measurements) {
    const index = measurement.partial - 1;
    const row = document.createElement("tr");
    row.classList.toggle("harmonic-disabled", !measurement.enabled);
    row.innerHTML = `<th scope="row" class="partial-label" style="--harmonic-color: ${harmonicColors[index]}">H${measurement.partial}</th><td>${measurement.enabled && measurement.theory ? `${formatHz(measurement.theory)} Hz` : "--"}</td><td>${measurement.enabled && measurement.peak ? `${formatHz(measurement.peak.frequencyHz)} Hz` : "--"}</td><td>${measurement.enabled && measurement.peak ? `${formatDb(measurement.peak.levelDb)} dBFS` : "--"}</td><td>${measurement.enabled ? "On" : "Off"}</td>`;
    harmonicRowsEl.append(row);
  }
}

function localPeak(targetHz: number): MeasuredPeak | null {
  if (targetHz >= sampleRate / 2) return null;
  const targetBin = Math.round((targetHz / sampleRate) * fftSize);
  const start = Math.max(1, targetBin - peakSearchRadiusBins);
  const end = Math.min(fftSize / 2 - 2, targetBin + peakSearchRadiusBins);
  let peakBin = start;
  let peakMagnitude = 0;
  for (let bin = start; bin <= end; bin += 1) {
    const magnitude = Math.hypot(real[bin], imag[bin]);
    if (magnitude > peakMagnitude) { peakMagnitude = magnitude; peakBin = bin; }
  }
  if (peakMagnitude === 0) return null;
  const refinedBin = refinePeakBin(peakBin);
  const coherentGain = 0.5;
  const amplitude = (2 * peakMagnitude) / (fftSize * coherentGain);
  const db = 20 * Math.log10(Math.max(amplitude, 0.000001));
  return db < minDb ? null : { frequencyHz: (refinedBin * sampleRate) / fftSize, levelDb: db };
}

function refinePeakBin(bin: number): number {
  const left = Math.hypot(real[bin - 1], imag[bin - 1]);
  const middle = Math.hypot(real[bin], imag[bin]);
  const right = Math.hypot(real[bin + 1], imag[bin + 1]);
  const denominator = left - 2 * middle + right;
  const offset = denominator === 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator));
  return bin + offset;
}

function formatHz(value: number): string { return value.toFixed(value < 100 ? 1 : 0); }
function formatDb(value: number): string { return value.toFixed(1); }

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenRe = Math.cos(angle);
    const wLenIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nextWRe = wRe * wLenRe - wIm * wLenIm;
        wIm = wRe * wLenIm + wIm * wLenRe;
        wRe = nextWRe;
      }
    }
  }
}

function makeHannWindow(size: number): Float32Array {
  const values = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    values[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return values;
}

function colorForDb(db: number): string {
  const normal = Math.min(1, Math.max(0, (db - minDb) / (maxDb - minDb)));
  const hue = 245 - normal * 205;
  const lightness = 8 + normal * 58;
  return `hsl(${hue} 88% ${lightness}%)`;
}

function colorWithAlpha(hex: string, alpha: number): string {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function paintEmptySpectrogram(): void {
  ctx.fillStyle = "#050608";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;

  for (let i = 1; i < 6; i += 1) {
    const y = (canvas.height / 6) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

async function updatePermissionStatus(): Promise<void> {
  if (!navigator.permissions?.query) {
    permissionEl.textContent = "prompt";
    return;
  }

  try {
    const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
    permissionEl.textContent = permission.state;
    permission.onchange = () => {
      permissionEl.textContent = permission.state;
    };
  } catch {
    permissionEl.textContent = "prompt";
  }
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function requiredCanvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }
  return context;
}
