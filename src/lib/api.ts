import type { MediaInfo, DownloadMode } from "./platform/types";

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

export function analyzeUrl(url: string): Promise<MediaInfo> {
  return fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).then((res) => parseJsonOrThrow<MediaInfo>(res));
}

export function startDownload(params: {
  analysisId: string;
  mode: DownloadMode;
  height: number | "best";
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
