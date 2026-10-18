"use client";

import { useMemo } from "react";
import { useLibrary } from "@/hooks/useLibrary";
import { desktop } from "@/lib/desktop";
import type { LibraryEntry } from "@/lib/library/types";
import { toTrack, toVideoTrack } from "@/lib/player/types";
import { PlatformBadge } from "../PlatformBadge";
import { LibraryThumb } from "../library/LibraryThumb";
import { PlayingBars } from "../library/ListBits";
import { PlayerIcon } from "../player/PlayerIcon";
import { usePlayer } from "../player/PlayerProvider";

const RECENT_COUNT = 4;

const KINDS: { title: string; text: string; icon: React.ReactNode }[] = [
  {
    title: "Un video",
    text: "De YouTube o X. Lo bajas como MP3 o como MP4 en la calidad que quieras.",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m10 9.5 4.5 2.5-4.5 2.5z" />
      </>
    ),
  },
  {
    title: "Una playlist entera",
    text: "Pista lista todos los videos, tú quitas los que no quieres y se guarda como playlist.",
    icon: (
      <>
        <path d="M4 6h12M4 11h12M4 16h7" />
        <path d="M15 20v-6l5 3z" />
      </>
    ),
  },
  {
    title: "Un reel o publicación",
    text: "De Instagram, TikTok o X. Si la publicación trae varios videos, eliges cuáles.",
    icon: (
      <>
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M11 18.5h2" />
      </>
    ),
  },
];

/**
 * Descargar before anything is pasted: what kinds of links work, and the
 * latest songs and videos saved, ready to play.
 */
export function DownloadIntro() {
  return (
    <>
      <ul className="grid w-full gap-4 md:grid-cols-3">
        {KINDS.map((kind) => (
          <li key={kind.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]" aria-hidden>
              {kind.icon}
            </svg>
            <p className="mt-3 text-base font-semibold text-white">{kind.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/50">{kind.text}</p>
          </li>
        ))}
      </ul>
      <RecentDownloads />
    </>
  );
}

type Recent = { kind: "music" | "video"; entry: LibraryEntry };

function RecentDownloads() {
  const player = usePlayer();
  const { items: music } = useLibrary("music");
  const { items: videos } = useLibrary("video");
  const recent = useMemo<Recent[]>(() => {
    const all: Recent[] = [
      ...(music ?? []).map((entry) => ({ kind: "music" as const, entry })),
      ...(videos ?? []).map((entry) => ({ kind: "video" as const, entry })),
    ];
    return all
      .filter((r) => !r.entry.missing)
      .sort((a, b) => b.entry.createdAt - a.entry.createdAt)
      .slice(0, RECENT_COUNT);
  }, [music, videos]);

  if (recent.length === 0) return null;
  const bridge = desktop();
  const currentId = player.current?.track.id ?? null;

  return (
    <section className="w-full">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-bold text-white">Bajado hace poco</h2>
        {bridge && (
          <button
            type="button"
            onClick={() => void bridge.openLibraryFolder("root")}
            className="text-sm font-medium text-[var(--accent)] underline-offset-4 transition hover:underline"
          >
            Abrir carpeta
          </button>
        )}
      </div>
      <ul className="flex flex-col">
        {recent.map(({ kind, entry }) => {
          const isCurrent = entry.id === currentId;
          const play = () =>
            kind === "music" ? player.actions.playTracks([toTrack(entry)], 0) : player.actions.playVideos([toVideoTrack(entry)], 0);
          return (
            <li key={entry.id} className="group flex items-center gap-4 rounded-xl px-2.5 py-2 transition hover:bg-white/[0.04]">
              <button type="button" onClick={play} tabIndex={-1} aria-hidden className="shrink-0">
                <LibraryThumb
                  id={entry.id}
                  hasThumbnail={entry.hasThumbnail}
                  fallbackIcon={kind}
                  className={`${kind === "music" ? "w-12" : "w-[85px]"} h-12 rounded-lg`}
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[15px] font-medium ${isCurrent ? "text-[var(--accent)]" : "text-white"}`}>{entry.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-white/45">
                  {entry.platform && <PlatformBadge platform={entry.platform} />}
                  {entry.platform && <span aria-hidden>·</span>}
                  <span>{whenSaved(entry.createdAt)}</span>
                </p>
              </div>
              <span className="hidden shrink-0 rounded-full bg-white/[0.07] px-2.5 py-1 text-xs font-medium text-white/70 sm:block">
                {kind === "music" ? "Audio" : "Video"}
              </span>
              <button
                type="button"
                onClick={play}
                aria-label={`Reproducir ${entry.title}`}
                title="Reproducir"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-white outline-none transition hover:scale-105 hover:border-white/30 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
              >
                {isCurrent && player.playing ? (
                  <PlayingBars className="h-3.5" />
                ) : (
                  <PlayerIcon name="play" size={16} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const dateFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

/** "hoy", "ayer", "hace 3 días", or the date once it's more than a week old. */
function whenSaved(timestamp: number): string {
  const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((startOf(Date.now()) - startOf(timestamp)) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return dateFormat.format(timestamp);
}
