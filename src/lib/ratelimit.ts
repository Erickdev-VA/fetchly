interface Bucket {
  timestamps: number[];
}

// See the comment in lib/jobs/downloadJobs.ts: pinned to globalThis so this
// survives Next.js dev (Turbopack) re-evaluating the module between requests.
interface RateLimitGlobal {
  buckets: Map<string, Bucket>;
  sweepIntervalStarted: boolean;
}

const globalStore = globalThis as unknown as { __mediaDownloaderRateLimit?: RateLimitGlobal };
const state: RateLimitGlobal = globalStore.__mediaDownloaderRateLimit ?? {
  buckets: new Map<string, Bucket>(),
  sweepIntervalStarted: false,
};
globalStore.__mediaDownloaderRateLimit = state;

if (!state.sweepIntervalStarted) {
  state.sweepIntervalStarted = true;
  setInterval(
    () => {
      const now = Date.now();
      for (const [key, bucket] of state.buckets) {
        bucket.timestamps = bucket.timestamps.filter((t) => now - t < 10 * 60 * 1000);
        if (bucket.timestamps.length === 0) state.buckets.delete(key);
      }
    },
    5 * 60 * 1000,
  ).unref();
}

/**
 * Simple in-memory sliding-window rate limiter, scoped per (key, action).
 * Sufficient for a single-instance MVP; swap for a shared store (e.g. Redis)
 * if the app is ever deployed across multiple instances.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = state.buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    state.buckets.set(key, bucket);
    return false;
  }

  bucket.timestamps.push(now);
  state.buckets.set(key, bucket);
  return true;
}

export function getClientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
