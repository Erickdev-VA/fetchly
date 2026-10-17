"use client";

import Link from "next/link";
import { useState } from "react";
import { fetchLibraryItem } from "@/lib/api";
import { desktop } from "@/lib/desktop";
import { CATEGORY_LABEL, type Category } from "@/lib/library/types";
import { toTrack } from "@/lib/player/types";
import { usePlayer } from "./player/PlayerProvider";

/**
 * "✓ Guardado en Música · ▶ Reproducir · Mostrar en carpeta" after a
 * download lands in the library. With `itemId`, it offers to play the song
 * (or open the video) right away.
 */
export function SavedNotice({
  category,
  filePath,
  itemId,
  text,
}: {
  category: Category;
  filePath?: string;
  itemId?: string;
  text?: string;
}) {
  const bridge = desktop();
  const player = usePlayer();
  const [playError, setPlayError] = useState<string | null>(null);

  const play = async () => {
    if (!itemId) return;
    try {
      const { entry } = await fetchLibraryItem(itemId);
      player.actions.playTracks([toTrack(entry)], 0);
      setPlayError(null);
    } catch {
      setPlayError("No se pudo reproducir.");
    }
  };

  const action = "font-medium text-white/60 underline-offset-2 transition hover:text-white hover:underline";
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-300/85">
      <span>✓ {text ?? `Guardado en ${CATEGORY_LABEL[category]}`}</span>
      {itemId && category === "music" && (
        <button type="button" onClick={() => void play()} className={action}>
          ▶ Reproducir
        </button>
      )}
      {itemId && category === "video" && (
        <Link href={`/videos/${itemId}`} className={action}>
          ▶ Ver
        </Link>
      )}
      {bridge && (
        <button
          type="button"
          onClick={() => void (filePath ? bridge.showItemInFolder(filePath) : bridge.openLibraryFolder(category))}
          className={action}
        >
          {filePath ? "Mostrar en carpeta" : "Abrir carpeta"}
        </button>
      )}
      {playError && <span className="text-red-300">{playError}</span>}
    </p>
  );
}
