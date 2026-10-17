import type { DownloadMode, Platform } from "../platform/types";

/** Where a file lives in the library. Shared by the server and the page. */
export type Category = "music" | "video";

export const CATEGORY_LABEL: Record<Category, string> = {
  music: "Música",
  video: "Videos",
};

/** Audio downloads are music; both video modes (with or without sound) are videos. */
export function categoryForMode(mode: DownloadMode): Category {
  return mode === "audio" ? "music" : "video";
}

export interface LibraryItem {
  id: string;
  category: Category;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  platform: Platform | null;
  sourceUrl: string | null;
  /** Absolute path of the file inside the library folder. */
  filePath: string;
  fileSize: number;
  /** File name inside the thumbnails folder, if one was saved. */
  thumbnailFile: string | null;
  createdAt: number;
}
