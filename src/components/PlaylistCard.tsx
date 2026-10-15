"use client";

import { useMemo, useState } from "react";
import { PLAYLIST_HEIGHTS, type DownloadMode, type PlaylistInfo } from "@/lib/platform/types";
import { formatDuration } from "@/lib/format";
import { getBatchItemUrl, getBatchZipUrl, type BatchItemStatus } from "@/lib/api";
import { useBatchJob } from "@/hooks/useBatchJob";
import { PlatformBadge } from "./PlatformBadge";

const QUALITY_OPTIONS: (number | "best")[] = ["best", ...PLAYLIST_HEIGHTS];

const STATUS_LABEL: Record<BatchItemStatus, string> = {
  queued: "Waiting",
  downloading: "Downloading",
  converting: "Converting",
  completed: "Done",
  error: "Failed",
  cancelled: "Cancelled",
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
  const { state, start, cancel, reset } = useBatchJob();

  const progress = state.phase === "running" || state.phase === "done" ? state.progress : null;
  const progressById = useMemo(() => new Map(progress?.items.map((i) => [i.entryId, i]) ?? []), [progress]);
  const batchId = state.phase === "running" || state.phase === "done" ? state.batchId : null;

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
            {playlist.truncated && " (first ones only)"}
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
            {allSelected ? "Deselect all" : "Select all"}
            <span className="text-white/35">· {selected.size} selected</span>
          </button>
        ) : (
          <span className="text-xs text-white/50">
            {state.phase === "done"
              ? `${completed} of ${items.length} downloaded${failed ? ` · ${failed} failed` : ""}`
              : `Downloading ${Math.min(finished + 1, selected.size)} of ${selected.size}…`}
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
                  {q === "best" ? "Best" : `${q}p`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ul className="mt-3 max-h-[420px] divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/5 bg-black/20">
        {visibleEntries.map((entry, i) => {
          const isSelected = selected.has(entry.id);
          const item = progressById.get(entry.id);
          const duration = formatDuration(entry.durationSeconds);
          return (
            <li key={entry.id}>
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
                  <p className="line-clamp-2 text-[13px] leading-snug text-white/90">{entry.title}</p>
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
                {item?.status === "completed" && batchId && (
                  <a
                    href={getBatchItemUrl(batchId, entry.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="relative shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85 transition hover:bg-white/[0.16]"
                    title="Download just this video"
                  >
                    Save
                  </a>
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
              ? "Select videos to download"
              : `Download ${selected.size} video${selected.size === 1 ? "" : "s"}`}
          </button>
        ) : state.phase === "starting" || state.phase === "running" ? (
          <>
            <div className="relative w-full overflow-hidden rounded-xl bg-[var(--accent)] py-2.5 text-center text-sm font-semibold text-white sm:w-auto sm:px-7">
              <span
                className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-500 ease-out"
                style={{ width: `${overall}%` }}
              />
              <span className="relative">
                {state.phase === "starting" ? "Preparing…" : `Downloading ${Math.round(overall)}%`}
              </span>
            </div>
            {state.phase === "running" && !progress?.cancelled && (
              <button
                type="button"
                onClick={cancel}
                className="rounded-xl px-3 py-2 text-xs font-medium text-white/55 transition hover:text-white"
              >
                Cancel
              </button>
            )}
          </>
        ) : (
          <>
            {completed > 1 && batchId && (
              <a
                href={getBatchZipUrl(batchId)}
                className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-center text-sm font-semibold text-white transition active:scale-[0.98] sm:w-auto sm:px-7"
              >
                Download ZIP again
              </a>
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded-xl px-3 py-2 text-xs font-medium text-white/55 transition hover:text-white"
            >
              Choose other videos
            </button>
          </>
        )}
        {state.phase === "error" && <p className="w-full text-xs text-red-300">{state.message}</p>}
      </div>
    </div>
  );
}
