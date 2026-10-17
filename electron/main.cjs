// Electron main process. Shows a window right away with a local loading
// screen, boots the Next.js server and switches the window to it as soon as
// the server accepts connections. Closing the window only hides it: the app
// keeps running from the tray (icon next to the clock) until "Salir".
//
// - Installed app / `npm run electron:preview`: the standalone server built
//   by scripts/build-desktop.mjs, run in a utility process on Electron's
//   bundled Node, so end users don't need Node/npm installed.
// - `npm run dev` (FETCHLY_DEV=1): `next dev` with hot reload.
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, shell, utilityProcess } = require("electron");
const path = require("node:path");
const net = require("node:net");
const fs = require("node:fs");
const { execSync, execFile, spawn } = require("node:child_process");
const { mediaIcons } = require("./media-icons.cjs");

// "Fetchly" instead of the npm package name for %APPDATA%\Fetchly. Must run
// before anything reads userData (the single-instance lock included).
app.setName("Fetchly");
app.setPath("userData", path.join(app.getPath("appData"), "Fetchly"));

// Chromium pauses muted media in a window that's hidden or covered by other
// windows ("to save power"). Fetchly's music lives in exactly such a window
// while it sits in the tray, so muting it there would stop the song.
app.commandLine.appendSwitch("disable-background-media-suspend");
// Hooks navigator.mediaSession up to Windows: the media overlay next to the
// volume flyout and the keyboard's play/pause/next/previous keys. Electron
// leaves both off unless asked.
app.commandLine.appendSwitch("enable-features", "MediaSessionService,HardwareMediaKeyHandling");

const isDev = process.env.FETCHLY_DEV === "1" && !app.isPackaged;
const PORT = Number(process.env.MEDIA_DOWNLOADER_PORT || (isDev ? 47824 : 47823));
const HOST = "127.0.0.1";
const APP_ORIGIN = `http://${HOST}:${PORT}`;
const SERVER_START_TIMEOUT_MS = isDev ? 120_000 : 60_000;

const projectRoot = path.join(__dirname, "..");
const serverDir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(projectRoot, "dist-desktop", "server");

const dataDir = app.getPath("userData");
const libraryDir = path.join(app.getPath("documents"), "Fetchly");
// Keep in sync with src/lib/library/paths.ts.
const CATEGORY_DIRS = { music: "Música", video: "Videos" };

const statePath = path.join(dataDir, "desktop-state.json");

let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverReady = false;
let quitting = false;
/** The last state the page reported (see PlayerSnapshot in src/lib/player/types.ts). */
let playerState = null;

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function writeState(patch) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ ...readState(), ...patch }, null, 2));
  } catch {
    // only remembers UI hints, nothing important
  }
}

function serverEnv() {
  return {
    ...process.env,
    PORT: String(PORT),
    // Never fall back to Next's default 0.0.0.0: that would expose the app
    // to the whole local network.
    HOSTNAME: HOST,
    FETCHLY_DATA_DIR: dataDir,
    FETCHLY_LIBRARY_DIR: libraryDir,
  };
}

function spawnServer() {
  if (isDev) {
    return spawn(process.env.FETCHLY_NODE || "node", [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "dev", "-H", HOST, "-p", String(PORT)], {
      cwd: projectRoot,
      env: serverEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }
  return utilityProcess.fork(path.join(__dirname, "server-entry.cjs"), [], {
    serviceName: "Fetchly Server",
    stdio: "pipe",
    env: {
      ...serverEnv(),
      NODE_ENV: "production",
      FETCHLY_SERVER_DIR: serverDir,
      FETCHLY_COMPILE_CACHE: path.join(dataDir, "compile-cache"),
    },
  });
}

function startServer() {
  serverProcess = spawnServer();

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
        reject(new Error(`El servidor se cerró con el código ${code}.\n\n${recentOutput.trim()}`));
      } else if (!quitting) {
        dialog.showErrorBox("Fetchly", `El servidor de la app se detuvo inesperadamente.\n\n${recentOutput.trim()}`);
        quitApp();
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
          reject(new Error(`El servidor no arrancó en ${SERVER_START_TIMEOUT_MS / 1000} s.\n\n${recentOutput.trim()}`));
        } else {
          setTimeout(probe, 50);
        }
      });
    };
    probe();
  });
}

