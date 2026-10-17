/**
 * Turns off yt-dlp's "generic" extractor, the catch-all that will fetch any
 * web page. Platform extractors can hand off to whatever URL a post links
 * to — e.g. a tweet with no video but a link card makes the Twitter
 * extractor redirect to that external site — which would let a post make
 * this server request arbitrary addresses, sidestepping the hostname
 * allowlist in lib/security/url.ts. Every supported platform has its own
 * dedicated extractor, so nothing legitimate needs the generic one.
 */
export function getExtractorArgs(): string[] {
  return ["--use-extractors", "default,-generic"];
}
