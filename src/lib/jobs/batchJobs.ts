import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import type { ChildProcess } from "node:child_process";
import { killProcessTree } from "../ytdlp/process";
import { logger } from "../logger";
import { runDownload, DownloadError } from "./runDownload";
import { acquireDownloadSlot } from "./capacity";
import { TMP_ROOT, SAVE_FAILED_MESSAGE, initTempRoot, cleanupJobFiles } from "./downloadJobs";
import { addDownloadToLibrary } from "../library/store";
import { categoryForMode, type LibraryItem } from "../library/types";
import type { DownloadMode, Platform } from "../platform/types";

/** Videos downloaded in parallel within one batch (on top of the app-wide limit). */
const BATCH_CONCURRENCY = Number(process.env.BATCH_CONCURRENCY ?? 2);
/** How long a finished batch's status stays readable by the page. */
const FINISHED_TTL_MS = 60 * 60 * 1000;
const ITEM_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;

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
  child?: ChildProcess;
}

export interface BatchJob {
  id: string;
  title: string;
  platform: Platform;
  mode: DownloadMode;
  height: number | "best";
  shareable: boolean;
  items: BatchItem[];
  tempDir: string;
  cancelled: boolean;
  createdAt: number;
  finishedAt?: number;
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

async function runItem(batch: BatchJob, item: BatchItem): Promise<void> {
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
    });
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

async function runBatch(batch: BatchJob): Promise<void> {
  const queue = [...batch.items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
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
        await runItem(batch, item);
        if (item.status !== "error" || batch.cancelled || item.errorMessage === SAVE_FAILED_MESSAGE) break;
        if (attempt < ITEM_ATTEMPTS) {
          item.status = "queued"; // don't flash "Falló" in the UI before the retry
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, BATCH_CONCURRENCY) }, worker));
  batch.finishedAt = Date.now();
  await cleanupJobFiles(batch);
}

export async function startBatchJob(opts: {
  title: string;
  platform: Platform;
  mode: DownloadMode;
  height: number | "best";
  shareable: boolean;
  entries: {
    entryId: string;
    url: string;
    title: string;
    author: string | null;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    index: number;
  }[];
}): Promise<string> {
  await initTempRoot();

  const id = randomUUID();
  const tempDir = path.join(TMP_ROOT, `batch-${id}`);
  await mkdir(tempDir, { recursive: true });

  const batch: BatchJob = {
    id,
    title: opts.title,
    platform: opts.platform,
    mode: opts.mode,
    height: opts.height,
    shareable: opts.shareable,
    items: opts.entries
      .sort((a, b) => a.index - b.index)
      .map((e) => ({ ...e, status: "queued" as const, percent: 0 })),
    tempDir,
    cancelled: false,
    createdAt: Date.now(),
  };
  batches.set(id, batch);
  void runBatch(batch);
  return id;
}

export function cancelBatch(id: string): void {
  const batch = batches.get(id);
  if (!batch || !isBatchRunning(batch)) return;
  batch.cancelled = true;
  for (const item of batch.items) {
    if (item.status === "queued") item.status = "cancelled";
    killProcessTree(item.child);
  }
}

/** Forgets a finished batch. Its files are already in the library. */
export async function discardBatch(id: string): Promise<void> {
  const batch = batches.get(id);
  if (!batch || isBatchRunning(batch)) return;
  batches.delete(id);
  await cleanupJobFiles(batch);
}
