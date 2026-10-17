import { getDb } from "./db";
import type { Category, LibraryItem } from "./types";
import type { Platform } from "../platform/types";

interface ItemRow {
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
}

function fromRow(row: ItemRow): LibraryItem {
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
  };
}

export function insertItem(item: LibraryItem): void {
  getDb()
    .prepare(
      `INSERT INTO items (id, category, title, artist, duration_seconds, platform, source_url,
                          file_path, file_size, thumbnail_file, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );
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
