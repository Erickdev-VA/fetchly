"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startBatch,
  getBatchProgress,
  cancelBatch,
  resumeBatch,
  discardBatch,
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

  // Opening another link doesn't cancel a playlist that's downloading: it
  // keeps going on the server and each video still lands in the library.
  useEffect(() => stopPolling, [stopPolling]);

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
          } catch {
            stopPolling();
            setState({ phase: "error", message: "Se perdió la conexión durante la descarga." });
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "No se pudo iniciar la descarga.";
        setState({ phase: "error", message });
      }
    },
    [stopPolling],
  );

  const cancel = useCallback(() => {
    if (batchIdRef.current) void cancelBatch(batchIdRef.current);
  }, []);

  const resume = useCallback(() => {
    if (batchIdRef.current) void resumeBatch(batchIdRef.current);
  }, []);

  return { state, start, cancel, resume, reset };
}
