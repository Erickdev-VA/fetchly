"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PLAYLIST_HEIGHTS, type DownloadMode, type PlaylistInfo } from "@/lib/platform/types";
import { formatDuration } from "@/lib/format";
import { createPlaylist, type BatchItemStatus } from "@/lib/api";
import { desktop } from "@/lib/desktop";
import { CATEGORY_LABEL, PLAYLIST_NAME_MAX, categoryForMode } from "@/lib/library/types";
import { useBatchJob } from "@/hooks/useBatchJob";
import { PlatformBadge } from "./PlatformBadge";
import { SavedNotice } from "./SavedNotice";

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

export function PlaylistCard({
  playlist,
  mode,
  shareable,
}: {
  playlist: PlaylistInfo;
  mode: DownloadMode;
  shareable: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(playlist.entries.map((e) => e.id)));
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
  const { state, start, cancel, reset } = useBatchJob();

  const progress = state.phase === "running" || state.phase === "done" ? state.progress : null;
  const progressById = useMemo(() => new Map(progress?.items.map((i) => [i.entryId, i]) ?? []), [progress]);
  const bridge = desktop();
  const category = categoryForMode(mode);

  const locked = state.phase === "starting" || state.phase === "running" || state.phase === "done";
  const allSelected = selected.size === playlist.entries.length;

  const toggle = (id: string) => {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (locked) return;
    setSelected(allSelected ? new Set() : new Set(playlist.entries.map((e) => e.id)));
  };

  const items = progress?.items ?? [];
  const finished = items.filter((i) => ["completed", "error", "cancelled"].includes(i.status)).length;
  const completed = items.filter((i) => i.status === "completed").length;
  const failed = items.filter((i) => i.status === "error").length;
  const overall = items.length
    ? items.reduce((sum, i) => sum + (i.status === "completed" ? 100 : i.percent), 0) / items.length
    : 0;

  // While a batch runs, only the selected videos matter.
  const visibleEntries = locked ? playlist.entries.filter((e) => selected.has(e.id)) : playlist.entries;

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
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {!locked ? (
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
        ) : (
          <span className="text-xs text-white/50">
            {state.phase === "done"
              ? `${completed} de ${items.length} descargado${items.length === 1 ? "" : "s"}${failed ? ` · ${failed} con error` : ""}`
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
          const isSelected = selected.has(entry.id);
          const item = progressById.get(entry.id);
          const duration = formatDuration(entry.durationSeconds);
          return (
            <li
              key={entry.id}
              data-entry-id={entry.id}
              className={entry.id === playlist.focusEntryId ? "bg-[var(--accent)]/[0.07]" : undefined}
            >
              <div
                role={locked ? undefined : "checkbox"}
                aria-checked={locked ? undefined : isSelected}
                aria-label={locked ? undefined : entry.title}
                tabIndex={locked ? undefined : 0}
                onClick={() => toggle(entry.id)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    toggle(entry.id);
                  }
                }}
                className={`relative flex items-center gap-3 px-3 py-2 transition ${
                  locked ? "" : "cursor-pointer hover:bg-white/[0.04]"
                } ${!locked && !isSelected ? "opacity-45" : ""}`}
              >
                {item && (item.status === "downloading" || item.status === "converting") && (
                  <span
                    className="absolute inset-y-0 left-0 bg-[var(--accent)]/10 transition-[width] duration-500"
                    style={{ width: `${item.percent}%` }}
                  />
                )}
                {!locked && <Checkbox checked={isSelected} />}
                <span className="relative w-5 shrink-0 text-right text-[11px] tabular-nums text-white/30">
                  {(locked ? playlist.entries.indexOf(entry) : i) + 1}
                </span>
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
                    {entry.id === playlist.focusEntryId && (
                      <span className="mr-1.5 rounded bg-[var(--accent)]/25 px-1 py-px text-[10px] font-semibold text-white/90">
                        Tu enlace
                      </span>
                    )}
                    {entry.title}
                  </p>
                  {item ? (
                    <p
                      className={`mt-0.5 text-[11px] ${
                        item.status === "error"
                          ? "text-red-300"
                          : item.status === "completed"
                            ? "text-emerald-300/80"
                            : "text-white/40"
                      }`}
                    >
                      {item.status === "error" && item.errorMessage
                        ? item.errorMessage
                        : STATUS_LABEL[item.status]}
                      {(item.status === "downloading" || item.status === "converting") && ` ${item.percent}%`}
                    </p>
                  ) : (
                    entry.author && <p className="mt-0.5 truncate text-[11px] text-white/35">{entry.author}</p>
                  )}
                </div>
                {item?.status === "completed" && item.filePath && bridge && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void bridge.showItemInFolder(item.filePath!);
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
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {state.phase === "idle" || state.phase === "error" ? (
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() =>
              start({
                analysisId: playlist.analysisId,
                // Keep playlist order regardless of click order.
                entryIds: playlist.entries.filter((e) => selected.has(e.id)).map((e) => e.id),
                mode,
                height: mode === "audio" ? "best" : quality,
                shareable,
              })
            }
            className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-default disabled:opacity-40 sm:w-auto sm:px-7"
          >
            {selected.size === 0
              ? "Selecciona videos para descargar"
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
                {state.phase === "starting" ? "Preparando…" : `Descargando ${Math.round(overall)}%`}
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
                category={category}
                text={`${completed} guardado${completed === 1 ? "" : "s"} en ${CATEGORY_LABEL[category]}`}
              />
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded-xl px-3 py-2 text-xs font-medium text-white/55 transition hover:text-white"
            >
              Elegir otros videos
            </button>
          </>
        )}
        {state.phase === "error" && <p className="w-full text-xs text-red-300">{state.message}</p>}
      </div>

      {state.phase === "done" && category === "music" && completed > 0 && (
        <PlaylistOffer
          key={state.batchId}
          name={playlist.title}
          // Batch items keep the playlist order.
          itemIds={items.flatMap((i) => (i.status === "completed" && i.libraryItemId ? [i.libraryItemId] : []))}
        />
      )}
    </div>
  );
}

/** After a playlist downloads as audio: "¿Crear la playlist «X» con N canciones?" */
function PlaylistOffer({ name, itemIds }: { name: string; itemIds: string[] }) {
  const [state, setState] = useState<
    { step: "asking" } | { step: "creating" } | { step: "created"; id: string } | { step: "dismissed" } | { step: "error"; message: string }
  >({ step: "asking" });

  if (state.step === "dismissed" || itemIds.length === 0) return null;

  const create = async () => {
    setState({ step: "creating" });
    try {
      // Long titles are cut to the longest name a playlist can have.
      setState({ step: "created", id: await createPlaylist(name.slice(0, PLAYLIST_NAME_MAX), itemIds) });
    } catch (err) {
      setState({ step: "error", message: err instanceof Error ? err.message : "No se pudo crear la playlist." });
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/[0.07] px-4 py-3 text-sm">
      {state.step === "created" ? (
        <>
          <span className="text-emerald-300/90">✓ Playlist «{name}» creada</span>
          <Link href={`/playlists/${state.id}`} className="font-medium text-white/75 underline-offset-2 hover:text-white hover:underline">
            Ver playlist
          </Link>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-white/80">
            ¿Crear la playlist «{name}» con {itemIds.length} canci{itemIds.length === 1 ? "ón" : "ones"}?
          </span>
          <button
            type="button"
            disabled={state.step === "creating"}
            onClick={() => void create()}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
          >
            {state.step === "creating" ? "Creando…" : "Crear playlist"}
          </button>
          <button
            type="button"
            onClick={() => setState({ step: "dismissed" })}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-white/55 transition hover:text-white"
          >
            No, gracias
          </button>
          {state.step === "error" && <p className="w-full text-xs text-red-300">{state.message}</p>}
        </>
      )}
    </div>
  );
}
