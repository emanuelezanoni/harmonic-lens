import assert from "node:assert/strict";
import test from "node:test";
import { formatAnalysisSampleRates, formatCaptureChannels, formatInputDiagnostic, listAudioInputOptions, mapGetUserMediaError, microphoneConstraints, requestMicrophone, selectedDeviceIsAvailable } from "../src/audio-input";

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
  assert.equal(mapGetUserMediaError({ name: "NotAllowedError" }, ""), "Microphone permission denied or blocked. Allow access in browser site settings or macOS System Settings → Privacy & Security → Microphone, then restart the app.");
  assert.equal(mapGetUserMediaError({ name: "NotFoundError" }, "usb"), "Selected microphone is unavailable. Choose another microphone.");
  assert.equal(mapGetUserMediaError({ name: "NotReadableError" }, ""), "Microphone is unavailable or in use by another application.");
  assert.equal(mapGetUserMediaError(new Error("driver failed"), ""), "Microphone start failed: driver failed");
});

test("unavailable exact selection retries once with analysis constraints on default input", async () => {
  const calls: MediaStreamConstraints[] = [];
  const stream = {} as MediaStream;
  const result = await requestMicrophone(async (constraints) => {
    calls.push(constraints);
    if (calls.length === 1) throw new DOMException("gone", "OverconstrainedError");
    return stream;
  }, "usb");
  assert.equal(result.stream, stream);
  assert.equal(result.fellBackToDefault, true);
  assert.deepEqual((calls[0].audio as MediaTrackConstraints).deviceId, { exact: "usb" });
  assert.equal("deviceId" in (calls[1].audio as MediaTrackConstraints), false);
});

test("permission and hardware failures never retry a different microphone", async () => {
  let calls = 0;
  await assert.rejects(requestMicrophone(async () => {
    calls += 1;
    throw new DOMException("denied", "NotAllowedError");
  }, "usb"), { name: "NotAllowedError" });
  assert.equal(calls, 1);
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
