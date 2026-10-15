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
 * silently rots. This runs `yt-dlp -U` at server start and then once a day.
 */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 90_000;
const MARKER_PATH = path.join(path.dirname(YTDLP_PATH), ".last-update-check");

interface UpdaterGlobal {
  started: boolean;
  inFlight: Promise<void> | null;
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

function runUpdate(): Promise<void> {
  return new Promise((resolve) => {
    execFile(
      YTDLP_PATH,
      ["-U"],
      { timeout: UPDATE_TIMEOUT_MS, windowsHide: true },
      (error, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`.trim();
        if (error) {
          logger.warn("yt-dlp self-update failed", { output: output.slice(-1000) });
        } else {
          const line = output.split("\n").find((l) => /Updated yt-dlp|up to date/i.test(l));
          logger.info("yt-dlp update check finished", { result: line ?? output.slice(-300) });
        }
        resolve();
      },
    );
  });
}

async function checkForUpdate(force = false): Promise<void> {
  if (state.inFlight) return state.inFlight;
  if (!existsSync(YTDLP_PATH)) return;
  if (!force && (await lastCheckWasRecent())) return;

  state.inFlight = (async () => {
    await runUpdate();
    await writeFile(MARKER_PATH, new Date().toISOString()).catch(() => {});
  })().finally(() => {
    state.inFlight = null;
  });
  return state.inFlight;
}

export function startYtDlpAutoUpdate(): void {
  if (state.started || process.env.YTDLP_AUTO_UPDATE === "0") return;
  state.started = true;
  void checkForUpdate();
  setInterval(() => void checkForUpdate(true), CHECK_INTERVAL_MS).unref();
}

/**
 * Lets callers avoid spawning yt-dlp in the middle of a self-update, when
 * the executable is briefly being swapped out on disk.
 */
export async function waitForYtDlpUpdate(): Promise<void> {
  if (state.inFlight) await state.inFlight;
}
