import "./styles.css";
import { AnalysisClient } from "./dsp/analysis-client";
import { type AnalysisFrame, type AnalysisSettings } from "./dsp/analysis-protocol";
import { formatAnalysisSampleRates, formatCaptureChannels, formatInputDiagnostic, listAudioInputOptions, mapGetUserMediaError, requestMicrophone, selectedDeviceIsAvailable, type AudioInputOption, type CaptureSettings } from "./audio-input";
import { loadSettings, saveSettings } from "./saved-settings";
import { SpectrogramView, formantColors, shownFormants } from "./ui/spectrogram-view";

const partialCount = 8;
const panelRefreshMs = 100;
/** Keep the last voiced readout visible (dimmed) this long after the voice stops, so numbers can be read. */
const readoutHoldMs = 1500;
const harmonicColors = ["#ff5c8a", "#ff9f43", "#f6d743", "#67d978", "#38c8e8", "#6395ff", "#a77bff", "#ef72e8"];

const startButton = requiredElement<HTMLButtonElement>("#startButton");
const pauseButton = requiredElement<HTMLButtonElement>("#pauseButton");
const stopButton = requiredElement<HTMLButtonElement>("#stopButton");
const audioInputEl = requiredElement<HTMLSelectElement>("#audioInput");
const voiceTypeEl = requiredElement<HTMLSelectElement>("#voiceType");
const rangeEl = requiredElement<HTMLSelectElement>("#rangeSelect");
const modeEl = requiredElement<HTMLSelectElement>("#modeSelect");
const formantToggle = requiredElement<HTMLButtonElement>("#formantToggle");
const statusEl = requiredElement<HTMLElement>("#status");
const permissionEl = requiredElement<HTMLElement>("#permission");
const sampleRateEl = requiredElement<HTMLElement>("#sampleRate");
const selectedInputEl = requiredElement<HTMLElement>("#selectedInput");
const actualInputEl = requiredElement<HTMLElement>("#actualInput");
const captureChannelsEl = requiredElement<HTMLElement>("#captureChannels");
const analysisSampleRateEl = requiredElement<HTMLElement>("#analysisSampleRate");
const framesPerSecondEl = requiredElement<HTMLElement>("#framesPerSecond");
const latencyEl = requiredElement<HTMLElement>("#latency");
const levelEl = requiredElement<HTMLElement>("#level");
const pitchStateEl = requiredElement<HTMLElement>("#pitchState");
const formantStateEl = requiredElement<HTMLElement>("#formantState");
const harmonicTogglesEl = requiredElement<HTMLElement>("#harmonicToggles");
const harmonicRowsEl = requiredElement<HTMLTableSectionElement>("#harmonicRows");
const view = new SpectrogramView(requiredElement<HTMLCanvasElement>("#spectrogram"), requiredElement<HTMLElement>("#freqAxis"), requiredElement<HTMLElement>("#timeAxis"), requiredElement<HTMLCanvasElement>("#pitchCanvas"), requiredElement<HTMLElement>("#pitchAxis"));

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let workletNode: AudioWorkletNode | null = null;
let silentSink: GainNode | null = null;
let client: AnalysisClient | null = null;
let stopping: Promise<void> | null = null;
let sampleRate = 0;
let framesThisSecond = 0;
let peakLatencyMs = 0;
let lastDiagnostics = performance.now();
let animationFrame = 0;
let lastPanelRender = 0;
let paused = false;
let showFormants = true;
let latestFrame: AnalysisFrame | null = null;
let lastVoicedFrame: AnalysisFrame | null = null;
let lastVoicedAt = 0;
let praatAvailable: boolean | null = null;
// Harmonic guides clutter the formant tracks, so they start hidden; the table always shows measurements.
const enabledPartials = Array.from({ length: partialCount }, () => false);
// Restore only values that still exist as options; anything stale falls back to the HTML defaults.
const saved = loadSettings();
const restore = (el: HTMLSelectElement, value: string | undefined) => { if (value !== undefined && [...el.options].some((o) => o.value === value)) el.value = value; };
restore(voiceTypeEl, saved.voiceType); restore(rangeEl, saved.range); restore(modeEl, saved.mode);
showFormants = saved.showFormants ?? showFormants;
formantToggle.setAttribute("aria-pressed", String(showFormants));
let settings: AnalysisSettings = { maxFormantHz: Number(voiceTypeEl.value), spectrumMaxHz: Number(rangeEl.value), spectrumWindowS: Number(modeEl.value) };
const persist = () => saveSettings({ voiceType: voiceTypeEl.value, range: rangeEl.value, mode: modeEl.value, showFormants });
let selectedDeviceId = "";
let selectedDeviceMissing = false;
let audioInputOptions: AudioInputOption[] = [];
let captureSettings: CaptureSettings = {};
let workletChannelCount: number | null = null;
let lifecycleGeneration = 0;
let refreshGeneration = 0;
let permissionGeneration = 0;

