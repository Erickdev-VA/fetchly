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
  | "NOT_FOUND"
  | "INTERNAL";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_URL: "Ese enlace no parece válido. Revísalo e inténtalo de nuevo.",
  UNSUPPORTED_PLATFORM: "Este enlace no es de una plataforma compatible.",
  CONTENT_UNAVAILABLE: "Este contenido ya no está disponible.",
  CONTENT_PRIVATE: "Este contenido es privado y no se puede acceder a él.",
  LIVE_UNSUPPORTED: "Las transmisiones en vivo no son compatibles.",
  METADATA_FAILED: "No se pudo obtener la información de este enlace.",
  PROCESSING_FAILED: "Algo salió mal al procesar este contenido.",
  DOWNLOAD_FAILED: "La descarga falló. Inténtalo de nuevo.",
  TOO_LONG: "Este contenido es demasiado largo para procesarlo.",
  TOO_LARGE: "Este archivo es demasiado grande para descargarlo.",
  NOT_FOUND: "No se encontró esa solicitud. Puede que haya caducado; inténtalo de nuevo.",
  INTERNAL: "Algo salió mal.",
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
