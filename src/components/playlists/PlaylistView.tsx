"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useDragReorder } from "@/hooks/useDragReorder";
import { usePlaylist } from "@/hooks/useLibrary";
import { useSelection } from "@/hooks/useSelection";
import { deletePlaylist, fetchPlaylist, setInLibrary, updatePlaylist } from "@/lib/api";
import { desktop } from "@/lib/desktop";
import { formatDuration } from "@/lib/format";
import { removeFromLibrary, removeManyFromLibrary, songCount } from "@/lib/library/actions";
import type { LibraryEntry } from "@/lib/library/types";
import { toTrack } from "@/lib/player/types";
import { moveIds } from "@/lib/reorder";
import { ErrorBanner } from "../ErrorBanner";
import { PAGE_CLASS } from "../shell/PageHeader";
import { ConfirmDialog } from "../library/ConfirmDialog";
import { ItemMenu, type MenuAction } from "../library/ItemMenu";
import { LibraryThumb } from "../library/LibraryThumb";
import { DropLine, GripDots, SelectBox, SelectionBar, type BarAction } from "../library/ListBits";
import { RemoveDialog } from "../library/MusicLibrary";
import { PlayerIcon } from "../player/PlayerIcon";
import { usePlayer } from "../player/PlayerProvider";
import { NameDialog } from "./NameDialog";
import { PlaylistMosaic } from "./PlaylistMosaic";
import { playlistMeta, usePlaylistPicker } from "./PlaylistPicker";

const NO_ITEMS: LibraryEntry[] = [];

