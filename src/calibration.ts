/*
 * Level display. The engine measures RMS in dBFS (0 = full-scale digital). dB SPL needs a reference: the user reads
 * a sound level meter while a steady sound plays, and we store the offset between the two for that input device.
 */
const KEY = "harmonic-lens.calibration.v1";

export type Calibration = { offsetDb: number; deviceId: string };

/** Energy mean (not arithmetic mean of dB values) of a window of RMS levels. */
export function meanLevelDb(levelsDb: readonly number[]): number {
  if (levelsDb.length === 0) return -Infinity;
  const power = levelsDb.reduce((sum, db) => sum + Math.pow(10, db / 10), 0) / levelsDb.length;
  return 10 * Math.log10(power);
}

/** Offset to add to dBFS so the recent level reads `splDb`. Null when there is no usable signal. */
export function offsetFromReading(splDb: number, recentLevelsDb: readonly number[], minLevelDb = -70): number | null {
  if (!Number.isFinite(splDb) || splDb < 20 || splDb > 140) return null;
  const mean = meanLevelDb(recentLevelsDb);
  return Number.isFinite(mean) && mean > minLevelDb ? splDb - mean : null;
}

export function formatLevel(dbfs: number, calibration: Calibration | null, deviceId: string): string {
  if (calibration && calibration.deviceId === deviceId) return `${Math.round(dbfs + calibration.offsetDb)} dB SPL (calibrated)`;
  return `${Math.round(dbfs)} dBFS`;
}

export function loadCalibration(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): Calibration | null {
  try {
    const p: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (typeof p !== "object" || p === null) return null;
    const { offsetDb, deviceId } = p as Record<string, unknown>;
    return typeof offsetDb === "number" && Number.isFinite(offsetDb) && typeof deviceId === "string" ? { offsetDb, deviceId } : null;
  } catch { return null; }
}

export function saveCalibration(value: Calibration | null, storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeStorage()): void {
  try { if (value) storage?.setItem(KEY, JSON.stringify(value)); else storage?.removeItem(KEY); } catch { /* not persisted */ }
}

function safeStorage(): Storage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}
