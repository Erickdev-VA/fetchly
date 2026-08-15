"use client";

import { useEffect, useState } from "react";
import type { MediaInfo, DownloadMode } from "@/lib/platform/types";
import { formatDuration, formatBytes } from "@/lib/format";
import { PlatformBadge } from "./PlatformBadge";
import { QualityChips } from "./QualityChips";
import { DownloadButton } from "./DownloadButton";
import { useDownloadJob } from "@/hooks/useDownloadJob";

export function MediaCard({ media, mode }: { media: MediaInfo; mode: DownloadMode }) {
  const [quality, setQuality] = useState<number | "best">("best");
  const { state, start, reset } = useDownloadJob();

  useEffect(() => {
    reset();
  }, [media.analysisId, mode, reset]);

  useEffect(() => {
    if (state.phase === "completed") {
      const t = setTimeout(() => reset(), 3000);
      return () => clearTimeout(t);
    }
  }, [state.phase, reset]);

  const showQuality = mode !== "audio" && media.qualities.length > 0;
  const isBusy = state.phase === "starting" || state.phase === "preparing" || state.phase === "processing";
  const duration = formatDuration(media.durationSeconds);

  const estSize =
    mode === "audio"
      ? formatBytes(media.bestAudioEstSizeBytes)
      : formatBytes(
          quality === "best"
            ? media.qualities[0]?.estSizeBytes
            : (media.qualities.find((q) => q.height === quality)?.estSizeBytes ?? null),
        );

  return (
    <div className="w-full animate-[fadeIn_0.35s_ease] rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-white/5 sm:w-56">
          {media.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.thumbnailUrl}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
          {duration && (
            <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {duration}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <h2 className="line-clamp-2 text-[15px] font-medium leading-snug text-white">{media.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/45">
              <PlatformBadge platform={media.platform} />
              {media.author && <span>· {media.author}</span>}
            </div>
          </div>

          {showQuality ? (
            <QualityChips qualities={media.qualities} selected={quality} onSelect={setQuality} disabled={isBusy} />
          ) : mode === "audio" ? (
            <span className="text-xs text-white/40">Best available audio quality</span>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <DownloadButton
              state={state}
              onClick={() =>
                start({
                  analysisId: media.analysisId,
                  mode,
                  height: showQuality ? quality : "best",
                })
              }
            />
            {estSize && !isBusy && state.phase !== "completed" && (
              <span className="text-xs text-white/35">~{estSize}</span>
            )}
          </div>

          {state.phase === "error" && <p className="text-xs text-red-300">{state.message}</p>}
        </div>
      </div>
    </div>
  );
}
