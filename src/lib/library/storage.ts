import { readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { categoryDir, libraryRoot } from "./paths";
import type { Category } from "./types";

export interface StorageUsage {
  /** Bytes and files in each category folder (everything there, not only what the app knows about). */
  music: { bytes: number; files: number };
  video: { bytes: number; files: number };
  /** Free space on the drive holding the library, if it could be read. */
  freeBytes: number | null;
}

async function folderUsage(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  const walk = async (current: string) => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const info = await stat(full).catch(() => null);
        if (info) {
          bytes += info.size;
          files++;
        }
      }
    }
  };
  await walk(dir);
  return { bytes, files };
}

/** "Espacio usado" in Ajustes, measured on disk so it matches what Windows shows. */
export async function storageUsage(): Promise<StorageUsage> {
  const [music, video] = await Promise.all((["music", "video"] as Category[]).map((c) => folderUsage(categoryDir(c))));
  let freeBytes: number | null = null;
  try {
    const fs = await statfs(libraryRoot());
    freeBytes = fs.bavail * fs.bsize;
  } catch {
    // the folder may not exist yet
  }
  return { music, video, freeBytes };
}
