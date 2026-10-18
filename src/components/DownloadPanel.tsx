"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { UrlInputBar } from "@/components/UrlInputBar";
import { AnalyzingIndicator } from "@/components/AnalyzingIndicator";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MediaCard } from "@/components/MediaCard";
import { PlaylistCard } from "@/components/PlaylistCard";
import { analyzeUrl, ApiError, fetchSettings } from "@/lib/api";
import type { AnalyzeResult, DownloadMode } from "@/lib/platform/types";

type Status = "idle" | "analyzing" | "ready" | "error";

const MODE_KEY = "pista.downloadMode";

/** Video or Audio, as last chosen on a result card (this browser only). */
function rememberedMode(): DownloadMode {
  try {
    return localStorage.getItem(MODE_KEY) === "audio" ? "audio" : "auto";
  } catch {
    return "auto";
  }
}

/**
 * The Descargar page. The (app) layout renders it all the time and only
 * shows it at /descargar, so a download keeps showing its progress (and the
 * pasted link, the list and the choices) after visiting another section.
 */
export function DownloadPanel() {
  const visible = usePathname() === "/descargar";
  const [url, setUrl] = useState("");
  // Picked on the result card, once the link shows what it is. (Nothing on
  // the first render depends on it, so reading storage here can't mismatch.)
  const [mode, setModeState] = useState<DownloadMode>(rememberedMode);
  const setMode = useCallback((next: DownloadMode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {}
  }, []);
  const [status, setStatus] = useState<Status>("idle");
  // "Compatible con WhatsApp" is chosen once, in Ajustes.
  const [shareable, setShareable] = useState(true);
  const [media, setMedia] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

  // Read again on every visit, in case it was changed in Ajustes meanwhile.
  useEffect(() => {
    if (!visible) return;
    let live = true;
    fetchSettings().then(
      ({ settings }) => live && setShareable(settings.shareableDefault),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [visible]);

  const runAnalysis = useCallback(async (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    setStatus("analyzing");
    setError(null);
    setMedia(null);
    try {
      const result = await analyzeUrl(trimmed);
      setMedia(result);
      setStatus("ready");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Algo salió mal.";
      setError(message);
      setStatus("error");
    }
  }, []);

  const handlePaste = useCallback(async () => {
    setPasteNotice(null);
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      setPasteNotice("No se puede pegar automáticamente. Pega el enlace a mano.");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteNotice("El portapapeles está vacío.");
        return;
      }
      setUrl(text);
      void runAnalysis(text);
    } catch {
      setPasteNotice("No se pudo acceder al portapapeles. Pega el enlace a mano.");
    }
  }, [runAnalysis]);

  const isBusy = status === "analyzing";

  const hasResult = status !== "idle";

  return (
    <div hidden={!visible} className="h-full">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-6 py-8 lg:max-w-3xl lg:px-10">
        <PageHeader title="Descargar" subtitle="Pega un enlace de YouTube, TikTok, Instagram o X." />

        {/* With nothing pasted yet the link box sits in the middle of the page;
            once there is something to show it moves up to make room. */}
        <div className={`flex w-full flex-col items-center gap-8 ${hasResult ? "pt-4" : "flex-1 justify-center pb-[12vh]"}`}>
          <div className="flex w-full flex-col items-center gap-3">
            <UrlInputBar
              value={url}
              onChange={setUrl}
              onSubmit={() => runAnalysis(url)}
              onPasteClick={handlePaste}
              disabled={isBusy}
            />
            {pasteNotice && <p className="text-center text-xs text-white/40">{pasteNotice}</p>}
          </div>

          {hasResult && (
            <div className="flex w-full flex-col items-center gap-4">
              {status === "analyzing" && <AnalyzingIndicator />}
              {status === "error" && error && <ErrorBanner message={error} onDismiss={() => setStatus("idle")} />}
              {status === "ready" && media?.kind === "media" && <MediaCard media={media} mode={mode} onModeChange={setMode} shareable={shareable} />}
              {status === "ready" && media?.kind === "playlist" && (
                <PlaylistCard key={media.analysisId} playlist={media} mode={mode} onModeChange={setMode} shareable={shareable} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
