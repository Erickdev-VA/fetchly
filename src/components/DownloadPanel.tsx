"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DownloadIntro } from "@/components/download/DownloadIntro";
import { FRAME_CLASS } from "@/components/shell/PageHeader";
import { UrlInputBar } from "@/components/UrlInputBar";
import { AnalyzingIndicator } from "@/components/AnalyzingIndicator";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MediaCard } from "@/components/MediaCard";
import { platformLabel } from "@/components/PlatformBadge";
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
  // A playlist takes the page's full width, with its link box across the top.
  const playlist = status === "ready" && media?.kind === "playlist" ? media : null;
  const clear = useCallback(() => {
    setUrl("");
    setMedia(null);
    setError(null);
    setStatus("idle");
  }, []);

  return (
    <div hidden={!visible} className="h-full">
      <div className={`${FRAME_CLASS} pb-16 ${hasResult ? "pt-8" : "pt-8 lg:pt-12"}`}>
        <div className={`mx-auto flex w-full flex-col items-center ${playlist ? "max-w-[1100px]" : "max-w-[880px]"}`}>
          {/* With nothing pasted yet the page explains itself and shows the latest
              downloads; once there is something to show, the link box moves up. */}
          {!hasResult && (
            <header className="mb-8 text-center">
              <h1 className="text-[38px] font-black leading-[0.98] tracking-[-0.035em] text-white lg:text-[46px]">
                ¿Qué quieres
                <br />
                guardar hoy?
              </h1>
              <p className="mx-auto mt-4 max-w-[460px] text-sm leading-relaxed text-white/55">
                Pega el enlace de un video, una playlist completa o una publicación. Tú eliges si te quedas con el audio o con el video.
              </p>
            </header>
          )}

          <div className={`flex w-full flex-col gap-3 ${playlist ? "items-start" : "max-w-[620px] items-center"}`}>
            <UrlInputBar
              value={url}
              onChange={setUrl}
              onSubmit={() => runAnalysis(url)}
              onPasteClick={handlePaste}
              disabled={isBusy}
              onClear={playlist ? clear : undefined}
            />
            {playlist && (
              <p className="flex items-center gap-2 pl-6 text-[13px] font-medium text-emerald-300/85">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                Playlist de {platformLabel(playlist.platform)} encontrada · {playlist.entries.length} video{playlist.entries.length === 1 ? "" : "s"}
              </p>
            )}
            {pasteNotice && <p className="text-center text-xs text-white/40">{pasteNotice}</p>}
          </div>

          {hasResult && (
            <div className={`flex w-full flex-col items-center gap-4 ${playlist ? "mt-6" : "mt-8 max-w-3xl"}`}>
              {status === "analyzing" && <AnalyzingIndicator />}
              {status === "error" && error && <ErrorBanner message={error} onDismiss={() => setStatus("idle")} />}
              {status === "ready" && media?.kind === "media" && <MediaCard media={media} mode={mode} onModeChange={setMode} shareable={shareable} />}
              {playlist && (
                <PlaylistCard key={playlist.analysisId} playlist={playlist} mode={mode} onModeChange={setMode} shareable={shareable} onClose={clear} />
              )}
            </div>
          )}

          {/* Also under an error, so the page isn't left empty. */}
          {visible && (status === "idle" || status === "error") && (
            <div className="mt-10 flex w-full flex-col gap-9">
              <DownloadIntro />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
