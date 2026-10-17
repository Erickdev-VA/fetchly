import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { YTDLP_PATH } from "./binary";
import { logger } from "../logger";

/**
 * YouTube changes its player/anti-bot logic every few weeks, and an
 * outdated yt-dlp starts failing with HTTP 403 on downloads even though
 * metadata still loads fine. setup-ytdlp.mjs only fetches the binary once
 * at install time, so a long-running install (the desktop app especially)
 * silently rots. This runs `yt-dlp -U` shortly after server start and then
 * once a day.
 */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
// The Windows yt-dlp.exe unpacks a whole Python runtime to %TEMP% on every
// launch, so running it while the desktop app is still booting competes for
// disk and CPU with the server and the first page render. Wait until the
// window is up and idle.
const STARTUP_DELAY_MS = 15_000;
const UPDATE_TIMEOUT_MS = 90_000;
const MARKER_PATH = path.join(path.dirname(YTDLP_PATH), ".last-update-check");

/** How a `yt-dlp -U` went. */
type UpdateResult = "updated" | "current" | "failed";

interface UpdaterGlobal {
  started: boolean;
  inFlight: Promise<UpdateResult> | null;
}

const globalStore = globalThis as unknown as { __mediaDownloaderUpdater?: UpdaterGlobal };
const state: UpdaterGlobal = globalStore.__mediaDownloaderUpdater ?? { started: false, inFlight: null };
globalStore.__mediaDownloaderUpdater = state;

async function lastCheckWasRecent(): Promise<boolean> {
  try {
    const s = await stat(MARKER_PATH);
    return Date.now() - s.mtimeMs < CHECK_INTERVAL_MS;
  } catch {
    return false;
  }
}

function runUpdate(): Promise<UpdateResult> {
  return new Promise((resolve) => {
    execFile(
      YTDLP_PATH,
      ["-U"],
      { timeout: UPDATE_TIMEOUT_MS, windowsHide: true },
      (error, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`.trim();
        if (error) {
          logger.warn("yt-dlp self-update failed", { output: output.slice(-1000) });
          resolve("failed");
        } else {
          const line = output.split("\n").find((l) => /Updated yt-dlp|up to date/i.test(l));
          logger.info("yt-dlp update check finished", { result: line ?? output.slice(-300) });
          resolve(/Updated yt-dlp/i.test(output) ? "updated" : "current");
        }
      },
    );
  });
}

async function checkForUpdate(force = false): Promise<UpdateResult | null> {
  if (state.inFlight) return state.inFlight;
  if (!existsSync(YTDLP_PATH)) return null;
  if (!force && (await lastCheckWasRecent())) return null;

  state.inFlight = (async () => {
    const result = await runUpdate();
    await writeFile(MARKER_PATH, new Date().toISOString()).catch(() => {});
    return result;
  })().finally(() => {
    state.inFlight = null;
  });
  return state.inFlight;
}

export function startYtDlpAutoUpdate(): void {
  if (state.started || process.env.YTDLP_AUTO_UPDATE === "0") return;
  state.started = true;
  setTimeout(() => void checkForUpdate(), STARTUP_DELAY_MS).unref();
  setInterval(() => void checkForUpdate(true), CHECK_INTERVAL_MS).unref();
}

/**
 * Lets callers avoid spawning yt-dlp in the middle of a self-update, when
 * the executable is briefly being swapped out on disk.
 */
export async function waitForYtDlpUpdate(): Promise<void> {
  if (state.inFlight) await state.inFlight;
}

/** The installed yt-dlp version (its release date, like "2026.09.30"), or null if it won't run. */
export async function ytDlpVersion(): Promise<string | null> {
  await waitForYtDlpUpdate();
  return new Promise((resolve) => {
    execFile(YTDLP_PATH, ["--version"], { timeout: 30_000, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : stdout.trim().split("\n")[0] || null);
    });
  });
}

/** "Buscar actualización ahora" in Ajustes. */
export async function updateYtDlpNow(): Promise<UpdateResult> {
  return (await checkForUpdate(true)) ?? "failed";
}
