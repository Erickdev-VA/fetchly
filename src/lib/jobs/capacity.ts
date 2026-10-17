/**
 * How many yt-dlp downloads run at once across the whole app (single
 * downloads and playlist items alike). Anything beyond that waits its turn
 * instead of being rejected.
 */
const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS ?? 3);

interface CapacityGlobal {
  active: number;
  waiting: (() => void)[];
}

// See the comment in downloadJobs.ts about pinning state to globalThis.
const globalStore = globalThis as unknown as { __fetchlyCapacity?: CapacityGlobal };
const state: CapacityGlobal = globalStore.__fetchlyCapacity ?? { active: 0, waiting: [] };
globalStore.__fetchlyCapacity = state;

/** Resolves once a download slot is free; call the returned function to give it back. */
export async function acquireDownloadSlot(): Promise<() => void> {
  if (state.active >= MAX_CONCURRENT_DOWNLOADS) {
    await new Promise<void>((resolve) => state.waiting.push(resolve));
  } else {
    state.active++;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    // Hand the slot straight to the next in line, or free it.
    const next = state.waiting.shift();
    if (next) next();
    else state.active--;
  };
}
