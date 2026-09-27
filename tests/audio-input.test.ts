import assert from "node:assert/strict";
import test from "node:test";
import { formatAnalysisSampleRates, formatCaptureChannels, formatInputDiagnostic, listAudioInputOptions, mapGetUserMediaError, microphoneConstraints, selectedDeviceIsAvailable } from "../src/audio-input";

test("audio input options exclude non-microphone devices and use fallback labels before permission", () => {
  const options = listAudioInputOptions([
    { kind: "videoinput", deviceId: "camera", label: "Camera" },
    { kind: "audioinput", deviceId: "default", label: "" },
    { kind: "audiooutput", deviceId: "speaker", label: "Speaker" },
    { kind: "audioinput", deviceId: "usb", label: "USB microphone" }
  ] as MediaDeviceInfo[]);
  assert.deepEqual(options, [
    { deviceId: "default", label: "Microphone 1" },
    { deviceId: "usb", label: "USB microphone" }
  ]);
});

test("selected microphone uses exact device constraint and unavailable selection is detectable", () => {
  const options = [{ deviceId: "usb", label: "USB microphone" }];
  assert.deepEqual(microphoneConstraints("usb").deviceId, { exact: "usb" });
  assert.equal("deviceId" in microphoneConstraints(""), false);
  assert.equal(selectedDeviceIsAvailable("usb", options), true);
  assert.equal(selectedDeviceIsAvailable("gone", options), false);
  assert.equal(selectedDeviceIsAvailable("", options), true);
});

test("getUserMedia errors have actionable microphone messages", () => {
  assert.equal(mapGetUserMediaError({ name: "NotAllowedError" }, ""), "Microphone permission denied. Allow access, then try again.");
  assert.equal(mapGetUserMediaError({ name: "NotFoundError" }, "usb"), "Selected microphone is unavailable. Choose another microphone.");
  assert.equal(mapGetUserMediaError({ name: "NotReadableError" }, ""), "Microphone is unavailable or in use by another application.");
  assert.equal(mapGetUserMediaError(new Error("driver failed"), ""), "Microphone start failed: driver failed");
});

test("capture diagnostics distinguish known values from browser fallbacks", () => {
  const options = [{ deviceId: "usb", label: "USB microphone" }];
  assert.equal(formatInputDiagnostic("usb", options, "unknown"), "USB microphone");
  assert.equal(formatInputDiagnostic("missing", options, "unknown"), "Device ID: missing");
  assert.equal(formatInputDiagnostic(undefined, options, "Default microphone"), "Default microphone");
  assert.equal(formatCaptureChannels({ channelCount: 2 }, null), "2 reported channels → mono average");
  assert.equal(formatCaptureChannels({}, 3), "3 channels → mono average");
  assert.equal(formatCaptureChannels({}, null), "channels unknown → mono average");
  assert.equal(formatAnalysisSampleRates(48_000, 44_100), "AudioContext 48,000 Hz · analysis 44,100 Hz");
  assert.equal(formatAnalysisSampleRates(null, null), "AudioContext unknown · analysis unknown");
});
