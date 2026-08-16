// Electron main process. Runs the Next.js server in-process (via Next's
// programmatic API, no separate `npx`/child process needed — important
// because end users installing the packaged app won't have Node/npm on
// PATH) and opens a window pointing at it. This reuses the exact same
// server code already used for the hosted deployment; nothing in src/
// changes for the desktop build.
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const http = require("node:http");
const { execSync } = require("node:child_process");

const isPackaged = app.isPackaged;
const appRoot = isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");

// binary.ts resolves the yt-dlp/ffmpeg paths off process.cwd(), so make sure
// it points at the app root regardless of how the app was launched.
process.chdir(appRoot);

const PORT = Number(process.env.MEDIA_DOWNLOADER_PORT || 47823);

let mainWindow = null;
let httpServer = null;

async function startServer() {
  process.env.NODE_ENV = "production";
  const next = require(path.join(appRoot, "node_modules", "next"));
  const nextApp = next({ dev: false, dir: appRoot });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  httpServer = http.createServer((req, res) => handle(req, res));
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(PORT, "127.0.0.1", resolve);
  });
}

function killStrayBinaries() {
  if (process.platform !== "win32") return;
  for (const name of ["yt-dlp.exe", "ffmpeg.exe"]) {
    try {
      execSync(`taskkill /IM ${name} /F`, { stdio: "ignore" });
    } catch {
      // nothing running under that name, fine
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: "#0a0a0c",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startServer();
      createWindow();
    } catch (err) {
      console.error("Failed to start the app server:", err);
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    killStrayBinaries();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", killStrayBinaries);
}
