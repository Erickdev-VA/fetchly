import os from "node:os";
import path from "node:path";
import type { Category } from "./types";

// Keep in sync with CATEGORY_DIRS in electron/main.cjs.
const CATEGORY_DIR_NAMES: Record<Category, string> = {
  music: "Música",
  video: "Videos",
};

/**
 * Documentos\Fetchly, where the user's files go. Electron passes the real
 * Documents folder (which may be redirected to OneDrive); the fallback is
 * only for running the server on its own.
 */
export function libraryRoot(): string {
  return process.env.FETCHLY_LIBRARY_DIR ?? path.join(os.homedir(), "Documents", "Fetchly");
}

export function categoryDir(category: Category): string {
  return path.join(libraryRoot(), CATEGORY_DIR_NAMES[category]);
}

/** %APPDATA%\Fetchly: the database and thumbnails, out of the user's way. */
export function dataDir(): string {
  return process.env.FETCHLY_DATA_DIR ?? path.join(os.homedir(), "AppData", "Roaming", "Fetchly");
}

export function thumbnailsDir(): string {
  return path.join(dataDir(), "thumbnails");
}

/** True if `filePath` is somewhere under the library folder (not the folder itself). */
export function isInsideLibrary(filePath: string): boolean {
  const relative = path.relative(libraryRoot(), path.resolve(filePath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
