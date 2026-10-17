"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchLibraryItem } from "@/lib/api";
import { toVideoTrack } from "@/lib/player/types";
import { ErrorBanner } from "../ErrorBanner";
import { PAGE_CLASS } from "../shell/PageHeader";
import { usePlayer } from "../player/PlayerProvider";

/**
 * /videos/[id] (the "▶ Ver" after a download): plays that video over the
 * whole window and leaves the Videos page underneath, for when it's closed.
 */
export function OpenVideo({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const { actions } = usePlayer();
  const router = useRouter();

  useEffect(() => {
    let live = true;
    fetchLibraryItem(id)
      .then(({ category, entry }) => {
        if (!live) return;
        if (category !== "video") throw new Error("Eso no es un video.");
        if (entry.missing) throw new Error("No se encontró el archivo. Puede que se haya movido o borrado fuera de la app.");
        actions.playVideos([toVideoTrack(entry)], 0);
        router.replace("/videos");
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : "No se pudo abrir el video."));
    return () => {
      live = false;
    };
  }, [id, actions, router]);

  return <div className={PAGE_CLASS}>{error && <ErrorBanner message={error} />}</div>;
}
