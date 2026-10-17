import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./paths";

/**
 * Schema changes, applied in order. PRAGMA user_version records how many
 * have run, so an existing library is upgraded in place on app update.
 * Never edit a migration that has shipped; add a new one.
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE items (
     id               TEXT PRIMARY KEY,
     category         TEXT NOT NULL CHECK (category IN ('music', 'video')),
     title            TEXT NOT NULL,
     artist           TEXT,
     duration_seconds REAL,
     platform         TEXT,
     source_url       TEXT,
     file_path        TEXT NOT NULL UNIQUE,
     file_size        INTEGER NOT NULL,
     thumbnail_file   TEXT,
     created_at       INTEGER NOT NULL
   );
   CREATE INDEX items_category_created ON items (category, created_at DESC);`,
  // Playlists hold songs by reference: deleting a playlist keeps the songs,
  // deleting a song drops it from every playlist.
  `CREATE TABLE playlists (
     id         TEXT PRIMARY KEY,
     name       TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE playlist_items (
     playlist_id TEXT NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
     item_id     TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
     position    INTEGER NOT NULL,
     PRIMARY KEY (playlist_id, item_id)
   );
   CREATE INDEX playlist_items_item ON playlist_items (item_id);`,
  // Lets "Importar carpeta" recognise a file that's already in the library.
  `ALTER TABLE items ADD COLUMN fingerprint TEXT;
   CREATE INDEX items_fingerprint ON items (fingerprint);`,
];

// See the comment in lib/jobs/downloadJobs.ts about pinning state to globalThis.
const globalStore = globalThis as unknown as { __fetchlyDb?: DatabaseSync };

function open(): DatabaseSync {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "library.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");

  const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return db;
}

export function getDb(): DatabaseSync {
  globalStore.__fetchlyDb ??= open();
  return globalStore.__fetchlyDb;
}
