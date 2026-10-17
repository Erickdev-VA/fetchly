import { randomUUID } from "node:crypto";
import { copyFile, mkdir, open, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { categoryDir, thumbnailsDir } from "./paths";
import { insertItem } from "./items";
import type { Category, LibraryItem } from "./types";
import { safeFileStem } from "../security/filename";
import { probeMedia } from "../ytdlp/postprocess";
import { logger } from "../logger";
import type { Platform } from "../platform/types";

const THUMBNAIL_TIMEOUT_MS = 10_000;
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const THUMBNAIL_EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/**
 * Creates an empty file with a name nobody else has, "Title.m4a", then
 * "Title (2).m4a" and so on. Creating it exclusively (`wx`) is what makes two
 * downloads finishing at the same moment unable to pick the same name.
 */
async function reserveFileName(dir: string, stem: string, ext: string): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = path.join(dir, n === 1 ? `${stem}${ext}` : `${stem} (${n})${ext}`);
    try {
      await (await open(candidate, "wx")).close();
      return candidate;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
}

/** Moves a file onto `dest` (which may exist), across drives if needed. */
async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err) {
    // The temp folder and Documents can be on different drives.
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await copyFile(src, dest);
    await rm(src, { force: true });
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Saves the cover locally so the library shows it without internet. A
 * missing or broken thumbnail never fails the download.
 */
async function saveThumbnail(itemId: string, url: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS), redirect: "follow" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = THUMBNAIL_EXT_BY_TYPE[type];
    if (!res.ok || !ext) return null;
    const body = await readLimited(res, MAX_THUMBNAIL_BYTES);
    if (!body || body.length === 0) return null;
    await mkdir(thumbnailsDir(), { recursive: true });
    const fileName = `${itemId}${ext}`;
    await writeFile(path.join(thumbnailsDir(), fileName), body);
    return fileName;
  } catch (err) {
    logger.warn("thumbnail download failed", { itemId, err: String(err) });
    return null;
  }
}

export interface NewDownload {
  /** The finished file in the job's temp folder; it's moved, not copied. */
  tempFilePath: string;
  category: Category;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  platform: Platform;
  sourceUrl: string;
  thumbnailUrl: string | null;
}

/** Moves a finished download into Documentos\Fetchly\<categoría> and records it. */
export async function addDownloadToLibrary(download: NewDownload): Promise<LibraryItem> {
  const id = randomUUID();
  const dir = categoryDir(download.category);
  await mkdir(dir, { recursive: true });

  const ext = path.extname(download.tempFilePath).toLowerCase() || (download.category === "music" ? ".m4a" : ".mp4");
  const filePath = await reserveFileName(dir, safeFileStem(download.title), ext);
  try {
    await moveFile(download.tempFilePath, filePath);
  } catch (err) {
    await unlink(filePath).catch(() => {});
    throw err;
  }

  try {
    const [{ size }, thumbnailFile, durationSeconds] = await Promise.all([
      stat(filePath),
      saveThumbnail(id, download.thumbnailUrl),
      download.durationSeconds ?? probeMedia(filePath).then((p) => p.durationSeconds),
    ]);

    const item: LibraryItem = {
      id,
      category: download.category,
      title: download.title,
      artist: download.artist,
      durationSeconds,
      platform: download.platform,
      sourceUrl: download.sourceUrl,
      filePath,
      fileSize: size,
      thumbnailFile,
      createdAt: Date.now(),
    };
    insertItem(item);
    return item;
  } catch (err) {
    // Don't leave a file the library doesn't know about.
    await unlink(filePath).catch(() => {});
    throw err;
  }
}
