"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startDownload, getDownloadProgress, ApiError, type SavedItem, type SaveTargetRequest } from "@/lib/api";
import type { DownloadMode } from "@/lib/platform/types";

export type DownloadState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "queued" }
  | { phase: "processing"; percent: number }
  | { phase: "converting"; percent: number }
  | { phase: "completed"; item: SavedItem }
  | { phase: "error"; message: string };

const POLL_INTERVAL_MS = 800;

export function useDownloadJob() {
  const [state, setState] = useState<DownloadState>({ phase: "idle" });
  // The last file this card saved (and the playlist it went into). Outlives
  // the button's "Completado", which goes back to "Descargar" after a moment.
  const [saved, setSaved] = useState<(SavedItem & { playlistId: string | null }) | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // The download itself keeps going on the server (and lands in the
  // library) if the card goes away; only the progress polling stops.
  useEffect(() => stopPolling, [stopPolling]);

  /** Back to "Descargar"; `forget` also drops the "Guardado en…" notice. */
  const reset = useCallback(
    (forget = false) => {
      stopPolling();
      setState({ phase: "idle" });
      if (forget) setSaved(null);
    },
    [stopPolling],
  );

  const start = useCallback(
    async (params: {
      analysisId: string;
      mode: DownloadMode;
      height: number | "best";
      shareable: boolean;
      target?: SaveTargetRequest;
    }) => {
      stopPolling();
      setState({ phase: "starting" });
      try {
        const { jobId, playlistId } = await startDownload(params);
        setState({ phase: "queued" });

        pollRef.current = window.setInterval(async () => {
          try {
            const progress = await getDownloadProgress(jobId);
            if (progress.status === "completed" && progress.item) {
              stopPolling();
              setState({ phase: "completed", item: progress.item });
              setSaved({ ...progress.item, playlistId });
            } else if (progress.status === "error") {
              stopPolling();
              setState({ phase: "error", message: progress.errorMessage ?? "La descarga falló." });
            } else if (progress.status === "queued") {
              setState({ phase: "queued" });
            } else {
              setState({ phase: progress.converting ? "converting" : "processing", percent: progress.percent });
            }
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

  return { state, saved, start, reset };
}
