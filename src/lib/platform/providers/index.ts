import { youtubeProvider } from "./youtube";
import { tiktokProvider } from "./tiktok";
import { instagramProvider } from "./instagram";
import type { PlatformProvider } from "./types";

// To support a new platform: add a provider file with its hostnames above,
// register it here, and add a badge entry in components/PlatformBadge.tsx.
// The extraction pipeline itself (yt-dlp) needs no changes.
export const PROVIDERS: PlatformProvider[] = [youtubeProvider, tiktokProvider, instagramProvider];

export type { PlatformProvider } from "./types";
