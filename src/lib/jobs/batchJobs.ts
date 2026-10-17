import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import type { ChildProcess } from "node:child_process";
import { killProcessTree } from "../ytdlp/process";
import { logger } from "../logger";
import { runDownload, BlockedError, DownloadError } from "./runDownload";
import { acquireDownloadSlot } from "./capacity";
import { TMP_ROOT, SAVE_FAILED_MESSAGE, initTempRoot, cleanupJobFiles } from "./downloadJobs";
import { addDownloadToLibrary } from "../library/store";
import { placeExistingSong } from "../library/playlists";
import { categoryForMode, type LibraryItem, type SaveTarget } from "../library/types";
import type { DownloadMode, Platform } from "../platform/types";

/** Videos downloaded in parallel within one batch (on top of the app-wide limit). */
const BATCH_CONCURRENCY = Number(process.env.BATCH_CONCURRENCY ?? 2);
/** How long a finished batch's status stays readable by the page. */
const FINISHED_TTL_MS = 60 * 60 * 1000;
const ITEM_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;
/**
 * A short, uneven pause after each video. Hundreds of back-to-back requests
 * are what gets YouTube to start refusing; a few seconds between them keeps
 * a long playlist going far longer.
 */
const ITEM_GAP_MIN_MS = 1500;
const ITEM_GAP_MAX_MS = 4000;
/** When YouTube starts refusing, wait this long (times how often it happened, up to the max) before going on. */
const BLOCK_PAUSE_MS = 10 * 60 * 1000;
const BLOCK_PAUSE_MAX_MS = 30 * 60 * 1000;

export type BatchItemStatus = "queued" | "downloading" | "converting" | "completed" | "error" | "cancelled";

export interface BatchItem {
  entryId: string;
  url: string;
  title: string;
  author: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  /** Position in the playlist. */
  index: number;
  status: BatchItemStatus;
  percent: number;
  errorMessage?: string;
  /** The library entry the file became, once completed. */
  libraryItem?: LibraryItem;
  /** Already downloaded as a song: it's saved to the target again instead of downloaded twice. */
  existing?: LibraryItem;
  child?: ChildProcess;
}

export interface BatchJob {
  id: string;
  title: string;
  platform: Platform;
  mode: DownloadMode;
  height: number | "best";
  shareable: boolean;
  /** "Guardar en": a playlist and/or Música. */
  target: SaveTarget;
  items: BatchItem[];
  tempDir: string;
  cancelled: boolean;
  createdAt: number;
  finishedAt?: number;
  /** Videos not started yet, in playlist order. */
  queue: BatchItem[];
  /** Workers currently pulling from `queue`. */
  workers: number;
  /** Set while paused because YouTube refused: when the batch goes on by itself. */
  pausedUntil?: number;
  /** How many times YouTube refused during this batch (each pause is longer). */
  blockCount: number;
  resumeTimer?: NodeJS.Timeout;
}

interface BatchJobsGlobal {
  batches: Map<string, BatchJob>;
  sweepIntervalStarted: boolean;
}

// See the comment in downloadJobs.ts about pinning state to globalThis.
const globalStore = globalThis as unknown as { __mediaDownloaderBatches?: BatchJobsGlobal };
const store: BatchJobsGlobal = globalStore.__mediaDownloaderBatches ?? {
  batches: new Map<string, BatchJob>(),
  sweepIntervalStarted: false,
};
globalStore.__mediaDownloaderBatches = store;

const batches = store.batches;

if (!store.sweepIntervalStarted) {
  store.sweepIntervalStarted = true;
  setInterval(
    () => {
      const now = Date.now();
      for (const [id, batch] of batches) {
        if (batch.finishedAt && now - batch.finishedAt > FINISHED_TTL_MS) {
          batches.delete(id);
          void cleanupJobFiles(batch);
        }
      }
    },
    5 * 60 * 1000,
  ).unref();
}

export function isBatchRunning(batch: BatchJob): boolean {
  return batch.finishedAt === undefined;
}

export function getBatch(id: string): BatchJob | null {
  return batches.get(id) ?? null;
}

