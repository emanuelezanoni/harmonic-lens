export type AudioInputDevice = Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">;

export type AudioInputOption = {
  deviceId: string;
  label: string;
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

export function mapGetUserMediaError(error: unknown, selectedDeviceId: string): string {
  const name = typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
    ? error.name
    : "";

  switch (name) {
    case "NotAllowedError": return "Microphone permission denied. Allow access, then try again.";
    case "NotFoundError": return selectedDeviceId ? "Selected microphone is unavailable. Choose another microphone." : "No microphone is available.";
    case "OverconstrainedError": return selectedDeviceId ? "Selected microphone is unavailable. Choose another microphone." : "Microphone constraints cannot be met.";
    case "NotReadableError": return "Microphone is unavailable or in use by another application.";
    case "AbortError": return "Microphone start was interrupted. Try again.";
    case "SecurityError": return "Microphone access is blocked by browser security settings.";
    default: return error instanceof Error && error.message ? `Microphone start failed: ${error.message}` : "Microphone start failed.";
  }
}