/** One playlist: play or shuffle it, rename or delete it, and reorder, move or remove its songs. */
export function PlaylistView({ id }: { id: string }) {
  const { playlist, error, reload } = usePlaylist(id);
  const player = usePlayer();
  const picker = usePlaylistPicker();
  const router = useRouter();
  const bridge = desktop();
  // The order shown while a change is on its way to the server.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [menu, setMenu] = useState<{ entry: LibraryEntry; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Deleting the playlist: also delete the songs that are only in it (or send them to Música).
  const [deleteSongsToo, setDeleteSongsToo] = useState(true);
  /** Songs "Borrar" asked about: their files go to the Recycle Bin. */
  const [confirmingRemove, setConfirmingRemove] = useState<LibraryEntry[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const loaded = playlist?.items ?? NO_ITEMS;
  const items = useMemo(() => {
    if (!pendingOrder) return loaded;
    const byId = new Map(loaded.map((e) => [e.id, e]));
    return pendingOrder.map((itemId) => byId.get(itemId)).filter((e): e is LibraryEntry => e !== undefined);
  }, [loaded, pendingOrder]);
  const ids = useMemo(() => items.map((e) => e.id), [items]);
  const selection = useSelection(ids);

  const saveOrder = async (next: string[]) => {
    setPendingOrder(next);
    try {
      await updatePlaylist(id, { itemIds: next });
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo guardar el orden.");
    } finally {
      await reload();
      setPendingOrder(null);
    }
  };

  const drag = useDragReorder({
    // Grabbing a selected song takes the whole selection with it.
    group: (itemId) => (selection.has(itemId) ? selection.ids : [itemId]),
    label: songCount,
    onMove: (moved, spot) => {
      const next = moveIds(ids, moved, spot.target, spot.after);
      if (next.join() !== ids.join()) void saveOrder(next);
    },
  });

  if (!playlist) {
    return (
      <div className={PAGE_CLASS}>
        <BackLink />
        {error && <ErrorBanner message={error} />}
      </div>
    );
  }

  const playable = items.filter((e) => !e.missing);
  const currentId = player.current?.track.id ?? null;
  const selected = items.filter((e) => selection.has(e.id));
  const selectedPlayable = selected.filter((e) => !e.missing);

  const move = (entry: LibraryEntry, step: -1 | 1) => {
    const neighbor = ids[ids.indexOf(entry.id) + step];
    if (neighbor) void saveOrder(moveIds(ids, [entry.id], neighbor, step === 1));
  };
  // Songs kept out of Música that are in no other playlist: taking them out
  // of this one sends them back to Música, and deleting it asks about them.
  const onlyHere = new Set(playlist.onlyHereIds);
  const onlyHereEntries = items.filter((e) => onlyHere.has(e.id));

  /** Takes songs out of this playlist (they stay in Música; songs kept apart go back to it). */
  const removeFromHere = (entries: LibraryEntry[]) => {
    const gone = new Set(entries.map((e) => e.id));
    void saveOrder(ids.filter((itemId) => !gone.has(itemId)));
    selection.clear();
    const backToLibrary = entries.filter((e) => onlyHere.has(e.id)).length;
    picker.notify(
      (entries.length === 1 ? `«${entries[0].title}» se quitó de la playlist` : `${songCount(entries.length)} quitadas de la playlist`) +
        (backToLibrary > 0 ? ` (${backToLibrary === entries.length && backToLibrary === 1 ? "pasó" : `${songCount(backToLibrary)} pasaron`} a Mi música)` : ""),
    );
  };

  /** "Mostrar en Mi música" / "Sacar de Mi música". */
  const setShownInLibrary = async (entries: LibraryEntry[], inLibrary: boolean) => {
    try {
      const changed = await setInLibrary(
        entries.map((e) => e.id),
        inLibrary,
      );
      setActionError(null);
      selection.clear();
      picker.notify(`${songCount(changed)} ${inLibrary ? "ahora en Mi música" : "solo en playlists"}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo cambiar.");
    } finally {
      await reload();
    }
  };

  const confirmDeletePlaylist = async () => {
    setConfirmingDelete(false);
    try {
      // Songs that would otherwise go back to Música go to the Recycle Bin instead.
      if (deleteSongsToo && bridge && onlyHereEntries.length > 0) {
        await removeManyFromLibrary(onlyHereEntries, (entry) => player.actions.forgetTrack(entry.id));
      }
      await deletePlaylist(id);
      router.push("/musica");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo borrar la playlist.");
      await reload();
    }
  };
  /** "Mover a otra playlist…": the picker adds them there, then they leave this one. */
  const moveToOther = (entries: LibraryEntry[]) => {
    const gone = new Set(entries.map((e) => e.id));
    picker.addToPlaylist(entries, {
      playlistId: id,
      onMoved: async () => {
        // Read it again: it may have changed while the picker was open.
        const { playlist: fresh } = await fetchPlaylist(id);
        await updatePlaylist(id, { itemIds: fresh.items.map((e) => e.id).filter((itemId) => !gone.has(itemId)) });
        selection.clear();
        await reload();
      },
    });
  };

  const confirmRemove = async () => {
    const entries = confirmingRemove;
    setConfirmingRemove(null);
    if (!entries) return;
    const forget = (entry: LibraryEntry) => player.actions.forgetTrack(entry.id);
    try {
      if (entries.length === 1) {
        forget(entries[0]);
        await removeFromLibrary(entries[0]);
        setActionError(null);
      } else {
        const { removed, failed, firstError } = await removeManyFromLibrary(entries, forget);
        if (failed > 0) setActionError(`Se borraron ${removed} de ${entries.length}. ${firstError ?? ""}`.trim());
        else {
          setActionError(null);
          picker.notify(`${songCount(removed)} ${removed === 1 ? "enviada" : "enviadas"} a la Papelera`);
        }
      }
      selection.clear();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      await reload();
    }
  };

  const playFrom = (entry: LibraryEntry) => {
    const start = playable.indexOf(entry);
    if (start >= 0) player.actions.playTracks(playable.map(toTrack), start);
  };

  const menuActions = (entry: LibraryEntry): MenuAction[] => {
    const index = ids.indexOf(entry.id);
    return [
      { label: "Seleccionar", onSelect: () => selection.start(entry.id) },
      { label: "Reproducir", disabled: entry.missing, onSelect: () => playFrom(entry) },
      { label: "Reproducir a continuación", disabled: entry.missing, onSelect: () => player.actions.playNext([toTrack(entry)]) },
      { label: "Añadir a la cola", disabled: entry.missing, onSelect: () => player.actions.addToQueue([toTrack(entry)]) },
      { label: "Añadir a otra playlist…", onSelect: () => picker.addToPlaylist([entry]) },
      { label: "Mover a otra playlist…", onSelect: () => moveToOther([entry]) },
      entry.inLibrary
        ? { label: "Sacar de Mi música", onSelect: () => void setShownInLibrary([entry], false) }
        : { label: "Mostrar en Mi música", onSelect: () => void setShownInLibrary([entry], true) },
      { label: "Subir", disabled: index <= 0, onSelect: () => move(entry, -1) },
      { label: "Bajar", disabled: index >= ids.length - 1, onSelect: () => move(entry, 1) },
      ...(bridge
        ? [{ label: "Mostrar en carpeta", disabled: entry.missing, onSelect: () => void bridge.showItemInFolder(entry.filePath) }]
        : []),
      { label: "Quitar de esta playlist", danger: true, onSelect: () => removeFromHere([entry]) },
    ];
  };

  const barActions: BarAction[] = [
    {
      label: "Reproducir",
      primary: true,
      disabled: selectedPlayable.length === 0,
      onSelect: () => player.actions.playTracks(selectedPlayable.map(toTrack), 0),
    },
    {
      label: "Reproducir a continuación",
      disabled: selectedPlayable.length === 0,
      onSelect: () => player.actions.playNext(selectedPlayable.map(toTrack)),
    },
    {
      label: "Añadir a la cola",
      disabled: selectedPlayable.length === 0,
      onSelect: () => player.actions.addToQueue(selectedPlayable.map(toTrack)),
    },
    { label: "Añadir a otra playlist…", onSelect: () => picker.addToPlaylist(selected) },
    { label: "Mover a otra playlist…", onSelect: () => moveToOther(selected) },
    selected.length > 0 && selected.every((e) => !e.inLibrary)
      ? { label: "Mostrar en Mi música", onSelect: () => void setShownInLibrary(selected, true) }
      : { label: "Sacar de Mi música", onSelect: () => void setShownInLibrary(selected, false) },
    { label: "Quitar de esta playlist", onSelect: () => removeFromHere(selected) },
    ...(bridge ? [{ label: "Borrar", danger: true, onSelect: () => setConfirmingRemove(selected) }] : []),
  ];

  return (
    <div className={PAGE_CLASS}>
      <BackLink />

      <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end">
        <PlaylistMosaic coverIds={playlist.coverIds} className="aspect-square w-40 shrink-0 rounded-2xl lg:w-52 shadow-2xl shadow-black/50" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">Playlist</p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-white lg:text-4xl">{playlist.name}</h1>
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
              onClick={() => {
                setDeleteSongsToo(true);
                setConfirmingDelete(true);
              }}
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
            const checked = selection.has(entry.id);
            return (
              <li
                key={entry.id}
                {...drag.rowProps(entry.id)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  selection.rowClick(entry.id, e);
                }}
                onDoubleClick={(e) => {
                  if (selection.active || entry.missing || (e.target as HTMLElement).closest("button")) return;
                  playFrom(entry);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ entry, x: e.clientX, y: e.clientY });
                }}
                className={`group relative flex select-none items-center gap-3 px-3 py-2 transition ${
                  checked ? "bg-white/[0.08]" : isCurrent ? "bg-[var(--accent)]/[0.08]" : "hover:bg-white/[0.03]"
                } ${entry.missing ? "opacity-50" : ""} ${drag.isDragging(entry.id) ? "opacity-40" : ""}`}
              >
                <DropLine at={drag.marker(entry.id)} />
                {selection.active && (
                  <SelectBox checked={checked} label={`Seleccionar ${entry.title}`} onToggle={(range) => selection.toggle(entry.id, range)} />
                )}
                <span
                  className="flex w-5 shrink-0 cursor-grab justify-center text-xs tabular-nums text-white/35 active:cursor-grabbing"
                  title="Arrastra para cambiar el orden"
                >
                  <span className="group-hover:hidden">{index + 1}</span>
                  <span className="hidden text-white/55 group-hover:block">
                    <GripDots />
                  </span>
                </span>
                <LibraryThumb id={entry.id} hasThumbnail={entry.hasThumbnail} fallbackIcon="music" className="h-10 w-10 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[13.5px] ${isCurrent ? "font-medium text-[var(--accent)]" : "text-white/90"}`} title={entry.title}>
                    {entry.title}
                  </p>
                  <p className="truncate text-xs text-white/40">
                    {!entry.inLibrary && (
                      <span
                        className="mr-1.5 rounded bg-white/[0.08] px-1 py-px text-[10px] font-medium text-white/55"
                        title="No aparece en Mi música, solo en sus playlists"
                      >
                        Aparte
                      </span>
                    )}
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
                  onClick={() => removeFromHere([entry])}
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

      <SelectionBar
        active={selection.active}
        count={selection.count}
        total={items.length}
        actions={barActions}
        onSelectAll={selection.selectAll}
        onClear={selection.clear}
      />

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
          message={
            onlyHereEntries.length === 0
              ? `Se borrará «${playlist.name}». Las canciones siguen en Música.`
              : `Se borrará «${playlist.name}». ${
                  onlyHereEntries.length === 1 ? "1 canción solo está" : `${songCount(onlyHereEntries.length)} solo están`
                } en esta playlist (no en Mi música). ¿Qué hacemos con ${onlyHereEntries.length === 1 ? "ella" : "ellas"}?`
          }
          confirmLabel="Borrar playlist"
          onConfirm={() => void confirmDeletePlaylist()}
          onCancel={() => setConfirmingDelete(false)}
        >
          {onlyHereEntries.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 text-sm text-white/80">
              {bridge && (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="only-here"
                    checked={deleteSongsToo}
                    onChange={() => setDeleteSongsToo(true)}
                    className="accent-[var(--accent)]"
                  />
                  Borrarlas también (van a la Papelera)
                </label>
              )}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="only-here"
                  checked={!deleteSongsToo || !bridge}
                  onChange={() => setDeleteSongsToo(false)}
                  className="accent-[var(--accent)]"
                />
                Pasarlas a Mi música
              </label>
            </div>
          )}
        </ConfirmDialog>
      )}

      {confirmingRemove && (
        <RemoveDialog entries={confirmingRemove} onConfirm={() => void confirmRemove()} onCancel={() => setConfirmingRemove(null)} />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/musica" className="mb-5 inline-flex items-center gap-1 text-sm text-white/50 transition hover:text-white">
      ← Música
    </Link>
  );
}
