"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { libraryMediaUrl, libraryThumbnailUrl } from "@/lib/api";
import { desktop } from "@/lib/desktop";
import { prefsStore, type PlayerPrefs } from "@/lib/player/prefs";
import {
  EMPTY_QUEUE,
  append,
  currentEntry,
  insertNext,
  makeEntries,
  moveUpcoming,
  newQueue,
  removeWhere,
  setShuffle,
  type QueueState,
} from "@/lib/player/queue";
import { isPlayerCommand, type PlayerSnapshot, type QueueEntry, type Track } from "@/lib/player/types";
import { forgetPosition, savePosition, savedPosition } from "@/lib/library/videoPositions";
import { VideoStage } from "./VideoStage";

/** Going back within this many seconds jumps to the previous song; later it restarts the current one. */
const RESTART_THRESHOLD_S = 3;
const ERROR_VISIBLE_MS = 5000;
// Videos pick up where they were left: only past this point, and not in the last stretch.
const RESUME_MIN_S = 5;
const RESUME_END_MARGIN_S = 10;
const VIDEO_SAVE_EVERY_MS = 5000;
const RESUME_NOTICE_MS = 8000;
/** Over a video, the controls fade out after this long without the mouse moving. */
const IDLE_MS = 3000;

/** Remembers where a video was left (or forgets it once it was watched to the end). */
function rememberVideoPosition(entry: QueueEntry | null, el: HTMLMediaElement | null): void {
  if (!entry || entry.track.kind !== "video" || !el || el.currentTime <= 0) return;
  const end = Number.isFinite(el.duration) ? el.duration : (entry.track.durationSeconds ?? Infinity);
  if (end - el.currentTime < RESUME_END_MARGIN_S) forgetPosition(entry.track.id);
  else savePosition(entry.track.id, el.currentTime);
}

