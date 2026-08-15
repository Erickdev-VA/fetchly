// Cross-platform production start: hosts like Render inject PORT and expect
// the app to bind to it, but `next start` doesn't read PORT on its own, and
// shell-specific `${PORT:-3000}` syntax breaks on Windows. Plain Node avoids both.
//
// npx/next.cmd require a shell to run on Windows, so we build a single command
// string (the officially safe way to combine shell:true with dynamic input)
// rather than an args array, and validate PORT is numeric before interpolating it.
import { spawn } from "node:child_process";

const rawPort = process.env.PORT || "3000";
const port = /^\d{1,5}$/.test(rawPort) ? rawPort : "3000";

const child = spawn(`npx next start -p ${port}`, { stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
