import type { RepeatMode } from "./types";

/** Player settings remembered between launches. */
export interface PlayerPrefs {
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
}

const STORAGE_KEY = "fetchly.player";
const DEFAULTS: PlayerPrefs = { volume: 0.8, muted: false, shuffle: false, repeat: "off" };

let current: PlayerPrefs | null = null;
const listeners = new Set<() => void>();

function load(): PlayerPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<PlayerPrefs>;
    return {
      volume: typeof saved.volume === "number" && saved.volume >= 0 && saved.volume <= 1 ? saved.volume : DEFAULTS.volume,
      muted: saved.muted === true,
      shuffle: saved.shuffle === true,
      repeat: saved.repeat === "all" || saved.repeat === "one" ? saved.repeat : "off",
    };
  } catch {
    return DEFAULTS;
  }
}

// A tiny external store for useSyncExternalStore: the server renders the
// defaults, the browser reads localStorage, and React reconciles the two
// without a hydration mismatch.
export const prefsStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): PlayerPrefs {
    current ??= load();
    return current;
  },
  getServerSnapshot(): PlayerPrefs {
    return DEFAULTS;
  },
  update(patch: Partial<PlayerPrefs>) {
    current = { ...prefsStore.getSnapshot(), ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // still applies for this session
    }
    for (const listener of listeners) listener();
  },
};
