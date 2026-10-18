"use client";

import { useCallback, useState } from "react";
import { useLibrary, usePlaylists } from "@/hooks/useLibrary";
import { desktop } from "@/lib/desktop";
import { formatDuration } from "@/lib/format";
import { removeFromLibrary } from "@/lib/library/actions";
import type { LibraryEntry } from "@/lib/library/types";
import { toVideoTrack } from "@/lib/player/types";
import { ErrorBanner } from "../ErrorBanner";
import { PlatformBadge } from "../PlatformBadge";
import { ConfirmDialog } from "../library/ConfirmDialog";
import { ItemMenu, type MenuAction } from "../library/ItemMenu";
import { LibraryThumb } from "../library/LibraryThumb";
import { LibraryHeader, diskSize } from "../shell/LibraryHeader";
import { PAGE_CLASS } from "../shell/PageHeader";
import { PlaylistShelf } from "../playlists/PlaylistShelf";
import { usePlaylistPicker } from "../playlists/PlaylistPicker";
import { EmptyState } from "../shell/EmptyState";
import { usePlayer } from "../player/PlayerProvider";

/**
 * The Videos page: the playlists of videos, then a grid of thumbnails. A
 * click plays the video over the whole window, with the playback bar as its
 * controls; the queue becomes the videos on the page, so "Siguiente" goes on
 * to the next one.
 */

/** A shuffled copy (Fisher-Yates). */
function shuffled<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function VideoLibrary() {
  const { items, error: loadError, reload } = useLibrary("video");
  const { playlists } = usePlaylists("video");
  const picker = usePlaylistPicker();
  const [menu, setMenu] = useState<{ entry: LibraryEntry; x: number; y: number } | null>(null);
  const [confirming, setConfirming] = useState<LibraryEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const bridge = desktop();
  const player = usePlayer();
  const closeMenu = useCallback(() => setMenu(null), []);

  const menuActions = (entry: LibraryEntry): MenuAction[] => [
    { label: "Añadir a playlist…", onSelect: () => picker.addToPlaylist([entry], undefined, "video") },
    ...(bridge
      ? [
          { label: "Mostrar en carpeta", disabled: entry.missing, onSelect: () => void bridge.showItemInFolder(entry.filePath) },
          { label: entry.missing ? "Quitar de la biblioteca" : "Borrar", danger: true, onSelect: () => setConfirming(entry) },
        ]
      : []),
  ];

  const confirmRemove = async () => {
    const entry = confirming;
    setConfirming(null);
    if (!entry) return;
    try {
      await removeFromLibrary(entry);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      await reload();
    }
  };

  const count = items?.length ?? 0;
  const playableAll = (items ?? []).filter((e) => !e.missing);
  const bytes = (items ?? []).reduce((sum, e) => sum + (e.missing ? 0 : e.fileSize), 0);
  const meta = items
    ? [
        `${count} video${count === 1 ? "" : "s"}`,
        playlists && `${playlists.length} playlist${playlists.length === 1 ? "" : "s"}`,
        diskSize(bytes) && `${diskSize(bytes)} en tu equipo`,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const play = (entry: LibraryEntry) => {
    const playable = (items ?? []).filter((e) => !e.missing);
    const start = playable.findIndex((e) => e.id === entry.id);
    if (start >= 0) player.actions.playVideos(playable.map(toVideoTrack), start);
  };

  return (
    <div className={PAGE_CLASS}>
      <LibraryHeader
        title="Videos"
        meta={meta}
        disabled={playableAll.length === 0}
        onPlayAll={() => player.actions.playVideos(playableAll.map(toVideoTrack), 0)}
        onShuffle={() => player.actions.playVideos(shuffled(playableAll).map(toVideoTrack), 0)}
      />

      {loadError && !items && <ErrorBanner message={loadError} />}
      {actionError && (
        <div className="mb-4">
          <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
        </div>
      )}

      {items && <PlaylistShelf kind="video" playlists={playlists} hideWhenEmpty={count === 0} />}

      {items && count > 0 && (
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-white lg:text-[28px]">
          Todos los videos <span className="ml-1 text-base font-normal text-white/40">{count}</span>
        </h2>
      )}

      {items && count === 0 && (
        <EmptyState icon="video" text="Aún no tienes videos. Ve a Descargar." action={{ href: "/descargar", label: "Ir a Descargar" }} />
      )}

      {items && count > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {items.map((entry) => (
            <li
              key={entry.id}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ entry, x: e.clientX, y: e.clientY });
              }}
              className={`group relative ${entry.missing ? "opacity-50" : ""}`}
            >
              <button
                type="button"
                disabled={entry.missing}
                onClick={() => play(entry)}
                className="block w-full rounded-2xl p-2 text-left outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
              >
                <div className="relative">
                  <LibraryThumb id={entry.id} hasThumbnail={entry.hasThumbnail} fallbackIcon="video" className="aspect-video w-full rounded-2xl shadow-lg shadow-black/40" />
                  {formatDuration(entry.durationSeconds) && (
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                      {formatDuration(entry.durationSeconds)}
                    </span>
                  )}
                </div>
                <p className="mt-3 line-clamp-2 text-[15px] font-medium leading-snug text-white/90" title={entry.title}>
                  {entry.title}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[13px] text-white/45">
                  {entry.missing ? (
                    <span className="text-amber-300/90">No encontrado</span>
                  ) : (
                    <>
                      {entry.platform && <PlatformBadge platform={entry.platform} />}
                      {entry.artist && <span className="truncate">{entry.artist}</span>}
                    </>
                  )}
                </div>
              </button>
              <button
                type="button"
                aria-label={`Opciones de ${entry.title}`}
                aria-haspopup="menu"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenu({ entry, x: rect.right, y: rect.bottom + 4 });
                }}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white/80 opacity-0 outline-none backdrop-blur transition hover:bg-black/80 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu && <ItemMenu x={menu.x} y={menu.y} actions={menuActions(menu.entry)} onClose={closeMenu} />}

      {confirming && (
        <ConfirmDialog
          title={confirming.missing ? "¿Quitar de la biblioteca?" : "¿Borrar este video?"}
          message={
            confirming.missing
              ? `«${confirming.title}» ya no está en su carpeta. Se quitará de la lista.`
              : `«${confirming.title}» irá a la Papelera de Windows. Desde ahí puedes recuperarlo.`
          }
          confirmLabel={confirming.missing ? "Quitar" : "Borrar"}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
