"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaylists } from "@/hooks/useLibrary";
import { createPlaylist } from "@/lib/api";
import { NameDialog } from "./NameDialog";
import { PlaylistMosaic } from "./PlaylistMosaic";
import { playlistMeta } from "./PlaylistPicker";

const CARD_CLASS = "w-40 shrink-0 snap-start lg:w-44 2xl:w-52";

/**
 * The playlists, as one row of cards at the top of Música (Spotify's "Tu
 * biblioteca"): "+ Nueva playlist" first, then the most recently changed.
 * The row scrolls sideways, with ‹ › when it doesn't all fit. Hidden while
 * the library is empty and there are no playlists (`hideWhenEmpty`).
 */
export function PlaylistShelf({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean }) {
  const { playlists } = usePlaylists();
  const [creating, setCreating] = useState(false);
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
    <section aria-labelledby="playlists-heading" className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="playlists-heading" className="text-2xl font-bold tracking-tight text-white">
          Playlists
          {playlists.length > 0 && <span className="ml-2 text-sm font-normal text-white/40">{playlists.length}</span>}
        </h2>
        {!(edges.start && edges.end) && (
          <div className="flex gap-1">
            <ArrowButton direction={-1} disabled={edges.start} onClick={() => scrollBy(-1)} />
            <ArrowButton direction={1} disabled={edges.end} onClick={() => scrollBy(1)} />
          </div>
        )}
      </div>

      <ul
        ref={rowRef}
        onScroll={measure}
        className="-mx-2 flex snap-x scroll-px-2 gap-2 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <li className={CARD_CLASS}>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="group block w-full rounded-2xl p-2 text-left outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
          >
            <span className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed border-white/15 text-4xl font-light text-white/45 transition group-hover:border-white/30 group-hover:text-white/80">
              +
            </span>
            <span className="mt-3 block truncate text-[15px] font-medium text-white/90">Nueva playlist</span>
            <span className="mt-0.5 block truncate text-[13px] text-white/45">
              {playlists.length === 0 ? "Aún no tienes ninguna" : "Crear"}
            </span>
          </button>
        </li>
        {playlists.map((p) => (
          <li key={p.id} className={CARD_CLASS}>
            <Link
              href={`/playlists/${p.id}`}
              className="group block rounded-2xl p-2 outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
            >
              <PlaylistMosaic coverIds={p.coverIds} className="aspect-square w-full rounded-2xl shadow-lg shadow-black/40" />
              <p className="mt-3 truncate text-[15px] font-medium text-white/90" title={p.name}>
                {p.name}
              </p>
              <p className="mt-0.5 truncate text-[13px] text-white/45">{playlistMeta(p.count, p.durationSeconds)}</p>
            </Link>
          </li>
        ))}
      </ul>

      {creating && (
        <NameDialog
          title="Nueva playlist"
          submitLabel="Crear"
          onSubmit={async (name) => {
            const id = await createPlaylist(name);
            setCreating(false);
            router.push(`/playlists/${id}`);
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
