const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
const RESERVED_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;

/**
 * Sanitizes a title for use as a suggested download filename (Content-Disposition).
 * This is never used to build an actual filesystem path — on-disk paths always
 * live under a server-generated UUID job directory.
 */
export function sanitizeFilename(name: string, fallback = "download"): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(RESERVED_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const truncated = cleaned.slice(0, 120).trim();
  return truncated.length ? truncated : fallback;
}
