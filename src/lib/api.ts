import type { AnalyzeResult, DownloadMode } from "./platform/types";

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error?.code ?? "INTERNAL";
    const message = data?.error?.message ?? "Something went wrong.";
    throw new ApiError(code, message);
  }
  return data as T;
}

export function analyzeUrl(url: string): Promise<AnalyzeResult> {
  return fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).then((res) => parseJsonOrThrow<AnalyzeResult>(res));
}

export function startDownload(params: {
  analysisId: string;
  mode: DownloadMode;
  height: number | "best";
  shareable: boolean;
}): Promise<{ jobId: string }> {
  return fetch("/api/download/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((res) => parseJsonOrThrow<{ jobId: string }>(res));
}

export interface DownloadProgress {
  status: "preparing" | "processing" | "completed" | "error";
  percent: number;
  /** True while the file is being re-encoded to H.264/AAC. */
  converting: boolean;
  errorMessage: string | null;
  fileName: string | null;
}

export function getDownloadProgress(jobId: string): Promise<DownloadProgress> {
  return fetch(`/api/download/progress/${jobId}`, { cache: "no-store" }).then((res) =>
    parseJsonOrThrow<DownloadProgress>(res),
  );
}

export function getDownloadFileUrl(jobId: string): string {
  return `/api/download/file/${jobId}`;
}

export type BatchItemStatus = "queued" | "downloading" | "converting" | "completed" | "error" | "cancelled";

export interface BatchProgress {
  running: boolean;
  cancelled: boolean;
  items: {
    entryId: string;
    title: string;
    status: BatchItemStatus;
    percent: number;
    errorMessage: string | null;
  }[];
}

export function startBatch(params: {
  analysisId: string;
  entryIds: string[];
  mode: DownloadMode;
  height: number | "best";
  shareable: boolean;
}): Promise<{ batchId: string }> {
  return fetch("/api/batch/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((res) => parseJsonOrThrow<{ batchId: string }>(res));
}

export function getBatchProgress(batchId: string): Promise<BatchProgress> {
  return fetch(`/api/batch/${batchId}`, { cache: "no-store" }).then((res) => parseJsonOrThrow<BatchProgress>(res));
}

export function cancelBatch(batchId: string): Promise<unknown> {
  return fetch(`/api/batch/${batchId}/cancel`, { method: "POST" });
}

export function discardBatch(batchId: string): Promise<unknown> {
  return fetch(`/api/batch/${batchId}`, { method: "DELETE" });
}

export function getBatchZipUrl(batchId: string): string {
  return `/api/batch/${batchId}/zip`;
}

export function getBatchItemUrl(batchId: string, entryId: string): string {
  return `/api/batch/${batchId}/item/${encodeURIComponent(entryId)}`;
}
