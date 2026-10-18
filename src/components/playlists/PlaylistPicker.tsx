"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { addToPlaylist, createPlaylist } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { songCount } from "@/lib/library/actions";
import type { Category } from "@/lib/library/types";
import { usePlaylists } from "@/hooks/useLibrary";
import { PlaylistMosaic } from "./PlaylistMosaic";
import { NameDialog } from "./NameDialog";

interface Song {
  id: string;
  title: string;
}

interface MoveFrom {
  /** The playlist the songs leave; it isn't offered as a destination. */
  playlistId: string;
  /** Called once they're in the other playlist, to take them out of this one. */
  onMoved: () => void | Promise<void>;
}

interface PickerApi {
  /**
   * Opens "Añadir a playlist" for these songs. With `moveFrom` it's "Mover a
   * playlist": once they're added (or were already there), `onMoved` takes
   * them out of the playlist they came from. If adding fails, they stay.
   * With kind "video", these are videos and only playlists of videos are offered.
   */
  addToPlaylist(songs: Song[], moveFrom?: MoveFrom, kind?: Category): void;
  /** A short message at the bottom of the window. */
  notify(message: string): void;
}

const PickerContext = createContext<PickerApi | null>(null);

export function usePlaylistPicker(): PickerApi {
  const value = useContext(PickerContext);
  if (!value) throw new Error("usePlaylistPicker must be used inside <PlaylistPickerProvider>");
  return value;
}

const TOAST_MS = 3000;

function describe(songs: Song[], kind: Category = "music"): string {
  if (songs.length === 1) return `«${songs[0].title}»`;
  return kind === "video" ? `${songs.length} videos` : songCount(songs.length);
}

/**
 * "Añadir a playlist" from anywhere in the main window (the song list, the
 * playback bar): a dialog with the playlists and "Nueva playlist", plus the
 * small notice that says how it went.
 */
export function PlaylistPickerProvider({ children }: { children: React.ReactNode }) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [moveFrom, setMoveFrom] = useState<MoveFrom | null>(null);
  const [kind, setKind] = useState<Category>("music");
  const [naming, setNaming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const api = useMemo<PickerApi>(
    () => ({
      addToPlaylist: (next, from, nextKind = "music") => {
        setSongs(next.length ? next : null);
        setMoveFrom(from ?? null);
        setKind(nextKind);
      },
      notify,
    }),
    [notify],
  );

  const close = () => {
    setSongs(null);
    setMoveFrom(null);
    setNaming(false);
  };

  /** After the songs are in `name`: finish a move, then say how it went. */
  const finish = async (name: string, added: number | "created") => {
    if (!songs) return;
    if (moveFrom) {
      try {
        await moveFrom.onMoved();
        notify(`${describe(songs, kind)} ${songs.length === 1 ? "movida" : "movidas"} a «${name}»`);
      } catch (err) {
        notify(err instanceof Error ? err.message : `Se añadieron a «${name}», pero no se pudieron quitar de esta playlist.`);
      }
    } else if (added === "created") notify(`Playlist «${name}» creada con ${describe(songs, kind)}`);
    else if (added === 0) notify(`${songs.length === 1 ? "Ya estaba" : "Ya estaban"} en «${name}»`);
    else if (songs.length === 1) notify(`«${songs[0].title}» ${kind === "video" ? "añadido" : "añadida"} a «${name}»`);
    else notify(kind === "video" ? `${added} videos añadidos a «${name}»` : `${added} canciones añadidas a «${name}»`);
  };

  const addTo = async (playlist: { id: string; name: string }) => {
    if (!songs) return;
    close();
    try {
      await finish(playlist.name, await addToPlaylist(playlist.id, songs.map((s) => s.id)));
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo añadir a la playlist.");
    }
  };

  return (
    <PickerContext.Provider value={api}>
      {children}
      {songs && !naming && (
        <PickerDialog
          songs={songs}
          kind={kind}
          moving={moveFrom !== null}
          exclude={moveFrom?.playlistId ?? null}
          onPick={(p) => void addTo(p)}
          onNew={() => setNaming(true)}
          onCancel={close}
        />
      )}
      {songs && naming && (
        <NameDialog
          title="Nueva playlist"
          submitLabel={moveFrom ? "Crear y mover" : "Crear y añadir"}
          onSubmit={async (name) => {
            await createPlaylist(name, songs.map((s) => s.id), kind);
            await finish(name, "created");
            close();
          }}
          onCancel={close}
        />
      )}
      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-[92px] left-1/2 z-50 max-w-[min(480px,calc(100vw-32px))] -translate-x-1/2 animate-[fadeIn_0.15s_ease] truncate rounded-xl border border-white/10 bg-[#1d1d22] px-4 py-2.5 text-sm text-white/90 shadow-2xl shadow-black/60"
        >
          {toast}
        </div>
      )}
    </PickerContext.Provider>
  );
}

function PickerDialog({
  songs,
  kind,
  moving,
  exclude,
  onPick,
  onNew,
  onCancel,
}: {
  songs: Song[];
  kind: Category;
  moving: boolean;
  /** A playlist not to list (the one the songs are moving out of). */
  exclude: string | null;
  onPick: (playlist: { id: string; name: string }) => void;
  onNew: () => void;
  onCancel: () => void;
}) {
  const { playlists, error } = usePlaylists(kind);

  return (
    <dialog
      ref={(dialog) => {
        if (dialog && !dialog.open) dialog.showModal();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-[#17171b] p-5 text-white backdrop:bg-black/60"
    >
      <h2 className="text-[15px] font-semibold">{moving ? "Mover a playlist" : "Añadir a playlist"}</h2>
      <p className="mt-1 truncate text-sm text-white/50">{describe(songs, kind)}</p>

      <div className="mt-4 max-h-[min(360px,50vh)] overflow-y-auto">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-medium text-white/85 outline-none transition hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-xl leading-none text-white/70">
            +
          </span>
          Nueva playlist
        </button>
        {error && !playlists && <p className="px-2 py-3 text-xs text-red-300">{error}</p>}
        {playlists?.filter((p) => p.id !== exclude).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
          >
            <PlaylistMosaic coverIds={p.coverIds} className="h-10 w-10 shrink-0 rounded-md" />
            <span className="min-w-0">
              <span className="block truncate text-sm text-white/90">{p.name}</span>
              <span className="block text-xs text-white/40">{playlistMeta(p.count, p.durationSeconds, p.kind)}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        >
          Cancelar
        </button>
      </div>
    </dialog>
  );
}

/** "12 canciones · 48 min" */
export function playlistMeta(count: number, durationSeconds: number, kind: Category = "music"): string {
  const songs = kind === "video" ? `${count} video${count === 1 ? "" : "s"}` : `${count} canci${count === 1 ? "ón" : "ones"}`;
  if (durationSeconds <= 0) return songs;
  const minutes = Math.round(durationSeconds / 60);
  const length = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : minutes > 0 ? `${minutes} min` : formatDuration(durationSeconds);
  return `${songs} · ${length}`;
}
