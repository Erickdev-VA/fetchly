"use client";

import { useRef } from "react";
import { formatDuration } from "@/lib/format";
import type { Track } from "@/lib/player/types";
import { PlayerIcon } from "./PlayerIcon";

/** A click waits this long to see whether it's the first half of a double click (full screen). */
const DOUBLE_CLICK_MS = 250;

/**
 * Where a video is watched, Spotify style: over the whole window except the
 * playback bar, which is its only set of controls (and, in full screen, over
 * everything with the bar floating on top). Clicking the picture plays or
 * pauses it; a double click goes full screen. When hidden it keeps its
 * child, the app's one media element, mounted, so the sound goes on.
 */
export function VideoStage({
  shown,
  fullscreen,
  idle,
  playing,
  track,
  resumedFrom,
  onClose,
  onToggle,
  onToggleFullscreen,
  onRestart,
  onDismissNotice,
  children,
}: {
  shown: boolean;
  fullscreen: boolean;
  idle: boolean;
  playing: boolean;
  track: Track | null;
  /** Set while showing "Continuando desde…". */
  resumedFrom: number | null;
  onClose: () => void;
  onToggle: () => void;
  onToggleFullscreen: () => void;
  onRestart: () => void;
  onDismissNotice: () => void;
  children: React.ReactNode;
}) {
  const clickTimer = useRef<number | null>(null);
  const chrome = `transition-opacity duration-300 ${idle ? "pointer-events-none opacity-0" : "opacity-100"}`;

  return (
    <div
      className={
        shown
          ? `fixed inset-x-0 top-0 z-20 bg-black ${fullscreen ? "bottom-0" : "bottom-[76px]"} ${idle ? "cursor-none" : ""}`
          : "hidden"
      }
      aria-hidden={!shown}
    >
      {children}

      {shown && (
        <>
          {/* Clicks on the picture: one plays/pauses, two go full screen. */}
          <div
            className="absolute inset-0"
            onClick={() => {
              if (clickTimer.current !== null) return;
              clickTimer.current = window.setTimeout(() => {
                clickTimer.current = null;
                onToggle();
              }, DOUBLE_CLICK_MS);
            }}
            onDoubleClick={() => {
              if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
              clickTimer.current = null;
              onToggleFullscreen();
            }}
          />

          {!playing && track && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                <PlayerIcon name="play" size={30} />
              </span>
            </div>
          )}

          <div className={`absolute inset-x-0 top-0 flex items-start gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-5 pb-16 pt-4 ${chrome}`}>
            <button
              type="button"
              onClick={onClose}
              title="Cerrar video (Esc). Sigue sonando."
              aria-label="Cerrar video"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <PlayerIcon name="chevron-down" size={20} />
            </button>
            {track && (
              <div className="min-w-0 pt-0.5">
                <p className="truncate text-[15px] font-semibold text-white" title={track.title}>
                  {track.title}
                </p>
                {track.artist && <p className="truncate text-sm text-white/60">{track.artist}</p>}
              </div>
            )}
          </div>

          {resumedFrom !== null && (
            // Not faded with the rest: it shows up exactly when nobody touches the mouse, and goes away by itself.
            <div className="absolute bottom-5 left-5 flex items-center gap-3 rounded-full bg-black/75 py-2 pl-4 pr-2 text-sm text-white/85 backdrop-blur">
              <span>Continuando desde {formatDuration(resumedFrom) ?? "0:00"}</span>
              <button
                type="button"
                onClick={onRestart}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                Desde el principio
              </button>
              <button
                type="button"
                onClick={onDismissNotice}
                aria-label="Cerrar aviso"
                className="flex h-6 w-6 items-center justify-center rounded-full text-white/50 transition hover:text-white"
              >
                <PlayerIcon name="close" size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
