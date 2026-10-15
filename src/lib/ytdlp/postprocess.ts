import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { FFMPEG_PATH } from "./binary";

function runFfmpeg(
  args: string[],
  opts: { onChild?: (child: ChildProcess) => void; onTime?: (seconds: number) => void } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    opts.onChild?.(child);
    let stderrTail = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-8000);
      if (opts.onTime) {
        const matches = [...chunk.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
        const last = matches.at(-1);
        if (last) opts.onTime(Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]));
      }
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stderrTail);
      else reject(new Error(stderrTail || `ffmpeg exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

/**
 * Strips the unwanted track from a muxed file using stream copy (no
 * re-encoding, lossless, fast). Used as a fallback for Audio/Mute modes when
 * the platform doesn't expose a dedicated audio-only or video-only stream.
 */
export async function stripTrack(inputPath: string, outputPath: string, keep: "audio" | "video"): Promise<void> {
  const args =
    keep === "audio"
      ? ["-y", "-i", inputPath, "-vn", "-acodec", "copy", outputPath]
      : ["-y", "-i", inputPath, "-an", "-vcodec", "copy", outputPath];
  await runFfmpeg(args);
}

export interface MediaProbe {
  durationSeconds: number | null;
  videoCodec: string | null;
  pixelFormat: string | null;
  videoKbps: number | null;
  audioCodec: string | null;
  audioProfile: string | null;
}

/**
 * Reads codec info from `ffmpeg -i` (ffmpeg-static ships no ffprobe). ffmpeg
 * exits non-zero here because no output is given, so the banner is parsed
 * from the error path rather than treated as a failure.
 */
export async function probeMedia(inputPath: string): Promise<MediaProbe> {
  const text = await runFfmpeg(["-hide_banner", "-i", inputPath]).catch((err: Error) => err.message);
  const duration = text.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = text.match(/Stream #\S+.*?: Video: (\w+)[^,\n]*,\s*(\w+)[^\n]*/);
  const videoKbps = video?.[0].match(/(\d+) kb\/s/);
  const audio = text.match(/Stream #\S+.*?: Audio: (\w+)(?: \(([^)]+)\))?/);
  return {
    durationSeconds: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null,
    videoCodec: video?.[1] ?? null,
    pixelFormat: video?.[2] ?? null,
    videoKbps: videoKbps ? Number(videoKbps[1]) : null,
    audioCodec: audio?.[1] ?? null,
    audioProfile: audio?.[2] ?? null,
  };
}

/**
 * Makes sure the output is something WhatsApp (chats and Status), iPhones
 * and Android galleries all accept: H.264 8-bit 4:2:0 video + AAC-LC audio
 * in an MP4 with the index up front. Platforms increasingly serve VP9/AV1
 * (Instagram Reels are VP9-only now, YouTube above 1080p too) and HE-AAC or
 * Opus audio — all perfectly valid files that WhatsApp nonetheless refuses
 * to send or post. Streams that already comply are copied untouched; only
 * the offending track gets re-encoded.
 *
 * Returns the path of the file to serve (possibly the input itself).
 */
export async function makeShareable(
  inputPath: string,
  tempDir: string,
  keep: "both" | "audio" | "video",
  opts: { onChild?: (child: ChildProcess) => void; onProgress?: (fraction: number) => void } = {},
): Promise<string> {
  const probe = await probeMedia(inputPath);
  const ext = path.extname(inputPath).toLowerCase();

  const videoOk = probe.videoCodec === "h264" && /^yuvj?420p$/.test(probe.pixelFormat ?? "");
  // HE-AAC (what Instagram serves) isn't reliably accepted everywhere AAC-LC
  // is; re-encoding just the audio is cheap, so normalize it.
  const audioOk = probe.audioCodec === "aac" && !/HE-AAC/i.test(probe.audioProfile ?? "");
  const hasVideo = probe.videoCodec !== null;
  const hasAudio = probe.audioCodec !== null;

  let args: string[];
  let outPath: string;

  if (keep === "audio") {
    if (!hasAudio) throw new Error("no audio stream to keep");
    if (audioOk && (ext === ".m4a" || ext === ".mp4") && !hasVideo) return inputPath;
    outPath = path.join(tempDir, "shareable.m4a");
    args = ["-vn", "-map", "0:a:0", ...(audioOk ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "192k"])];
  } else {
    if (!hasVideo) throw new Error("no video stream to keep");
    const wantAudio = keep === "both" && hasAudio;
    const alreadyFine = videoOk && (!wantAudio || audioOk) && ext === ".mp4" && (wantAudio || !hasAudio);
    if (alreadyFine) return inputPath;

    outPath = path.join(tempDir, "shareable.mp4");
    // H.264 needs roughly 1.5x the bitrate of VP9/AV1 for the same look;
    // capping there keeps CRF from ballooning the file well past the original.
    const rateCap = probe.videoKbps ? Math.max(800, Math.round(probe.videoKbps * 1.5)) : null;
    const videoArgs = videoOk
      ? ["-c:v", "copy"]
      : [
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          ...(rateCap ? ["-maxrate", `${rateCap}k`, "-bufsize", `${rateCap * 2}k`] : []),
          "-profile:v",
          "high",
          "-pix_fmt",
          "yuv420p",
          // yuv420p needs even dimensions; some vertical videos aren't.
          "-vf",
          "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ];
    const audioArgs = !wantAudio
      ? ["-an"]
      : audioOk
        ? ["-map", "0:a:0", "-c:a", "copy"]
        : ["-map", "0:a:0", "-c:a", "aac", "-b:a", "160k", "-ac", "2"];
    args = ["-map", "0:v:0", ...videoArgs, ...audioArgs];
  }

  const duration = probe.durationSeconds;
  await runFfmpeg(["-hide_banner", "-y", "-i", inputPath, ...args, "-movflags", "+faststart", outPath], {
    onChild: opts.onChild,
    onTime: duration && opts.onProgress ? (t) => opts.onProgress?.(Math.min(1, t / duration)) : undefined,
  });
  return outPath;
}
