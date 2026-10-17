"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPlaylists, type SaveTargetRequest } from "@/lib/api";
import { PLAYLIST_NAME_MAX, type PlaylistSummary } from "@/lib/library/types";

/** "Guardar en" while picking: Música, or a playlist (an existing one or a new one by name). */
export type SaveChoice =
  | { to: "library" }
  | { to: "playlist"; playlistId: string | "new"; newName: string; alsoInLibrary: boolean };

export const SAVE_TO_LIBRARY_CHOICE: SaveChoice = { to: "library" };

/**
 * The choice as the server takes it, plus the playlist's name for the
 * "Guardado en…" notice. Null when it can't be used yet (a new playlist
 * with no name).
 */
export function saveRequest(
  choice: SaveChoice,
  playlists: PlaylistSummary[] | null,
): { target?: SaveTargetRequest; playlistName: string | null } | null {
  if (choice.to === "library") return { playlistName: null };
  if (choice.playlistId === "new") {
    const name = choice.newName.replace(/\s+/g, " ").trim();
    if (!name) return null;
    return { target: { newPlaylistName: name, inLibrary: choice.alsoInLibrary }, playlistName: name };
  }
  const name = playlists?.find((p) => p.id === choice.playlistId)?.name ?? "la playlist";
  return { target: { playlistId: choice.playlistId, inLibrary: choice.alsoInLibrary }, playlistName: name };
}

/** The playlists, loaded with the card; `reload` after a download created one. */
export function usePlaylistOptions(): { playlists: PlaylistSummary[] | null; reload: () => Promise<void> } {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const reload = useCallback(
    () =>
      fetchPlaylists().then(
        ({ playlists }) => setPlaylists(playlists),
        () => setPlaylists((prev) => prev ?? []),
      ),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  return { playlists, reload };
}

/**
 * Once a download created its new playlist, the choice points at that
 * playlist, so downloading again doesn't make a second one with the same name.
 */
export function chooseCreatedPlaylist(choice: SaveChoice, playlistId: string): SaveChoice {
  return choice.to === "playlist" && choice.playlistId === "new" ? { ...choice, playlistId } : choice;
}

const pill = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium transition ${
    active ? "bg-white text-black" : "text-white/55 hover:text-white/85"
  } disabled:cursor-default disabled:opacity-50`;

/**
 * "Guardar en: Mi música | Una playlist". For a playlist: which one (or a
 * new one, named after the YouTube playlist when there is one), and
 * whether the songs also show in Mi música; off by default, so they stay
 * apart from the rest.
 */
export function SaveTargetPicker({
  value,
  onChange,
  playlists,
  suggestedName,
  disabled,
}: {
  value: SaveChoice;
  onChange: (choice: SaveChoice) => void;
  playlists: PlaylistSummary[] | null;
  /** Name offered for a new playlist. */
  suggestedName: string;
  disabled?: boolean;
}) {
  const pickPlaylist = () =>
    onChange({
      to: "playlist",
      // A whole playlist most likely wants its own; a single song, the latest one used.
      playlistId: suggestedName || !playlists?.length ? "new" : playlists[0].id,
      newName: suggestedName.slice(0, PLAYLIST_NAME_MAX),
      alsoInLibrary: false,
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/45">Guardar en</span>
        <div className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
          <button type="button" disabled={disabled} onClick={() => onChange(SAVE_TO_LIBRARY_CHOICE)} className={pill(value.to === "library")}>
            Mi música
          </button>
          <button type="button" disabled={disabled} onClick={() => value.to !== "playlist" && pickPlaylist()} className={pill(value.to === "playlist")}>
            Una playlist
          </button>
        </div>
      </div>

      {value.to === "playlist" && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Playlist"
              disabled={disabled}
              value={value.playlistId}
              onChange={(e) => onChange({ ...value, playlistId: e.target.value })}
              className="min-w-0 max-w-full flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white outline-none focus:border-white/25 disabled:opacity-50 sm:flex-none [&>option]:bg-neutral-900"
            >
              <option value="new">＋ Nueva playlist</option>
              {playlists?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {value.playlistId === "new" && (
              <input
                type="text"
                aria-label="Nombre de la nueva playlist"
                placeholder="Nombre de la playlist"
                maxLength={PLAYLIST_NAME_MAX}
                disabled={disabled}
                value={value.newName}
                onChange={(e) => onChange({ ...value, newName: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25 disabled:opacity-50"
              />
            )}
          </div>
          <label className={`inline-flex items-center gap-2 text-xs text-white/60 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.alsoInLibrary}
              onChange={(e) => onChange({ ...value, alsoInLibrary: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Mostrar también en Mi música
          </label>
          {!value.alsoInLibrary && (
            <p className="text-[11px] text-white/35">Solo estará en la playlist, aparte del resto de tu música.</p>
          )}
        </div>
      )}
    </div>
  );
}
