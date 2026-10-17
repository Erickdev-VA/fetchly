// Builds the self-contained server the desktop app runs, into
// dist-desktop/server. It's Next's standalone output (only the node_modules
// files the server actually loads) plus what that output leaves out on
// purpose: static assets, public/, and the yt-dlp and ffmpeg binaries.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, ".next-build"); // distDir in next.config.mjs
const standaloneDir = path.join(buildDir, "standalone");
const outDir = path.join(root, "dist-desktop", "server");

const ytdlpName = process.platform === "win32" ? "yt-dlp.exe" : process.platform === "darwin" ? "yt-dlp_macos" : "yt-dlp";
const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const ytdlpSrc = path.join(root, "bin", ytdlpName);
const ffmpegSrc = path.join(root, "node_modules", "ffmpeg-static", ffmpegName);

for (const file of [ytdlpSrc, ffmpegSrc]) {
  if (!existsSync(file)) {
    console.error(`[build-desktop] Missing ${file}. Run "npm install" first.`);
    process.exit(1);
  }
}

// Remove the previous output first, or the build would trace (and copy) it.
rmSync(path.dirname(outDir), { recursive: true, force: true });

const build = spawnSync(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, FETCHLY_DESKTOP_BUILD: "1" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync(path.join(standaloneDir, "server.js"))) {
  console.error("[build-desktop] next build did not produce .next-build/standalone/server.js");
  process.exit(1);
}

mkdirSync(path.dirname(outDir), { recursive: true });
renameSync(standaloneDir, outDir);

// Output file tracing follows the process.cwd()-based paths in
// src/lib/ytdlp/binary.ts and drags in whatever it finds there (the local
// bin/ with its update marker, even an old release/ folder). Replace those
// with exactly the two binaries the app needs.
rmSync(path.join(outDir, "release"), { recursive: true, force: true });
rmSync(path.join(outDir, "bin"), { recursive: true, force: true });
mkdirSync(path.join(outDir, "bin"), { recursive: true });
cpSync(ytdlpSrc, path.join(outDir, "bin", ytdlpName));
mkdirSync(path.join(outDir, "node_modules", "ffmpeg-static"), { recursive: true });
cpSync(ffmpegSrc, path.join(outDir, "node_modules", "ffmpeg-static", ffmpegName));

// The standalone server reads its build from <server>/.next-build.
cpSync(path.join(buildDir, "static"), path.join(outDir, ".next-build", "static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(outDir, "public"), { recursive: true });

console.log(`[build-desktop] Server ready at ${path.relative(root, outDir)}`);
