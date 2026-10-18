"use client";

import { useEffect, useState } from "react";
import { libraryThumbnailUrl } from "@/lib/api";

/**
 * The cover's average color, leaning to its most colorful pixels and
 * darkened so white text stays readable on it: a backdrop, like
 * Spotify's (the mini player's card, a playlist's header). Null until
 * it's read (and for songs without a cover).
 */
export function useCoverColor(id: string | null, hasThumbnail: boolean): string | null {
  const [color, setColor] = useState<{ id: string; value: string } | null>(null);
  useEffect(() => {
    if (!id || !hasThumbnail) return;
    let live = true;
    const image = new Image();
    image.onload = () => {
      if (!live) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 16;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, 16, 16);
        const data = context.getImageData(0, 0, 16, 16).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const weight = 1 + (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])) / 24;
          r += data[i] * weight;
          g += data[i + 1] * weight;
          b += data[i + 2] * weight;
          total += weight;
        }
        const peak = Math.max(r, g, b, 1) / total;
        const k = Math.min(0.8, 130 / peak) / total;
        setColor({ id, value: `rgb(${Math.round(r * k)} ${Math.round(g * k)} ${Math.round(b * k)})` });
      } catch {
        // Only a backdrop: the plain one stays.
      }
    };
    image.src = libraryThumbnailUrl(id);
    return () => {
      live = false;
    };
  }, [id, hasThumbnail]);
  return color && color.id === id ? color.value : null;
}
