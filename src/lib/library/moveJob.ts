import { existsSync } from "node:fs";
import { mkdir, readdir, rmdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors";
import { logger } from "../logger";
import { getSettings, updateSettings } from "../settings";
import { listAllItems, setFilePath } from "./items";
import { CATEGORY_DIR_NAMES, defaultLibraryRoot, libraryRoot } from "./paths";
import { moveFile, reserveFileName } from "./store";

export interface MoveProgress {
  running: boolean;
  from: string;
  to: string;
  totalFiles: number;
  movedFiles: number;
  totalBytes: number;
  movedBytes: number;
  /** Files that couldn't be moved; they stay (and keep working) where they were. */
  failed: string[];
  error: string | null;
}

// See the comment in lib/jobs/downloadJobs.ts about pinning state to globalThis.
const globalStore = globalThis as unknown as { __fetchlyMove?: MoveProgress };

const RETRIES = 4;
const RETRY_DELAY_MS = 700;

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * The folder the library ends up in: the chosen one if it's already called
 * "Fetchly", otherwise a "Fetchly" folder inside it, so picking "D:\" or
 * "Música" never scatters the library's subfolders among the user's own.
 */
export function targetRootFor(chosen: string): string {
  return path.basename(chosen).toLowerCase() === "fetchly" ? chosen : path.join(chosen, "Fetchly");
}

/**
 * A file that's playing is briefly locked by the media stream on Windows;
 * try again a few times before giving up on it.
 */
async function moveWithRetry(src: string, dest: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await moveFile(src, dest);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= RETRIES || (code !== "EBUSY" && code !== "EPERM" && code !== "EACCES")) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

async function filesIn(dir: string): Promise<{ path: string; size: number }[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(dir, entry.name);
    const info = await stat(full).catch(() => null);
    if (info) files.push({ path: full, size: info.size });
  }
  return files;
}

async function run(progress: MoveProgress): Promise<void> {
  try {
    // Library paths, so moved files can be re-pointed. Case-insensitive, like Windows.
    const itemsByPath = new Map(listAllItems().map((item) => [path.resolve(item.filePath).toLowerCase(), item]));
    const plan: { src: string; size: number; dir: string }[] = [];
    for (const dirName of Object.values(CATEGORY_DIR_NAMES)) {
      for (const file of await filesIn(path.join(progress.from, dirName))) {
        plan.push({ src: file.path, size: file.size, dir: dirName });
      }
    }
    progress.totalFiles = plan.length;
    progress.totalBytes = plan.reduce((sum, f) => sum + f.size, 0);

    for (const file of plan) {
      const destDir = path.join(progress.to, file.dir);
      await mkdir(destDir, { recursive: true });
      const ext = path.extname(file.src);
      const dest = await reserveFileName(destDir, path.basename(file.src, ext), ext);
      try {
        await moveWithRetry(file.src, dest);
        const item = itemsByPath.get(path.resolve(file.src).toLowerCase());
        if (item) setFilePath(item.id, dest);
      } catch (err) {
        logger.warn("moving a library file failed", { file: file.src, err: String(err) });
        progress.failed.push(path.basename(file.src));
        // reserveFileName left an empty placeholder there.
        await unlink(dest).catch(() => {});
      }
      progress.movedFiles++;
      progress.movedBytes += file.size;
    }

    // Items whose file was already missing: point them at where it would be now.
    for (const item of listAllItems()) {
      if (isWithin(progress.from, item.filePath) && !existsSync(item.filePath)) {
        const moved = path.join(progress.to, path.relative(progress.from, item.filePath));
        if (moved !== item.filePath) setFilePath(item.id, moved);
      }
    }

    // Tidy up the old folders if nothing else is left in them.
    for (const dirName of Object.values(CATEGORY_DIR_NAMES)) await rmdir(path.join(progress.from, dirName)).catch(() => {});
    await rmdir(progress.from).catch(() => {});
  } catch (err) {
    logger.error("moving the library crashed", { err: String(err) });
    progress.error = "El cambio de carpeta se detuvo por un error inesperado. Los archivos que no se movieron siguen funcionando donde estaban.";
  } finally {
    progress.running = false;
  }
}

/**
 * Moves the whole library (the Música and Videos folders) under `chosen`.
 * The new folder takes effect right away, so downloads that finish during
 * the move already land there; each file is re-pointed as soon as it moves,
 * so the library (and the song playing) keeps working throughout.
 */
export async function startLibraryMove(chosen: unknown): Promise<MoveProgress> {
  if (globalStore.__fetchlyMove?.running) throw new AppError("INVALID_URL", "Ya se está cambiando la carpeta.");
  if (typeof chosen !== "string" || !path.isAbsolute(chosen)) throw new AppError("INVALID_URL", "Elige una carpeta.");
  const info = await stat(chosen).catch(() => null);
  if (!info?.isDirectory()) throw new AppError("NOT_FOUND", "No se encontró esa carpeta.");

  const from = path.resolve(libraryRoot());
  const to = path.resolve(targetRootFor(chosen));
  if (from.toLowerCase() === to.toLowerCase()) throw new AppError("INVALID_URL", "La biblioteca ya está en esa carpeta.");
  if (isWithin(from, to) || isWithin(to, from)) {
    throw new AppError("INVALID_URL", "Elige una carpeta que no esté dentro de la biblioteca actual (ni al revés).");
  }
  try {
    await mkdir(to, { recursive: true });
  } catch {
    throw new AppError("INVALID_URL", "No se puede escribir en esa carpeta. Elige otra.");
  }

  const isDefault = to.toLowerCase() === path.resolve(defaultLibraryRoot()).toLowerCase();
  updateSettings({ libraryDir: isDefault ? null : to });

  const progress: MoveProgress = {
    running: true,
    from,
    to,
    totalFiles: 0,
    movedFiles: 0,
    totalBytes: 0,
    movedBytes: 0,
    failed: [],
    error: null,
  };
  globalStore.__fetchlyMove = progress;
  void run(progress);
  return progress;
}

export function getLibraryMove(): MoveProgress | null {
  return globalStore.__fetchlyMove ?? null;
}

/** The library folder, and whether it's the default one. */
export function libraryLocation(): { path: string; isDefault: boolean } {
  return { path: libraryRoot(), isDefault: getSettings().libraryDir === null };
}
