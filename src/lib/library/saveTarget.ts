import { AppError } from "../errors";
import { cleanPlaylistName, createPlaylist, getPlaylist } from "./playlists";
import { SAVE_TO_LIBRARY, type SaveTarget } from "./types";
import type { DownloadMode } from "../platform/types";

/**
 * Reads "Guardar en" from a download request: { playlistId } or
 * { newPlaylistName }, plus inLibrary (also show it in Música). Only audio
 * goes into playlists; anything else is saved to the library as always.
 * A new playlist is created here, so call this after every other check.
 */
export function resolveSaveTarget(value: unknown, mode: DownloadMode): SaveTarget {
  if (mode !== "audio" || value === undefined || value === null) return SAVE_TO_LIBRARY;
  if (typeof value !== "object") throw new AppError("INVALID_URL", "Destino no válido.");
  const { playlistId, newPlaylistName, inLibrary } = value as Record<string, unknown>;
  const alsoInLibrary = inLibrary === true;

  if (newPlaylistName !== undefined) {
    return { playlistId: createPlaylist(cleanPlaylistName(newPlaylistName), []), inLibrary: alsoInLibrary };
  }
  if (playlistId === undefined || playlistId === null) return SAVE_TO_LIBRARY;
  if (typeof playlistId !== "string" || getPlaylist(playlistId)?.kind !== "music") {
    throw new AppError("NOT_FOUND", "Esa playlist ya no existe.");
  }
  return { playlistId, inLibrary: alsoInLibrary };
}
