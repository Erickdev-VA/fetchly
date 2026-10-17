import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors";
import { logger } from "../logger";
import { safeFileStem } from "../security/filename";
import { extractCover, readMediaTags } from "../ytdlp/postprocess";
import { fileFingerprint } from "./fingerprint";
import { findByFingerprint, insertItem, listAllItems, setFingerprint } from "./items";
import { categoryDir, isInsideLibrary, thumbnailsDir } from "./paths";
import { reserveFileName } from "./store";
import type { Category, LibraryItem } from "./types";

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".oga", ".opus"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".webm", ".mov", ".mkv"]);
const MAX_DEPTH = 8;
const MAX_FILES = 5000;
/** Kept around after finishing, so the page can still show the result. */
const FINISHED_TTL_MS = 60 * 60 * 1000;

export interface ImportProgress {
  id: string;
  folder: string;
  running: boolean;
  /** Media files found. */
  total: number;
  done: number;
  imported: { music: number; video: number };
  /** Media files that weren't imported, and why. */
  skipped: { name: string; reason: string }[];
  /** Files that aren't audio or video (pictures, documents…), left alone. */
  ignored: number;
  /** Set when the whole import failed. */
  error: string | null;
}

interface ImportJob extends ImportProgress {
  finishedAt?: number;
}

// See the comment in lib/jobs/downloadJobs.ts about pinning state to globalThis.
const globalStore = globalThis as unknown as { __fetchlyImports?: Map<string, ImportJob> };
const jobs = (globalStore.__fetchlyImports ??= new Map());

function sweep() {
  for (const [id, job] of jobs) {
    if (job.finishedAt && Date.now() - job.finishedAt > FINISHED_TTL_MS) jobs.delete(id);
  }
}

/** Media files under `folder` (subfolders too), skipping hidden ones. */
async function findMedia(folder: string, job: ImportJob): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, depth: number) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // no permission: skip that folder
    }
    for (const entry of entries) {
      if (found.length >= MAX_FILES) return;
      if (entry.name.startsWith(".") || entry.name.startsWith("$")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) await walk(full, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext)) found.push(full);
        else job.ignored++;
      }
    }
  };
  await walk(folder, 0);
  return found.sort((a, b) => a.localeCompare(b));
}

/** Older items have no fingerprint yet; give them one so their copies are recognised. */
async function fillMissingFingerprints(): Promise<void> {
  for (const item of listAllItems()) {
    if (item.fingerprint) continue;
    const fingerprint = await fileFingerprint(item.filePath).catch(() => null);
    if (fingerprint) setFingerprint(item.id, fingerprint);
  }
}

async function importFile(job: ImportJob, source: string, seen: Set<string>): Promise<void> {
  const name = path.basename(source);
  const skip = (reason: string) => {
    job.skipped.push({ name, reason });
  };

  if (isInsideLibrary(source)) return skip("Ya está en la carpeta de la biblioteca");
  const fingerprint = await fileFingerprint(source).catch(() => null);
  if (!fingerprint) return skip("No se pudo leer el archivo");
  if (seen.has(fingerprint) || findByFingerprint(fingerprint)) return skip("Ya está en la biblioteca");
  seen.add(fingerprint);

  const tags = await readMediaTags(source);
  const ext = path.extname(source).toLowerCase();
  // A video file with no picture (an audio-only .mp4 or .webm) is music.
  const category: Category | null =
    tags.hasVideo && VIDEO_EXTENSIONS.has(ext) ? "video" : tags.hasAudio ? "music" : null;
  if (!category) return skip("No tiene audio ni video que se pueda reproducir");

  const id = randomUUID();
  const title = tags.title ?? path.basename(source, path.extname(source));
  const dir = categoryDir(category);
  await mkdir(dir, { recursive: true });
  const filePath = await reserveFileName(dir, safeFileStem(title), ext);
  try {
    await copyFile(source, filePath);
    let thumbnailFile: string | null = `${id}.jpg`;
    await mkdir(thumbnailsDir(), { recursive: true });
    const coverSaved =
      category === "video"
        ? await extractCover(filePath, path.join(thumbnailsDir(), thumbnailFile), {
            kind: "frame",
            atSeconds: Math.min(10, (tags.durationSeconds ?? 0) / 10),
          })
        : tags.hasCover && (await extractCover(filePath, path.join(thumbnailsDir(), thumbnailFile), { kind: "embedded" }));
    if (!coverSaved) thumbnailFile = null;

    const item: LibraryItem = {
      id,
      category,
      title,
      artist: tags.artist,
      durationSeconds: tags.durationSeconds,
      platform: null,
      sourceUrl: null,
      filePath,
      fileSize: (await stat(filePath)).size,
      thumbnailFile,
      createdAt: Date.now(),
      fingerprint,
    };
    insertItem(item);
    job.imported[category]++;
  } catch (err) {
    await unlink(filePath).catch(() => {});
    logger.warn("import failed", { source, err: String(err) });
    skip("No se pudo copiar (¿falta espacio o el archivo está en uso?)");
  }
}

async function run(job: ImportJob): Promise<void> {
  try {
    await fillMissingFingerprints();
    const files = await findMedia(job.folder, job);
    job.total = files.length;
    const seen = new Set<string>();
    for (const file of files) {
      try {
        await importFile(job, file, seen);
      } catch (err) {
        // One odd file must not stop the rest.
        logger.warn("import of one file failed", { file, err: String(err) });
        job.skipped.push({ name: path.basename(file), reason: "No se pudo importar" });
      }
      job.done++;
    }
  } catch (err) {
    logger.error("import crashed", { folder: job.folder, err: String(err) });
    job.error = "La importación se detuvo por un error inesperado.";
  } finally {
    job.running = false;
    job.finishedAt = Date.now();
  }
}

/**
 * Copies the audio and video files of `folder` into the library (originals
 * stay where they were). Only one import runs at a time; asking again while
 * one runs returns that one.
 */
export async function startImport(folder: unknown): Promise<string> {
  sweep();
  const running = [...jobs.values()].find((j) => j.running);
  if (running) return running.id;

  if (typeof folder !== "string" || !path.isAbsolute(folder)) throw new AppError("INVALID_URL", "Elige una carpeta.");
  const info = await stat(folder).catch(() => null);
  if (!info?.isDirectory()) throw new AppError("NOT_FOUND", "No se encontró esa carpeta.");

  const job: ImportJob = {
    id: randomUUID(),
    folder,
    running: true,
    total: 0,
    done: 0,
    imported: { music: 0, video: 0 },
    skipped: [],
    ignored: 0,
    error: null,
  };
  jobs.set(job.id, job);
  void run(job);
  return job.id;
}

export function getImport(id: string): ImportProgress | null {
  const job = jobs.get(id);
  if (!job) return null;
  return {
    id: job.id,
    folder: job.folder,
    running: job.running,
    total: job.total,
    done: job.done,
    imported: job.imported,
    skipped: job.skipped,
    ignored: job.ignored,
    error: job.error,
  };
}
