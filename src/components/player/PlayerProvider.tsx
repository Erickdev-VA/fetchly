"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { libraryMediaUrl, libraryThumbnailUrl } from "@/lib/api";
import { desktop } from "@/lib/desktop";
import { prefsStore, type PlayerPrefs } from "@/lib/player/prefs";
import {
  EMPTY_QUEUE,
  append,
  currentEntry,
  insertNext,
  makeEntries,
  newQueue,
  removeWhere,
  setShuffle,
  type QueueState,
} from "@/lib/player/queue";
import { isPlayerCommand, type PlayerSnapshot, type QueueEntry, type Track } from "@/lib/player/types";

/** Going back within this many seconds jumps to the previous song; later it restarts the current one. */
const RESTART_THRESHOLD_S = 3;
const ERROR_VISIBLE_MS = 5000;

export interface PlayerActions {
  /** Replaces the queue with `tracks` and plays from `startIndex`. */
  playTracks(tracks: Track[], startIndex: number): void;
  playNext(tracks: Track[]): void;
  addToQueue(tracks: Track[]): void;
  toggle(): void;
  next(): void;
  /** The <audio> element finished a song: like next(), except "repeat one" replays it. */
  ended(): void;
  previous(): void;
  seek(seconds: number): void;
  jumpTo(uid: string): void;
  removeFromQueue(uid: string): void;
  clearUpcoming(): void;
  /** Drops a song from the queue everywhere, stopping it if it's playing (used before deleting it). */
  forgetTrack(trackId: string): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
}

interface PlayerState extends PlayerPrefs {
  queue: QueueState;
  current: QueueEntry | null;
  playing: boolean;
  duration: number | null;
  hasPrevious: boolean;
  hasNext: boolean;
  error: string | null;
  queueOpen: boolean;
  setQueueOpen(open: boolean): void;
  actions: PlayerActions;
}

const PlayerContext = createContext<PlayerState | null>(null);
// Kept apart so the ~4 updates a second only re-render what shows the time.
const PositionContext = createContext(0);

export function usePlayer(): PlayerState {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return value;
}

export function usePlayerPosition(): number {
  return useContext(PositionContext);
}

