// Electron main process. Shows a window right away with a local loading
// screen, boots the Next.js standalone server (built by
// scripts/build-desktop.mjs) in a utility process, and switches the window
// to it as soon as the server accepts connections. The utility process runs
// on Electron's bundled Node, so end users don't need Node/npm installed.
// This reuses the exact same server code already used for the hosted
// deployment; nothing in src/ changes for the desktop build.
const { app, BrowserWindow, dialog, utilityProcess } = require("electron");
const path = require("node:path");
const net = require("node:net");
const { execSync } = require("node:child_process");

const PORT = Number(process.env.MEDIA_DOWNLOADER_PORT || 47823);
const HOST = "127.0.0.1";
const SERVER_START_TIMEOUT_MS = 60_000;

const serverDir = app.isPackaged
  ? path.join(process.resourcesPath, "server")
  : path.join(__dirname, "..", "dist-desktop", "server");

let mainWindow = null;
let serverProcess = null;
let quitting = false;

function startServer() {
  serverProcess = utilityProcess.fork(path.join(__dirname, "server-entry.cjs"), [], {
    serviceName: "Fetchly Server",
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      // Never fall back to Next's default 0.0.0.0: that would expose the
      // downloader to the whole local network.
      HOSTNAME: HOST,
      FETCHLY_SERVER_DIR: serverDir,
      FETCHLY_COMPILE_CACHE: path.join(app.getPath("userData"), "compile-cache"),
    },
  });

  // Keep the tail of the server's output so a failed start can say why.
  let recentOutput = "";
  const collect = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    recentOutput = (recentOutput + text).slice(-2000);
  };
  serverProcess.stdout?.on("data", collect);
  serverProcess.stderr?.on("data", collect);

  return new Promise((resolve, reject) => {
    let settled = false;
    const deadline = Date.now() + SERVER_START_TIMEOUT_MS;

    serverProcess.once("exit", (code) => {
      serverProcess = null;
      if (!settled) {
        settled = true;
        reject(new Error(`The server exited with code ${code}.\n\n${recentOutput.trim()}`));
      } else if (!quitting) {
        dialog.showErrorBox("Fetchly", `The app server stopped unexpectedly.\n\n${recentOutput.trim()}`);
        app.quit();
      }
    });

    // Next listens on the port before it has finished loading, and queues
    // requests until it is ready, so an open port is the earliest moment the
    // window can navigate to it.
    const probe = () => {
      if (settled) return;
      const socket = net.connect(PORT, HOST);
      socket.once("connect", () => {
        socket.destroy();
        settled = true;
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          settled = true;
          reject(new Error(`The server did not start within ${SERVER_START_TIMEOUT_MS / 1000}s.\n\n${recentOutput.trim()}`));
        } else {
          setTimeout(probe, 50);
        }
      });
    };
    probe();
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
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
    show: false,
    backgroundColor: "#0a0a0c",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadFile(path.join(__dirname, "loading.html"));
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
    // Start the server first so it boots while the window is being created.
    const serverReady = startServer();
    createWindow();
    try {
      await serverReady;
      if (mainWindow) mainWindow.loadURL(`http://${HOST}:${PORT}`);
    } catch (err) {
      if (quitting) return;
      console.error("Failed to start the app server:", err);
      dialog.showErrorBox("Fetchly could not start", String(err?.message ?? err));
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    killStrayBinaries();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    quitting = true;
    stopServer();
    killStrayBinaries();
  });
}
