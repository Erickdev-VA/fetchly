import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./library/paths";

/**
 * The user's choices from Ajustes, in %APPDATA%\Fetchly\settings.json.
 * electron/main.cjs reads `libraryDir` from the same file (to know which
 * folder "Mostrar en carpeta" and the Recycle Bin may touch), so keep the
 * field names in sync with readLibraryDirSetting() there.
 */
export interface Settings {
  /** The library folder, when the user moved it away from Documentos\Fetchly. */
  libraryDir: string | null;
  /** Whether "Compatible con WhatsApp" starts switched on in Descargar. */
  shareableDefault: boolean;
}

const DEFAULTS: Settings = { libraryDir: null, shareableDefault: true };

function settingsPath(): string {
  return path.join(dataDir(), "settings.json");
}

// See the comment in lib/jobs/downloadJobs.ts about pinning state to globalThis.
const globalStore = globalThis as unknown as { __fetchlySettings?: Settings };

function load(): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<Record<keyof Settings, unknown>>;
    return {
      libraryDir: typeof raw.libraryDir === "string" && path.isAbsolute(raw.libraryDir) ? raw.libraryDir : null,
      shareableDefault: typeof raw.shareableDefault === "boolean" ? raw.shareableDefault : DEFAULTS.shareableDefault,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings(): Settings {
  globalStore.__fetchlySettings ??= load();
  return globalStore.__fetchlySettings;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  mkdirSync(dataDir(), { recursive: true });
  // Written aside and renamed, so a crash never leaves half a file.
  const temp = `${settingsPath()}.tmp`;
  writeFileSync(temp, JSON.stringify(next, null, 2));
  renameSync(temp, settingsPath());
  globalStore.__fetchlySettings = next;
  return next;
}
