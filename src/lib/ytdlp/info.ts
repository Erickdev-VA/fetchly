import { execFile } from "node:child_process";
import { AppError } from "../errors";
import { logger } from "../logger";
import { YTDLP_PATH, FFMPEG_PATH } from "./binary";
import { getCookiesArgs } from "./cookies";
import { getJsRuntimeArgs, getJsRuntimeEnv } from "./jsRuntime";
import type { RawYtDlpInfo } from "./rawTypes";

const INFO_TIMEOUT_MS = 25_000;
const MAX_BUFFER_BYTES = 15 * 1024 * 1024;

export function fetchMediaInfo(url: string): Promise<RawYtDlpInfo> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      YTDLP_PATH,
      [
        "--dump-single-json",
        "--no-warnings",
        "--no-playlist",
        "--socket-timeout",
        "15",
        "--ffmpeg-location",
        FFMPEG_PATH,
        ...getJsRuntimeArgs(),
        ...getCookiesArgs(),
        "--",
        url,
      ],
      {
        timeout: INFO_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER_BYTES,
        windowsHide: true,
        env: { ...process.env, ...getJsRuntimeEnv() },
      },
      (error, stdout, stderr) => {
        if (!error) {
          try {
            resolve(JSON.parse(stdout) as RawYtDlpInfo);
          } catch {
            reject(new AppError("METADATA_FAILED"));
          }
          return;
        }

        if (error.killed || error.signal === "SIGTERM") {
          reject(new AppError("METADATA_FAILED", "Fetching information took too long."));
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
    child.on("error", () => reject(new AppError("METADATA_FAILED")));
  });
}
