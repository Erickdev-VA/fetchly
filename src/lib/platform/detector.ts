import { PROVIDERS } from "./providers";
import type { Platform } from "./types";

/**
 * Strict hostname allowlist. Anything not matching an exact hostname here is
 * rejected before any network call is made — this is the app's primary SSRF
 * boundary in addition to the IP/DNS checks in lib/security/url.ts.
 */
export function detectPlatform(hostname: string): Platform | null {
  const host = hostname.toLowerCase();
  for (const provider of PROVIDERS) {
    if (provider.hostnames.includes(host)) return provider.id;
  }
  return null;
}

export function getProviderDisplayName(platform: Platform): string {
  return PROVIDERS.find((p) => p.id === platform)?.displayName ?? platform;
}
