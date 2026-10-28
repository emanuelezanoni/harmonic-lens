const KEY = "harmonic-lens.settings.v1";

export type SavedSettings = { voiceType?: string; range?: string; mode?: string; showFormants?: boolean };

export function loadSettings(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): SavedSettings {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return {};
    const p = parsed as Record<string, unknown>;
    return {
      voiceType: typeof p.voiceType === "string" ? p.voiceType : undefined,
      range: typeof p.range === "string" ? p.range : undefined,
      mode: typeof p.mode === "string" ? p.mode : undefined,
      showFormants: typeof p.showFormants === "boolean" ? p.showFormants : undefined
    };
  } catch { return {}; }
}

export function saveSettings(value: SavedSettings, storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void {
  try { storage?.setItem(KEY, JSON.stringify(value)); } catch { /* private mode or quota: settings simply do not persist */ }
}

function safeStorage(): Storage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}