export interface PlayerActions {
  /** Replaces the queue with `tracks` and plays from `startIndex`. */
  playTracks(tracks: Track[], startIndex: number): void;
  /** Like playTracks, for videos: also opens the full-window video view. */
  playVideos(tracks: Track[], startIndex: number): void;
  /** Turns shuffle on and plays `tracks` from a random one. */
  shuffleTracks(tracks: Track[]): void;
  playNext(tracks: Track[]): void;
  addToQueue(tracks: Track[]): void;
  toggle(): void;
  /** Pauses playback if it is playing. */
  pause(): void;
  next(): void;
  /** The media element finished a song: like next(), except "repeat one" replays it. */
  ended(): void;
  previous(): void;
  seek(seconds: number): void;
  jumpTo(uid: string): void;
  removeFromQueue(uid: string): void;
  /** Drag and drop in "A continuación": puts `uids` right before (or after) `targetUid`. */
  moveInQueue(uids: string[], targetUid: string, after: boolean): void;
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
  /** The current video fills the window (only ever true while a video is the current track). */
  videoOpen: boolean;
  openVideo(): void;
  closeVideo(): void;
  /** The window is in full screen, showing the video and the bar. */
  fullscreen: boolean;
  toggleFullscreen(): void;
  /** Over a video, the mouse hasn't moved for a while: controls fade out. */
  idle: boolean;
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
 * The playback engine, for songs and videos alike. It owns the app's only
 * media element (a <video>, which plays songs just as well) and lives in the
 * (app) layout, which stays mounted across sections, so changing pages or
 * hiding the window to the tray never interrupts playback. A video's picture
 * shows in VideoStage, over the whole window; the playback bar controls both.
 * The taskbar, tray and mini player only send commands here and mirror its
 * state.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const mediaRef = useRef<HTMLVideoElement>(null);
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
  const [videoOpen, setVideoOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  /** "Continuando desde 3:12" for the video in this queue slot. */
  const [resumeNotice, setResumeNotice] = useState<{ uid: string; from: number } | null>(null);
  /** The slot whose file is in the media element now. */
  const loadedRef = useRef<QueueEntry | null>(null);
  /** Where to jump once the video being loaded knows its length. */
  const resumeRef = useRef<number | null>(null);
  const lastVideoSave = useRef(0);

  const actions = useMemo<PlayerActions>(() => {
    const media = () => mediaRef.current;

    const commit = (next: QueueState) => {
      queueRef.current = next;
      setQueue(next);
    };

    const load = (entry: QueueEntry | null, autoplay: boolean) => {
      const el = media();
      if (!el) return;
      // Leaving a video halfway: remember where, to pick it up from there next time.
      if (loadedRef.current && loadedRef.current !== entry) rememberVideoPosition(loadedRef.current, el);
      loadedRef.current = entry;
      resumeRef.current = null;
      setPosition(0);
      if (!entry) {
        el.pause();
        el.removeAttribute("src");
        el.load();
        setDuration(null);
        return;
      }
      setDuration(entry.track.durationSeconds);
      if (entry.track.kind === "video") resumeRef.current = savedPosition(entry.track.id);
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
      const wasPlaying = !(media()?.paused ?? true);
      commit(next);
      const after = currentEntry(next);
      if (after !== before) load(after, wasPlaying);
    };

    const advance = (auto: boolean) => {
      const q = queueRef.current;
      const { repeat } = prefsStore.getSnapshot();
      const el = media();
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

    const startQueue = (tracks: Track[], startIndex: number) => {
      const next = newQueue(makeEntries(tracks), startIndex, prefsStore.getSnapshot().shuffle);
      commit(next);
      load(currentEntry(next), true);
    };

    return {
      playTracks:(tracks, startIndex) => startQueue(tracks, startIndex),
      playVideos(tracks, startIndex) {
        startQueue(tracks, startIndex);
        setIdle(false);
        setVideoOpen(true);
      },
      shuffleTracks(tracks) {
        if (tracks.length === 0) return;
        prefsStore.update({ shuffle: true });
        const next = newQueue(makeEntries(tracks), Math.floor(Math.random() * tracks.length), true);
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
        const el = media();
        const q = queueRef.current;
        if (!el) return;
        if (!currentEntry(q)) {
          if (q.order.length > 0) goTo(0);
          return;
        }
        if (el.paused) el.play().catch(() => {});
        else el.pause();
      },
      pause() {
        media()?.pause();
      },
      next: () => advance(false),
      ended: () => advance(true),
      previous() {
        const el = media();
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
        const el = media();
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
      moveInQueue(uids, targetUid, after) {
        const next = moveUpcoming(queueRef.current, uids, targetUid, after);
        if (next !== queueRef.current) commit(next);
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

  // --- the video view: full window, full screen, idle controls ----------------

  // Moving on to a song closes the view by itself: it only ever shows a video.
  const stageShown = videoOpen && current?.track.kind === "video";

  const openVideo = useCallback(() => {
    setIdle(false);
    setVideoOpen(true);
  }, []);
  const closeVideo = useCallback(() => setVideoOpen(false), []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    // The whole page, so the playback bar stays with the video.
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Full screen is for the video: leaving the view leaves it too.
  useEffect(() => {
    if (!stageShown && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [stageShown]);

  // Over the video, the controls fade out when the mouse rests, except over the bar.
  useEffect(() => {
    if (!stageShown) return;
    let timer = 0;
    const wake = (event: Event) => {
      setIdle(false);
      window.clearTimeout(timer);
      const overBar = event.target instanceof Element && event.target.closest("footer") !== null;
      if (!overBar) timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, button, [role=slider], dialog") !== null && target !== null;
      if (event.key === "Escape" && !document.fullscreenElement) setVideoOpen(false);
      else if (event.key === " " && !typing) {
        event.preventDefault();
        actionsRef.current.toggle();
      } else if (event.key.toLowerCase() === "f" && !typing) toggleFullscreen();
    };
    timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    window.addEventListener("mousemove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", keys);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", keys);
    };
  }, [stageShown, toggleFullscreen]);

  // "Continuando desde…" goes away by itself after a few seconds.
  useEffect(() => {
    if (!resumeNotice) return;
    const timer = window.setTimeout(() => setResumeNotice(null), RESUME_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [resumeNotice]);

  // --- the media element -------------------------------------------------------

  useEffect(() => {
    const el = mediaRef.current;
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

  const onMediaError = () => {
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
      ["play", () => mediaRef.current?.paused && actionsRef.current.toggle()],
      ["pause", () => mediaRef.current?.paused === false && actionsRef.current.toggle()],
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
          album: "Pista",
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
    const el = mediaRef.current;
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
    player.publishState({ ...base, position: mediaRef.current?.currentTime ?? 0, positionAt: Date.now() });
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
      else if (command.type === "seek") a.seek(command.seconds);
      else if (command.type === "volume") a.setVolume(command.volume);
      else if (command.type === "toggleShuffle") a.toggleShuffle();
      else a.toggleMute();
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
      videoOpen: stageShown,
      openVideo,
      closeVideo,
      fullscreen,
      toggleFullscreen,
      idle: stageShown && idle,
      actions,
      ...prefs,
    }),
    [
      queue,
      current,
      playing,
      duration,
      hasPrevious,
      hasNext,
      error,
      queueOpen,
      stageShown,
      openVideo,
      closeVideo,
      fullscreen,
      toggleFullscreen,
      idle,
      actions,
      prefs,
    ],
  );

  const notice = resumeNotice && resumeNotice.uid === current?.uid ? resumeNotice.from : null;

  return (
    <PlayerContext.Provider value={value}>
      <PositionContext.Provider value={position}>
        {children}
        {/* Always mounted, in the same place: moving or remounting it would cut the sound. */}
        <VideoStage
          shown={stageShown}
          fullscreen={fullscreen}
          idle={stageShown && idle}
          playing={playing}
          track={current?.track ?? null}
          resumedFrom={notice}
          onClose={closeVideo}
          onToggle={actions.toggle}
          onToggleFullscreen={toggleFullscreen}
          onRestart={() => {
            actions.seek(0);
            setResumeNotice(null);
          }}
          onDismissNotice={() => setResumeNotice(null)}
        >
          <video
            ref={mediaRef}
            preload="auto"
            playsInline
            onPlay={() => setPlaying(true)}
            onPause={(e) => {
              setPlaying(false);
              rememberVideoPosition(loadedRef.current, e.currentTarget);
            }}
            onPlaying={() => {
              failuresInARow.current = 0;
              updatePositionState();
            }}
            onLoadedMetadata={(e) => {
              // A video left halfway picks up there, with a note offering to start over.
              const from = resumeRef.current;
              resumeRef.current = null;
              const el = e.currentTarget;
              const entry = loadedRef.current;
              if (from === null || !entry || !Number.isFinite(el.duration)) return;
              if (from < RESUME_MIN_S || from > el.duration - RESUME_END_MARGIN_S) return;
              el.currentTime = from;
              setResumeNotice({ uid: entry.uid, from });
            }}
            onTimeUpdate={(e) => {
              setPosition(e.currentTarget.currentTime);
              if (Date.now() - lastVideoSave.current >= VIDEO_SAVE_EVERY_MS) {
                lastVideoSave.current = Date.now();
                rememberVideoPosition(loadedRef.current, e.currentTarget);
              }
            }}
            onDurationChange={(e) => {
              if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
              updatePositionState();
            }}
            onSeeked={() => {
              updatePositionState();
              publish(true);
            }}
            onEnded={() => {
              const entry = loadedRef.current;
              if (entry?.track.kind === "video") forgetPosition(entry.track.id);
              actionsRef.current.ended();
            }}
            onError={onMediaError}
            className="h-full w-full bg-black object-contain"
          />
        </VideoStage>
      </PositionContext.Provider>
    </PlayerContext.Provider>
  );
}
