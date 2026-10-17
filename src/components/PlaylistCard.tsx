"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLAYLIST_HEIGHTS, type DownloadMode, type PlaylistEntry, type PlaylistInfo } from "@/lib/platform/types";
import { formatDuration } from "@/lib/format";
import type { BatchItemStatus } from "@/lib/api";
import { desktop } from "@/lib/desktop";
import { CATEGORY_LABEL, categoryForMode, type Category } from "@/lib/library/types";
import { useBatchJob } from "@/hooks/useBatchJob";
import { PlatformBadge } from "./PlatformBadge";
import { SavedNotice } from "./SavedNotice";
import { ModeToggle } from "./ModeToggle";
import {
  SAVE_TO_LIBRARY_CHOICE,
  SaveTargetPicker,
  chooseCreatedPlaylist,
  saveRequest,
  usePlaylistOptions,
  type SaveChoice,
} from "./SaveTargetPicker";

const QUALITY_OPTIONS: (number | "best")[] = ["best", ...PLAYLIST_HEIGHTS];

const STATUS_LABEL: Record<BatchItemStatus, string> = {
  queued: "En espera",
  downloading: "Descargando",
  converting: "Convirtiendo",
  completed: "Guardado",
  error: "Falló",
  cancelled: "Cancelado",
};

