/**
 * YouTube increasingly requires executing a bit of its player's JavaScript
 * to produce validly-signed download URLs; without a JS runtime yt-dlp can
 * still extract metadata but a chunk of download attempts fail with a
 * silent HTTP 403. Node itself (already required to run this app) is a
 * perfectly good runtime for that — we just need to point yt-dlp at it.
 *
 * In a plain Node process (local dev, Render) `process.execPath` is a real
 * node binary, so `node:<execPath>` always resolves correctly regardless of
 * whether a `node` command happens to be on PATH. Inside a packaged
 * Electron app there usually isn't a standalone Node binary on the end
 * user's machine at all — but Electron's own binary can act as one when
 * ELECTRON_RUN_AS_NODE=1 is set on the process yt-dlp spawns for it.
 */
export function getJsRuntimeArgs(): string[] {
  return ["--js-runtimes", `node:${process.execPath}`];
}

export function getJsRuntimeEnv(): Record<string, string> {
  return { ELECTRON_RUN_AS_NODE: "1" };
}
