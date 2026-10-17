import type { Category } from "./library/types";

/** What electron/preload.cjs exposes as `window.fetchly`. */
interface FetchlyBridge {
  isDesktop: true;
  openLibraryFolder(category: Category): Promise<boolean>;
  showItemInFolder(filePath: string): Promise<boolean>;
  /** True once the file is in the Recycle Bin or was already gone. */
  trashItem(filePath: string): Promise<boolean>;
}

declare global {
  interface Window {
    fetchly?: FetchlyBridge;
  }
}

/** The Electron bridge, or null when the page isn't running inside the app. */
export function desktop(): FetchlyBridge | null {
  return typeof window === "undefined" ? null : (window.fetchly ?? null);
}
