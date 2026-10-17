"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { usePlaylist } from "@/hooks/useLibrary";
import { deletePlaylist, updatePlaylist } from "@/lib/api";
import { desktop } from "@/lib/desktop";
import { formatDuration } from "@/lib/format";
import type { LibraryEntry } from "@/lib/library/types";
import { toTrack } from "@/lib/player/types";
import { ErrorBanner } from "../ErrorBanner";
import { ConfirmDialog } from "../library/ConfirmDialog";
import { ItemMenu, type MenuAction } from "../library/ItemMenu";
import { LibraryThumb } from "../library/LibraryThumb";
import { PlayerIcon } from "../player/PlayerIcon";
import { usePlayer } from "../player/PlayerProvider";
import { NameDialog } from "./NameDialog";
import { PlaylistMosaic } from "./PlaylistMosaic";
import { playlistMeta, usePlaylistPicker } from "./PlaylistPicker";

/** `ids` with `moved` taken out and put back before (or after) `target`. */
function reorder(ids: string[], moved: string, target: string, after: boolean): string[] {
  if (moved === target) return ids;
  const rest = ids.filter((id) => id !== moved);
  const at = rest.indexOf(target);
  if (at < 0) return ids;
  rest.splice(after ? at + 1 : at, 0, moved);
  return rest;
}