function stopServer() {
  if (!serverProcess) return;
  if (isDev && process.platform === "win32" && serverProcess.pid) {
    // `next dev` runs its own worker processes; take down the whole tree.
    execFile("taskkill", ["/PID", String(serverProcess.pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    serverProcess.kill();
  }
  serverProcess = null;
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

function showMainWindow() {
  if (!mainWindow) {
    // The page can close its own window (window.close() bypasses the "close"
    // event that hides it), so build a fresh one rather than do nothing.
    if (quitting) return;
    createWindow();
    if (serverReady) mainWindow.loadURL(APP_ORIGIN);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApp() {
  quitting = true;
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: "Fetchly",
    icon: path.join(__dirname, "assets", "icon.png"),
    backgroundColor: "#0a0a0c",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The window keeps playing music and polling downloads while hidden
      // in the tray; don't let Chromium throttle it.
      backgroundThrottling: false,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // The X hides to the tray; only "Salir" really quits.
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!readState().trayHintShown && tray) {
      tray.displayBalloon({
        iconType: "info",
        title: "Fetchly sigue abierto",
        content: "Está junto al reloj. Para cerrarlo del todo: clic derecho en el icono → Salir.",
      });
      writeState({ trayHintShown: true });
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    // Its music stopped with it.
    playerState = null;
    updateTrayMenu();
  });
  // Windows drops the thumbnail buttons whenever the window is hidden.
  mainWindow.on("show", updateThumbar);

  // Links to other sites open in the real browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(APP_ORIGIN)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(APP_ORIGIN) || url.startsWith("file:")) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });

  mainWindow.loadFile(path.join(__dirname, "loading.html"));
}

function createTray() {
  tray = new Tray(path.join(__dirname, "assets", "tray.png"));
  updateTrayMenu();
  tray.on("click", showMainWindow);
}

// --- player: taskbar thumbnail buttons and tray controls --------------------
// The music plays in the main window's page. These only send it commands
// and show what it last reported.

function sendPlayerCommand(type) {
  mainWindow?.webContents.send("player:command", { type });
}

/** Keeps only the fields the main process uses, with the right types. */
function readSnapshot(value) {
  if (typeof value !== "object" || value === null) return null;
  const track = value.track;
  return {
    track:
      typeof track === "object" && track !== null && typeof track.title === "string"
        ? { title: track.title.slice(0, 200), artist: typeof track.artist === "string" ? track.artist.slice(0, 200) : null }
        : null,
    playing: value.playing === true,
    hasPrevious: value.hasPrevious === true,
    hasNext: value.hasNext === true,
  };
}

function updateThumbar() {
  if (!mainWindow || process.platform !== "win32") return;
  if (!playerState?.track) {
    mainWindow.setThumbarButtons([]);
    return;
  }
  const icons = mediaIcons();
  const flags = (enabled) => (enabled ? ["enabled"] : ["disabled"]);
  mainWindow.setThumbarButtons([
    { tooltip: "Anterior", icon: icons.previous, flags: flags(playerState.hasPrevious), click: () => sendPlayerCommand("previous") },
    {
      tooltip: playerState.playing ? "Pausar" : "Reproducir",
      icon: playerState.playing ? icons.pause : icons.play,
      click: () => sendPlayerCommand("toggle"),
    },
    { tooltip: "Siguiente", icon: icons.next, flags: flags(playerState.hasNext), click: () => sendPlayerCommand("next") },
  ]);
}

function updateTrayMenu() {
  if (!tray) return;
  const track = playerState?.track ?? null;
  // "&" marks a keyboard shortcut in Windows menus; "&&" shows a real one.
  const menuText = (text) => text.replace(/&/g, "&&");
  const nowPlaying = track ? `${track.title}${track.artist ? ` — ${track.artist}` : ""}` : null;
  tray.setToolTip(nowPlaying ? `Fetchly · ${nowPlaying}`.slice(0, 127) : "Fetchly");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...(nowPlaying ? [{ label: menuText(nowPlaying.slice(0, 60)), enabled: false }] : []),
      {
        label: playerState?.playing ? "Pausar" : "Reproducir",
        enabled: Boolean(track),
        click: () => sendPlayerCommand("toggle"),
      },
      { label: "Siguiente", enabled: Boolean(track && playerState.hasNext), click: () => sendPlayerCommand("next") },
      { label: "Anterior", enabled: Boolean(track && playerState.hasPrevious), click: () => sendPlayerCommand("previous") },
      { type: "separator" },
      { label: "Mostrar Fetchly", click: showMainWindow },
      { type: "separator" },
      { label: "Salir", click: quitApp },
    ]),
  );
}

ipcMain.on("player:state", (event, value) => {
  if (!fromApp(event) || event.sender !== mainWindow?.webContents) return;
  const next = readSnapshot(value);
  // Only rebuild the menu and buttons when something they show changed.
  if (JSON.stringify(next) === JSON.stringify(playerState)) return;
  playerState = next;
  updateThumbar();
  updateTrayMenu();
});

// --- IPC: the functions preload.cjs exposes to the page -------------------

function fromApp(event) {
  return event.senderFrame?.url?.startsWith(APP_ORIGIN) ?? false;
}

function insideLibrary(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) return false;
  const relative = path.relative(libraryDir, path.resolve(filePath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

ipcMain.handle("library:open-folder", async (event, category) => {
  if (!fromApp(event) || !Object.hasOwn(CATEGORY_DIRS, category)) return false;
  const dir = path.join(libraryDir, CATEGORY_DIRS[category]);
  fs.mkdirSync(dir, { recursive: true });
  return (await shell.openPath(dir)) === "";
});

ipcMain.handle("library:show-item", (event, filePath) => {
  if (!fromApp(event) || !insideLibrary(filePath) || !fs.existsSync(filePath)) return false;
  shell.showItemInFolder(path.resolve(filePath));
  return true;
});

// True once the file is in the Recycle Bin, or if it was already gone (moved
// or deleted outside the app); the page then drops it from the library.
ipcMain.handle("library:trash-item", async (event, filePath) => {
  if (!fromApp(event) || !insideLibrary(filePath)) return false;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return true;
  try {
    await shell.trashItem(resolved);
    return true;
  } catch (err) {
    console.error("Moving to the Recycle Bin failed:", err);
    return false;
  }
});

// --- lifecycle --------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Opening Fetchly again while it runs in the tray brings the window back.
  app.on("second-instance", showMainWindow);

  app.whenReady().then(async () => {
    // Start the server first so it boots while the window is being created.
    const serverStarting = startServer();
    createWindow();
    createTray();
    try {
      await serverStarting;
      serverReady = true;
      if (mainWindow) mainWindow.loadURL(APP_ORIGIN);
    } catch (err) {
      if (quitting) return;
      console.error("Failed to start the app server:", err);
      dialog.showErrorBox("Fetchly no pudo iniciar", String(err?.message ?? err));
      quitApp();
    }
  });

  // Windows are only destroyed when quitting, so this never ends the app on
  // its own; "Salir" in the tray does.
  app.on("window-all-closed", () => {});

  app.on("before-quit", () => {
    quitting = true;
    stopServer();
    killStrayBinaries();
  });
}
