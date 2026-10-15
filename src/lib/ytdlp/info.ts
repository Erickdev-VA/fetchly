import { execFile } from "node:child_process";
import { AppError } from "../errors";
import { logger } from "../logger";
import { YTDLP_PATH, FFMPEG_PATH } from "./binary";
import { getCookiesArgs } from "./cookies";
import { getJsRuntimeArgs, getJsRuntimeEnv } from "./jsRuntime";
import { killProcessTree } from "./process";
import { waitForYtDlpUpdate } from "./updater";
import type { RawYtDlpInfo, RawYtDlpPlaylist } from "./rawTypes";

const INFO_TIMEOUT_MS = 25_000;
const PLAYLIST_TIMEOUT_MS = 60_000;
const MAX_BUFFER_BYTES = 15 * 1024 * 1024;
export const MAX_PLAYLIST_ENTRIES = 300;

async function runYtDlpJson<T>(args: string[], timeoutMs: number): Promise<T> {
  await waitForYtDlpUpdate();
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const child = execFile(
      YTDLP_PATH,
      [
        "--dump-single-json",
        "--no-warnings",
        "--socket-timeout",
        "15",
        "--ffmpeg-location",
        FFMPEG_PATH,
        ...getJsRuntimeArgs(),
        ...getCookiesArgs(),
        ...args,
      ],
      {
        maxBuffer: MAX_BUFFER_BYTES,
        windowsHide: true,
        env: { ...process.env, ...getJsRuntimeEnv() },
      },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new AppError("METADATA_FAILED", "Fetching information took too long."));
          return;
        }
        if (!error) {
          try {
            resolve(JSON.parse(stdout) as T);
          } catch {
            reject(new AppError("METADATA_FAILED"));
          }
          return;
        }

        const text = stderr || error.message || "";
        logger.error("yt-dlp metadata fetch failed", { stderr: text.slice(-2000) });

        if (/private|login required|rate-?limit/i.test(text)) {
          reject(new AppError("CONTENT_PRIVATE"));
        } else if (/unavailable|not available|removed|404|does not exist/i.test(text)) {
          reject(new AppError("CONTENT_UNAVAILABLE"));
        } else {
          reject(new AppError("METADATA_FAILED"));
        }
      },
    );
    // execFile's own `timeout` option only kills the outer PyInstaller shim on
    // Windows, leaving the real yt-dlp worker orphaned — so time out manually.
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);
    child.on("error", () => reject(new AppError("METADATA_FAILED")));
  });
}

export function fetchMediaInfo(url: string): Promise<RawYtDlpInfo> {
  return runYtDlpJson<RawYtDlpInfo>(["--no-playlist", "--", url], INFO_TIMEOUT_MS);
}

/**
 * Lists a playlist's entries without resolving each video (`--flat-playlist`),
 * which takes a few seconds even for long playlists instead of minutes.
 */
export function fetchPlaylistInfo(url: string, maxEntries = MAX_PLAYLIST_ENTRIES): Promise<RawYtDlpPlaylist> {
  return runYtDlpJson<RawYtDlpPlaylist>(
    ["--flat-playlist", "--yes-playlist", "--playlist-end", String(maxEntries), "--", url],
    PLAYLIST_TIMEOUT_MS,
  );
}
