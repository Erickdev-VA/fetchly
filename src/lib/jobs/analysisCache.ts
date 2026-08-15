import { randomUUID } from "node:crypto";
import type { Platform } from "../platform/types";

export interface CachedAnalysis {
  id: string;
  url: string;
  platform: Platform;
  title: string;
  availableHeights: number[];
  hasAudioOnlyStream: boolean;
  hasVideoOnlyStream: boolean;
  hasAnyAudio: boolean;
  createdAt: number;
}

const TTL_MS = 15 * 60 * 1000;

// See the comment in lib/jobs/downloadJobs.ts: pinned to globalThis so this
// survives Next.js dev (Turbopack) re-evaluating the module between requests.
interface AnalysisCacheGlobal {
  store: Map<string, CachedAnalysis>;
  sweepIntervalStarted: boolean;
}

const globalStore = globalThis as unknown as { __mediaDownloaderAnalysisCache?: AnalysisCacheGlobal };
const cache: AnalysisCacheGlobal = globalStore.__mediaDownloaderAnalysisCache ?? {
  store: new Map<string, CachedAnalysis>(),
  sweepIntervalStarted: false,
};
globalStore.__mediaDownloaderAnalysisCache = cache;

if (!cache.sweepIntervalStarted) {
  cache.sweepIntervalStarted = true;
  setInterval(
    () => {
      const now = Date.now();
      for (const [id, entry] of cache.store) {
        if (now - entry.createdAt > TTL_MS) cache.store.delete(id);
      }
    },
    5 * 60 * 1000,
  ).unref();
}

export function saveAnalysis(data: Omit<CachedAnalysis, "id" | "createdAt">): string {
  const id = randomUUID();
  cache.store.set(id, { ...data, id, createdAt: Date.now() });
  return id;
}

export function getAnalysis(id: string): CachedAnalysis | null {
  const entry = cache.store.get(id);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.store.delete(id);
    return null;
  }
  return entry;
}
