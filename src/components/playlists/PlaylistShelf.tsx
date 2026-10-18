"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPlaylist } from "@/lib/api";
import type { Category, PlaylistSummary } from "@/lib/library/types";
import { NameDialog } from "./NameDialog";
import { PlaylistMosaic } from "./PlaylistMosaic";
import { playlistMeta } from "./PlaylistPicker";

const CARD_CLASS = "w-[180px] shrink-0 snap-start lg:w-[212px]";

/** A playlist made this recently shows "Nueva" on its card. */
const NEW_FOR_MS = 24 * 60 * 60 * 1000;

/** Where a playlist's page is: songs under Música, videos under Videos. */
export function playlistHref(playlist: { id: string; kind: Category }): string {
  return playlist.kind === "video" ? `/videos/playlists/${playlist.id}` : `/playlists/${playlist.id}`;
}

/**
 * The playlists, as one row of cards at the top of Música or Videos
 * (Spotify's "Tu biblioteca"): "+ Nueva playlist" first, then the most
 * recently changed.
 * The row scrolls sideways, with ‹ › when it doesn't all fit. Hidden while
 * the library is empty and there are no playlists (`hideWhenEmpty`).
 */
export function PlaylistShelf({
  kind,
  playlists,
  hideWhenEmpty = false,
}: {
  kind: Category;
  playlists: PlaylistSummary[] | null;
  hideWhenEmpty?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  // Read once: the "Nueva" badges don't need to tick over while the page is open.
  const [now] = useState(() => Date.now());
  const router = useRouter();
  const rowRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    setEdges({ start: row.scrollLeft <= 1, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure, playlists]);

  if (!playlists || (hideWhenEmpty && playlists.length === 0)) return null;

  const scrollBy = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (row) row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section aria-labelledby="playlists-heading" className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="playlists-heading" className="text-2xl font-bold tracking-tight text-white lg:text-[28px]">
          Playlists
          {playlists.length > 0 && <span className="ml-2 text-base font-normal text-white/40">{playlists.length}</span>}
        </h2>
        <div className="flex min-w-0 items-center gap-4">
          <p className="hidden truncate text-[13px] text-white/45 md:block">
            {kind === "music"
              ? "Pega el enlace de una playlist de YouTube y se guarda aquí tal cual"
              : "Junta tus videos en el orden que quieras"}
          </p>
          {!(edges.start && edges.end) && (
            <div className="flex shrink-0 gap-1">
              <ArrowButton direction={-1} disabled={edges.start} onClick={() => scrollBy(-1)} />
              <ArrowButton direction={1} disabled={edges.end} onClick={() => scrollBy(1)} />
            </div>
          )}
        </div>
      </div>

      <ul
        ref={rowRef}
        onScroll={measure}
        className="-mx-2 flex snap-x scroll-px-2 gap-3 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <li className={CARD_CLASS}>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="group block w-full rounded-2xl p-2 text-left outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
          >
            <span className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] text-white/45 transition group-hover:border-white/30 group-hover:text-white/80">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="mt-3 block truncate text-[15px] font-semibold text-white/90">Nueva playlist</span>
            <span className="mt-0.5 block truncate text-[13px] text-white/45">
              {playlists.length === 0 ? "Aún no tienes ninguna" : kind === "music" ? "Crear o pegar enlace" : "Crear"}
            </span>
          </button>
        </li>
        {playlists.map((p) => (
          <li key={p.id} className={CARD_CLASS}>
            <Link
              href={playlistHref(p)}
              className="group block rounded-2xl p-2 outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
            >
              <div className="relative">
                <PlaylistMosaic coverIds={p.coverIds} className="aspect-square w-full rounded-2xl shadow-lg shadow-black/40" />
                {now - p.createdAt < NEW_FOR_MS && (
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold text-white shadow">
                    Nueva
                  </span>
                )}
              </div>
              <p className="mt-3 truncate text-[15px] font-semibold text-white/90" title={p.name}>
                {p.name}
              </p>
              <p className="mt-0.5 truncate text-[13px] text-white/45">{playlistMeta(p.count, p.durationSeconds, p.kind)}</p>
            </Link>
          </li>
        ))}
      </ul>

      {creating && (
        <NameDialog
          title="Nueva playlist"
          submitLabel="Crear"
          note={
            kind === "music" ? (
              <Link href="/descargar" onClick={() => setCreating(false)} className="text-[13px] text-white/50 underline-offset-4 transition hover:text-white hover:underline">
                ¿Tienes un enlace de una playlist? Pégalo en Descargar
              </Link>
            ) : undefined
          }
          onSubmit={async (name) => {
            const id = await createPlaylist(name, [], kind);
            setCreating(false);
            router.push(playlistHref({ id, kind }));
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </section>
  );
}

function ArrowButton({ direction, disabled, onClick }: { direction: 1 | -1; disabled: boolean; onClick: () => void }) {
  const label = direction === 1 ? "Ver más playlists" : "Ver las anteriores";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-white/70 outline-none transition enabled:hover:bg-white/[0.12] enabled:hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 disabled:opacity-30"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={direction === 1 ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
      </svg>
    </button>
  );
}
