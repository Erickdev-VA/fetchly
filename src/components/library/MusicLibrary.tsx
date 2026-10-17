"use client";

import { useCallback, useMemo, useState } from "react";
import { useLibrary } from "@/hooks/useLibrary";
import { desktop } from "@/lib/desktop";
import { formatDuration } from "@/lib/format";
import { removeFromLibrary } from "@/lib/library/actions";
import type { LibraryEntry } from "@/lib/library/types";
import { toTrack } from "@/lib/player/types";
import { usePlayer } from "../player/PlayerProvider";
import { PlayerIcon } from "../player/PlayerIcon";
import { PlatformBadge } from "../PlatformBadge";
import { ErrorBanner } from "../ErrorBanner";
import { PageHeader } from "../shell/PageHeader";
import { EmptyState } from "../shell/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { ItemMenu, type MenuAction } from "./ItemMenu";
import { LibraryThumb } from "./LibraryThumb";

type SortKey = "recent" | "title" | "artist" | "duration";

const SORT_LABEL: Record<SortKey, string> = {
  recent: "Más recientes",
  title: "Título",
  artist: "Artista",
  duration: "Duración",
};

const dateFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" });
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/** Lowercase without accents, so "cancion" finds "Canción". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Missing values (no artist, unknown length) always go last. */
function compareNullable<T>(a: T | null, b: T | null, compare: (a: T, b: T) => number): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return compare(a, b);
}

function sortEntries(entries: LibraryEntry[], key: SortKey): LibraryEntry[] {
  const sorted = [...entries];
  switch (key) {
    case "recent":
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
    case "title":
      return sorted.sort((a, b) => collator.compare(a.title, b.title));
    case "artist":
      return sorted.sort(
        (a, b) => compareNullable(a.artist, b.artist, collator.compare) || collator.compare(a.title, b.title),
      );
    case "duration":
      return sorted.sort((a, b) => compareNullable(a.durationSeconds, b.durationSeconds, (x, y) => x - y));
  }
}