/** One playlist: play or shuffle it, rename or delete it, and reorder or remove its songs. */
export function PlaylistView({ id }: { id: string }) {
  const { playlist, error, reload } = usePlaylist(id);
  const player = usePlayer();
  const picker = usePlaylistPicker();
  const router = useRouter();
  const bridge = desktop();
  // The order shown while a change is on its way to the server.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const [menu, setMenu] = useState<{ entry: LibraryEntry; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  if (!playlist) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <BackLink />
        {error && <ErrorBanner message={error} />}
      </div>
    );
  }

  const byId = new Map(playlist.items.map((e) => [e.id, e]));
  const items = pendingOrder
    ? pendingOrder.map((itemId) => byId.get(itemId)).filter((e): e is LibraryEntry => e !== undefined)
    : playlist.items;
  const playable = items.filter((e) => !e.missing);
  const currentId = player.current?.track.id ?? null;

  const saveOrder = async (ids: string[]) => {
    setPendingOrder(ids);
    try {
      await updatePlaylist(id, { itemIds: ids });
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo guardar el orden.");
    } finally {
      await reload();
      setPendingOrder(null);
    }
  };

  const ids = items.map((e) => e.id);
  const move = (entry: LibraryEntry, step: -1 | 1) => {
    const index = ids.indexOf(entry.id);
    const neighbor = ids[index + step];
    if (neighbor) void saveOrder(reorder(ids, entry.id, neighbor, step === 1));
  };
  const remove = (entry: LibraryEntry) => {
    void saveOrder(ids.filter((itemId) => itemId !== entry.id));
    picker.notify(`«${entry.title}» se quitó de la playlist`);
  };

  const playFrom = (entry: LibraryEntry) => {
    const start = playable.indexOf(entry);
    if (start >= 0) player.actions.playTracks(playable.map(toTrack), start);
  };

  const menuActions = (entry: LibraryEntry): MenuAction[] => {
    const index = ids.indexOf(entry.id);
    return [
      { label: "Reproducir", disabled: entry.missing, onSelect: () => playFrom(entry) },
      { label: "Reproducir a continuación", disabled: entry.missing, onSelect: () => player.actions.playNext([toTrack(entry)]) },
      { label: "Añadir a la cola", disabled: entry.missing, onSelect: () => player.actions.addToQueue([toTrack(entry)]) },
      { label: "Añadir a otra playlist…", onSelect: () => picker.addToPlaylist([entry]) },
      { label: "Subir", disabled: index <= 0, onSelect: () => move(entry, -1) },
      { label: "Bajar", disabled: index >= ids.length - 1, onSelect: () => move(entry, 1) },
      ...(bridge
        ? [{ label: "Mostrar en carpeta", disabled: entry.missing, onSelect: () => void bridge.showItemInFolder(entry.filePath) }]
        : []),
      { label: "Quitar de esta playlist", danger: true, onSelect: () => remove(entry) },
    ];
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <BackLink />

      <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end">
        <PlaylistMosaic coverIds={playlist.coverIds} className="aspect-square w-40 shrink-0 rounded-2xl shadow-2xl shadow-black/50" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">Playlist</p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-white">{playlist.name}</h1>
          <p className="mt-1 text-sm text-white/45">{playlistMeta(playlist.count, playlist.durationSeconds)}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={playable.length === 0}
              onClick={() => player.actions.playTracks(playable.map(toTrack), 0)}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-40"
            >
              <PlayerIcon name="play" size={16} /> Reproducir
            </button>
            <button
              type="button"
              disabled={playable.length === 0}
              onClick={() => player.actions.shuffleTracks(playable.map(toTrack))}
              className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-4 py-2 text-sm font-medium text-white/85 transition enabled:hover:bg-white/[0.14] disabled:opacity-40"
            >
              <PlayerIcon name="shuffle" size={15} /> Aleatorio
            </button>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="rounded-full px-3 py-2 text-sm font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            >
              Renombrar
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-full px-3 py-2 text-sm font-medium text-red-300/80 transition hover:bg-red-500/10 hover:text-red-300"
            >
              Borrar
            </button>
          </div>
        </div>
      </header>

      {actionError && (
        <div className="mb-4">
          <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center text-sm text-white/50">
          Esta playlist está vacía. En Música, abre el menú ⋯ de una canción y elige «Añadir a playlist».
        </p>
      ) : (
        <ol className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06]">
          {items.map((entry, index) => {
            const isCurrent = entry.id === currentId;
            const marker = dropTarget?.id === entry.id && dragging !== entry.id ? (dropTarget.after ? "after" : "before") : null;
            return (
              <li
                key={entry.id}
                draggable
                onDragStart={(e) => {
                  setDragging(entry.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", entry.id);
                }}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY > rect.top + rect.height / 2;
                  if (dropTarget?.id !== entry.id || dropTarget.after !== after) setDropTarget({ id: entry.id, after });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && dropTarget) {
                    const next = reorder(ids, dragging, dropTarget.id, dropTarget.after);
                    if (next.join() !== ids.join()) void saveOrder(next);
                  }
                  setDragging(null);
                  setDropTarget(null);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDropTarget(null);
                }}
                onDoubleClick={(e) => {
                  if (entry.missing || (e.target as HTMLElement).closest("button")) return;
                  playFrom(entry);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ entry, x: e.clientX, y: e.clientY });
                }}
                className={`group relative flex select-none items-center gap-3 px-3 py-2 transition ${
                  isCurrent ? "bg-[var(--accent)]/[0.08]" : "hover:bg-white/[0.03]"
                } ${entry.missing ? "opacity-50" : ""} ${dragging === entry.id ? "opacity-40" : ""}`}
              >
                {marker && (
                  <span
                    className={`pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-[var(--accent)] ${
                      marker === "before" ? "-top-px" : "-bottom-px"
                    }`}
                  />
                )}
                <span
                  className="w-5 shrink-0 cursor-grab text-center text-xs tabular-nums text-white/35 active:cursor-grabbing"
                  title="Arrastra para cambiar el orden"
                >
                  {index + 1}
                </span>
                <LibraryThumb id={entry.id} hasThumbnail={entry.hasThumbnail} fallbackIcon="music" className="h-10 w-10 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[13.5px] ${isCurrent ? "font-medium text-[var(--accent)]" : "text-white/90"}`} title={entry.title}>
                    {entry.title}
                  </p>
                  <p className="truncate text-xs text-white/40">
                    {entry.missing ? <span className="text-amber-300/90">No encontrado</span> : (entry.artist ?? "—")}
                  </p>
                </div>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-white/45">
                  {formatDuration(entry.durationSeconds) ?? "—"}
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${entry.title} de la playlist`}
                  title="Quitar de esta playlist"
                  onClick={() => remove(entry)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/45 opacity-0 outline-none transition hover:bg-white/[0.08] hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <PlayerIcon name="close" size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Opciones de ${entry.title}`}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMenu({ entry, x: rect.right, y: rect.bottom + 4 });
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
          })}
        </ol>
      )}

      {menu && <ItemMenu x={menu.x} y={menu.y} actions={menuActions(menu.entry)} onClose={closeMenu} />}

      {renaming && (
        <NameDialog
          title="Renombrar playlist"
          initialName={playlist.name}
          submitLabel="Guardar"
          onSubmit={async (name) => {
            await updatePlaylist(id, { name });
            setRenaming(false);
            await reload();
          }}
          onCancel={() => setRenaming(false)}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="¿Borrar esta playlist?"
          message={`Se borrará «${playlist.name}». Las canciones siguen en Música.`}
          confirmLabel="Borrar playlist"
          onConfirm={() => {
            setConfirmingDelete(false);
            void deletePlaylist(id)
              .then(() => router.push("/playlists"))
              .catch((err) => setActionError(err instanceof Error ? err.message : "No se pudo borrar la playlist."));
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/playlists" className="mb-5 inline-flex items-center gap-1 text-sm text-white/50 transition hover:text-white">
      ← Playlists
    </Link>
  );
}
