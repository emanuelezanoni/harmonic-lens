export type AudioInputDevice = Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">;

export type AudioInputOption = {
  deviceId: string;
  label: string;
};

export type CaptureSettings = Pick<MediaTrackSettings, "channelCount" | "deviceId">;

export type MicrophoneRequestResult = {
  stream: MediaStream;
  fellBackToDefault: boolean;
};

export function listAudioInputOptions(devices: readonly AudioInputDevice[]): AudioInputOption[] {
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Microphone ${index + 1}`
    }));
}

export function selectedDeviceIsAvailable(selectedDeviceId: string, options: readonly AudioInputOption[]): boolean {
  return !selectedDeviceId || options.some((option) => option.deviceId === selectedDeviceId);
}

export function microphoneConstraints(selectedDeviceId: string): MediaTrackConstraints {
  return {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {})
  };
}

export function isSelectedDeviceFailure(error: unknown, selectedDeviceId: string): boolean {
  if (!selectedDeviceId || typeof error !== "object" || error === null || !("name" in error)) return false;
  return error.name === "NotFoundError" || error.name === "OverconstrainedError";
}

export async function requestMicrophone(
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
  selectedDeviceId: string
): Promise<MicrophoneRequestResult> {
  try {
    return {
      stream: await getUserMedia({ audio: microphoneConstraints(selectedDeviceId) }),
      fellBackToDefault: false
    };
  } catch (error) {
    if (!isSelectedDeviceFailure(error, selectedDeviceId)) throw error;
    return {
      stream: await getUserMedia({ audio: microphoneConstraints("") }),
      fellBackToDefault: true
    };
  }
}

export function formatInputDiagnostic(deviceId: string | undefined, options: readonly AudioInputOption[], fallback: string): string {
  if (!deviceId) return fallback;
  return options.find((option) => option.deviceId === deviceId)?.label ?? `Device ID: ${deviceId}`;
}

export function formatCaptureChannels(settings: CaptureSettings, workletChannelCount: number | null): string {
  const channelCount = workletChannelCount && workletChannelCount > 0
    ? `${workletChannelCount} channels`
    : settings.channelCount && settings.channelCount > 0
      ? `${settings.channelCount} reported channels`
      : "channels unknown";
  return `${channelCount} → mono average`;
}

export function formatAnalysisSampleRates(audioContextSampleRate: number | null, analysisSampleRate: number | null): string {
  const format = (sampleRate: number | null) => sampleRate && sampleRate > 0 ? `${sampleRate.toLocaleString()} Hz` : "unknown";
  return `AudioContext ${format(audioContextSampleRate)} · analysis ${format(analysisSampleRate)}`;
}

export function mapGetUserMediaError(error: unknown, selectedDeviceId: string): string {
  const name = typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
    ? error.name
    : "";

  switch (name) {
    case "NotAllowedError": return "Microphone permission denied or blocked. Allow access in browser site settings or macOS System Settings → Privacy & Security → Microphone, then restart the app.";
    case "NotFoundError": return selectedDeviceId ? "Selected microphone is unavailable. Choose another microphone." : "No microphone is available.";
    case "OverconstrainedError": return selectedDeviceId ? "Selected microphone is unavailable. Choose another microphone." : "Microphone constraints cannot be met.";
    case "NotReadableError": return "Microphone is unavailable or in use by another application.";
    case "AbortError": return "Microphone start was interrupted. Try again.";
    case "SecurityError": return "Microphone access is blocked by browser security settings.";
    case "InvalidStateError": return "Microphone cannot start while this page is inactive. Focus the page, then try again.";
    default: return error instanceof Error && error.message ? `Microphone start failed: ${error.message}` : "Microphone start failed.";
  }
}
