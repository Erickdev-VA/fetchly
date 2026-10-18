"use client";

import Link from "next/link";
import { useMemo } from "react";
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

// One row of each: as many cards as the columns at that width (see the grids below).
const PLAYLIST_CARDS = 6;
const VIDEO_CARDS = 4;
// A card past the columns of the current width is hidden, so each section is a single row.
const PLAYLIST_HIDE = ["", "", "", "hidden lg:block", "hidden xl:block", "hidden 2xl:block"];
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

  const resume = resumable(playableVideos, player.current?.track.id ?? null);

  const playVideo = (entry: LibraryEntry) => {
    const start = playableVideos.findIndex((v) => v.id === entry.id);
    if (start >= 0) player.actions.playVideos(playableVideos.map(toVideoTrack), start);
  };

  return (
    <div className={`${PAGE_CLASS} flex flex-col gap-10`}>
      <Link href="/descargar" className={`group flex items-center gap-5 px-5 py-5 lg:px-6 ${CARD_CLASS}`}>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white">
          <NavIcon name="link" className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold tracking-tight text-white lg:text-xl">Pega un enlace para guardar algo nuevo</span>
          <span className="mt-1 block text-sm text-white/50">
            Videos y playlists de YouTube, TikTok, reels de Instagram y videos de X. Tú eliges audio o video.
          </span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/80" aria-hidden>
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>

      {(player.current || resume) && (
        <section aria-labelledby="home-continue">
          <SectionHeader id="home-continue" title="Continuar" />
          <div className="grid gap-5 md:grid-cols-2">
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
          <ul className="grid grid-cols-3 gap-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {playlists.slice(0, PLAYLIST_CARDS).map((p, i) => (
              <li key={p.id} className={PLAYLIST_HIDE[i]}>
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

function SectionHeader({ id, title, link }: { id: string; title: string; link?: { href: string; label: string } }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 id={id} className="text-2xl font-bold tracking-tight text-white">
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
    <button type="button" onClick={onClick} className={`group flex items-center gap-5 p-4 text-left ${CARD_CLASS}`}>
      <div className={`relative h-[100px] shrink-0 overflow-hidden rounded-xl ${isVideo ? "w-[178px]" : "w-[100px]"}`}>
        <LibraryThumb id={track.id} hasThumbnail={track.hasThumbnail} fallbackIcon={isVideo ? "video" : "music"} className="h-full w-full" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/45">
          {player.playing ? (
            <>
              <PlayingBars className="h-8 gap-1 group-hover:hidden" barClassName="w-1.5" />
              <PlayerIcon name="pause" size={28} className="hidden text-white group-hover:block" />
            </>
          ) : (
            <PlayerIcon name="play" size={28} className="text-white" />
          )}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">{label}</p>
        <p className="mt-1.5 truncate text-lg font-semibold text-white" title={track.title}>
          {track.title}
        </p>
        <p className="mt-1 truncate text-sm text-white/45">
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
    <button type="button" onClick={onPlay} className={`group flex items-center gap-5 p-4 text-left ${CARD_CLASS}`}>
      <div className="relative h-[100px] w-[178px] shrink-0 overflow-hidden rounded-xl">
        <LibraryThumb id={entry.id} hasThumbnail={entry.hasThumbnail} fallbackIcon="video" className="h-full w-full" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 transition group-hover:bg-black/50">
          <PlayerIcon name="play" size={28} className="text-white" />
        </span>
        {progress !== null && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <span className="block h-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">Seguir viendo</p>
        <p className="mt-1.5 truncate text-lg font-semibold text-white" title={entry.title}>
          {entry.title}
        </p>
        <p className="mt-1 flex items-center gap-2 truncate text-sm text-white/45">
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
