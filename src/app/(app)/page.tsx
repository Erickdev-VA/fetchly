"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { UrlInputBar } from "@/components/UrlInputBar";
import { ModeToggle } from "@/components/ModeToggle";
import { AnalyzingIndicator } from "@/components/AnalyzingIndicator";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MediaCard } from "@/components/MediaCard";
import { PlaylistCard } from "@/components/PlaylistCard";
import { ShareableToggle } from "@/components/ShareableToggle";
import { analyzeUrl, ApiError, fetchSettings } from "@/lib/api";
import { CATEGORY_LABEL, categoryForMode } from "@/lib/library/types";
import type { AnalyzeResult, DownloadMode } from "@/lib/platform/types";

type Status = "idle" | "analyzing" | "ready" | "error";

export default function DownloadPage() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<DownloadMode>("auto");
  const [status, setStatus] = useState<Status>("idle");
  const [shareable, setShareable] = useState(true);
  const shareableTouched = useRef(false);
  const [media, setMedia] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

  // Start from the default chosen in Ajustes, unless the switch was already used.
  useEffect(() => {
    let live = true;
    fetchSettings().then(
      ({ settings }) => live && !shareableTouched.current && setShareable(settings.shareableDefault),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

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

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-8 px-6 py-8">
        <div className="w-full">
          <PageHeader title="Descargar" subtitle="Pega un enlace de YouTube, TikTok, Instagram o X." />
        </div>

        <div className="flex w-full max-w-xl flex-col items-center gap-3">
          <UrlInputBar
            value={url}
            onChange={setUrl}
            onSubmit={() => runAnalysis(url)}
            onPasteClick={handlePaste}
            disabled={isBusy}
          />
          <ModeToggle value={mode} onChange={setMode} disabled={isBusy} />
          <p className="text-xs text-white/40">Se guardará en {CATEGORY_LABEL[categoryForMode(mode)]}</p>
          <ShareableToggle
            value={shareable}
            onChange={(value) => {
              shareableTouched.current = true;
              setShareable(value);
            }}
            disabled={isBusy}
          />
          {pasteNotice && <p className="text-center text-xs text-white/40">{pasteNotice}</p>}
        </div>

        <div className="flex w-full max-w-xl flex-col items-center gap-4">
          {status === "analyzing" && <AnalyzingIndicator />}
          {status === "error" && error && <ErrorBanner message={error} onDismiss={() => setStatus("idle")} />}
          {status === "ready" && media?.kind === "media" && (
            <MediaCard media={media} mode={mode} shareable={shareable} />
          )}
          {status === "ready" && media?.kind === "playlist" && (
            <PlaylistCard key={media.analysisId} playlist={media} mode={mode} shareable={shareable} />
          )}
        </div>
      </div>

      <footer className="px-6 pb-6 text-center text-[11px] text-white/25">
        Para contenido sobre el que tienes derechos. Respeta los términos de servicio de cada plataforma.
      </footer>
    </div>
  );
}
