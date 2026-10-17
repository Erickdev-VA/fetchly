"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { addToPlaylist, createPlaylist } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { usePlaylists } from "@/hooks/useLibrary";
import { PlaylistMosaic } from "./PlaylistMosaic";
import { NameDialog } from "./NameDialog";

interface Song {
  id: string;
  title: string;
}

interface PickerApi {
  /** Opens "Añadir a playlist" for these songs. */
  addToPlaylist(songs: Song[]): void;
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

function describe(songs: Song[]): string {
  return songs.length === 1 ? `«${songs[0].title}»` : `${songs.length} canciones`;
}

/**
 * "Añadir a playlist" from anywhere in the main window (the song list, the
 * playback bar): a dialog with the playlists and "Nueva playlist", plus the
 * small notice that says how it went.
 */
export function PlaylistPickerProvider({ children }: { children: React.ReactNode }) {
  const [songs, setSongs] = useState<Song[] | null>(null);
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

  const api = useMemo<PickerApi>(() => ({ addToPlaylist: (next) => setSongs(next.length ? next : null), notify }), [notify]);

  const close = () => {
    setSongs(null);
    setNaming(false);
  };

  const addTo = async (playlist: { id: string; name: string }) => {
    if (!songs) return;
    close();
    try {
      const added = await addToPlaylist(playlist.id, songs.map((s) => s.id));
      if (added === 0) notify(`${songs.length === 1 ? "Ya estaba" : "Ya estaban"} en «${playlist.name}»`);
      else if (songs.length === 1) notify(`«${songs[0].title}» añadida a «${playlist.name}»`);
      else notify(`${added} canciones añadidas a «${playlist.name}»`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "No se pudo añadir a la playlist.");
    }
  };

  return (
    <PickerContext.Provider value={api}>
      {children}
      {songs && !naming && (
        <PickerDialog songs={songs} onPick={(p) => void addTo(p)} onNew={() => setNaming(true)} onCancel={close} />
      )}
      {songs && naming && (
        <NameDialog
          title="Nueva playlist"
          submitLabel="Crear y añadir"
          onSubmit={async (name) => {
            await createPlaylist(name, songs.map((s) => s.id));
            notify(`Playlist «${name}» creada con ${describe(songs)}`);
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
  onPick,
  onNew,
  onCancel,
}: {
  songs: Song[];
  onPick: (playlist: { id: string; name: string }) => void;
  onNew: () => void;
  onCancel: () => void;
}) {
  const { playlists, error } = usePlaylists();

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
      <h2 className="text-[15px] font-semibold">Añadir a playlist</h2>
      <p className="mt-1 truncate text-sm text-white/50">{describe(songs)}</p>

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
        {playlists?.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
          >
            <PlaylistMosaic coverIds={p.coverIds} className="h-10 w-10 shrink-0 rounded-md" />
            <span className="min-w-0">
              <span className="block truncate text-sm text-white/90">{p.name}</span>
              <span className="block text-xs text-white/40">{playlistMeta(p.count, p.durationSeconds)}</span>
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
export function playlistMeta(count: number, durationSeconds: number): string {
  const songs = `${count} canci${count === 1 ? "ón" : "ones"}`;
  if (durationSeconds <= 0) return songs;
  const minutes = Math.round(durationSeconds / 60);
  const length = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : minutes > 0 ? `${minutes} min` : formatDuration(durationSeconds);
  return `${songs} · ${length}`;
}
