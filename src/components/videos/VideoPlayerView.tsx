"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fetchLibraryItem, libraryMediaUrl } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { LibraryEntry } from "@/lib/library/types";
import { forgetPosition, savePosition, savedPosition } from "@/lib/library/videoPositions";
import { ErrorBanner } from "../ErrorBanner";
import { PlatformBadge } from "../PlatformBadge";
import { usePlayer } from "../player/PlayerProvider";

/** Resuming is offered only past this point, and not in the last stretch of the video. */
const RESUME_MIN_S = 5;
const RESUME_END_MARGIN_S = 10;
const SAVE_EVERY_MS = 5000;

type Loaded = { entry: LibraryEntry; resumeAt: number | null };

/**
 * One video, played inside the app with the browser's own controls (full
 * screen included; Esc leaves it). Starting it pauses the music, and it
 * remembers where it was left so it can offer to continue from there.
 */
export function VideoPlayerView({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);
  const player = usePlayer();

  useEffect(() => {
    let live = true;
    // From a callback rather than the effect body, as react-hooks/set-state-in-effect asks.
    const timer = window.setTimeout(() => {
      fetchLibraryItem(id)
        .then(({ category, entry }) => {
          if (!live) return;
          if (category !== "video") throw new Error("Eso no es un video.");
          const saved = savedPosition(id);
          const end = entry.durationSeconds ?? Infinity;
          const resumeAt = saved !== null && saved >= RESUME_MIN_S && saved < end - RESUME_END_MARGIN_S ? saved : null;
          setLoaded({ entry, resumeAt });
        })
        .catch((err) => live && setError(err instanceof Error ? err.message : "No se pudo abrir el video."));
    }, 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [id]);

  const remember = (force: boolean) => {
    const video = videoRef.current;
    if (!video || video.currentTime <= 0) return;
    if (!force && Date.now() - lastSave.current < SAVE_EVERY_MS) return;
    lastSave.current = Date.now();
    savePosition(id, video.currentTime);
  };

  const start = (from: number) => {
    const video = videoRef.current;
    setAsking(false);
    if (!video) return;
    video.currentTime = from;
    void video.play().catch(() => {});
  };

  const entry = loaded?.entry ?? null;
  const offerResume = loaded?.resumeAt != null && asking;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-6">
      <Link href="/videos" className="mb-4 inline-flex w-fit items-center gap-1 text-sm text-white/50 transition hover:text-white">
        ← Videos
      </Link>

      {error && <ErrorBanner message={error} />}

      {entry && (
        <>
          <div className="relative overflow-hidden rounded-2xl bg-black">
            {entry.missing ? (
              <p className="flex aspect-video items-center justify-center px-6 text-center text-sm text-amber-300/90">
                No se encontró el archivo. Puede que se haya movido o borrado fuera de la app.
              </p>
            ) : (
              <video
                ref={videoRef}
                src={libraryMediaUrl(entry.id)}
                controls
                autoPlay={!offerResume}
                playsInline
                onPlay={() => {
                  player.actions.pause();
                  setAsking(false);
                }}
                onTimeUpdate={() => remember(false)}
                onPause={() => remember(true)}
                onEnded={() => forgetPosition(id)}
                className="mx-auto block max-h-[calc(100vh-260px)] w-full bg-black"
              />
            )}
            {offerResume && loaded?.resumeAt != null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
                <p className="text-sm text-white/80">Ya habías visto parte de este video.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => start(loaded.resumeAt ?? 0)}
                    className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                  >
                    Continuar desde {formatDuration(loaded.resumeAt)}
                  </button>
                  <button
                    type="button"
                    onClick={() => start(0)}
                    className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/[0.16]"
                  >
                    Desde el principio
                  </button>
                </div>
              </div>
            )}
          </div>

          <h1 className="mt-4 text-lg font-semibold leading-snug text-white">{entry.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/45">
            {entry.platform && <PlatformBadge platform={entry.platform} />}
            {entry.artist && <span>{entry.artist}</span>}
          </div>
        </>
      )}
    </div>
  );
}
