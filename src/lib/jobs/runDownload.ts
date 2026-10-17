import path from "node:path";
import { readdir, rm, stat } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { YTDLP_PATH, FFMPEG_PATH } from "../ytdlp/binary";
import { getCookiesArgs } from "../ytdlp/cookies";
import { getJsRuntimeArgs, getJsRuntimeEnv } from "../ytdlp/jsRuntime";
import { getExtractorArgs } from "../ytdlp/extractors";
import { makeShareable, stripTrack } from "../ytdlp/postprocess";
import { killProcessTree } from "../ytdlp/process";
import { waitForYtDlpUpdate } from "../ytdlp/updater";
import { logger } from "../logger";
import type { DownloadMode } from "../platform/types";

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const CONVERT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_FILESIZE = process.env.MAX_DOWNLOAD_FILESIZE ?? "2G";

/** An error whose message is safe and meant to be shown to the user. */
export class DownloadError extends Error {}

export interface RunDownloadOptions {
  url: string;
  mode: DownloadMode;
  height: number | "best";
  hasAudioOnlyStream: boolean;
  hasVideoOnlyStream: boolean;
  /** Re-encode to H.264/AAC MP4 if needed so the file can be shared on WhatsApp. */
  shareable: boolean;
  tempDir: string;
  onProgress: (percent: number, phase: "downloading" | "converting") => void;
  /** Called with every child process spawned, so the caller can cancel it. */
  onChild: (child: ChildProcess) => void;
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

async function findDownloadedFile(tempDir: string): Promise<string> {
  const files = await readdir(tempDir);
  const real = files.filter((f) => f.startsWith("source.") && !f.endsWith(".part") && !f.endsWith(".ytdl"));
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

function runYtDlp(args: string[], opts: RunDownloadOptions, maxPercent: number, postStrip: boolean) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(YTDLP_PATH, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...getJsRuntimeEnv() },
    });
    opts.onChild(child);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, DOWNLOAD_TIMEOUT_MS);

    let stderrTail = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      const matches = [...chunk.matchAll(/\[download\]\s+([\d.]+)%/g)];
      const last = matches.at(-1);
      if (last) {
        const scale = postStrip ? maxPercent * 0.95 : maxPercent;
        opts.onProgress(Math.min(maxPercent, (parseFloat(last[1]) * scale) / 100), "downloading");
      }
      if (/\[Merger\]|Merging formats/i.test(chunk)) opts.onProgress(maxPercent, "downloading");
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-4000);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      logger.error("failed to spawn yt-dlp", { err: String(err) });
      reject(new DownloadError("Couldn't start the download."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new DownloadError("The download took too long and was cancelled."));
      if (code !== 0) {
        logger.error("yt-dlp download failed", { code, stderrTail });
        return reject(new DownloadError(classifyDownloadError(stderrTail)));
      }
      resolve();
    });
  });
}

/**
 * Downloads one URL into `tempDir` and post-processes it. Resolves with the
 * path of the finished file; rejects with a DownloadError carrying a
 * user-facing message.
 */
export async function runDownload(opts: RunDownloadOptions): Promise<string> {
  await waitForYtDlpUpdate();

  const plan = planDownload(opts.mode, opts.height, opts.hasAudioOnlyStream, opts.hasVideoOnlyStream);
  // Leave room on the progress bar for a possible H.264 re-encode.
  const downloadWeight = opts.shareable && opts.mode !== "audio" ? 0.7 : 0.95;

  const args = [
    "-f",
    plan.selector,
    // Prefer H.264/AAC over AV1/VP9+Opus when the platform offers both: it
    // decodes natively on every phone and shares fine over WhatsApp, and
    // picking it up front avoids a re-encode. This picks a different
    // original-quality stream, it doesn't transcode anything.
    "-S",
    "vcodec:h264,acodec:aac",
    "-o",
    path.join(opts.tempDir, "source.%(ext)s"),
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
    ...getExtractorArgs(),
  ];
  if (plan.needsMerge) args.push("--merge-output-format", "mp4");
  args.push("--", opts.url);

  await runYtDlp(args, opts, downloadWeight * 100, plan.postStrip !== "none");

  try {
    const sourcePath = await findDownloadedFile(opts.tempDir);

    if (opts.shareable) {
      const keep = opts.mode === "audio" ? "audio" : opts.mode === "mute" ? "video" : "both";
      let convertChild: ChildProcess | undefined;
      const timer = setTimeout(() => killProcessTree(convertChild), CONVERT_TIMEOUT_MS);
      try {
        const outPath = await makeShareable(sourcePath, opts.tempDir, keep, {
          onChild: (c) => {
            convertChild = c;
            opts.onChild(c);
          },
          onProgress: (f) => opts.onProgress(downloadWeight * 100 + f * (100 - downloadWeight * 100 - 1), "converting"),
        });
        // Don't keep two copies around (adds up fast in a playlist batch).
        if (outPath !== sourcePath) await rm(sourcePath, { force: true });
        return outPath;
      } finally {
        clearTimeout(timer);
      }
    }

    if (plan.postStrip === "none") return sourcePath;
    const keep = plan.postStrip === "audio-only" ? "audio" : "video";
    const ext = path.extname(sourcePath) || (keep === "audio" ? ".m4a" : ".mp4");
    const outPath = path.join(opts.tempDir, `output${ext}`);
    await stripTrack(sourcePath, outPath, keep);
    return outPath;
  } catch (err) {
    logger.error("post-processing failed", { err: String(err) });
    throw new DownloadError("Something went wrong while processing this content.");
  }
}
