const RESERVED_CHARS = /[\/:*?"<>|\x00-\x1f]/g;
const WINDOWS_DEVICE_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_LENGTH = 120;

/**
 * Turns a video title into a file name stem (no extension) for the library.
 * Accents and other Unicode stay, so "Canción" remains "Canción"; path
 * separators and every character Windows rejects are replaced, so the
 * result can never point outside the folder it's joined to.
 */
export function safeFileStem(name: string, fallback = "Sin título"): string {
  const cleaned = name
    .normalize("NFC")
    .replace(RESERVED_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  // Cut by code points so an emoji isn't split in half; Windows also
  // rejects names ending in a dot or a space.
  const stem = Array.from(cleaned).slice(0, MAX_LENGTH).join("").replace(/[. ]+$/, "");
  if (!stem || WINDOWS_DEVICE_NAMES.test(stem)) return fallback;
  return stem;
}
