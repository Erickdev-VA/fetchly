import path from "node:path";
import { existsSync } from "node:fs";

const YTDLP_ASSET_BY_PLATFORM: Record<string, string> = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp",
};

const assetName = YTDLP_ASSET_BY_PLATFORM[process.platform] ?? "yt-dlp";

export const YTDLP_PATH = path.join(process.cwd(), "bin", assetName);

// Resolved directly (not via `require("ffmpeg-static")") because Next.js's
// server-external-package bundling bakes an *absolute* path to the module at
// build time. That's fine when the app runs from where it was built, but
// breaks the moment the build output is copied elsewhere — exactly what
// electron-builder does for the packaged desktop app. The binary's location
// inside the package is stable, so we just compute it the same way we
// already do for yt-dlp.
export const FFMPEG_PATH = path.join(
  process.cwd(),
  "node_modules",
  "ffmpeg-static",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
);

export function assertBinariesPresent(): void {
  if (!existsSync(YTDLP_PATH)) {
    throw new Error(
      `yt-dlp binary not found at ${YTDLP_PATH}. Run "npm install" to fetch it (scripts/setup-ytdlp.mjs).`,
    );
  }
  if (!existsSync(FFMPEG_PATH)) {
    throw new Error(`ffmpeg binary not found at ${FFMPEG_PATH} (ffmpeg-static).`);
  }
}
