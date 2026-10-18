"use client";

import { useEffect, useMemo, useState } from "react";
import { addToPlaylist, fetchLibrary } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { Category, LibraryEntry } from "@/lib/library/types";
import { LibraryThumb } from "../library/LibraryThumb";

/** Lowercase and without accents, so "cancion" finds "Canción". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const noun = (kind: Category, n: number) =>
  kind === "music" ? `${n} canci${n === 1 ? "ón" : "ones"}` : `${n} video${n === 1 ? "" : "s"}`;

/**
 * "Añadir canciones" (or videos) inside a playlist: every song in the app,
 * also the ones kept only in other playlists, to tick and add at the end.
 * The ones already in this playlist show as such and can't be picked.
 */
export function AddItemsDialog({
  kind,
  playlistId,
  playlistName,
  existingIds,
  onAdded,
  onClose,
}: {
  kind: Category;
  playlistId: string;
  playlistName: string;
  existingIds: Set<string>;
  onAdded: (added: number) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchLibrary(kind, true).then(
      ({ items }) => live && setEntries(items.filter((e) => !e.missing)),
      () => live && setLoadError("No se pudo cargar tu biblioteca."),
    );
    return () => {
      live = false;
    };
  }, [kind]);

  const visible = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!entries || words.length === 0) return entries ?? [];
    return entries.filter((e) => {
      const haystack = fold(`${e.title} ${e.artist ?? ""}`);
      return words.every((w) => haystack.includes(w));
    });
  }, [entries, query]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (picked.size === 0 || busy || !entries) return;
    setBusy(true);
    try {
      // In the library's order (newest first), whatever the clicking order.
      const added = await addToPlaylist(
        playlistId,
        entries.filter((e) => picked.has(e.id)).map((e) => e.id),
      );
      onAdded(added);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron añadir.");
      setBusy(false);
    }
  };

  const title = kind === "music" ? "Añadir canciones" : "Añadir videos";

  return (
    <dialog
      ref={(dialog) => {
        if (dialog && !dialog.open) dialog.showModal();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
      className="m-auto flex h-[min(680px,calc(100vh-64px))] w-[min(640px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17171b] p-0 text-white backdrop:bg-black/60 [&:not([open])]:hidden"
    >
      <div className="px-5 pb-3 pt-5">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-0.5 truncate text-[13px] text-white/45">a «{playlistName}»</p>
        <label className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition-colors focus-within:border-white/25">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-white/35" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título o artista"
            aria-label="Buscar"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35 [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto border-y border-white/[0.06] px-2 py-2">
        {loadError ? (
          <li className="px-3 py-10 text-center text-sm text-red-300">{loadError}</li>
        ) : !entries ? (
          <li className="px-3 py-10 text-center text-sm text-white/40">Cargando…</li>
        ) : visible.length === 0 ? (
          <li className="px-3 py-10 text-center text-sm text-white/40">
            {entries.length === 0 ? (kind === "music" ? "Aún no tienes canciones." : "Aún no tienes videos.") : "Sin resultados"}
          </li>
        ) : (
          visible.map((entry) => {
            const already = existingIds.has(entry.id);
            const checked = picked.has(entry.id);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={already || checked}
                  disabled={already}
                  onClick={() => toggle(entry.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition enabled:hover:bg-white/[0.05] disabled:cursor-default"
                >
                  <span
                    aria-hidden
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition ${
                      already ? "border-white/10 bg-white/10" : checked ? "border-[var(--accent)] bg-[var(--accent)]" : "border-white/25"
                    }`}
                  >
                    {(checked || already) && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.2 5 8.5l4.5-5" stroke="white" strokeOpacity={already ? 0.5 : 1} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <LibraryThumb
                    id={entry.id}
                    hasThumbnail={entry.hasThumbnail}
                    fallbackIcon={kind}
                    className={`${kind === "music" ? "w-10" : "w-[71px]"} h-10 shrink-0 rounded-md ${already ? "opacity-50" : ""}`}
                  />
                  <span className={`min-w-0 flex-1 ${already ? "opacity-50" : ""}`}>
                    <span className="block truncate text-sm text-white/90">{entry.title}</span>
                    <span className="block truncate text-xs text-white/40">{entry.artist ?? "—"}</span>
                  </span>
                  {already ? (
                    <span className="shrink-0 text-xs text-white/40">Ya está</span>
                  ) : (
                    <span className="shrink-0 text-[13px] tabular-nums text-white/40">{formatDuration(entry.durationSeconds) ?? ""}</span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="flex items-center gap-3 px-5 py-4">
        <p className="min-w-0 flex-1 text-[13px] text-white/50">
          {error ? <span className="text-red-300">{error}</span> : picked.size > 0 ? `${noun(kind, picked.size)} ${kind === "music" ? "elegida" : "elegido"}${picked.size === 1 ? "" : "s"}` : "Elige las que quieras añadir"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={picked.size === 0 || busy}
          onClick={() => void submit()}
          className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-40"
        >
          {picked.size > 0 ? `Añadir ${noun(kind, picked.size)}` : "Añadir"}
        </button>
      </div>
    </dialog>
  );
}