function Checkbox({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition ${
        checked || indeterminate
          ? "border-[var(--accent)] bg-[var(--accent)]"
          : "border-white/25 bg-white/[0.03]"
      }`}
    >
      {checked ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2 5 8.5l4.5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : indeterminate ? (
        <span className="h-0.5 w-2 rounded bg-white" />
      ) : null}
    </span>
  );
}

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

/**
 * Every entry except the ones already saved in this category. Going into a
 * playlist, every entry: the ones already saved are added to it without
 * downloading them again.
 */
function defaultSelection(entries: PlaylistEntry[], owned: Set<string>, intoPlaylist = false): Set<string> {
  return new Set(entries.flatMap((e) => (owned.has(e.id) && !intoPlaylist ? [] : [e.id])));
}

export function PlaylistCard({
  playlist,
  mode,
  onModeChange,
  shareable,
}: {
  playlist: PlaylistInfo;
  mode: DownloadMode;
  onModeChange: (mode: DownloadMode) => void;
  shareable: boolean;
}) {
  const category = categoryForMode(mode);
  const [choice, setChoice] = useState<SaveChoice>(SAVE_TO_LIBRARY_CHOICE);
  const { playlists, reload: reloadPlaylists } = usePlaylistOptions();
  // Only songs go into playlists.
  const intoPlaylist = mode === "audio" && choice.to === "playlist";
  const request = mode === "audio" ? saveRequest(choice, playlists) : { playlistName: null };
  // The playlist the running (or last) download goes into, for the "Guardado en…" notice.
  const [startedPlaylistName, setStartedPlaylistName] = useState<string | null>(null);
  // Videos this card downloaded, so "Elegir otros videos" counts them as owned too.
  const [downloadedHere, setDownloadedHere] = useState<{ category: Category; ids: string[] }[]>([]);
  const owned = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, categories] of Object.entries(playlist.inLibrary)) if (categories.includes(category)) ids.add(id);
    for (const batch of downloadedHere) if (batch.category === category) for (const id of batch.ids) ids.add(id);
    return ids;
  }, [playlist.inLibrary, downloadedHere, category]);

  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(playlist.entries, owned));
  const [quality, setQuality] = useState<number | "best">("best");
  const listRef = useRef<HTMLUListElement>(null);

  // A link to a video inside the playlist: bring that video into view.
  useEffect(() => {
    const list = listRef.current;
    const row = playlist.focusEntryId
      ? list?.querySelector<HTMLElement>(`[data-entry-id="${playlist.focusEntryId}"]`)
      : null;
    if (list && row) list.scrollTop = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2;
  }, [playlist.focusEntryId]);
  const { state, start, cancel, resume, reset } = useBatchJob();

  const progress = state.phase === "running" || state.phase === "done" ? state.progress : null;
  const progressById = useMemo(() => new Map(progress?.items.map((i) => [i.entryId, i]) ?? []), [progress]);
  const positionById = useMemo(() => new Map(playlist.entries.map((e, i) => [e.id, i])), [playlist.entries]);
  const bridge = desktop();

  const locked = state.phase === "starting" || state.phase === "running" || state.phase === "done";
  const allSelected = selected.size === playlist.entries.length;

  // Switching Audio/Video changes which videos are already owned, and
  // "Guardar en" whether those are picked, so the selection starts over
  // (only while picking).
  const selectionKey = `${category}:${intoPlaylist}`;
  const [selectionFor, setSelectionFor] = useState(selectionKey);
  if (!locked && selectionFor !== selectionKey) {
    setSelectionFor(selectionKey);
    setSelected(defaultSelection(playlist.entries, owned, intoPlaylist));
  }

  // A new playlist was created by this download: point the choice at it.
  const createdPlaylistId = state.phase === "running" || state.phase === "done" ? state.playlistId : null;
  useEffect(() => {
    if (!createdPlaylistId) return;
    void reloadPlaylists().then(() => setChoice((c) => chooseCreatedPlaylist(c, createdPlaylistId)));
  }, [createdPlaylistId, reloadPlaylists]);

  const toggle = useCallback(
    (id: string) => {
      if (locked) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [locked],
  );

  const toggleAll = () => {
    if (locked) return;
    setSelected(allSelected ? new Set() : new Set(playlist.entries.map((e) => e.id)));
  };

  const items = progress?.items ?? [];
  let finished = 0;
  let completed = 0;
  let failed = 0;
  let percentSum = 0;
  for (const i of items) {
    if (i.status === "completed" || i.status === "error" || i.status === "cancelled") finished++;
    if (i.status === "completed") completed++;
    if (i.status === "error") failed++;
    percentSum += i.status === "completed" ? 100 : i.percent;
  }
  const overall = items.length ? percentSum / items.length : 0;
  const pausedUntil = state.phase === "running" ? (progress?.pausedUntil ?? null) : null;

  const chooseOthers = () => {
    if (progress) {
      const ids = progress.items.flatMap((i) => (i.status === "completed" ? [i.entryId] : []));
      const nextOwned = new Set([...owned, ...(progress.category === category ? ids : [])]);
      setDownloadedHere((prev) => [...prev, { category: progress.category, ids }]);
      setSelected(defaultSelection(playlist.entries, nextOwned, intoPlaylist));
    }
    reset();
  };

  // While a batch runs, only the selected videos matter.
  const visibleEntries = locked ? playlist.entries.filter((e) => selected.has(e.id)) : playlist.entries;
  const ownedCount = playlist.entries.reduce((n, e) => n + (owned.has(e.id) ? 1 : 0), 0);
  const onlyNewSelected = selected.size === playlist.entries.length - ownedCount && [...selected].every((id) => !owned.has(id));

  return (
    <div className="w-full animate-[fadeIn_0.35s_ease] rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="line-clamp-2 text-[15px] font-medium leading-snug text-white">{playlist.title}</h2>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/45">
          <PlatformBadge platform={playlist.platform} />
          {playlist.author && <span>· {playlist.author}</span>}
          <span>
            · {playlist.entries.length} video{playlist.entries.length === 1 ? "" : "s"}
            {playlist.truncated && " (solo los primeros)"}
          </span>
          {ownedCount > 0 && (
            <span className="text-emerald-300/70">
              · {ownedCount} ya {ownedCount === 1 ? "la tienes" : "las tienes"}
              {intoPlaylist && " (se añaden sin descargarlas otra vez)"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col items-start gap-3">
        <ModeToggle value={mode} onChange={onModeChange} disabled={locked} />
        {mode === "audio" ? (
          <SaveTargetPicker
            value={choice}
            onChange={setChoice}
            playlists={playlists}
            suggestedName={playlist.title}
            disabled={locked}
          />
        ) : (
          <span className="text-xs text-white/40">Se guarda en Videos</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {!locked ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-2 text-xs font-medium text-white/70 transition hover:text-white"
            >
              <Checkbox checked={allSelected} indeterminate={!allSelected && selected.size > 0} />
              {allSelected ? "Quitar todos" : "Seleccionar todos"}
              <span className="text-white/35">
                · {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
              </span>
            </button>
            {ownedCount > 0 && !intoPlaylist && !onlyNewSelected && (
              <button
                type="button"
                onClick={() => setSelected(defaultSelection(playlist.entries, owned))}
                className="text-xs font-medium text-white/50 transition hover:text-white"
              >
                Solo las que no tengo
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs text-white/50">
            {state.phase === "done"
              ? `${completed} de ${items.length} descargado${items.length === 1 ? "" : "s"}${failed ? ` · ${failed} con error` : ""}`
              : pausedUntil
                ? `En pausa · ${finished} de ${selected.size} listos`
                : `Descargando ${Math.min(finished + 1, selected.size)} de ${selected.size}…`}
          </span>
        )}

        {mode !== "audio" && (
          <div className="flex flex-wrap gap-1.5">
            {QUALITY_OPTIONS.map((q) => {
              const active = q === quality;
              return (
                <button
                  key={q}
                  type="button"
                  disabled={locked}
                  onClick={() => setQuality(q)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? "border-[var(--accent)]/60 bg-[var(--accent)]/15 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/85"
                  } disabled:cursor-default disabled:opacity-40`}
                >
                  {q === "best" ? "Máxima" : `${q}p`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ul
        ref={listRef}
        className="relative mt-3 max-h-[420px] divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/5 bg-black/20"
      >
        {visibleEntries.map((entry, i) => {
          const item = progressById.get(entry.id);
          return (
            <EntryRow
              key={entry.id}
              entry={entry}
              number={(locked ? (positionById.get(entry.id) ?? i) : i) + 1}
              isSelected={selected.has(entry.id)}
              isOwned={owned.has(entry.id)}
              isFocus={entry.id === playlist.focusEntryId}
              locked={locked}
              status={item?.status ?? null}
              percent={item?.percent ?? 0}
              errorMessage={item?.errorMessage ?? null}
              filePath={item?.filePath ?? null}
              onToggle={toggle}
              onShowInFolder={bridge ? bridge.showItemInFolder : null}
            />
          );
        })}
      </ul>

      {pausedUntil && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-sm">
          <span className="min-w-0 flex-1 text-white/80">
            YouTube está frenando las descargas. La lista se reanudará sola a las {clockTime(pausedUntil)}.
          </span>
          <button
            type="button"
            onClick={resume}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.16]"
          >
            Reanudar ahora
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {state.phase === "idle" || state.phase === "error" ? (
          <button
            type="button"
            disabled={selected.size === 0 || !request}
            onClick={() => {
              if (!request) return;
              setStartedPlaylistName(request.playlistName);
              void start({
                analysisId: playlist.analysisId,
                // Keep playlist order regardless of click order.
                entryIds: playlist.entries.filter((e) => selected.has(e.id)).map((e) => e.id),
                mode,
                height: mode === "audio" ? "best" : quality,
                shareable,
                target: request.target,
              });
            }}
            className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-default disabled:opacity-40 sm:w-auto sm:px-7"
          >
            {!request
              ? "Escribe el nombre de la playlist"
              : selected.size === 0
              ? ownedCount === playlist.entries.length
                ? "Ya tienes todos estos videos"
                : "Selecciona videos para descargar"
              : `Descargar ${selected.size} video${selected.size === 1 ? "" : "s"}`}
          </button>
        ) : state.phase === "starting" || state.phase === "running" ? (
          <>
            <div className="relative w-full overflow-hidden rounded-xl bg-[var(--accent)] py-2.5 text-center text-sm font-semibold text-white sm:w-auto sm:px-7">
              <span
                className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-500 ease-out"
                style={{ width: `${overall}%` }}
              />
              <span className="relative">
                {state.phase === "starting"
                  ? "Preparando…"
                  : pausedUntil
                    ? `En pausa ${Math.round(overall)}%`
                    : `Descargando ${Math.round(overall)}%`}
              </span>
            </div>
            {state.phase === "running" && !progress?.cancelled && (
              <button
                type="button"
                onClick={cancel}
                className="rounded-xl px-3 py-2 text-xs font-medium text-white/55 transition hover:text-white"
              >
                Cancelar
              </button>
            )}
          </>
        ) : (
          <>
            {completed > 0 && (
              <SavedNotice
                category={progress?.category ?? category}
                text={`${completed} guardado${completed === 1 ? "" : "s"} en ${
                  state.playlistId ? `la playlist «${startedPlaylistName ?? ""}»` : CATEGORY_LABEL[progress?.category ?? category]
                }`}
                playlist={state.playlistId ? { id: state.playlistId, name: startedPlaylistName ?? "" } : null}
              />
            )}
            <button
              type="button"
              onClick={chooseOthers}
              className="rounded-xl px-3 py-2 text-xs font-medium text-white/55 transition hover:text-white"
            >
              Elegir otros videos
            </button>
          </>
        )}
        {state.phase === "error" && <p className="w-full text-xs text-red-300">{state.message}</p>}
      </div>

    </div>
  );
}

