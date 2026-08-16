import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { YTDLP_PATH, FFMPEG_PATH } from "../ytdlp/binary";
import { getCookiesArgs } from "../ytdlp/cookies";
import { getJsRuntimeArgs, getJsRuntimeEnv } from "../ytdlp/jsRuntime";
import { stripTrack } from "../ytdlp/postprocess";
import { logger } from "../logger";
import type { DownloadMode } from "../platform/types";

const TMP_ROOT = path.join(os.tmpdir(), "media-downloader-jobs");
const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS ?? 3);
const JOB_TTL_MS = 20 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_FILESIZE = process.env.MAX_DOWNLOAD_FILESIZE ?? "2G";

export type JobStatus = "preparing" | "processing" | "completed" | "error";

export interface DownloadJob {
  id: string;
  status: JobStatus;
  percent: number;
  errorMessage?: string;
  /** Suggested download name, e.g. the video title (sanitized on use, not on disk). */
  title: string;
  fileName?: string;
  filePath?: string;
  tempDir: string;
  child?: ChildProcess;
  createdAt: number;
  timeoutHandle?: NodeJS.Timeout;
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

export function activeDownloadCount(): number {
  let n = 0;
  for (const j of jobs.values()) if (j.status === "preparing" || j.status === "processing") n++;
  return n;
}

export function isServerBusy(): boolean {
  return activeDownloadCount() >= MAX_CONCURRENT_DOWNLOADS;
}

interface DownloadPlan {
  selector: string;
  needsMerge: boolean;
  postStrip: "none" | "audio-only" | "video-only";
}

function planDownload(
  mode: DownloadMode,
  height: number | "best",
  hasAudioOnlyStream: boolean,
  hasVideoOnlyStream: boolean,
): DownloadPlan {
  const cap = height === "best" ? "" : `[height<=${height}]`;

  if (mode === "audio") {
    if (hasAudioOnlyStream) return { selector: "bestaudio/best", needsMerge: false, postStrip: "none" };
    return { selector: `best${cap}/bestvideo${cap}+bestaudio`, needsMerge: true, postStrip: "audio-only" };
  }

  if (mode === "mute") {
    if (hasVideoOnlyStream) return { selector: `bestvideo${cap}`, needsMerge: false, postStrip: "none" };
    return { selector: `best${cap}/bestvideo${cap}+bestaudio`, needsMerge: true, postStrip: "video-only" };
  }

  return { selector: `bestvideo${cap}+bestaudio/best${cap}`, needsMerge: true, postStrip: "none" };
}

function classifyDownloadError(stderr: string): string {
  if (/max-filesize/i.test(stderr)) return "This file is too large to download.";
  if (/private|login required/i.test(stderr)) return "This content is private and can't be accessed.";
  if (/unavailable|not available|removed|404|does not exist/i.test(stderr)) {
    return "This content isn't available anymore.";
  }
  return "The download failed. Please try again.";
}

export async function startDownloadJob(opts: {
  url: string;
  title: string;
  mode: DownloadMode;
  height: number | "best";
  hasAudioOnlyStream: boolean;
  hasVideoOnlyStream: boolean;
}): Promise<string> {
  await initTempRoot();

  const id = randomUUID();
  const tempDir = path.join(TMP_ROOT, id);
  await mkdir(tempDir, { recursive: true });

  const job: DownloadJob = {
    id,
    status: "preparing",
    percent: 0,
    title: opts.title,
    tempDir,
    createdAt: Date.now(),
  };
  jobs.set(id, job);

  const plan = planDownload(opts.mode, opts.height, opts.hasAudioOnlyStream, opts.hasVideoOnlyStream);
  const outputTemplate = path.join(tempDir, "source.%(ext)s");

  const args = [
    "-f",
    plan.selector,
    // Prefer H.264/AAC over AV1/VP9+Opus: those decode natively on every
    // phone and share fine over WhatsApp/iMessage, whereas AV1 in
    // particular fails silently on a lot of iPhones (no thumbnail, won't
    // play, won't send) even though the file itself is perfectly valid.
    // This is picking a different original-quality stream, not re-encoding.
    "-S",
    "vcodec:h264,acodec:aac",
    "-o",
    outputTemplate,
    "--no-playlist",
    "--no-warnings",
    "--newline",
    "--ffmpeg-location",
    FFMPEG_PATH,
    "--max-filesize",
    MAX_FILESIZE,
    "--socket-timeout",
    "15",
    ...getJsRuntimeArgs(),
    ...getCookiesArgs(),
  ];
  if (plan.needsMerge) args.push("--merge-output-format", "mp4");
  args.push("--", opts.url);

  const child = spawn(YTDLP_PATH, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...getJsRuntimeEnv() },
  });
  job.child = child;
  job.status = "processing";

  job.timeoutHandle = setTimeout(() => {
    if (job.status === "preparing" || job.status === "processing") {
      logger.warn("download job timed out, killing", { id });
      child.kill("SIGKILL");
      job.status = "error";
      job.errorMessage = "The download took too long and was cancelled.";
    }
  }, DOWNLOAD_TIMEOUT_MS);

  let stderrTail = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    const match = chunk.match(/\[download\]\s+([\d.]+)%/);
    if (match) job.percent = Math.min(95, parseFloat(match[1]) * (plan.postStrip === "none" ? 1 : 0.9));
    if (/\[Merger\]|Merging formats/i.test(chunk)) job.percent = 95;
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-4000);
  });

  child.on("error", (err) => {
    logger.error("failed to spawn yt-dlp", { id, err: String(err) });
    finishWithError(job, "Couldn't start the download.");
  });

  child.on("close", async (code) => {
    if (job.timeoutHandle) clearTimeout(job.timeoutHandle);
    if (job.status === "error") {
      await cleanupJobFiles(job);
      return;
    }
    if (code !== 0) {
      logger.error("yt-dlp download failed", { id, code, stderrTail });
      finishWithError(job, classifyDownloadError(stderrTail));
      await cleanupJobFiles(job);
      return;
    }

    try {
      const sourcePath = await findDownloadedFile(tempDir);
      if (plan.postStrip === "none") {
        job.filePath = sourcePath;
        job.fileName = path.basename(sourcePath);
      } else {
        const keep = plan.postStrip === "audio-only" ? "audio" : "video";
        const ext = keep === "audio" ? path.extname(sourcePath) || ".m4a" : path.extname(sourcePath) || ".mp4";
        const outPath = path.join(tempDir, `output${ext}`);
        await stripTrack(sourcePath, outPath, keep);
        job.filePath = outPath;
        job.fileName = path.basename(outPath);
      }
      job.percent = 100;
      job.status = "completed";
    } catch (err) {
      logger.error("post-processing failed", { id, err: String(err) });
      finishWithError(job, "Something went wrong while processing this content.");
      await cleanupJobFiles(job);
    }
  });

  return id;
}