view.setRange(settings.spectrumMaxHz);
createHarmonicControls();
renderPanel(null);
void updatePermissionStatus();
void refreshAudioInputs();

audioInputEl.addEventListener("change", () => {
  selectedDeviceId = audioInputEl.value;
  selectedDeviceMissing = false;
  // Switching while listening restarts capture on the new device instead of waiting for a manual stop/start.
  if (audioContext) void restart();
});
navigator.mediaDevices?.addEventListener("devicechange", () => { void refreshAudioInputs(); });
startButton.addEventListener("click", () => { void start(); });
stopButton.addEventListener("click", () => { void stop(); });
pauseButton.addEventListener("click", () => setPaused(!paused));
formantToggle.addEventListener("click", () => {
  showFormants = !showFormants;
  formantToggle.setAttribute("aria-pressed", String(showFormants));
  persist();
});
voiceTypeEl.addEventListener("change", applySettings);
rangeEl.addEventListener("change", applySettings);
modeEl.addEventListener("change", applySettings);

function applySettings(): void {
  settings = { maxFormantHz: Number(voiceTypeEl.value), spectrumMaxHz: Number(rangeEl.value), spectrumWindowS: Number(modeEl.value) };
  view.setRange(settings.spectrumMaxHz);
  client?.updateSettings(settings);
  persist();
}

function setPaused(next: boolean): void {
  paused = next;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  if (paused) { view.discardQueue(); setStatus(statusEl.textContent?.replace(/^Listening/, "Paused") ?? "Paused"); }
  else setStatus(praatAvailable === false ? "Listening · Praat WASM unavailable (pitch/HNR off)" : "Listening · Praat WASM");
}

async function restart(): Promise<void> {
  await stop(false);
  await start();
}

