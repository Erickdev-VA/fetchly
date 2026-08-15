import path from "node:path";
import { existsSync } from "node:fs";
import ffmpegPathImport from "ffmpeg-static";

const YTDLP_ASSET_BY_PLATFORM: Record<string, string> = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp",
};

const assetName = YTDLP_ASSET_BY_PLATFORM[process.platform] ?? "yt-dlp";

export const YTDLP_PATH = path.join(process.cwd(), "bin", assetName);
export const FFMPEG_PATH = (ffmpegPathImport as unknown as string) ?? "ffmpeg";

export function assertBinariesPresent(): void {
  if (!existsSync(YTDLP_PATH)) {
    throw new Error(
      `yt-dlp binary not found at ${YTDLP_PATH}. Run "npm install" to fetch it (scripts/setup-ytdlp.mjs).`,
    );
  }
  if (!existsSync(/* turbopackIgnore: true */ FFMPEG_PATH)) {
    throw new Error(`ffmpeg binary not found at ${FFMPEG_PATH} (ffmpeg-static).`);
  }
}
