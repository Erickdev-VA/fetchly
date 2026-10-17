// Plain .mjs (not .ts) on purpose: a next.config.ts has to be transpiled with
// the native SWC binary every time the server boots, which alone cost ~1.5s
// of the desktop app's startup.

/** @type {import("next").NextConfig} */
const nextConfig = {
  // The default bottom-left spot sits on top of the playback bar.
  devIndicators: { position: "top-right" },
  // scripts/build-desktop.mjs sets this to get a self-contained server with
  // only the node_modules it actually needs, instead of shipping the whole
  // 400MB+ node_modules folder.
  ...(process.env.FETCHLY_DESKTOP_BUILD === "1"
    ? {
        output: "standalone",
        distDir: ".next-build",
        // The library code builds file paths from runtime values (titles,
        // folders chosen by Electron), which the tracer can't resolve, so it
        // assumes any project file might be read and copies all of them.
        // The server never reads project files: yt-dlp and ffmpeg are copied
        // explicitly by scripts/build-desktop.mjs.
        outputFileTracingExcludes: {
          "/*": [
            "./*.{md,json,mjs,ts,tsbuildinfo}",
            "./{src,scripts,electron,public,bin,release,dist-desktop}/**",
            "./{.git,.claude,.next,.next-desktop}/**",
          ],
        },
      }
    : {}),
  // Both desktop modes get their own build folder, so neither clashes with a
  // plain `next dev` in the browser: Next allows only one dev server per
  // build folder, and a build would overwrite what that server is using.
  ...(process.env.FETCHLY_DEV === "1" ? { distDir: ".next-desktop" } : {}),
};

export default nextConfig;
