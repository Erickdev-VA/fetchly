"use client";

import { useCallback, useRef, useState } from "react";
import { startDownload, getDownloadProgress, getDownloadFileUrl, ApiError } from "@/lib/api";
import type { DownloadMode } from "@/lib/platform/types";

export type DownloadState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "preparing"; percent: number }
  | { phase: "processing"; percent: number }
  | { phase: "completed" }
  | { phase: "error"; message: string };

const POLL_INTERVAL_MS = 800;

export function useDownloadJob() {
  const [state, setState] = useState<DownloadState>({ phase: "idle" });
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setState({ phase: "idle" });
  }, [stopPolling]);

  const start = useCallback(
    async (params: { analysisId: string; mode: DownloadMode; height: number | "best" }) => {
      stopPolling();
      setState({ phase: "starting" });
      try {
        const { jobId } = await startDownload(params);
        setState({ phase: "preparing", percent: 0 });

        pollRef.current = window.setInterval(async () => {
          try {
            const progress = await getDownloadProgress(jobId);
            if (progress.status === "completed") {
              stopPolling();
              setState({ phase: "completed" });
              window.location.assign(getDownloadFileUrl(jobId));
            } else if (progress.status === "error") {
              stopPolling();
              setState({ phase: "error", message: progress.errorMessage ?? "The download failed." });
            } else {
              setState({ phase: progress.status, percent: progress.percent });
            }
          } catch {
            stopPolling();
            setState({ phase: "error", message: "Lost connection while downloading." });
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Couldn't start the download.";
        setState({ phase: "error", message });
      }
    },
    [stopPolling],
  );

  return { state, start, reset };
}
