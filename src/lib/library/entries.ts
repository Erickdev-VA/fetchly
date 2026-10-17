import { existsSync } from "node:fs";
import type { LibraryEntry, LibraryItem } from "./types";

/** A library item as the page sees it: no thumbnail file name, plus whether the file is still there. */
export function toEntry(item: LibraryItem): LibraryEntry {
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    durationSeconds: item.durationSeconds,
    platform: item.platform,
    filePath: item.filePath,
    fileSize: item.fileSize,
    createdAt: item.createdAt,
    hasThumbnail: item.thumbnailFile !== null,
    missing: !existsSync(item.filePath),
  };
}
