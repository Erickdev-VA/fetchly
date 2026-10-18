"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLibrary, usePlaylists } from "@/hooks/useLibrary";
import { formatDuration } from "@/lib/format";
import { recentPositions } from "@/lib/library/videoPositions";
import type { LibraryEntry, PlaylistSummary } from "@/lib/library/types";
import { toVideoTrack } from "@/lib/player/types";
import { PlatformBadge } from "../PlatformBadge";
import { LibraryThumb } from "../library/LibraryThumb";
import { PlayingBars } from "../library/ListBits";
import { PlayerIcon } from "../player/PlayerIcon";
import { usePlayer, usePlayerPosition } from "../player/PlayerProvider";
import { PlaylistMosaic } from "../playlists/PlaylistMosaic";
import { NavIcon } from "../shell/NavIcon";
import { PAGE_CLASS } from "../shell/PageHeader";

// Playlist cards keep one size (px, matches w-[220px] and gap-5); the row shows as many as fit.
const PLAYLIST_CARD_PX = 220;
const PLAYLIST_GAP_PX = 20;
// Videos: one row, as many cards as the columns at that width (see the grid below).
const VIDEO_CARDS = 4;
const VIDEO_HIDE = ["", "", "hidden md:block", "hidden xl:block"];

const CARD_CLASS =
  "rounded-2xl border border-white/[0.06] bg-white/[0.03] outline-none transition hover:border-white/10 hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60";

/**
 * Inicio: a way into Descargar, what was playing or left half watched, and
 * the latest playlists and videos, each with a link to the whole section.
 * A section with nothing to show is left out.
 */