export function MusicLibrary() {
  const { items, error: loadError, reload } = useLibrary("music");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [menu, setMenu] = useState<{ entry: LibraryEntry; x: number; y: number } | null>(null);
  const [confirming, setConfirming] = useState<LibraryEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const bridge = desktop();
  const player = usePlayer();
  const currentId = player.current?.track.id ?? null;

  const visible = useMemo(() => {
    if (!items) return [];
    const needle = fold(query.trim());
    const matches = needle
      ? items.filter((e) => fold(e.title).includes(needle) || (e.artist !== null && fold(e.artist).includes(needle)))
      : items;
    return sortEntries(matches, sort);
  }, [items, query, sort]);

  const closeMenu = useCallback(() => setMenu(null), []);

  /** Plays `entry` with the visible list (as filtered and sorted) as the queue. */
  const playFromList = (entry: LibraryEntry) => {
    const playable = visible.filter((e) => !e.missing);
    const start = playable.indexOf(entry);
    if (start >= 0) player.actions.playTracks(playable.map(toTrack), start);
  };

  const menuActions = (entry: LibraryEntry): MenuAction[] => [
    { label: "Reproducir", disabled: entry.missing, onSelect: () => playFromList(entry) },
    { label: "Reproducir a continuación", disabled: entry.missing, onSelect: () => player.actions.playNext([toTrack(entry)]) },
    { label: "Añadir a la cola", disabled: entry.missing, onSelect: () => player.actions.addToQueue([toTrack(entry)]) },
    ...(bridge
      ? [
          {
            label: "Mostrar en carpeta",
            disabled: entry.missing,
            onSelect: () => void bridge.showItemInFolder(entry.filePath),
          },
          {
            label: entry.missing ? "Quitar de la biblioteca" : "Borrar",
            danger: true,
            onSelect: () => setConfirming(entry),
          },
        ]
      : []),
  ];

  const confirmRemove = async () => {
    const entry = confirming;
    setConfirming(null);
    if (!entry) return;
    try {
      // Stop it first if it's playing, so Windows doesn't see the file as in use.
      player.actions.forgetTrack(entry.id);
      await removeFromLibrary(entry);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      await reload();
    }
  };

  const count = items?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <PageHeader
        title="Música"
        subtitle={items && count > 0 ? `${count} canci${count === 1 ? "ón" : "ones"}` : undefined}
      />

      {loadError && !items && <ErrorBanner message={loadError} />}
      {actionError && (
        <div className="mb-4">
          <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      {items && count === 0 && (
        <EmptyState icon="music" text="Aún no tienes música. Ve a Descargar." action={{ href: "/", label: "Ir a Descargar" }} />
      )}

      {items && count > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition-colors focus-within:border-white/25">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-white/35" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título o artista"
                aria-label="Buscar canciones"
                className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-white/45">
              Ordenar por
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-xl border border-white/10 bg-[#141417] px-2.5 py-2 text-sm text-white/85 outline-none focus:border-white/25"
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="py-12 text-center text-sm text-white/45">No hay canciones que coincidan con «{query.trim()}».</p>
          ) : (
            <ul className="@container divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06]">
              {visible.map((entry) => (
                <TrackRow
                  key={entry.id}
                  entry={entry}
                  isCurrent={entry.id === currentId}
                  isPlaying={entry.id === currentId && player.playing}
                  onPlay={() => playFromList(entry)}
                  onMenu={(x, y) => setMenu({ entry, x, y })}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {menu && <ItemMenu x={menu.x} y={menu.y} actions={menuActions(menu.entry)} onClose={closeMenu} />}

      {confirming && (
        <ConfirmDialog
          title={confirming.missing ? "¿Quitar de la biblioteca?" : "¿Borrar esta canción?"}
          message={
            confirming.missing
              ? `«${confirming.title}» ya no está en su carpeta. Se quitará de la lista.`
              : `«${confirming.title}» irá a la Papelera de Windows. Desde ahí puedes recuperarla.`
          }
          confirmLabel={confirming.missing ? "Quitar" : "Borrar"}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function TrackRow({
  entry,
  isCurrent,
  isPlaying,
  onPlay,
  onMenu,
}: {
  entry: LibraryEntry;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const duration = formatDuration(entry.durationSeconds);
  return (
    <li
      onDoubleClick={(e) => {
        if (entry.missing || (e.target as HTMLElement).closest("button")) return;
        onPlay();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      className={`group flex select-none items-center gap-3 px-3 py-2 transition ${
        isCurrent ? "bg-[var(--accent)]/[0.08]" : "hover:bg-white/[0.03]"
      } ${entry.missing ? "opacity-50" : ""}`}
    >
      <div className="relative h-10 w-10 shrink-0">
        <LibraryThumb id={entry.id} hasThumbnail={entry.hasThumbnail} fallbackIcon="music" className="h-10 w-10 rounded-md" />
        {!entry.missing && (
          <button
            type="button"
            onClick={onPlay}
            aria-label={`Reproducir ${entry.title}`}
            title="Reproducir"
            className={`absolute inset-0 flex items-center justify-center rounded-md bg-black/55 text-white outline-none transition focus-visible:opacity-100 group-hover:opacity-100 ${
              isPlaying ? "opacity-100" : "opacity-0"
            }`}
          >
            {isPlaying ? <PlayingBars /> : <PlayerIcon name="play" size={16} />}
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13.5px] ${isCurrent ? "font-medium text-[var(--accent)]" : "text-white/90"}`} title={entry.title}>
          {entry.title}
        </p>
        <p className="truncate text-xs text-white/40">
          {entry.missing ? <span className="text-amber-300/90">No encontrado</span> : (entry.artist ?? "—")}
        </p>
      </div>
      <div className="hidden w-24 shrink-0 @xl:block">{entry.platform && <PlatformBadge platform={entry.platform} />}</div>
      <span className="hidden w-28 shrink-0 text-xs text-white/40 @2xl:block">{dateFormat.format(entry.createdAt)}</span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-white/45">{duration ?? "—"}</span>
      <button
        type="button"
        aria-label={`Opciones de ${entry.title}`}
        aria-haspopup="menu"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onMenu(rect.right, rect.bottom + 4);
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 opacity-0 outline-none transition hover:bg-white/[0.08] hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
    </li>
  );
}

/** The little bouncing bars on the song that's playing. */
function PlayingBars() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
      {[0, 0.2, 0.4].map((delay) => (
        <span
          key={delay}
          className="w-[3px] rounded-sm bg-[var(--accent)]"
          style={{ animation: `playingBar 0.9s ease-in-out ${delay}s infinite alternate` }}
        />
      ))}
    </span>
  );
}
