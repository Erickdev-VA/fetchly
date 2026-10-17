import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { mkdir, readdir, rm } from "node:fs/promises";
import type { ChildProcess } from "node:child_process";
import { killProcessTree } from "../ytdlp/process";
import { logger } from "../logger";
import { runDownload, DownloadError } from "./runDownload";
import { acquireDownloadSlot } from "./capacity";
import { addDownloadToLibrary } from "../library/store";
import { categoryForMode, type LibraryItem } from "../library/types";
import type { DownloadMode, Platform } from "../platform/types";

export const TMP_ROOT = path.join(os.tmpdir(), "media-downloader-jobs");
/** How long a finished job's status stays readable by the page. */
const FINISHED_JOB_TTL_MS = 20 * 60 * 1000;

export const SAVE_FAILED_MESSAGE = "No se pudo guardar el archivo en la biblioteca.";

export type JobStatus = "queued" | "processing" | "completed" | "error";

export interface DownloadJob {
  id: string;
  status: JobStatus;
  percent: number;
  converting: boolean;
  errorMessage?: string;
  /** The library entry the file became, once completed. */
  item?: LibraryItem;
  tempDir: string;
  child?: ChildProcess;
  finishedAt?: number;
}

// Next.js dev (Turbopack) can re-evaluate this module's top-level scope on
// every request to a Route Handler, which would otherwise reset in-memory
// state and re-register intervals/sweeps on each call. Pinning state to
// globalThis keeps a single real instance for the life of the Node process,
// in dev and in production alike (same pattern Next.js recommends for
// singleton clients such as a shared Prisma instance).
interface DownloadJobsGlobal {
  jobs: Map<string, DownloadJob>;
  tempRootInitialized: boolean;
  sweepIntervalStarted: boolean;
}

const globalStore = globalThis as unknown as { __mediaDownloaderJobs?: DownloadJobsGlobal };
const store: DownloadJobsGlobal = globalStore.__mediaDownloaderJobs ?? {
  jobs: new Map<string, DownloadJob>(),
  tempRootInitialized: false,
  sweepIntervalStarted: false,
};
globalStore.__mediaDownloaderJobs = store;

const jobs = store.jobs;

export async function startDownloadJob(opts: {
  url: string;
  title: string;
  author: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  platform: Platform;
  mode: DownloadMode;
  height: number | "best";
  hasAudioOnlyStream: boolean;
  hasVideoOnlyStream: boolean;
  shareable: boolean;
}): Promise<string> {
  await initTempRoot();

  const id = randomUUID();
  const tempDir = path.join(TMP_ROOT, id);
  await mkdir(tempDir, { recursive: true });

  const job: DownloadJob = { id, status: "queued", percent: 0, converting: false, tempDir };
  jobs.set(id, job);

  void (async () => {
    const release = await acquireDownloadSlot();
    job.status = "processing";
    let filePath: string;
    try {
      filePath = await runDownload({
        ...opts,
        tempDir,
        onProgress: (percent, phase) => {
          job.percent = percent;
          job.converting = phase === "converting";
        },
        onChild: (child) => {
          job.child = child;
        },
      });
    } catch (err) {
      job.status = "error";
      job.errorMessage = err instanceof DownloadError ? err.message : "La descarga falló. Inténtalo de nuevo.";
      job.finishedAt = Date.now();
      await cleanupJobFiles(job);
      return;
    } finally {
      job.child = undefined;
      release();
    }

    try {
      job.item = await addDownloadToLibrary({
        tempFilePath: filePath,
        category: categoryForMode(opts.mode),
        title: opts.title,
        artist: opts.author,
        durationSeconds: opts.durationSeconds,
        platform: opts.platform,
        sourceUrl: opts.url,
        thumbnailUrl: opts.thumbnailUrl,
      });
      job.percent = 100;
      job.status = "completed";
    } catch (err) {
      logger.error("saving to the library failed", { id, err: String(err) });
      job.status = "error";
      job.errorMessage = SAVE_FAILED_MESSAGE;
    } finally {
      job.finishedAt = Date.now();
      await cleanupJobFiles(job);
    }
  })();

  return id;
}

export function getJob(id: string): DownloadJob | null {
  return jobs.get(id) ?? null;
}

export async function cleanupJobFiles(job: { id: string; tempDir: string }): Promise<void> {
  try {
    await rm(job.tempDir, { recursive: true, force: true });
  } catch (err) {
    logger.warn("temp dir cleanup failed", { id: job.id, err: String(err) });
  }
}

/**
 * One-time (per process) creation of the temp root plus a sweep of any
 * leftover job directories from a previous crashed process. Guarded so it
 * never runs again — and never touches directories for jobs that are
 * currently in flight — once the process is up.
 */
export async function initTempRoot(): Promise<void> {
  if (store.tempRootInitialized) return;
  store.tempRootInitialized = true;

  await mkdir(TMP_ROOT, { recursive: true });
  try {
    const entries = await readdir(TMP_ROOT);
    await Promise.all(entries.map((e) => rm(path.join(TMP_ROOT, e), { recursive: true, force: true })));
  } catch (err) {
    logger.warn("temp root sweep failed", { err: String(err) });
  }

  if (!store.sweepIntervalStarted) {
    store.sweepIntervalStarted = true;
    // Running jobs are bounded by runDownload's own timeouts; only forget
    // finished ones here. Their files already live in the library.
    setInterval(
      () => {
        const now = Date.now();
        for (const [id, job] of jobs) {
          if (job.finishedAt && now - job.finishedAt > FINISHED_JOB_TTL_MS) {
            killProcessTree(job.child);
            jobs.delete(id);
          }
        }
      },
      5 * 60 * 1000,
    ).unref();
  }
}
