import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "./binary";

/**
 * Strips the unwanted track from a muxed file using stream copy (no
 * re-encoding, lossless, fast). Used as a fallback for Audio/Mute modes when
 * the platform doesn't expose a dedicated audio-only or video-only stream.
 */
export function stripTrack(inputPath: string, outputPath: string, keep: "audio" | "video"): Promise<void> {
  return new Promise((resolve, reject) => {
    const args =
      keep === "audio"
        ? ["-y", "-i", inputPath, "-vn", "-acodec", "copy", outputPath]
        : ["-y", "-i", inputPath, "-an", "-vcodec", "copy", outputPath];

    const child = spawn(FFMPEG_PATH, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderrTail = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-2000);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderrTail || `ffmpeg exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
