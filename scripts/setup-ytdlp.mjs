// Ensures the yt-dlp binary is present locally. Downloads the official
// standalone release from GitHub if it's missing (first install / fresh clone).
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.join(__dirname, "..", "bin");

const assetByPlatform = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp",
};

const assetName = assetByPlatform[process.platform];
if (!assetName) {
  console.error(`[setup-ytdlp] Unsupported platform: ${process.platform}`);
  process.exit(1);
}

const destPath = path.join(binDir, assetName);

if (existsSync(destPath)) {
  console.log(`[setup-ytdlp] Already present at ${destPath}, skipping download.`);
  process.exit(0);
}

mkdirSync(binDir, { recursive: true });

const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;
console.log(`[setup-ytdlp] Downloading ${url}`);

const res = await fetch(url, { redirect: "follow" });
if (!res.ok || !res.body) {
  console.error(`[setup-ytdlp] Failed to download yt-dlp: HTTP ${res.status}`);
  process.exit(1);
}

await pipeline(res.body, createWriteStream(destPath, { mode: 0o755 }));

if (process.platform !== "win32") {
  const { chmodSync } = await import("node:fs");
  chmodSync(destPath, 0o755);
}

console.log(`[setup-ytdlp] Saved to ${destPath}`);
