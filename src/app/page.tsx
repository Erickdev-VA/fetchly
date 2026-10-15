"use client";

import { useCallback, useState } from "react";
import { Logo } from "@/components/Logo";
import { UrlInputBar } from "@/components/UrlInputBar";
import { ModeToggle } from "@/components/ModeToggle";
import { AnalyzingIndicator } from "@/components/AnalyzingIndicator";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MediaCard } from "@/components/MediaCard";
import { PlaylistCard } from "@/components/PlaylistCard";
import { ShareableToggle } from "@/components/ShareableToggle";
import { analyzeUrl, ApiError } from "@/lib/api";
import type { AnalyzeResult, DownloadMode } from "@/lib/platform/types";

type Status = "idle" | "analyzing" | "ready" | "error";

export default function Home() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<DownloadMode>("auto");
  const [status, setStatus] = useState<Status>("idle");
  const [shareable, setShareable] = useState(true);
  const [media, setMedia] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

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
      const message = err instanceof ApiError ? err.message : "Something went wrong on our end.";
      setError(message);
      setStatus("error");
    }
  }, []);

  const handlePaste = useCallback(async () => {
    setPasteNotice(null);
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      setPasteNotice("Automatic paste isn't available in this browser. Paste the link manually instead.");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteNotice("Your clipboard is empty.");
        return;
      }
      setUrl(text);
      void runAnalysis(text);
    } catch {
      setPasteNotice("Couldn't access the clipboard. Paste the link manually instead.");
    }
  }, [runAnalysis]);

  const isBusy = status === "analyzing";

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 sm:px-6">
        <Logo />

        <div className="flex w-full max-w-xl flex-col items-center gap-3">
          <UrlInputBar
            value={url}
            onChange={setUrl}
            onSubmit={() => runAnalysis(url)}
            onPasteClick={handlePaste}
            disabled={isBusy}
          />
          <ModeToggle value={mode} onChange={setMode} disabled={isBusy} />
          <ShareableToggle value={shareable} onChange={setShareable} disabled={isBusy} />
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
      </main>

      <footer className="px-4 pb-6 text-center text-[11px] text-white/25">
        For content you have the rights to. Please respect each platform&apos;s terms of service.
      </footer>
    </div>
  );
}
