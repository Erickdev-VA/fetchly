"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useCoverColor } from "@/hooks/useCoverColor";
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
import { PlatformBadge } from "../PlatformBadge";
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

const dateFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" });

/** Before a cover's color is read, or when no song has a cover. */
const NEUTRAL_TINT = "rgb(52 52 58)";

/** The name as big as Spotify's, smaller as it gets longer so it never breaks badly. */
function titleSize(name: string): string {
  if (name.length <= 14) return "text-5xl lg:text-7xl xl:text-[88px]";
  if (name.length <= 28) return "text-4xl lg:text-6xl";
  return "text-3xl lg:text-5xl";
}

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
  // ⋯ next to the play button: rename or delete the playlist.
  const [playlistMenu, setPlaylistMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Deleting the playlist: also delete the songs that are only in it (or send them to Música).
  const [deleteSongsToo, setDeleteSongsToo] = useState(true);
  /** Songs "Borrar" asked about: their files go to the Recycle Bin. */
  const [confirmingRemove, setConfirmingRemove] = useState<LibraryEntry[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closePlaylistMenu = useCallback(() => setPlaylistMenu(null), []);

  const loaded = playlist?.items ?? NO_ITEMS;
  const items = useMemo(() => {
    if (!pendingOrder) return loaded;
    const byId = new Map(loaded.map((e) => [e.id, e]));
    return pendingOrder.map((itemId) => byId.get(itemId)).filter((e): e is LibraryEntry => e !== undefined);
  }, [loaded, pendingOrder]);
  const ids = useMemo(() => items.map((e) => e.id), [items]);
  // The header takes the color of the first song's cover (or the next one that has a cover), like Spotify.
  const coverSong = items.find((e) => e.hasThumbnail) ?? null;
  const tint = useCoverColor(coverSong?.id ?? null, coverSong !== null) ?? NEUTRAL_TINT;
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
    <div className="relative">
      {/* The header's color, fading into the page below the buttons. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px] transition-colors duration-700" style={{ backgroundColor: tint }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px]" style={{ background: HEADER_FADE }} />

      <div className={`${PAGE_CLASS} relative`}>
        <BackLink />

        <header className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <PlaylistMosaic coverIds={playlist.coverIds} className="aspect-square w-44 shrink-0 rounded-lg shadow-[0_8px_40px_rgb(0_0_0/0.5)] lg:w-56" />
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-sm font-medium text-white/90">Playlist</p>
            <h1 className="mt-1">
              <button
                type="button"
                onClick={() => setRenaming(true)}
                title="Cambiar nombre"
                className={`block max-w-full break-words rounded-lg text-left font-black leading-[1.05] tracking-tight text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${titleSize(playlist.name)}`}
              >
                {playlist.name}
              </button>
            </h1>
            <p className="mt-4 text-sm font-medium text-white/80">{playlistMeta(playlist.count, playlist.durationSeconds)}</p>
          </div>
        </header>

        <div className="mt-7 flex items-center gap-5">
          <button
            type="button"
            disabled={playable.length === 0}
            onClick={() => player.actions.playTracks(playable.map(toTrack), 0)}
            aria-label="Reproducir"
            title="Reproducir"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg shadow-black/30 outline-none transition enabled:hover:scale-105 enabled:hover:brightness-110 enabled:active:scale-95 focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40"
          >
            <PlayerIcon name="play" size={24} />
          </button>
          <button
            type="button"
            disabled={playable.length === 0}
            onClick={() => player.actions.shuffleTracks(playable.map(toTrack))}
            aria-label="Reproducir en orden aleatorio"
            title="Aleatorio"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 outline-none transition enabled:hover:scale-105 enabled:hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40"
          >
            <PlayerIcon name="shuffle" size={26} />
          </button>
          <button
            type="button"
            aria-label={`Más opciones de ${playlist.name}`}
            aria-haspopup="menu"
            title="Más opciones"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setPlaylistMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 outline-none transition hover:scale-105 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.9" />
              <circle cx="12" cy="12" r="1.9" />
              <circle cx="19" cy="12" r="1.9" />
            </svg>
          </button>
        </div>

        {actionError && (
          <div className="mt-6">
            <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
          </div>
        )}

        {items.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center text-sm text-white/50">
            Esta playlist está vacía. En Música, abre el menú ⋯ de una canción y elige «Añadir a playlist».
          </p>
        ) : (
          <>
            <div className="mt-8 flex items-center gap-3 border-b border-white/[0.08] px-3 pb-2 text-[13px] text-white/50">
              {selection.active && <span className="w-6 shrink-0" />}
              <span className="w-5 shrink-0 text-center">#</span>
              <span className="min-w-0 flex-1">Título</span>
              <span className="hidden w-32 shrink-0 lg:block">Plataforma</span>
              <span className="hidden w-32 shrink-0 md:block">Descargada</span>
              <span className="flex w-12 shrink-0 justify-end" title="Duración">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" role="img" aria-label="Duración">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5V12l3 2" />
                </svg>
              </span>
              {/* Room for ✕ and ⋯ on each row. */}
              <span className="w-[76px] shrink-0" />
            </div>
            <ol className="mt-2">
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
                    className={`group relative flex select-none items-center gap-3 rounded-md px-3 py-2 transition ${
                      checked ? "bg-white/[0.1]" : isCurrent ? "bg-[var(--accent)]/[0.08]" : "hover:bg-white/[0.06]"
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
                    <div className="hidden w-32 shrink-0 lg:block">{entry.platform && <PlatformBadge platform={entry.platform} />}</div>
                    <span className="hidden w-32 shrink-0 text-[13px] text-white/50 md:block">{dateFormat.format(entry.createdAt)}</span>
                    <span className="w-12 shrink-0 text-right text-[13px] tabular-nums text-white/50">
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
          </>
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

        {playlistMenu && (
          <ItemMenu
            x={playlistMenu.x}
            y={playlistMenu.y}
            actions={[
              { label: "Cambiar nombre", onSelect: () => setRenaming(true) },
              {
                label: "Borrar playlist",
                danger: true,
                onSelect: () => {
                  setDeleteSongsToo(true);
                  setConfirmingDelete(true);
                },
              },
            ]}
            onClose={closePlaylistMenu}
          />
        )}

        {renaming && (
          <NameDialog
            title="Cambiar nombre"
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
    </div>
  );
}

/** Over the header's color: a touch darker toward the buttons, then into the page's own background. */
const HEADER_FADE =
  "linear-gradient(to bottom, rgb(0 0 0 / 0) 0%, rgb(0 0 0 / 0.12) 40%, color-mix(in srgb, var(--background) 72%, transparent) 62%, var(--background) 100%)";

function BackLink() {
  return (
    <Link href="/musica" className="mb-5 inline-flex items-center gap-1 text-sm text-white/50 transition hover:text-white">
      ← Música
    </Link>
  );
}
