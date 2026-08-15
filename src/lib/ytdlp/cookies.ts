import { existsSync } from "node:fs";

/**
 * Optional path to a Netscape-format cookies file, used to authenticate
 * yt-dlp requests as a logged-in session. Needed for platforms (mainly
 * YouTube) that block anonymous requests from cloud/datacenter IPs with a
 * "confirm you're not a bot" challenge — passing cookies from a real
 * browser session works around that. Configure via the YTDLP_COOKIES_FILE
 * env var (e.g. pointing at a Render "Secret File"). Absent by default, in
 * which case yt-dlp just runs unauthenticated as before.
 */
export function getCookiesArgs(): string[] {
  const cookiesPath = process.env.YTDLP_COOKIES_FILE;
  if (!cookiesPath || !existsSync(cookiesPath)) return [];
  return ["--cookies", cookiesPath];
}