async function start(): Promise<void> {
  if (selectedDeviceMissing) { setStatus("Selected microphone is unavailable. Choose another microphone."); return; }
  setStatus("Requesting microphone permission...");
  startButton.disabled = true;
  const generation = ++lifecycleGeneration;
  let fellBackToDefault = false;

  try {
    if (!window.isSecureContext) throw new Error("Microphone access requires HTTPS or localhost.");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support microphone capture.");

    // Construct/resume during click activation. Permission prompts can outlive transient activation.
    audioContext = new AudioContext({ latencyHint: "interactive" });
    const resumePromise = audioContext.resume();
    const capture = await requestMicrophone((constraints) => navigator.mediaDevices.getUserMedia(constraints), selectedDeviceId);
    if (generation !== lifecycleGeneration) { capture.stream.getTracks().forEach((track) => track.stop()); return; }
    mediaStream = capture.stream;
    fellBackToDefault = capture.fellBackToDefault;
    if (fellBackToDefault) { selectedDeviceId = ""; selectedDeviceMissing = false; }
    captureSettings = mediaStream.getAudioTracks()[0]?.getSettings?.() ?? {};
    const captureTrack = mediaStream.getAudioTracks()[0];
    if (!captureTrack) throw new DOMException("No audio track was returned.", "NotFoundError");
    captureTrack.addEventListener("ended", () => {
      if (generation !== lifecycleGeneration) return;
      setStatus("Microphone disconnected or permission was revoked. Choose an input, then start again.");
      void stop(false);
    }, { once: true });
    await refreshAudioInputs(); // device labels become available after permission
    if (generation !== lifecycleGeneration || !audioContext || !mediaStream) return;

    sampleRate = audioContext.sampleRate;
    await audioContext.audioWorklet.addModule(new URL("./audio-processor.js", window.location.href).toString());
    await resumePromise;
    if (generation !== lifecycleGeneration || !audioContext || !mediaStream) return;
    if (audioContext.state !== "running") throw new DOMException("AudioContext did not enter running state.", "InvalidStateError");
    audioContext.addEventListener("statechange", () => {
      if (generation !== lifecycleGeneration || audioContext?.state === "running") return;
      setStatus("Audio system was interrupted. Start again to resume microphone analysis.");
      void stop(false);
    });

    praatAvailable = null;
    client = new AnalysisClient(sampleRate, settings, {
      onFrame: (frame) => onFrame(frame, generation),
      onReady: (praat, detail) => {
        if (generation !== lifecycleGeneration) return;
        praatAvailable = praat;
        setStatus(praat ? "Listening · Praat WASM" : `Listening · Praat WASM unavailable (pitch/HNR off): ${detail ?? "load failed"}`);
      },
      onFailure: (message) => {
        if (generation !== lifecycleGeneration) return;
        setStatus(`Analysis failed: ${message}`);
        void stop(false);
      }
    });

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioContext, "microphone-processor", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCountMode: "max" });
    workletNode.port.onmessage = (event: MessageEvent<{ stats?: { sampleRate: number; channelCount: number } }>) => {
      const stats = event.data.stats;
      if (!stats) return;
      if (sampleRate !== stats.sampleRate || workletChannelCount !== stats.channelCount) {
        sampleRate = stats.sampleRate; workletChannelCount = stats.channelCount; renderCaptureDiagnostics();
      }
    };
    workletNode.onprocessorerror = () => { setStatus("Audio processor stopped unexpectedly."); void stop(false); };
    workletNode.port.postMessage({ analysisPort: client.audioPort }, [client.audioPort]);
    // Keep the graph rendered without passing microphone sound to the speakers.
    silentSink = audioContext.createGain();
    silentSink.gain.value = 0;
    sourceNode.connect(workletNode);
    workletNode.connect(silentSink);
    silentSink.connect(audioContext.destination);

    setStatus(fellBackToDefault ? "Listening · selected microphone unavailable; using default microphone" : "Listening · loading Praat WASM");
    stopButton.disabled = false;
    pauseButton.disabled = false;
    sampleRateEl.textContent = `${sampleRate.toLocaleString()} Hz`;
    renderCaptureDiagnostics();
    animationFrame = requestAnimationFrame(tick);
    await updatePermissionStatus();
  } catch (error) {
    setStatus(mapGetUserMediaError(error, selectedDeviceId));
    startButton.disabled = false;
    stopButton.disabled = true;
    await stop(false);
  }
}

async function stop(updateStatus = true): Promise<void> {
  if (stopping) { await stopping; return; }
  stopping = stopInternal(updateStatus);
  try { await stopping; } finally { stopping = null; }
}

