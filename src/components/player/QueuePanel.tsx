"use client";

import { useEffect } from "react";
import { formatDuration } from "@/lib/format";
import type { QueueEntry } from "@/lib/player/types";
import { LibraryThumb } from "../library/LibraryThumb";
import { PlayerIcon } from "./PlayerIcon";
import { usePlayer } from "./PlayerProvider";

function QueueRow({
  entry,
  current,
  onPlay,
  onRemove,
}: {
  entry: QueueEntry;
  current?: boolean;
  onPlay?: () => void;
  onRemove: () => void;
}) {
  const { track } = entry;
  return (
    <li className="group flex items-center gap-2 rounded-lg pr-1 hover:bg-white/[0.04]">
      <button
        type="button"
        onClick={onPlay}
        disabled={!onPlay}
        title={onPlay ? `Reproducir ${track.title}` : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
      >
        <LibraryThumb id={track.id} hasThumbnail={track.hasThumbnail} fallbackIcon="music" className="h-9 w-9 shrink-0 rounded-md" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] ${current ? "font-medium text-[var(--accent)]" : "text-white/85"}`}>
            {track.title}
          </span>
          <span className="block truncate text-[11px] text-white/40">{track.artist ?? "—"}</span>
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-white/35">{formatDuration(track.durationSeconds) ?? ""}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${track.title} de la cola`}
        title="Quitar de la cola"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/40 opacity-0 outline-none transition hover:bg-white/[0.08] hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
      >
        <PlayerIcon name="close" size={14} />
      </button>
    </li>
  );
}

/** The queue, sliding over the right side of the page; opened with ☰ in the bar. */
export function QueuePanel() {
  const { queue, current, queueOpen, setQueueOpen, actions } = usePlayer();

  useEffect(() => {
    if (!queueOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQueueOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [queueOpen, setQueueOpen]);

  if (!queueOpen) return null;
  const upcoming = queue.order.slice(queue.index + 1);

  return (
    <aside
      aria-label="Cola de reproducción"
      className="absolute inset-y-0 right-0 z-30 flex w-80 max-w-full animate-[fadeIn_0.15s_ease] flex-col border-l border-white/[0.08] bg-[#0e0e11] shadow-2xl shadow-black/50"
    >
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-[15px] font-semibold text-white">Cola</h2>
        <button
          type="button"
          onClick={() => setQueueOpen(false)}
          aria-label="Cerrar la cola"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/[0.06] hover:text-white"
        >
          <PlayerIcon name="close" size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {!current ? (
          <p className="px-2 py-10 text-center text-sm text-white/40">La cola está vacía. Haz doble clic en una canción para empezar.</p>
        ) : (
          <>
            <h3 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">Sonando ahora</h3>
            <ul>
              <QueueRow entry={current} current onRemove={() => actions.removeFromQueue(current.uid)} />
            </ul>
            <div className="flex items-center justify-between px-2 pb-1 pt-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/35">A continuación</h3>
              {upcoming.length > 0 && (
                <button type="button" onClick={actions.clearUpcoming} className="text-[11px] font-medium text-white/45 transition hover:text-white">
                  Vaciar
                </button>
              )}
            </div>
            {upcoming.length === 0 ? (
              <p className="px-2 py-3 text-xs text-white/35">No hay más canciones en la cola.</p>
            ) : (
              <ul>
                {upcoming.map((entry) => (
                  <QueueRow
                    key={entry.uid}
                    entry={entry}
                    onPlay={() => actions.jumpTo(entry.uid)}
                    onRemove={() => actions.removeFromQueue(entry.uid)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
