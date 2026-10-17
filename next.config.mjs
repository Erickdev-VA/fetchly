// Plain .mjs (not .ts) on purpose: a next.config.ts has to be transpiled with
// the native SWC binary every time the server boots, which alone cost ~1.5s
// of the desktop app's startup.

/** @type {import("next").NextConfig} */
const nextConfig = {
  // The desktop build (scripts/build-desktop.mjs) sets this to get a
  // self-contained server with only the node_modules it actually needs,
  // instead of shipping the whole 400MB+ node_modules folder. The hosted
  // deployment keeps the regular `next start` output.
  ...(process.env.FETCHLY_DESKTOP_BUILD === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