/**
 * One video of the list. Memoized on plain values: a batch polls every
 * second, and with up to 1000 rows only the ones whose status changed
 * should render again.
 */
const EntryRow = memo(function EntryRow({
  entry,
  number,
  isSelected,
  isOwned,
  isFocus,
  locked,
  status,
  percent,
  errorMessage,
  filePath,
  onToggle,
  onShowInFolder,
}: {
  entry: PlaylistEntry;
  number: number;
  isSelected: boolean;
  isOwned: boolean;
  isFocus: boolean;
  locked: boolean;
  status: BatchItemStatus | null;
  percent: number;
  errorMessage: string | null;
  filePath: string | null;
  onToggle: (id: string) => void;
  onShowInFolder: ((filePath: string) => unknown) | null;
}) {
  const duration = formatDuration(entry.durationSeconds);
  const active = status === "downloading" || status === "converting";
  return (
    <li
      data-entry-id={entry.id}
      className={isFocus ? "bg-[var(--accent)]/[0.07]" : undefined}
      // Rows far out of view skip layout and paint (61px is one row's height).
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 61px" }}
    >
      <div
        role={locked ? undefined : "checkbox"}
        aria-checked={locked ? undefined : isSelected}
        aria-label={locked ? undefined : entry.title}
        tabIndex={locked ? undefined : 0}
        onClick={() => onToggle(entry.id)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onToggle(entry.id);
          }
        }}
        className={`relative flex items-center gap-3 px-3 py-2 transition ${
          locked ? "" : "cursor-pointer hover:bg-white/[0.04]"
        } ${!locked && !isSelected ? "opacity-45" : ""}`}
      >
        {active && (
          <span
            className="absolute inset-y-0 left-0 bg-[var(--accent)]/10 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        )}
        {!locked && <Checkbox checked={isSelected} />}
        <span className="relative w-7 shrink-0 text-right text-[11px] tabular-nums text-white/30">{number}</span>
        <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-white/5">
          {entry.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.thumbnailUrl}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          {duration && (
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-[10px] font-medium text-white">
              {duration}
            </span>
          )}
        </div>
        <div className="relative min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] leading-snug text-white/90">
            {isFocus && (
              <span className="mr-1.5 rounded bg-[var(--accent)]/25 px-1 py-px text-[10px] font-semibold text-white/90">
                Tu enlace
              </span>
            )}
            {entry.title}
          </p>
          {status ? (
            <p
              className={`mt-0.5 text-[11px] ${
                status === "error" ? "text-red-300" : status === "completed" ? "text-emerald-300/80" : "text-white/40"
              }`}
            >
              {status === "error" && errorMessage ? errorMessage : STATUS_LABEL[status]}
              {active && ` ${percent}%`}
            </p>
          ) : (
            <p className="mt-0.5 truncate text-[11px] text-white/35">
              {isOwned && <span className="mr-1.5 font-medium text-emerald-300/80">✓ Ya la tienes</span>}
              {entry.author}
            </p>
          )}
        </div>
        {status === "completed" && filePath && onShowInFolder && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void onShowInFolder(filePath);
            }}
            className="relative shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85 transition hover:bg-white/[0.16]"
            title="Mostrar en carpeta"
          >
            Mostrar
          </button>
        )}
      </div>
    </li>
  );
});
