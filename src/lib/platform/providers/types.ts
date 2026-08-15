import type { Platform } from "../types";

export interface PlatformProvider {
  id: Platform;
  displayName: string;
  /** Exact hostnames this provider matches (used as a strict allowlist). */
  hostnames: string[];
}