function finishWithError(job: DownloadJob, message: string) {
  job.status = "error";
  job.errorMessage = message;
}

async function findDownloadedFile(tempDir: string): Promise<string> {
  const files = await readdir(tempDir);
  const real = files.filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
  if (real.length === 0) throw new Error("no output file produced");
  let chosen = real[0];
  let chosenSize = -1;
  for (const f of real) {
    const s = await stat(path.join(tempDir, f));
    if (s.size > chosenSize) {
      chosen = f;
      chosenSize = s.size;
    }
  }
  return path.join(tempDir, chosen);
}

export function getJob(id: string): DownloadJob | null {
  return jobs.get(id) ?? null;
}

export async function cleanupJobFiles(job: DownloadJob): Promise<void> {
  try {
    await rm(job.tempDir, { recursive: true, force: true });
  } catch (err) {
    logger.warn("temp dir cleanup failed", { id: job.id, err: String(err) });
  }
}

export async function finalizeJob(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job) return;
  await cleanupJobFiles(job);
  jobs.delete(id);
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
    setInterval(
      () => {
        const now = Date.now();
        for (const [id, job] of jobs) {
          if (now - job.createdAt > JOB_TTL_MS) {
            job.child?.kill("SIGKILL");
            cleanupJobFiles(job).finally(() => jobs.delete(id));
          }
        }
      },
      5 * 60 * 1000,
    ).unref();
  }
}