/** Resolves "requeue" when the video didn't run because the batch got paused, so it goes back in line. */
async function runItem(batch: BatchJob, item: BatchItem): Promise<"requeue" | void> {
  if (item.existing) {
    try {
      placeExistingSong(item.existing.id, batch.target);
      item.libraryItem = item.existing;
      item.percent = 100;
      item.status = "completed";
    } catch (err) {
      logger.error("saving an existing song failed", { batch: batch.id, entry: item.entryId, err: String(err) });
      item.status = "error";
      item.errorMessage = SAVE_FAILED_MESSAGE;
    }
    return;
  }

  const itemDir = path.join(batch.tempDir, String(item.index));
  // Start from an empty dir so a retry never picks up a failed attempt's leftovers.
  await rm(itemDir, { recursive: true, force: true });
  await mkdir(itemDir, { recursive: true });
  item.status = "queued";
  item.percent = 0;
  item.errorMessage = undefined;

  const release = await acquireDownloadSlot();
  let filePath: string;
  try {
    if (batch.cancelled) {
      item.status = "cancelled";
      return;
    }
    // Paused while this one waited for a download slot.
    if (batch.pausedUntil) return "requeue";
    item.status = "downloading";
    filePath = await runDownload({
      url: item.url,
      mode: batch.mode,
      height: batch.height,
      // Batches are YouTube-only, which always offers separate audio and video streams.
      hasAudioOnlyStream: true,
      hasVideoOnlyStream: true,
      shareable: batch.shareable,
      tempDir: itemDir,
      onProgress: (percent, phase) => {
        item.percent = percent;
        item.status = phase;
      },
      onChild: (child) => {
        item.child = child;
        // Cancelled between steps (e.g. right before the ffmpeg pass).
        if (batch.cancelled) killProcessTree(child);
      },
    });
  } catch (err) {
    if (batch.cancelled) {
      item.status = "cancelled";
    } else if (err instanceof BlockedError) {
      item.status = "queued";
      item.percent = 0;
      pauseBatch(batch);
      return "requeue";
    } else {
      item.status = "error";
      item.errorMessage = err instanceof DownloadError ? err.message : "La descarga falló.";
    }
    return;
  } finally {
    item.child = undefined;
    release();
  }

  // Each video goes into the library as soon as it's ready, so whatever
  // finished is kept even if the rest of the playlist is cancelled.
  try {
    item.libraryItem = await addDownloadToLibrary({
      tempFilePath: filePath,
      category: categoryForMode(batch.mode),
      title: item.title,
      artist: item.author,
      durationSeconds: item.durationSeconds,
      platform: batch.platform,
      sourceUrl: item.url,
      thumbnailUrl: item.thumbnailUrl,
    }, batch.target);
    item.percent = 100;
    item.status = "completed";
  } catch (err) {
    logger.error("saving to the library failed", { batch: batch.id, entry: item.entryId, err: String(err) });
    item.status = "error";
    item.errorMessage = SAVE_FAILED_MESSAGE;
  } finally {
    await rm(itemDir, { recursive: true, force: true }).catch(() => {});
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Puts a video back in line at its playlist position. */
function requeue(batch: BatchJob, item: BatchItem): void {
  const at = batch.queue.findIndex((other) => other.index > item.index);
  batch.queue.splice(at === -1 ? batch.queue.length : at, 0, item);
}

/** YouTube is refusing: stop taking new videos and go on by itself after a while. */
function pauseBatch(batch: BatchJob): void {
  if (batch.pausedUntil) return; // the other worker hit the same wall
  batch.blockCount++;
  const wait = Math.min(BLOCK_PAUSE_MS * batch.blockCount, BLOCK_PAUSE_MAX_MS);
  batch.pausedUntil = Date.now() + wait;
  batch.resumeTimer = setTimeout(() => resumeBatch(batch.id), wait);
  batch.resumeTimer.unref();
  logger.warn("youtube is refusing downloads, pausing the batch", { batch: batch.id, minutes: wait / 60_000 });
}

async function work(batch: BatchJob): Promise<void> {
  while (!batch.pausedUntil) {
    const item = batch.queue.shift();
    if (!item) return;
    if (batch.cancelled) {
      item.status = "cancelled";
      continue;
    }
    // YouTube occasionally rejects a download (a one-off 403) that works
    // fine moments later, so give each failed video one more try.
    for (let attempt = 1; attempt <= ITEM_ATTEMPTS; attempt++) {
      if (attempt > 1 && batch.cancelled) {
        item.status = "cancelled";
        break;
      }
      if ((await runItem(batch, item)) === "requeue") {
        requeue(batch, item);
        break;
      }
      if (item.status !== "error" || batch.cancelled || item.errorMessage === SAVE_FAILED_MESSAGE) break;
      if (attempt < ITEM_ATTEMPTS) {
        item.status = "queued"; // don't flash "Falló" in the UI before the retry
        await sleep(RETRY_DELAY_MS);
      }
    }
    // Nothing was asked of YouTube for a song that was already here.
    if (!item.existing && batch.queue.length > 0 && !batch.cancelled && !batch.pausedUntil) {
      await sleep(ITEM_GAP_MIN_MS + Math.random() * (ITEM_GAP_MAX_MS - ITEM_GAP_MIN_MS));
    }
  }
}

/** Called when the last worker stops: the batch is over unless it's only paused. */
async function settle(batch: BatchJob): Promise<void> {
  if (batch.finishedAt !== undefined) return;
  if (batch.pausedUntil && !batch.cancelled && batch.queue.length > 0) return;
  clearTimeout(batch.resumeTimer);
  batch.pausedUntil = undefined;
  batch.finishedAt = Date.now();
  await cleanupJobFiles(batch);
}

/** Brings the batch up to its number of parallel downloads. */
function startWorkers(batch: BatchJob): void {
  const missing = Math.max(1, BATCH_CONCURRENCY) - batch.workers;
  for (let i = 0; i < missing; i++) {
    batch.workers++;
    void work(batch)
      .catch((err) => logger.error("batch worker failed", { batch: batch.id, err: String(err) }))
      .finally(() => {
        batch.workers--;
        if (batch.workers === 0) void settle(batch);
      });
  }
}

/** Goes on with a paused batch now instead of waiting out the pause. */
export function resumeBatch(id: string): void {
  const batch = batches.get(id);
  if (!batch || !isBatchRunning(batch) || batch.cancelled || !batch.pausedUntil) return;
  clearTimeout(batch.resumeTimer);
  batch.resumeTimer = undefined;
  batch.pausedUntil = undefined;
  startWorkers(batch);
}

export async function startBatchJob(opts: {
  title: string;
  platform: Platform;
  mode: DownloadMode;
  height: number | "best";
  shareable: boolean;
  target: SaveTarget;
  entries: {
    entryId: string;
    url: string;
    title: string;
    author: string | null;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    index: number;
    existing?: LibraryItem;
  }[];
}): Promise<string> {
  await initTempRoot();

  const id = randomUUID();
  const tempDir = path.join(TMP_ROOT, `batch-${id}`);
  await mkdir(tempDir, { recursive: true });

  const items: BatchItem[] = opts.entries
    .sort((a, b) => a.index - b.index)
    .map((e) => ({ ...e, status: "queued" as const, percent: 0 }));
  const batch: BatchJob = {
    id,
    title: opts.title,
    platform: opts.platform,
    mode: opts.mode,
    height: opts.height,
    shareable: opts.shareable,
    target: opts.target,
    items,
    tempDir,
    cancelled: false,
    createdAt: Date.now(),
    queue: [...items],
    workers: 0,
    blockCount: 0,
  };
  batches.set(id, batch);
  startWorkers(batch);
  return id;
}

export function cancelBatch(id: string): void {
  const batch = batches.get(id);
  if (!batch || !isBatchRunning(batch)) return;
  batch.cancelled = true;
  batch.queue.length = 0;
  for (const item of batch.items) {
    if (item.status === "queued") item.status = "cancelled";
    killProcessTree(item.child);
  }
  // A paused batch has no worker left to wrap it up.
  if (batch.workers === 0) void settle(batch);
}

/** Forgets a finished batch. Its files are already in the library. */
export async function discardBatch(id: string): Promise<void> {
  const batch = batches.get(id);
  if (!batch || isBatchRunning(batch)) return;
  batches.delete(id);
  await cleanupJobFiles(batch);
}
