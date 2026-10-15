import { activeDownloadCount } from "./downloadJobs";
import { activeBatchCount } from "./batchJobs";

const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS ?? 3);

/** A running playlist batch takes one slot, like a single download. */
export function isServerBusy(): boolean {
  return activeDownloadCount() + activeBatchCount() >= MAX_CONCURRENT_DOWNLOADS;
}
