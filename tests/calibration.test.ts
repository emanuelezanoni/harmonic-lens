import assert from "node:assert/strict";
import test from "node:test";
import { formatLevel, loadCalibration, meanLevelDb, offsetFromReading, saveCalibration } from "../src/calibration";
import { SessionLog } from "../src/session-export";
import type { AnalysisFrame } from "../src/dsp/analysis-protocol";

const frame = (timeS: number, f0Hz: number | null, formants: number[]): AnalysisFrame => ({
  timeS, levelDb: -20, f0Hz, hnrDb: f0Hz === null ? null : 15,
  formants: formants.map((frequencyHz) => ({ frequencyHz, bandwidthHz: 100 })),
  theoreticalHz: [], peaks: [], spectrum: new Float32Array(0), audioTimeS: timeS, producedAtMs: 0
});

test("mean level is an energy mean", () => {
  assert.ok(Math.abs(meanLevelDb([-20, -20, -20]) - -20) < 1e-9);
  assert.ok(Math.abs(meanLevelDb([-10, -30]) - 10 * Math.log10((0.1 + 0.001) / 2)) < 1e-9);
});

test("offset makes the recent level read the meter value", () => {
  const off = offsetFromReading(70, [-30, -30, -30]);
  assert.equal(off, 100);
  assert.equal(formatLevel(-30, { offsetDb: 100, deviceId: "mic" }, "mic"), "70 dB SPL (calibrated)");
});

test("calibration refuses silence and absurd readings, and does not leak across devices", () => {
  assert.equal(offsetFromReading(70, [-90, -90]), null);
  assert.equal(offsetFromReading(5, [-30]), null);
  assert.equal(offsetFromReading(Number.NaN, [-30]), null);
  assert.equal(formatLevel(-30, { offsetDb: 100, deviceId: "mic" }, "other"), "-30 dBFS");
});

test("calibration persists and survives bad storage", () => {
  const m = new Map<string, string>();
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  saveCalibration({ offsetDb: 91.5, deviceId: "abc" }, store);
  assert.deepEqual(loadCalibration(store), { offsetDb: 91.5, deviceId: "abc" });
  saveCalibration(null, store);
  assert.equal(loadCalibration(store), null);
  m.set("harmonic-lens.calibration.v1", "{oops");
  assert.equal(loadCalibration(store), null);
});

test("session CSV: header, relative time, blanks for missing values, optional SPL column", () => {
  const log = new SessionLog();
  log.add(frame(5.0, 120, [700, 1200, 2500]));
  log.add(frame(5.01, null, []));
  const csv = log.toCsv().trim().split("\n");
  assert.equal(csv[0], "time_s,level_dbfs,f0_hz,hnr_db,f1_hz,f2_hz,f3_hz,f4_hz");
  assert.equal(csv[1], "0.000,-20.0,120.0,15.0,700,1200,2500,");
  assert.equal(csv[2], "0.010,-20.0,,,,,,");
  assert.equal(log.toCsv(100).split("\n")[0], "time_s,level_dbfs,level_db_spl,f0_hz,hnr_db,f1_hz,f2_hz,f3_hz,f4_hz");
});

test("session log is capped", () => {
  const log = new SessionLog();
  for (let i = 0; i < 61_000; i++) log.add(frame(i / 100, null, []));
  assert.ok(log.length <= 60_000);
});