async function stopInternal(updateStatus: boolean): Promise<void> {
  lifecycleGeneration += 1;
  stopButton.disabled = true;
  pauseButton.disabled = true;
  cancelAnimationFrame(animationFrame);
  workletNode?.disconnect();
  sourceNode?.disconnect();
  silentSink?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  try { await audioContext?.close(); } catch { /* nodes/tracks already detached; continue UI cleanup */ }
  client?.close();
  client = null;
  audioContext = null; mediaStream = null; sourceNode = null; workletNode = null; silentSink = null;
  framesThisSecond = 0; peakLatencyMs = 0; lastDiagnostics = performance.now(); lastPanelRender = 0;
  sampleRate = 0; captureSettings = {}; workletChannelCount = null; latestFrame = null; lastVoicedFrame = null; praatAvailable = null;
  paused = false; pauseButton.textContent = "Pause";
  sampleRateEl.textContent = "--"; selectedInputEl.textContent = "--"; actualInputEl.textContent = "unknown";
  captureChannelsEl.textContent = "unknown → mono average";
  analysisSampleRateEl.textContent = formatAnalysisSampleRates(null, null);
  framesPerSecondEl.textContent = "--"; latencyEl.textContent = "--"; levelEl.textContent = "--";
  view.clear();
  renderPanel(null);
  startButton.disabled = false;
  audioInputEl.disabled = false;
  if (updateStatus) setStatus("Stopped");
  await updatePermissionStatus();
  await refreshAudioInputs();
}

function onFrame(frame: AnalysisFrame, generation: number): void {
  if (generation !== lifecycleGeneration || !audioContext) return;
  framesThisSecond += 1;
  const latencyMs = (audioContext.currentTime - frame.audioTimeS) * 1000;
  if (latencyMs > peakLatencyMs) peakLatencyMs = latencyMs;
  if (paused) return;
  latestFrame = frame;
  if (frame.f0Hz !== null || frame.formants.length > 0) { lastVoicedFrame = frame; lastVoicedAt = performance.now(); }
  view.enqueue(frame);
}

function tick(now = performance.now()): void {
  const painted = paused ? 0 : view.paint({ harmonicColors, harmonicEnabled: enabledPartials, showFormants });
  if (painted > 0 && latestFrame && now - lastPanelRender >= panelRefreshMs) {
    renderPanel(latestFrame);
    lastPanelRender = now;
  }
  if (now - lastDiagnostics >= 1000) {
    framesPerSecondEl.textContent = `${framesThisSecond}`;
    latencyEl.textContent = peakLatencyMs > 0 ? `${Math.round(peakLatencyMs)} ms (+~25 ms window)` : "--";
    if (latestFrame) levelEl.textContent = `${Math.round(latestFrame.levelDb)} dBFS`;
    framesThisSecond = 0; peakLatencyMs = 0; lastDiagnostics = now;
  }
  animationFrame = requestAnimationFrame(tick);
}

function createHarmonicControls(): void {
  for (let index = 0; index < partialCount; index += 1) {
    const partial = index + 1;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "harmonic-toggle";
    button.style.setProperty("--harmonic-color", harmonicColors[index]);
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `Toggle H${partial} harmonic guide`);
    button.innerHTML = `<span class="harmonic-dot" aria-hidden="true"></span>H${partial}`;
    button.addEventListener("click", () => {
      enabledPartials[index] = !enabledPartials[index];
      button.setAttribute("aria-pressed", String(enabledPartials[index]));
      renderPanel(latestFrame);
    });
    harmonicTogglesEl.append(button);
  }
}

