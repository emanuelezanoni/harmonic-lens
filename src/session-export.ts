import type { AnalysisFrame } from "./dsp/analysis-protocol";

/** One compact row per analysis frame, kept in memory for CSV export. */
export type SessionRow = { timeS: number; levelDb: number; f0Hz: number | null; hnrDb: number | null; formantsHz: (number | null)[] };

export const maxSessionRows = 60_000; // 10 minutes at 100 frames/s

export class SessionLog {
  private rows: SessionRow[] = [];
  private origin: number | null = null;

  get length(): number { return this.rows.length; }
  clear(): void { this.rows = []; this.origin = null; }

  add(frame: AnalysisFrame, formantCount = 4): void {
    this.origin ??= frame.timeS;
    this.rows.push({
      timeS: frame.timeS - this.origin,
      levelDb: frame.levelDb,
      f0Hz: frame.f0Hz,
      hnrDb: frame.hnrDb,
      formantsHz: Array.from({ length: formantCount }, (_, k) => frame.formants[k]?.frequencyHz ?? null)
    });
    if (this.rows.length > maxSessionRows) this.rows.splice(0, this.rows.length - maxSessionRows + 6000);
  }

  toCsv(splOffsetDb: number | null = null): string {
    const n = this.rows[0]?.formantsHz.length ?? 4;
    const head = ["time_s", "level_dbfs", ...(splOffsetDb === null ? [] : ["level_db_spl"]), "f0_hz", "hnr_db", ...Array.from({ length: n }, (_, k) => `f${k + 1}_hz`)];
    const num = (v: number | null, digits: number) => (v === null || !Number.isFinite(v) ? "" : v.toFixed(digits));
    const lines = this.rows.map((r) => [
      r.timeS.toFixed(3), num(r.levelDb, 1), ...(splOffsetDb === null ? [] : [num(r.levelDb + splOffsetDb, 1)]),
      num(r.f0Hz, 1), num(r.hnrDb, 1), ...r.formantsHz.map((f) => num(f, 0))
    ].join(","));
    return [head.join(","), ...lines].join("\n") + "\n";
  }
}