export function HomePage() {
  const player = usePlayer();
  const { playlists } = usePlaylists();
  const { items: videos } = useLibrary("video");
  const playableVideos = useMemo(() => (videos ?? []).filter((v) => !v.missing), [videos]);

  const playlistRow = useRef<HTMLUListElement>(null);
  const playlistsShown = useFitCount(playlistRow, PLAYLIST_CARD_PX, PLAYLIST_GAP_PX);

  const resume = resumable(playableVideos, player.current?.track.id ?? null);

  const playVideo = (entry: LibraryEntry) => {
    const start = playableVideos.findIndex((v) => v.id === entry.id);
    if (start >= 0) player.actions.playVideos(playableVideos.map(toVideoTrack), start);
  };

  return (
    <div className={`${PAGE_CLASS} flex flex-col gap-8`}>
      <LinkCard />

      {(player.current || resume) && (
        <section aria-labelledby="home-continue">
          <SectionHeader id="home-continue" title="Continuar" />
          <div className="grid gap-4 md:grid-cols-2">
            {player.current && <NowPlayingCard />}
            {resume && <ResumeCard entry={resume.entry} seconds={resume.seconds} onPlay={() => playVideo(resume.entry)} />}
          </div>
        </section>
      )}

      {playlists && playlists.length > 0 && (
        <section aria-labelledby="home-playlists">
          <SectionHeader
            id="home-playlists"
            title="Playlists"
            link={{ href: "/musica", label: playlists.length === 1 ? "Ver la playlist" : `Ver las ${playlists.length}` }}
          />
          <ul ref={playlistRow} className="flex gap-5 overflow-hidden">
            {playlists.slice(0, playlistsShown).map((p) => (
              <li key={p.id} className="w-[220px] shrink-0">
                <PlaylistCard playlist={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {playableVideos.length > 0 && (
        <section aria-labelledby="home-videos">
          <SectionHeader
            id="home-videos"
            title="Tus videos"
            link={{ href: "/videos", label: playableVideos.length === 1 ? "Ver el video" : `Ver los ${playableVideos.length}` }}
          />
          <ul className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
            {playableVideos.slice(0, VIDEO_CARDS).map((v, i) => (
              <li key={v.id} className={VIDEO_HIDE[i]}>
                <VideoCard entry={v} onPlay={() => playVideo(v)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// "Pega un enlace…" on Inicio, until its ✕ hides it for good (this computer only).
const LINK_CARD_KEY = "pista.home.linkCardHidden";
const linkCardListeners = new Set<() => void>();

function linkCardHidden(): boolean {
  try {
    return localStorage.getItem(LINK_CARD_KEY) === "1";
  } catch {
    return false;
  }
}

function hideLinkCard(): void {
  try {
    localStorage.setItem(LINK_CARD_KEY, "1");
  } catch {}
  for (const listener of linkCardListeners) listener();
}

function subscribeLinkCard(listener: () => void): () => void {
  linkCardListeners.add(listener);
  return () => linkCardListeners.delete(listener);
}

/** The way into Descargar, with a ✕ in its corner to remove it. */
function LinkCard() {
  // Left out of the server render, so a hidden card never flashes in.
  const hidden = useSyncExternalStore(subscribeLinkCard, linkCardHidden, () => true);
  if (hidden) return null;
  return (
    <div className="relative w-full max-w-[640px]">
      <Link href="/descargar" className={`group flex w-full items-center gap-4 py-3.5 pl-4 pr-10 ${CARD_CLASS}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white">
          <NavIcon name="link" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold tracking-tight text-white">Pega un enlace para guardar algo nuevo</span>
          <span className="mt-0.5 block text-[13px] text-white/50">
            YouTube, TikTok, Instagram y X. Tú eliges audio o video.
          </span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/80" aria-hidden>
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>
      <button
        type="button"
        onClick={hideLinkCard}
        aria-label="Quitar este mensaje"
        title="Quitar"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-white/35 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

/** The video watched most recently that was left before the end (and isn't the one playing). */
function resumable(videos: LibraryEntry[], currentId: string | null): { entry: LibraryEntry; seconds: number } | null {
  if (videos.length === 0) return null;
  const byId = new Map(videos.map((v) => [v.id, v]));
  for (const { id, seconds } of recentPositions()) {
    const entry = byId.get(id);
    if (entry && id !== currentId) return { entry, seconds };
  }
  return null;
}

/** How many cards of `cardPx` (with `gapPx` between) fit across `ref`'s width, at least one. */
function useFitCount(ref: React.RefObject<HTMLElement | null>, cardPx: number, gapPx: number): number {
  const [count, setCount] = useState(5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setCount(Math.max(1, Math.floor((el.clientWidth + gapPx) / (cardPx + gapPx))));
    });
    observer.observe(el);
    return () => observer.disconnect();
  });
  return count;
}

function SectionHeader({ id, title, link }: { id: string; title: string; link?: { href: string; label: string } }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 id={id} className="text-xl font-bold tracking-tight text-white">
        {title}
      </h2>
      {link && (
        <Link
          href={link.href}
          className="shrink-0 rounded text-sm font-medium text-white/55 underline underline-offset-4 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
        >
          {link.label}
        </Link>
      )}
    </div>
  );
}

/** What the player has: a click plays or pauses it (a video opens over the window). */
function NowPlayingCard() {
  const player = usePlayer();
  const current = player.current;
  if (!current) return null;
  const { track } = current;
  const isVideo = track.kind === "video";
  const onClick = () => {
    if (isVideo) {
      player.openVideo();
      if (!player.playing) player.actions.toggle();
    } else {
      player.actions.toggle();
    }
  };
  const label = player.playing ? (isVideo ? "Viendo ahora" : "Sonando ahora") : "En pausa";

  return (
    <button type="button" onClick={onClick} className={`group flex items-center gap-4 p-3 text-left ${CARD_CLASS}`}>
      <div className={`relative h-16 shrink-0 overflow-hidden rounded-lg ${isVideo ? "w-[114px]" : "w-16"}`}>
        <LibraryThumb id={track.id} hasThumbnail={track.hasThumbnail} fallbackIcon={isVideo ? "video" : "music"} className="h-full w-full" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/45">
          {player.playing ? (
            <>
              <PlayingBars className="h-5 gap-[3px] group-hover:hidden" barClassName="w-1" />
              <PlayerIcon name="pause" size={22} className="hidden text-white group-hover:block" />
            </>
          ) : (
            <PlayerIcon name="play" size={22} className="text-white" />
          )}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">{label}</p>
        <p className="mt-1 truncate text-[15px] font-semibold text-white" title={track.title}>
          {track.title}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-white/45">
          {track.artist && <>{track.artist} · </>}
          <NowTime duration={player.duration ?? track.durationSeconds} />
        </p>
      </div>
    </button>
  );
}

/** "1:14 / 4:38", on its own so only it re-renders as the song moves. */
function NowTime({ duration }: { duration: number | null }) {
  const position = usePlayerPosition();
  const total = formatDuration(duration);
  return (
    <span className="tabular-nums">
      {formatDuration(position) ?? "0:00"}
      {total && ` / ${total}`}
    </span>
  );
}

function ResumeCard({ entry, seconds, onPlay }: { entry: LibraryEntry; seconds: number; onPlay: () => void }) {
  const duration = entry.durationSeconds;
  const progress = duration ? Math.min(100, (seconds / duration) * 100) : null;
  const minutesLeft = duration ? Math.max(1, Math.round((duration - seconds) / 60)) : null;
  return (
    <button type="button" onClick={onPlay} className={`group flex items-center gap-4 p-3 text-left ${CARD_CLASS}`}>
      <div className="relative h-16 w-[114px] shrink-0 overflow-hidden rounded-lg">
        <LibraryThumb id={entry.id} hasThumbnail={entry.hasThumbnail} fallbackIcon="video" className="h-full w-full" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 transition group-hover:bg-black/50">
          <PlayerIcon name="play" size={22} className="text-white" />
        </span>
        {progress !== null && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <span className="block h-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">Seguir viendo</p>
        <p className="mt-1 truncate text-[15px] font-semibold text-white" title={entry.title}>
          {entry.title}
        </p>
        <p className="mt-0.5 flex items-center gap-2 truncate text-[13px] text-white/45">
          {entry.platform && <PlatformBadge platform={entry.platform} />}
          {minutesLeft !== null && <span>quedan {minutesLeft} min</span>}
        </p>
      </div>
    </button>
  );
}

function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <Link
      href={`/playlists/${playlist.id}`}
      className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
    >
      <PlaylistMosaic
        coverIds={playlist.coverIds}
        className="aspect-square w-full rounded-2xl shadow-lg shadow-black/40 transition group-hover:brightness-110"
      />
      <p className="mt-3 truncate text-[15px] font-medium text-white/90" title={playlist.name}>
        {playlist.name}
      </p>
      <p className="mt-0.5 truncate text-[13px] text-white/45">
        Playlist · {playlist.count} canci{playlist.count === 1 ? "ón" : "ones"}
      </p>
    </Link>
  );
}

function VideoCard({ entry, onPlay }: { entry: LibraryEntry; onPlay: () => void }) {
  const duration = formatDuration(entry.durationSeconds);
  return (
    <button type="button" onClick={onPlay} className="group block w-full rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
      <div className="relative">
        <LibraryThumb
          id={entry.id}
          hasThumbnail={entry.hasThumbnail}
          fallbackIcon="video"
          className="aspect-video w-full rounded-2xl shadow-lg shadow-black/40 transition group-hover:brightness-110"
        />
        {duration && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {duration}
          </span>
        )}
      </div>
      <p className="mt-3 line-clamp-2 text-[15px] font-medium leading-snug text-white/90" title={entry.title}>
        {entry.title}
      </p>
      <div className="mt-1 flex items-center gap-2 text-[13px] text-white/45">
        {entry.platform && <PlatformBadge platform={entry.platform} />}
        {entry.artist && <span className="truncate">{entry.artist}</span>}
      </div>
    </button>
  );
}
