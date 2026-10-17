import type { PlatformProvider } from "./types";

export const twitterProvider: PlatformProvider = {
  id: "twitter",
  displayName: "X",
  // t.co is deliberately absent: it's a general-purpose redirector that can
  // point anywhere, so it doesn't belong on a strict allowlist.
  hostnames: ["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"],
};