/**
 * The music engine. It owns the app's only <audio> element and lives in the
 * (app) layout, which stays mounted across sections, so changing pages or
 * hiding the window to the tray never interrupts playback. The taskbar,
 * tray and mini player only send commands here and mirror its state.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [queue, setQueue] = useState<QueueState>(EMPTY_QUEUE);
  const queueRef = useRef(queue);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const prefs = useSyncExternalStore(prefsStore.subscribe, prefsStore.getSnapshot, prefsStore.getServerSnapshot);
  const failuresInARow = useRef(0);
  const errorTimer = useRef<number | null>(null);

  const actions = useMemo<PlayerActions>(() => {
    const audio = () => audioRef.current;

    const commit = (next: QueueState) => {
      queueRef.current = next;
      setQueue(next);
    };

    const load = (entry: QueueEntry | null, autoplay: boolean) => {
      const el = audio();
      if (!el) return;
      setPosition(0);
      if (!entry) {
        el.pause();
        el.removeAttribute("src");
        el.load();
        setDuration(null);
        return;
      }
      setDuration(entry.track.durationSeconds);
      el.src = libraryMediaUrl(entry.track.id);
      // A rejected play() here only means a newer src replaced this one.
      if (autoplay) el.play().catch(() => {});
    };

    const goTo = (index: number, autoplay = true) => {
      const next = { ...queueRef.current, index };
      commit(next);
      load(currentEntry(next), autoplay);
    };

    /** After removing slots: keep playing whatever took the current song's place. */
    const commitRemoval = (next: QueueState) => {
      const before = currentEntry(queueRef.current);
      const wasPlaying = !(audio()?.paused ?? true);
      commit(next);
      const after = currentEntry(next);
      if (after !== before) load(after, wasPlaying);
    };

    const advance = (auto: boolean) => {
      const q = queueRef.current;
      const { repeat } = prefsStore.getSnapshot();
      const el = audio();
      if (auto && repeat === "one" && el) {
        el.currentTime = 0;
        el.play().catch(() => {});
      } else if (q.index + 1 < q.order.length) {
        goTo(q.index + 1);
      } else if (repeat === "all" && q.order.length > 0) {
        goTo(0);
      } else if (auto && el) {
        // End of the queue: stay on the last song, rewound and paused.
        el.currentTime = 0;
      }
    };

    return {
      playTracks(tracks, startIndex) {
        const next = newQueue(makeEntries(tracks), startIndex, prefsStore.getSnapshot().shuffle);
        commit(next);
        load(currentEntry(next), true);
      },
      playNext(tracks) {
        const hadSong = currentEntry(queueRef.current) !== null;
        const next = insertNext(queueRef.current, makeEntries(tracks));
        commit(next);
        if (!hadSong) load(currentEntry(next), true);
      },
      addToQueue(tracks) {
        const hadSong = currentEntry(queueRef.current) !== null;
        const next = append(queueRef.current, makeEntries(tracks));
        commit(next);
        // Nothing was loaded: have the first one ready on the bar, paused.
        if (!hadSong) load(currentEntry(next), false);
      },
      toggle() {
        const el = audio();
        const q = queueRef.current;
        if (!el) return;
        if (!currentEntry(q)) {
          if (q.order.length > 0) goTo(0);
          return;
        }
        if (el.paused) el.play().catch(() => {});
        else el.pause();
      },
      next: () => advance(false),
      ended: () => advance(true),
      previous() {
        const el = audio();
        const q = queueRef.current;
        if (!el || !currentEntry(q)) return;
        if (el.currentTime > RESTART_THRESHOLD_S) {
          el.currentTime = 0;
        } else if (q.index > 0) {
          goTo(q.index - 1);
        } else if (prefsStore.getSnapshot().repeat === "all" && q.order.length > 1) {
          goTo(q.order.length - 1);
        } else {
          el.currentTime = 0;
        }
      },
      seek(seconds) {
        const el = audio();
        if (!el || !currentEntry(queueRef.current)) return;
        const end = Number.isFinite(el.duration) ? el.duration : seconds;
        el.currentTime = Math.min(Math.max(0, seconds), end);
        setPosition(el.currentTime);
      },
      jumpTo(uid) {
        const index = queueRef.current.order.findIndex((e) => e.uid === uid);
        if (index >= 0) goTo(index);
      },
      removeFromQueue(uid) {
        commitRemoval(removeWhere(queueRef.current, (e) => e.uid === uid));
      },
      clearUpcoming() {
        const q = queueRef.current;
        const keep = new Set(q.order.slice(0, q.index + 1));
        commit({ base: q.base.filter((e) => keep.has(e)), order: q.order.slice(0, q.index + 1), index: q.index });
      },
      forgetTrack(trackId) {
        commitRemoval(removeWhere(queueRef.current, (e) => e.track.id === trackId));
      },
      setVolume(volume) {
        prefsStore.update({ volume: Math.min(1, Math.max(0, volume)), muted: false });
      },
      toggleMute() {
        prefsStore.update({ muted: !prefsStore.getSnapshot().muted });
      },
      toggleShuffle() {
        const shuffle = !prefsStore.getSnapshot().shuffle;
        prefsStore.update({ shuffle });
        commit(setShuffle(queueRef.current, shuffle));
      },
      cycleRepeat() {
        const { repeat } = prefsStore.getSnapshot();
        prefsStore.update({ repeat: repeat === "off" ? "all" : repeat === "all" ? "one" : "off" });
      },
    };
  }, []);

  // Event handlers read the newest actions through this ref.
  const actionsRef = useRef(actions);

  const current = currentEntry(queue);
  const hasPrevious = current !== null;
  const hasNext = queue.index + 1 < queue.order.length || (prefs.repeat === "all" && queue.order.length > 1);

  // --- the <audio> element ---------------------------------------------------

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    // Squared, so the slider feels even: ears hear loudness, not amplitude.
    el.volume = prefs.volume * prefs.volume;
    el.muted = prefs.muted;
  }, [prefs.volume, prefs.muted]);

  const showError = (message: string) => {
    setError(message);
    if (errorTimer.current !== null) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(null), ERROR_VISIBLE_MS);
  };

  const onAudioError = () => {
    const q = queueRef.current;
    const entry = currentEntry(q);
    if (!entry) return;
    showError(`No se pudo reproducir «${entry.track.title}». Puede que el archivo se haya movido o borrado.`);
    // Skip ahead, but give up once every song in the queue has failed.
    failuresInARow.current++;
    if (failuresInARow.current < q.order.length) actionsRef.current.next();
  };

  // --- Windows media overlay, media keys ------------------------------------

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      // Separate play/pause, so a "pause" while already paused never resumes.
      ["play", () => audioRef.current?.paused && actionsRef.current.toggle()],
      ["pause", () => audioRef.current?.paused === false && actionsRef.current.toggle()],
      ["previoustrack", () => actionsRef.current.previous()],
      ["nexttrack", () => actionsRef.current.next()],
      ["seekto", (details) => details.seekTime !== undefined && actionsRef.current.seek(details.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // action not supported here
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // same as above
        }
      }
    };
  }, []);

  const track = current?.track ?? null;
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artist ?? "",
          album: "Fetchly",
          artwork: track.hasThumbnail
            ? [{ src: new URL(libraryThumbnailUrl(track.id), window.location.origin).href }]
            : [],
        })
      : null;
  }, [track]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = track ? (playing ? "playing" : "paused") : "none";
  }, [track, playing]);

  const updatePositionState = () => {
    const el = audioRef.current;
    if (!el || !("mediaSession" in navigator) || !Number.isFinite(el.duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: el.duration,
        position: Math.min(el.currentTime, el.duration),
        playbackRate: el.playbackRate,
      });
    } catch {
      // only a nicety for the overlay
    }
  };

  // --- Electron: taskbar buttons, tray menu, mini player --------------------

  // Listeners keep the clock running from position + positionAt, so the
  // snapshot only goes out when something else changes or the user seeks,
  // not on each of the ~4 time updates a second.
  const snapshotRef = useRef<Omit<PlayerSnapshot, "position" | "positionAt"> | null>(null);
  const publishedKeyRef = useRef("");
  const publish = (force: boolean) => {
    const base = snapshotRef.current;
    const player = desktop()?.player;
    if (!base || !player) return;
    const key = JSON.stringify(base);
    if (!force && key === publishedKeyRef.current) return;
    publishedKeyRef.current = key;
    player.publishState({ ...base, position: audioRef.current?.currentTime ?? 0, positionAt: Date.now() });
  };

  useEffect(() => {
    snapshotRef.current = {
      track: track && { id: track.id, title: track.title, artist: track.artist, hasThumbnail: track.hasThumbnail },
      playing,
      duration,
      volume: prefs.volume,
      muted: prefs.muted,
      shuffle: prefs.shuffle,
      repeat: prefs.repeat,
      hasPrevious,
      hasNext,
    };
    publish(false);
  });

  useEffect(() => {
    const player = desktop()?.player;
    if (!player) return;
    return player.onCommand((command) => {
      if (!isPlayerCommand(command)) return;
      const a = actionsRef.current;
      if (command.type === "toggle") a.toggle();
      else if (command.type === "next") a.next();
      else if (command.type === "previous") a.previous();
      else a.seek(command.seconds);
    });
  }, []);

  const value = useMemo<PlayerState>(
    () => ({
      queue,
      current,
      playing,
      duration,
      hasPrevious,
      hasNext,
      error,
      queueOpen,
      setQueueOpen,
      actions,
      ...prefs,
    }),
    [queue, current, playing, duration, hasPrevious, hasNext, error, queueOpen, actions, prefs],
  );

  return (
    <PlayerContext.Provider value={value}>
      <PositionContext.Provider value={position}>
        {children}
        <audio
          ref={audioRef}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onPlaying={() => {
            failuresInARow.current = 0;
            updatePositionState();
          }}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onDurationChange={(e) => {
            if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
            updatePositionState();
          }}
          onSeeked={() => {
            updatePositionState();
            publish(true);
          }}
          onEnded={() => actionsRef.current.ended()}
          onError={onAudioError}
          hidden
        />
      </PositionContext.Provider>
    </PlayerContext.Provider>
  );
}
