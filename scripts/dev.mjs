// `npm run dev`: opens the desktop app with `next dev` behind it (hot reload
// for everything under src/). Electron's main process itself (electron/)
// only reloads when this command is restarted.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const child = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: { ...process.env, FETCHLY_DEV: "1", FETCHLY_NODE: process.execPath },
});
child.on("exit", (code) => process.exit(code ?? 0));
