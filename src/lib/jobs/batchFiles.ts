import path from "node:path";
import { sanitizeFilename } from "../security/filename";
import type { BatchItem, BatchJob } from "./batchJobs";

/** "07 - Song title.mp4": numbered by playlist position so the ZIP keeps the order. */
export function batchItemFileName(batch: BatchJob, item: BatchItem): string {
  const width = String(Math.max(...batch.items.map((i) => i.index + 1))).length;
  const number = String(item.index + 1).padStart(Math.max(2, width), "0");
  const ext = path.extname(item.filePath ?? "");
  return `${number} - ${sanitizeFilename(item.title)}${ext}`;
}
