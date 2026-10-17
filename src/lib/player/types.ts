import type { LibraryEntry } from "../library/types";

/** What the player needs to know about a song. */
export interface Track {
  id: string;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  hasThumbnail: boolean;
}

export function toTrack(entry: LibraryEntry): Track {
  return {
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    durationSeconds: entry.durationSeconds,
    hasThumbnail: entry.hasThumbnail,
  };
}

/** One slot in the queue. The same song can be queued twice, so slots have their own id. */
export interface QueueEntry {
  uid: string;
  track: Track;
}

export type RepeatMode = "off" | "all" | "one";

/**
 * Commands that arrive from outside the page: the taskbar thumbnail
 * buttons, the tray menu and (later) the mini player.
 */
export type PlayerCommand =
  | { type: "toggle" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "seek"; seconds: number };

/**
 * What the page tells Electron after every change, so the taskbar, tray
 * and mini player show the same song and state as the bar.
 */
export interface PlayerSnapshot {
  track: { id: string; title: string; artist: string | null; hasThumbnail: boolean } | null;
  playing: boolean;
  /** Seconds into the song when the snapshot was taken... */
  position: number;
  /** ...at this Date.now(), so a listener can keep the clock running. */
  positionAt: number;
  duration: number | null;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function isPlayerCommand(value: unknown): value is PlayerCommand {
  if (typeof value !== "object" || value === null) return false;
  const { type, seconds } = value as { type?: unknown; seconds?: unknown };
  if (type === "seek") return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0;
  return type === "toggle" || type === "next" || type === "previous";
}