function renderPanel(live: AnalysisFrame | null): void {
  const hasVoice = live !== null && (live.f0Hz !== null || live.formants.length > 0);
  const held = !hasVoice && lastVoicedFrame !== null && performance.now() - lastVoicedAt < readoutHoldMs;
  const frame = held ? lastVoicedFrame : live;
  pitchStateEl.classList.toggle("stale", held);
  formantStateEl.classList.toggle("stale", held);
  pitchStateEl.textContent = frame && frame.f0Hz !== null
    ? `F0 ${formatHz(frame.f0Hz)} Hz · HNR ${frame.hnrDb === null ? "--" : `${frame.hnrDb.toFixed(1)} dB`}`
    : praatAvailable === false ? "Pitch unavailable (Praat WASM failed to load)" : "No pitch";
  formantStateEl.replaceChildren();
  formantStateEl.append("Formants: ");
  if (!frame || frame.formants.length === 0) formantStateEl.append("--");
  else frame.formants.slice(0, shownFormants).forEach((formant, index) => {
    const span = document.createElement("span");
    span.style.color = formantColors[index];
    span.textContent = `F${index + 1} ${Math.round(formant.frequencyHz)} Hz`;
    formantStateEl.append(span, index < Math.min(shownFormants, frame.formants.length) - 1 ? "  ·  " : "");
  });
  harmonicRowsEl.replaceChildren();
  for (let index = 0; index < partialCount; index += 1) {
    const enabled = enabledPartials[index], theory = frame?.theoreticalHz[index] ?? null, peak = frame?.peaks[index] ?? null;
    const row = document.createElement("tr");
    row.classList.toggle("harmonic-disabled", false);
    row.innerHTML = `<th scope="row" class="partial-label" style="--harmonic-color: ${harmonicColors[index]}">H${index + 1}</th><td>${theory !== null ? `${formatHz(theory)} Hz` : "--"}</td><td>${peak ? `${formatHz(peak.frequencyHz)} Hz` : "--"}</td><td>${peak ? `${peak.levelDb.toFixed(1)} dBFS` : "--"}</td><td>${enabled ? "Shown on plot" : "Hidden"}</td>`;
    harmonicRowsEl.append(row);
  }
}

function formatHz(value: number): string { return value.toFixed(value < 100 ? 1 : 0); }

async function updatePermissionStatus(): Promise<void> {
  const generation = ++permissionGeneration;
  if (!navigator.permissions?.query) { permissionEl.textContent = "prompt"; return; }
  try {
    const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (generation !== permissionGeneration) return;
    permissionEl.textContent = permission.state;
    permission.onchange = () => { if (generation === permissionGeneration) permissionEl.textContent = permission.state; };
  } catch { permissionEl.textContent = "prompt"; }
}

async function refreshAudioInputs(): Promise<void> {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const generation = ++refreshGeneration;
  try {
    const options = listAudioInputOptions(await navigator.mediaDevices.enumerateDevices());
    if (generation !== refreshGeneration) return;
    audioInputOptions = options;
    selectedDeviceMissing = !selectedDeviceIsAvailable(selectedDeviceId, options);
    audioInputEl.replaceChildren(new Option("Default microphone", ""));
    for (const option of options) audioInputEl.add(new Option(option.label, option.deviceId));
    if (selectedDeviceMissing) {
      const missing = new Option("Selected microphone unavailable", selectedDeviceId);
      missing.disabled = true;
      audioInputEl.add(missing);
      audioInputEl.value = selectedDeviceId;
      setStatus(mediaStream ? "Selected microphone disconnected. Stop, then choose another microphone." : "Selected microphone is unavailable. Choose another microphone.");
    } else audioInputEl.value = selectedDeviceId;
    if (mediaStream) renderCaptureDiagnostics();
  } catch { /* existing selection remains usable; enumerateDevices can fail independently */ }
}

function renderCaptureDiagnostics(): void {
  selectedInputEl.textContent = formatInputDiagnostic(selectedDeviceId, audioInputOptions, "Default microphone");
  actualInputEl.textContent = formatInputDiagnostic(captureSettings.deviceId, audioInputOptions, "unknown");
  captureChannelsEl.textContent = formatCaptureChannels(captureSettings, workletChannelCount);
  analysisSampleRateEl.textContent = formatAnalysisSampleRates(audioContext?.sampleRate ?? null, sampleRate || null);
}

function setStatus(message: string): void {
  statusEl.textContent = message;
  statusEl.dataset.state = message.startsWith("Listening")
    ? message.includes("unavailable") || message.includes("loading") ? "warning" : "active"
    : message === "Stopped" ? "idle"
      : message.startsWith("Paused") ? "warning"
        : message.includes("failed") || message.includes("denied") || message.includes("unavailable") || message.includes("disconnected") ? "error" : "pending";
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}
