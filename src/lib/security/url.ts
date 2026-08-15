import dns from "node:dns/promises";
import net from "node:net";
import { detectPlatform } from "../platform/detector";
import { AppError } from "../errors";
import type { Platform } from "../platform/types";

const MAX_URL_LENGTH = 2048;

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isPrivateOrReservedIpv4(ip);
  if (type === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.split(":").pop();
      if (v4 && net.isIP(v4) === 4) return isPrivateOrReservedIpv4(v4);
    }
    return false;
  }
  return true; // not a recognizable IP literal at all -> treat as unsafe
}

export interface ValidatedUrl {
  url: URL;
  platform: Platform;
}

/**
 * Validates a user-supplied URL and resolves the platform it belongs to.
 * Acts as the app's main SSRF boundary: only http(s) URLs on an exact
 * hostname allowlist are accepted, and DNS resolution is checked against
 * private/reserved IP ranges as defense-in-depth against DNS rebinding.
 */
export async function validateAndDetectPlatform(rawUrl: unknown): Promise<ValidatedUrl> {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new AppError("INVALID_URL");
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new AppError("INVALID_URL");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new AppError("INVALID_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("INVALID_URL");
  }
  if (url.username || url.password) {
    throw new AppError("INVALID_URL");
  }
  if (net.isIP(url.hostname)) {
    throw new AppError("UNSUPPORTED_PLATFORM");
  }

  const platform = detectPlatform(url.hostname);
  if (!platform) {
    throw new AppError("UNSUPPORTED_PLATFORM");
  }

  try {
    const records = await dns.lookup(url.hostname, { all: true });
    if (records.length === 0 || records.some((r) => isPrivateOrReservedIp(r.address))) {
      throw new AppError("UNSUPPORTED_PLATFORM");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("INVALID_URL", "Couldn't resolve this link.");
  }

  return { url, platform };
}
