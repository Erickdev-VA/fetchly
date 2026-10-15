"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startBatch,
  getBatchProgress,
  cancelBatch,
  discardBatch,
  getBatchZipUrl,
  getBatchItemUrl,
  ApiError,
  type BatchProgress,
} from "@/lib/api";
import type { DownloadMode } from "@/lib/platform/types";

export type BatchState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "running"; batchId: string; progress: BatchProgress | null }
  | { phase: "done"; batchId: string; progress: BatchProgress }
  | { phase: "error"; message: string };

const POLL_INTERVAL_MS = 1000;

export function useBatchJob() {
  const [state, setState] = useState<BatchState>({ phase: "idle" });
  const pollRef = useRef<number | null>(null);
  const batchIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    if (batchIdRef.current) void discardBatch(batchIdRef.current);
    batchIdRef.current = null;
    setState({ phase: "idle" });
  }, [stopPolling]);

  // Free the server's temp files if the user navigates to another link.
  useEffect(() => () => reset(), [reset]);

  const start = useCallback(
    async (params: {
      analysisId: string;
      entryIds: string[];
      mode: DownloadMode;
      height: number | "best";
      shareable: boolean;
    }) => {
      stopPolling();
      setState({ phase: "starting" });
      try {
        const { batchId } = await startBatch(params);
        batchIdRef.current = batchId;
        setState({ phase: "running", batchId, progress: null });

        pollRef.current = window.setInterval(async () => {
          try {
            const progress = await getBatchProgress(batchId);
            if (progress.running) {
              setState({ phase: "running", batchId, progress });
              return;
            }
            stopPolling();
            setState({ phase: "done", batchId, progress });
            const done = progress.items.filter((i) => i.status === "completed");
            // One file doesn't need a ZIP around it.
            if (done.length === 1) window.location.assign(getBatchItemUrl(batchId, done[0].entryId));
            else if (done.length > 1) window.location.assign(getBatchZipUrl(batchId));
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

  const cancel = useCallback(() => {
    if (batchIdRef.current) void cancelBatch(batchIdRef.current);
  }, []);

  return { state, start, cancel, reset };
}
