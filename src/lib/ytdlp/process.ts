import { execFile, type ChildProcess } from "node:child_process";

/**
 * Kills a spawned yt-dlp/ffmpeg process *and its children*. On Windows the
 * standalone yt-dlp.exe is a PyInstaller bootloader that re-launches itself
 * as a child process, so `child.kill()` only stops the outer shim and leaves
 * the real worker running (still downloading, still holding files open).
 * `taskkill /T` takes down the whole tree.
 */
export function killProcessTree(child: ChildProcess | undefined): void {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    child.kill("SIGKILL");
  }
}
