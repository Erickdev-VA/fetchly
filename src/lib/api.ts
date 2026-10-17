import type { AnalyzeResult, DownloadMode } from "./platform/types";
import type { Category, LibraryEntry, PlaylistDetail, PlaylistSummary } from "./library/types";

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error?.code ?? "INTERNAL";
    const message = data?.error?.message ?? "Algo salió mal.";
    throw new ApiError(code, message);
  }
  return data as T;
}

export function analyzeUrl(url: string): Promise<AnalyzeResult> {
  return fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).then((res) => parseJsonOrThrow<AnalyzeResult>(res));
}

/**
 * "Guardar en" as sent to the server (audio only): an existing playlist or a
 * new one by name, and whether the song also shows in Música. Leaving it
 * out saves to Música.
 */
export type SaveTargetRequest = { playlistId: string; inLibrary: boolean } | { newPlaylistName: string; inLibrary: boolean };

export function startDownload(params: {
  analysisId: string;
  mode: DownloadMode;
  height: number | "best";
  shareable: boolean;
  target?: SaveTargetRequest;
}): Promise<{ jobId: string; playlistId: string | null }> {
  return fetch("/api/download/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((res) => parseJsonOrThrow<{ jobId: string; playlistId: string | null }>(res));
}

/** Where a finished download ended up in the library. */
export interface SavedItem {
  id: string;
  category: Category;
  filePath: string;
}

export interface DownloadProgress {
  status: "queued" | "processing" | "completed" | "error";
  percent: number;
  /** True while the file is being re-encoded to H.264/AAC. */
  converting: boolean;
  errorMessage: string | null;
  item: SavedItem | null;
}

export function getDownloadProgress(jobId: string): Promise<DownloadProgress> {
  return fetch(`/api/download/progress/${jobId}`, { cache: "no-store" }).then((res) =>
    parseJsonOrThrow<DownloadProgress>(res),
  );
}

export type BatchItemStatus = "queued" | "downloading" | "converting" | "completed" | "error" | "cancelled";

export interface BatchProgress {
  running: boolean;
  cancelled: boolean;
  /** Set while YouTube is refusing downloads: when the batch goes on by itself (ms since epoch). */
  pausedUntil: number | null;
  category: Category;
  items: {
    entryId: string;
    title: string;
    status: BatchItemStatus;
    percent: number;
    errorMessage: string | null;
    filePath: string | null;
    /** The library entry it became, once completed. */
    libraryItemId: string | null;
  }[];
}

export function startBatch(params: {
  analysisId: string;
  entryIds: string[];
  mode: DownloadMode;
  height: number | "best";
  shareable: boolean;
  target?: SaveTargetRequest;
}): Promise<{ batchId: string; playlistId: string | null }> {
  return fetch("/api/batch/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((res) => parseJsonOrThrow<{ batchId: string; playlistId: string | null }>(res));
}

export function getBatchProgress(batchId: string): Promise<BatchProgress> {
  return fetch(`/api/batch/${batchId}`, { cache: "no-store" }).then((res) => parseJsonOrThrow<BatchProgress>(res));
}

export function cancelBatch(batchId: string): Promise<unknown> {
  return fetch(`/api/batch/${batchId}/cancel`, { method: "POST" });
}

export function resumeBatch(batchId: string): Promise<unknown> {
  return fetch(`/api/batch/${batchId}/resume`, { method: "POST" });
}

export function discardBatch(batchId: string): Promise<unknown> {
  return fetch(`/api/batch/${batchId}`, { method: "DELETE" });
}

export function fetchLibrary(category: Category): Promise<{ revision: string; items: LibraryEntry[] }> {
  return fetch(`/api/library?category=${category}`, { cache: "no-store" }).then((res) =>
    parseJsonOrThrow<{ revision: string; items: LibraryEntry[] }>(res),
  );
}

export function fetchLibraryRevision(): Promise<{ revision: string }> {
  return fetch("/api/library/revision", { cache: "no-store" }).then((res) => parseJsonOrThrow<{ revision: string }>(res));
}

export function fetchLibraryItem(id: string): Promise<{ category: Category; entry: LibraryEntry }> {
  return fetch(`/api/library/${encodeURIComponent(id)}`, { cache: "no-store" }).then((res) =>
    parseJsonOrThrow<{ category: Category; entry: LibraryEntry }>(res),
  );
}

/** Forgets an item; its file must already be in the Recycle Bin (or gone). */
export async function deleteLibraryItem(id: string): Promise<void> {
  const res = await fetch(`/api/library/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) await parseJsonOrThrow(res);
}

export function libraryMediaUrl(id: string): string {
  return `/api/library/media/${encodeURIComponent(id)}`;
}

export function libraryThumbnailUrl(id: string): string {
  return `/api/library/thumbnail/${encodeURIComponent(id)}`;
}

export function fetchPlaylists(): Promise<{ revision: string; playlists: PlaylistSummary[] }> {
  return fetch("/api/playlists", { cache: "no-store" }).then((res) =>
    parseJsonOrThrow<{ revision: string; playlists: PlaylistSummary[] }>(res),
  );
}

export function fetchPlaylist(id: string): Promise<{ revision: string; playlist: PlaylistDetail }> {
  return fetch(`/api/playlists/${encodeURIComponent(id)}`, { cache: "no-store" }).then((res) =>
    parseJsonOrThrow<{ revision: string; playlist: PlaylistDetail }>(res),
  );
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Creates a playlist, optionally with songs; resolves to its id. */
export async function createPlaylist(name: string, itemIds: string[] = []): Promise<string> {
  const { id } = await fetch("/api/playlists", jsonInit("POST", { name, itemIds })).then((res) =>
    parseJsonOrThrow<{ id: string }>(res),
  );
  return id;
}

/** Renames it, or sets which songs it has and their order. */
export async function updatePlaylist(id: string, change: { name: string } | { itemIds: string[] }): Promise<void> {
  const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`, jsonInit("PATCH", change));
  if (!res.ok) await parseJsonOrThrow(res);
}

export async function deletePlaylist(id: string): Promise<void> {
  const res = await fetch(`/api/playlists/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) await parseJsonOrThrow(res);
}

/** Adds songs at the end; resolves to how many were new to it. */
export async function addToPlaylist(id: string, itemIds: string[]): Promise<number> {
  const { added } = await fetch(`/api/playlists/${encodeURIComponent(id)}/items`, jsonInit("POST", { itemIds })).then(
    (res) => parseJsonOrThrow<{ added: number }>(res),
  );
  return added;
}

/** Shows songs in Música, or keeps them only in their playlists. Resolves to how many changed. */
export async function setInLibrary(itemIds: string[], inLibrary: boolean): Promise<number> {
  const { changed } = await fetch("/api/library/visibility", jsonInit("POST", { itemIds, inLibrary })).then((res) =>
    parseJsonOrThrow<{ changed: number }>(res),
  );
  return changed;
}

export interface AppSettings {
  settings: { libraryDir: string | null; shareableDefault: boolean; miniAutoShow: boolean };
  library: { path: string; isDefault: boolean };
  version: string | null;
}

export function fetchSettings(): Promise<AppSettings> {
  return fetch("/api/settings", { cache: "no-store" }).then((res) => parseJsonOrThrow<AppSettings>(res));
}

export async function setShareableDefault(value: boolean): Promise<void> {
  await fetch("/api/settings", jsonInit("PATCH", { shareableDefault: value })).then((res) => parseJsonOrThrow(res));
}

export async function setMiniAutoShow(value: boolean): Promise<void> {
  await fetch("/api/settings", jsonInit("PATCH", { miniAutoShow: value })).then((res) => parseJsonOrThrow(res));
}

export interface LibraryMove {
  running: boolean;
  from: string;
  to: string;
  totalFiles: number;
  movedFiles: number;
  totalBytes: number;
  movedBytes: number;
  failed: string[];
  error: string | null;
}

export function moveLibrary(folder: string): Promise<{ move: LibraryMove }> {
  return fetch("/api/settings/library-dir", jsonInit("POST", { folder })).then((res) =>
    parseJsonOrThrow<{ move: LibraryMove }>(res),
  );
}

export function fetchLibraryMove(): Promise<{ move: LibraryMove | null }> {
  return fetch("/api/settings/library-dir", { cache: "no-store" }).then((res) =>
    parseJsonOrThrow<{ move: LibraryMove | null }>(res),
  );
}

export interface StorageUsage {
  music: { bytes: number; files: number };
  video: { bytes: number; files: number };
  freeBytes: number | null;
}

export function fetchStorage(): Promise<StorageUsage> {
  return fetch("/api/settings/storage", { cache: "no-store" }).then((res) => parseJsonOrThrow<StorageUsage>(res));
}

export function fetchYtDlpVersion(): Promise<{ version: string | null }> {
  return fetch("/api/settings/ytdlp", { cache: "no-store" }).then((res) => parseJsonOrThrow<{ version: string | null }>(res));
}

export function updateYtDlp(): Promise<{ result: "updated" | "current" | "failed"; version: string | null }> {
  return fetch("/api/settings/ytdlp", { method: "POST" }).then((res) =>
    parseJsonOrThrow<{ result: "updated" | "current" | "failed"; version: string | null }>(res),
  );
}

export interface ImportProgress {
  id: string;
  folder: string;
  running: boolean;
  total: number;
  done: number;
  imported: { music: number; video: number };
  skipped: { name: string; reason: string }[];
  ignored: number;
  error: string | null;
}

export async function startImport(folder: string): Promise<string> {
  const { id } = await fetch("/api/library/import", jsonInit("POST", { folder })).then((res) =>
    parseJsonOrThrow<{ id: string }>(res),
  );
  return id;
}

export function fetchImport(id: string): Promise<ImportProgress> {
  return fetch(`/api/library/import/${encodeURIComponent(id)}`, { cache: "no-store" }).then((res) =>
    parseJsonOrThrow<ImportProgress>(res),
  );
}
