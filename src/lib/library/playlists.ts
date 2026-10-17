import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { AppError } from "../errors";
import { getDb } from "./db";
import { toEntry } from "./entries";
import { bumpLibraryRevision, fromRow, type ItemRow } from "./items";
import { PLAYLIST_NAME_MAX, type PlaylistDetail, type PlaylistSummary } from "./types";

interface PlaylistRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  count: number;
  duration: number | null;
}

const COVERS_IN_MOSAIC = 4;

/** Trimmed and checked; throws a message for the user when it's empty or too long. */
export function cleanPlaylistName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new AppError("INVALID_URL", "Escribe un nombre para la playlist.");
  if (name.length > PLAYLIST_NAME_MAX) {
    throw new AppError("INVALID_URL", `El nombre puede tener hasta ${PLAYLIST_NAME_MAX} caracteres.`);
  }
  return name;
}

function inTransaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec("BEGIN");
  try {
    const result = run();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function coverIds(db: DatabaseSync, playlistId: string): string[] {
  const rows = db
    .prepare(
      `SELECT i.id FROM playlist_items p JOIN items i ON i.id = p.item_id
       WHERE p.playlist_id = ? AND i.thumbnail_file IS NOT NULL
       ORDER BY p.position LIMIT ${COVERS_IN_MOSAIC}`,
    )
    .all(playlistId) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}

function toSummary(db: DatabaseSync, row: PlaylistRow): PlaylistSummary {
  return {
    id: row.id,
    name: row.name,
    count: row.count,
    durationSeconds: row.duration ?? 0,
    coverIds: coverIds(db, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SUMMARY_SELECT = `
  SELECT pl.id, pl.name, pl.created_at, pl.updated_at,
         COUNT(i.id) AS count, SUM(i.duration_seconds) AS duration
  FROM playlists pl
  LEFT JOIN playlist_items p ON p.playlist_id = pl.id
  LEFT JOIN items i ON i.id = p.item_id`;

/** Most recently changed first. */
export function listPlaylists(): PlaylistSummary[] {
  const db = getDb();
  const rows = db
    .prepare(`${SUMMARY_SELECT} GROUP BY pl.id ORDER BY pl.updated_at DESC`)
    .all() as unknown as PlaylistRow[];
  return rows.map((row) => toSummary(db, row));
}

export function getPlaylist(id: string): PlaylistDetail | null {
  const db = getDb();
  const row = db.prepare(`${SUMMARY_SELECT} WHERE pl.id = ? GROUP BY pl.id`).get(id) as PlaylistRow | undefined;
  if (!row) return null;
  const items = db
    .prepare(
      `SELECT i.* FROM playlist_items p JOIN items i ON i.id = p.item_id
       WHERE p.playlist_id = ? ORDER BY p.position`,
    )
    .all(id) as unknown as ItemRow[];
  return { ...toSummary(db, row), items: items.map((r) => toEntry(fromRow(r))) };
}

/** Of `ids`, the songs (not videos) that exist, in the given order, without repeats. */
function existingSongs(db: DatabaseSync, ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const check = db.prepare("SELECT 1 FROM items WHERE id = ? AND category = 'music'");
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && !seen.has(id) && check.get(id)) seen.add(id);
  }
  return [...seen];
}

function appendSongs(db: DatabaseSync, playlistId: string, itemIds: string[]): number {
  const { next } = db
    .prepare("SELECT COALESCE(MAX(position) + 1, 0) AS next FROM playlist_items WHERE playlist_id = ?")
    .get(playlistId) as { next: number };
  const insert = db.prepare("INSERT OR IGNORE INTO playlist_items (playlist_id, item_id, position) VALUES (?, ?, ?)");
  let added = 0;
  for (const itemId of itemIds) {
    added += Number(insert.run(playlistId, itemId, next + added).changes);
  }
  return added;
}

function touch(db: DatabaseSync, playlistId: string): void {
  db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(Date.now(), playlistId);
}

/** Creates a playlist, optionally with songs (in that order). Returns its id. */
export function createPlaylist(name: string, itemIds: unknown): string {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  inTransaction(db, () => {
    db.prepare("INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, name, now, now);
    appendSongs(db, id, existingSongs(db, itemIds));
  });
  bumpLibraryRevision();
  return id;
}

export function renamePlaylist(id: string, name: string): boolean {
  const db = getDb();
  const { changes } = db.prepare("UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?").run(name, Date.now(), id);
  if (changes > 0) bumpLibraryRevision();
  return changes > 0;
}

/** Deletes the playlist only; its songs stay in the library. */
export function deletePlaylist(id: string): boolean {
  const { changes } = getDb().prepare("DELETE FROM playlists WHERE id = ?").run(id);
  if (changes > 0) bumpLibraryRevision();
  return changes > 0;
}

function playlistExists(db: DatabaseSync, id: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM playlists WHERE id = ?").get(id));
}

/** Adds songs at the end; songs already in it are skipped. Returns how many were added, or null if there's no such playlist. */
export function addToPlaylist(id: string, itemIds: unknown): number | null {
  const db = getDb();
  if (!playlistExists(db, id)) return null;
  const added = inTransaction(db, () => {
    const count = appendSongs(db, id, existingSongs(db, itemIds));
    if (count > 0) touch(db, id);
    return count;
  });
  if (added > 0) bumpLibraryRevision();
  return added;
}

/**
 * Sets which songs the playlist has and in what order: reordering and
 * removing both come through here. Only songs already in it are kept, so a
 * stale page can't sneak new ones in. Returns false if there's no such playlist.
 */
export function setPlaylistOrder(id: string, itemIds: unknown): boolean {
  const db = getDb();
  if (!playlistExists(db, id) || !Array.isArray(itemIds)) return false;
  const current = new Set(
    (db.prepare("SELECT item_id FROM playlist_items WHERE playlist_id = ?").all(id) as unknown as { item_id: string }[]).map(
      (r) => r.item_id,
    ),
  );
  const order = [...new Set(itemIds.filter((v): v is string => typeof v === "string" && current.has(v)))];
  inTransaction(db, () => {
    db.prepare("DELETE FROM playlist_items WHERE playlist_id = ?").run(id);
    const insert = db.prepare("INSERT INTO playlist_items (playlist_id, item_id, position) VALUES (?, ?, ?)");
    order.forEach((itemId, position) => insert.run(id, itemId, position));
    touch(db, id);
  });
  bumpLibraryRevision();
  return true;
}
