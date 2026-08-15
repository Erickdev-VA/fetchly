export type ErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PLATFORM"
  | "CONTENT_UNAVAILABLE"
  | "CONTENT_PRIVATE"
  | "LIVE_UNSUPPORTED"
  | "METADATA_FAILED"
  | "PROCESSING_FAILED"
  | "DOWNLOAD_FAILED"
  | "TOO_LONG"
  | "TOO_LARGE"
  | "RATE_LIMITED"
  | "SERVER_BUSY"
  | "NOT_FOUND"
  | "INTERNAL";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_URL: "That link doesn't look valid. Double-check it and try again.",
  UNSUPPORTED_PLATFORM: "This link isn't from a supported platform yet.",
  CONTENT_UNAVAILABLE: "This content isn't available anymore.",
  CONTENT_PRIVATE: "This content is private and can't be accessed.",
  LIVE_UNSUPPORTED: "Live streams aren't supported.",
  METADATA_FAILED: "Couldn't fetch information for this link.",
  PROCESSING_FAILED: "Something went wrong while processing this content.",
  DOWNLOAD_FAILED: "The download failed. Please try again.",
  TOO_LONG: "This content is too long to process.",
  TOO_LARGE: "This file is too large to download.",
  RATE_LIMITED: "You're doing that a bit too much. Please wait a moment and try again.",
  SERVER_BUSY: "The server is busy right now. Please try again shortly.",
  NOT_FOUND: "We couldn't find that request. It may have expired — try again.",
  INTERNAL: "Something went wrong on our end.",
};

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_URL: 400,
  UNSUPPORTED_PLATFORM: 400,
  CONTENT_UNAVAILABLE: 422,
  CONTENT_PRIVATE: 422,
  LIVE_UNSUPPORTED: 422,
  METADATA_FAILED: 502,
  PROCESSING_FAILED: 500,
  DOWNLOAD_FAILED: 500,
  TOO_LONG: 422,
  TOO_LARGE: 422,
  RATE_LIMITED: 429,
  SERVER_BUSY: 503,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code]);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }

  toResponseBody() {
    return { error: { code: this.code, message: this.message } };
  }
}
