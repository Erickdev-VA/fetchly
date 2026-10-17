import type { Category } from "./library/types";
import type { PlayerCommand, PlayerSnapshot } from "./player/types";

/** What electron/preload.cjs exposes as `window.fetchly`. */
interface FetchlyBridge {
  isDesktop: true;
  openLibraryFolder(category: Category): Promise<boolean>;
  showItemInFolder(filePath: string): Promise<boolean>;
  /** True once the file is in the Recycle Bin or was already gone. */
  trashItem(filePath: string): Promise<boolean>;
  player: {
    /** Tells Electron what's playing (taskbar buttons, tray menu, mini player). */
    publishState(snapshot: PlayerSnapshot): void;
    /** Commands from the taskbar and the tray; returns the unsubscribe function. Validate before use. */
    onCommand(listener: (command: unknown) => void): () => void;
  };
  mini: {
    /** From the main window: opens the mini player, or brings it forward. */
    open(): void;
    // The rest only work from the mini player's own window.
    getState(): Promise<{ player: PlayerSnapshot | null; pinned: boolean } | null>;
    /** What's playing (null once the main window is gone); returns the unsubscribe function. */
    onState(listener: (state: PlayerSnapshot | null) => void): () => void;
    command(command: PlayerCommand): void;
    /** Resolves to the pin state now in effect. */
    setPinned(pinned: boolean): Promise<boolean>;
    close(): void;
    showApp(): void;
  };
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
