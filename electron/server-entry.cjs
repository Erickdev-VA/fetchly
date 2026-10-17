// Entry point of the utility process that hosts the Next.js server. It runs
// in its own process so the main process stays free to paint the window
// while Next boots.
const path = require("node:path");
const nodeModule = require("node:module");

// Node's on-disk compile cache: the first launch compiles Next's server
// bundles as usual and stores the result; later launches skip most of that
// work. Entries are keyed by file content, so app updates invalidate them.
if (process.env.FETCHLY_COMPILE_CACHE && typeof nodeModule.enableCompileCache === "function") {
  try {
    nodeModule.enableCompileCache(process.env.FETCHLY_COMPILE_CACHE);
  } catch {
    // purely an optimization
  }
}

// server.js is Next's generated standalone server. It chdir()s into its own
// folder, which is also where bin/ and ffmpeg-static live, so the binary
// paths in src/lib/ytdlp/binary.ts resolve without changes.
require(path.join(process.env.FETCHLY_SERVER_DIR, "server.js"));
