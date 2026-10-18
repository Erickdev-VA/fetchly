import type { DownloadMode, Platform } from "../platform/types";

/** Where a file lives in the library. Shared by the server and the page. */
export type Category = "music" | "video";

export const CATEGORY_LABEL: Record<Category, string> = {
  music: "Música",
  video: "Videos",
};

/** Audio downloads are music; both video modes (with or without sound) are videos. */
export function categoryForMode(mode: DownloadMode): Category {
  return mode === "audio" ? "music" : "video";
}

export interface LibraryItem {
  id: string;
  category: Category;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  platform: Platform | null;
  sourceUrl: string | null;
  /** Absolute path of the file inside the library folder. */
  filePath: string;
  fileSize: number;
  /** File name inside the thumbnails folder, if one was saved. */
  thumbnailFile: string | null;
  createdAt: number;
  /** Size plus the first and last bytes, hashed: spots the same file imported twice. */
  fingerprint: string | null;
  /**
   * Shown in Música. A song saved only into a playlist has this off and is
   * seen in its playlists alone; one that ends up in no playlist is put
   * back in Música, so it can always be reached.
   */
  inLibrary: boolean;
}

/** Where a download goes: a playlist (or none), and whether it also shows in Música. */
export interface SaveTarget {
  playlistId: string | null;
  inLibrary: boolean;
}

export const SAVE_TO_LIBRARY: SaveTarget = { playlistId: null, inLibrary: true };

/** A library item as the page sees it (GET /api/library). */
export interface LibraryEntry {
  id: string;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  platform: Platform | null;
  /** Needed for "Mostrar en carpeta" and the Recycle Bin, both done by Electron. */
  filePath: string;
  fileSize: number;
  createdAt: number;
  hasThumbnail: boolean;
  /** The file was moved or deleted outside the app. */
  missing: boolean;
  /** Shown in Música (off: only in its playlists). */
  inLibrary: boolean;
}

/** A playlist as the Playlists page lists it. */
export interface PlaylistSummary {
  id: string;
  name: string;
  /** Songs (music) or videos: a playlist holds one or the other. */
  kind: Category;
  /** Number of songs (or videos). */
  count: number;
  durationSeconds: number;
  /** Up to four songs with a cover, in playlist order, for the mosaic. */
  coverIds: string[];
  createdAt: number;
  updatedAt: number;
}

/** A playlist with its songs, in order. */
export interface PlaylistDetail extends PlaylistSummary {
  items: LibraryEntry[];
  /** Its songs that are neither in Música nor in another playlist: deleting the playlist asks about these. */
  onlyHereIds: string[];
}

/** Longest playlist name accepted. */
export const PLAYLIST_NAME_MAX = 100;
