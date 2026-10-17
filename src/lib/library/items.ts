import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { Category, LibraryItem } from "./types";
import type { Platform } from "../platform/types";

export interface ItemRow {
  id: string;
  category: Category;
  title: string;
  artist: string | null;
  duration_seconds: number | null;
  platform: string | null;
  source_url: string | null;
  file_path: string;
  file_size: number;
  thumbnail_file: string | null;
  created_at: number;
  fingerprint: string | null;
}

export function fromRow(row: ItemRow): LibraryItem {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    artist: row.artist,
    durationSeconds: row.duration_seconds,
    platform: row.platform as Platform | null,
    sourceUrl: row.source_url,
    filePath: row.file_path,
    fileSize: row.file_size,
    thumbnailFile: row.thumbnail_file,
    createdAt: row.created_at,
    fingerprint: row.fingerprint,
  };
}

// See the comment in lib/jobs/downloadJobs.ts about pinning state to globalThis.
const globalStore = globalThis as unknown as { __fetchlyLibraryRevision?: { boot: string; count: number } };
const revisionState = (globalStore.__fetchlyLibraryRevision ??= { boot: randomUUID().slice(0, 8), count: 0 });

/**
 * Changes whenever an item or a playlist is added, changed or removed, so open pages can tell
 * cheaply that their list is stale. The boot id keeps a restarted server
 * from repeating a value a page already saw.
 */
export function libraryRevision(): string {
  return `${revisionState.boot}-${revisionState.count}`;
}

/** Marks the library (items or playlists) as changed for open pages. */
export function bumpLibraryRevision(): void {
  revisionState.count++;
}

export function insertItem(item: LibraryItem): void {
  getDb()
    .prepare(
      `INSERT INTO items (id, category, title, artist, duration_seconds, platform, source_url,
                          file_path, file_size, thumbnail_file, created_at, fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      item.id,
      item.category,
      item.title,
      item.artist,
      item.durationSeconds,
      item.platform,
      item.sourceUrl,
      item.filePath,
      item.fileSize,
      item.thumbnailFile,
      item.createdAt,
      item.fingerprint,
    );
  revisionState.count++;
}

/** Every item, oldest first (moving the library, filling in fingerprints). */
export function listAllItems(): LibraryItem[] {
  const rows = getDb().prepare("SELECT * FROM items ORDER BY created_at").all() as unknown as ItemRow[];
  return rows.map(fromRow);
}

/** The item whose file has this fingerprint, if any (to skip importing the same file twice). */
export function findByFingerprint(fingerprint: string): LibraryItem | null {
  const row = getDb().prepare("SELECT * FROM items WHERE fingerprint = ? LIMIT 1").get(fingerprint) as ItemRow | undefined;
  return row ? fromRow(row) : null;
}

export function setFingerprint(id: string, fingerprint: string): void {
  getDb().prepare("UPDATE items SET fingerprint = ? WHERE id = ?").run(fingerprint, id);
}

/** After the library folder moved. */
export function setFilePath(id: string, filePath: string): void {
  getDb().prepare("UPDATE items SET file_path = ? WHERE id = ?").run(filePath, id);
  revisionState.count++;
}

export function getItem(id: string): LibraryItem | null {
  const row = getDb().prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow | undefined;
  return row ? fromRow(row) : null;
}

/** Newest first. */
export function listItems(category: Category): LibraryItem[] {
  const rows = getDb()
    .prepare("SELECT * FROM items WHERE category = ? ORDER BY created_at DESC")
    .all(category) as unknown as ItemRow[];
  return rows.map(fromRow);
}

/** Removes the entry (not the file). Returns false if there was none. */
export function deleteItem(id: string): boolean {
  const { changes } = getDb().prepare("DELETE FROM items WHERE id = ?").run(id);
  if (changes > 0) revisionState.count++;
  return changes > 0;
}
