// Electron main process. Shows a window right away with a local loading
// screen, boots the Next.js server and switches the window to it as soon as
// the server accepts connections. Closing the window only hides it: the app
// keeps running from the tray (icon next to the clock) until "Salir".
//
// - Installed app / `npm run electron:preview`: the standalone server built
//   by scripts/build-desktop.mjs, run in a utility process on Electron's
//   bundled Node, so end users don't need Node/npm installed.
// - `npm run dev` (FETCHLY_DEV=1): `next dev` with hot reload.
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, screen, shell, utilityProcess } = require("electron");
const path = require("node:path");
const net = require("node:net");
const fs = require("node:fs");
const { execSync, execFile, spawn } = require("node:child_process");
const { mediaIcons } = require("./media-icons.cjs");

// "Fetchly" instead of the npm package name for %APPDATA%\Fetchly. Must run
// before anything reads userData (the single-instance lock included).
// FETCHLY_TEST_PROFILE=1 swaps in a separate "Fetchly-test" profile and
// library (and, packaged, its own port), so tests can run beside the real
// Fetchly without touching the user's songs. Nothing sets it for users.
const testProfile = process.env.FETCHLY_TEST_PROFILE === "1";
const profileName = testProfile ? "Fetchly-test" : "Fetchly";
app.setName("Fetchly");
app.setPath("userData", path.join(app.getPath("appData"), profileName));

// Chromium pauses muted media in a window that's hidden or covered by other
// windows ("to save power"). Fetchly's music lives in exactly such a window
// while it sits in the tray, so muting it there would stop the song.
app.commandLine.appendSwitch("disable-background-media-suspend");
// Hooks navigator.mediaSession up to Windows: the media overlay next to the
// volume flyout and the keyboard's play/pause/next/previous keys. Electron
// leaves both off unless asked.
app.commandLine.appendSwitch("enable-features", "MediaSessionService,HardwareMediaKeyHandling");

const isDev = process.env.FETCHLY_DEV === "1" && !app.isPackaged;
const PORT = Number(process.env.MEDIA_DOWNLOADER_PORT || (isDev ? 47824 : testProfile ? 47833 : 47823));
const HOST = "127.0.0.1";
const APP_ORIGIN = `http://${HOST}:${PORT}`;
const SERVER_START_TIMEOUT_MS = isDev ? 120_000 : 60_000;

const projectRoot = path.join(__dirname, "..");
const serverDir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(projectRoot, "dist-desktop", "server");

const dataDir = app.getPath("userData");
const defaultLibraryDir = path.join(app.getPath("documents"), profileName);
const settingsPath = path.join(dataDir, "settings.json");
// Keep in sync with src/lib/library/paths.ts.
const CATEGORY_DIRS = { music: "Música", video: "Videos" };

const statePath = path.join(dataDir, "desktop-state.json");

let mainWindow = null;
let miniWindow = null;
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
    FETCHLY_LIBRARY_DIR: defaultLibraryDir,
    FETCHLY_VERSION: app.getVersion(),
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
    sendToMini();
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

function sendPlayerCommand(command) {
  mainWindow?.webContents.send("player:command", typeof command === "string" ? { type: command } : command);
}

const finiteNumber = (value, fallback) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** The page's PlayerSnapshot, keeping only known fields with the right types. */
function readSnapshot(value) {
  if (typeof value !== "object" || value === null) return null;
  const track = value.track;
  const duration = finiteNumber(value.duration, null);
  return {
    track:
      typeof track === "object" && track !== null && typeof track.title === "string" && typeof track.id === "string"
        ? {
            id: track.id.slice(0, 64),
            title: track.title.slice(0, 200),
            artist: typeof track.artist === "string" ? track.artist.slice(0, 200) : null,
            hasThumbnail: track.hasThumbnail === true,
          }
        : null,
    playing: value.playing === true,
    position: Math.max(0, finiteNumber(value.position, 0)),
    positionAt: finiteNumber(value.positionAt, Date.now()),
    duration: duration !== null && duration > 0 ? duration : null,
    volume: Math.min(1, Math.max(0, finiteNumber(value.volume, 1))),
    muted: value.muted === true,
    shuffle: value.shuffle === true,
    repeat: ["off", "all", "one"].includes(value.repeat) ? value.repeat : "off",
    hasPrevious: value.hasPrevious === true,
    hasNext: value.hasNext === true,
  };
}

/** What the taskbar buttons and the tray menu show; they're rebuilt only when this changes. */
function controlsKey(state) {
  if (!state?.track) return "";
  return JSON.stringify([state.track.title, state.track.artist, state.playing, state.hasPrevious, state.hasNext]);
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
  const controlsChanged = controlsKey(next) !== controlsKey(playerState);
  playerState = next;
  sendToMini();
  if (controlsChanged) {
    updateThumbar();
    updateTrayMenu();
  }
});

// --- mini player: a small always-on-top remote control ---------------------
// It never plays anything itself: it mirrors playerState and sends commands
// to the main window, which keeps the only <audio>.

const MINI_DEFAULT_SIZE = { width: 400, height: 128 };
const MINI_MIN_SIZE = { width: 200, height: 72 };
const MINI_MARGIN = 24;

function miniPinned() {
  return readState().miniPinned !== false;
}

/** The saved bounds if they're still on a connected screen, else the bottom-right corner of the main one. */
function miniBounds() {
  const saved = readState().miniBounds;
  if (saved && [saved.x, saved.y, saved.width, saved.height].every((n) => Number.isFinite(n))) {
    const width = Math.max(MINI_MIN_SIZE.width, Math.round(saved.width));
    const height = Math.max(MINI_MIN_SIZE.height, Math.round(saved.height));
    const bounds = { x: Math.round(saved.x), y: Math.round(saved.y), width, height };
    // Enough of it, the top edge included, must be on some screen to grab it.
    const visible = screen.getAllDisplays().some(({ workArea: a }) => {
      const overlapX = Math.min(bounds.x + width, a.x + a.width) - Math.max(bounds.x, a.x);
      const topInside = bounds.y >= a.y && bounds.y < a.y + a.height - 32;
      return topInside && overlapX >= 80;
    });
    if (visible) return bounds;
  }
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(saved?.width > 0 ? Math.round(saved.width) : MINI_DEFAULT_SIZE.width, workArea.width - MINI_MARGIN * 2);
  const height = Math.min(saved?.height > 0 ? Math.round(saved.height) : MINI_DEFAULT_SIZE.height, workArea.height - MINI_MARGIN * 2);
  return {
    x: workArea.x + workArea.width - width - MINI_MARGIN,
    y: workArea.y + workArea.height - height - MINI_MARGIN,
    width: Math.max(MINI_MIN_SIZE.width, width),
    height: Math.max(MINI_MIN_SIZE.height, height),
  };
}

function sendToMini() {
  miniWindow?.webContents.send("mini:state", playerState);
}

function openMini() {
  if (miniWindow) {
    miniWindow.show();
    miniWindow.focus();
    return;
  }
  const pinned = miniPinned();
  const bounds = miniBounds();
  miniWindow = new BrowserWindow({
    ...bounds,
    minWidth: MINI_MIN_SIZE.width,
    minHeight: MINI_MIN_SIZE.height,
    frame: false,
    show: false,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: pinned,
    title: "Fetchly · Mini reproductor",
    icon: path.join(__dirname, "assets", "icon.png"),
    backgroundColor: "#121216",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // With display scaling (125 %, say) a frameless window comes out a few
  // pixels bigger than asked, so it would grow on every reopen. Ask again,
  // minus the difference.
  miniWindow.setBounds(bounds);
  const actual = miniWindow.getBounds();
  if (actual.width !== bounds.width || actual.height !== bounds.height) {
    miniWindow.setBounds({
      ...bounds,
      width: bounds.width - (actual.width - bounds.width),
      height: bounds.height - (actual.height - bounds.height),
    });
  }
  // "floating" keeps it above normal windows without covering menus and the like.
  if (pinned) miniWindow.setAlwaysOnTop(true, "floating");
  miniWindow.once("ready-to-show", () => miniWindow?.show());

  const saveBounds = () => {
    if (miniWindow && !miniWindow.isDestroyed()) writeState({ miniBounds: miniWindow.getBounds() });
  };
  miniWindow.on("moved", saveBounds);
  miniWindow.on("resized", saveBounds);
  miniWindow.on("close", saveBounds);
  miniWindow.on("closed", () => {
    miniWindow = null;
  });

  miniWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  miniWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/mini`)) event.preventDefault();
  });
  miniWindow.loadURL(`${APP_ORIGIN}/mini`);
}

function fromMini(event) {
  return fromApp(event) && event.sender === miniWindow?.webContents;
}

/** The commands the mini may send, rebuilt so nothing else rides along. */
function readMiniCommand(value) {
  if (typeof value !== "object" || value === null) return null;
  if (["toggle", "next", "previous", "toggleMute"].includes(value.type)) return { type: value.type };
  if (value.type === "seek" && Number.isFinite(value.seconds) && value.seconds >= 0) return { type: "seek", seconds: value.seconds };
  if (value.type === "volume" && Number.isFinite(value.volume)) return { type: "volume", volume: Math.min(1, Math.max(0, value.volume)) };
  return null;
}

ipcMain.on("mini:open", (event) => {
  if (fromApp(event) && event.sender === mainWindow?.webContents) openMini();
});

ipcMain.handle("mini:get-state", (event) => {
  if (!fromMini(event)) return null;
  return { player: playerState, pinned: miniPinned() };
});

ipcMain.on("mini:command", (event, value) => {
  if (!fromMini(event)) return;
  const command = readMiniCommand(value);
  if (command) sendPlayerCommand(command);
});

ipcMain.handle("mini:set-pinned", (event, pinned) => {
  if (!fromMini(event) || typeof pinned !== "boolean") return miniPinned();
  writeState({ miniPinned: pinned });
  miniWindow.setAlwaysOnTop(pinned, "floating");
  return pinned;
});

ipcMain.on("mini:close", (event) => {
  if (fromMini(event)) miniWindow.close();
});

ipcMain.on("mini:show-app", (event) => {
  if (fromMini(event)) showMainWindow();
});

// --- IPC: the functions preload.cjs exposes to the page -------------------

function fromApp(event) {
  return event.senderFrame?.url?.startsWith(APP_ORIGIN) ?? false;
}

/**
 * The library folder: the one chosen in Ajustes (the server writes it to
 * settings.json, see src/lib/settings.ts) or Documentos\Fetchly. Read on
 * every call, so a move made by the server applies right away.
 */
function libraryDir() {
  try {
    const { libraryDir: chosen } = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (typeof chosen === "string" && path.isAbsolute(chosen)) return chosen;
  } catch {
    // no settings yet
  }
  return defaultLibraryDir;
}

function insideLibrary(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) return false;
  const relative = path.relative(libraryDir(), path.resolve(filePath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

// "root" opens the library folder itself (Ajustes).
ipcMain.handle("library:open-folder", async (event, category) => {
  if (!fromApp(event) || (category !== "root" && !Object.hasOwn(CATEGORY_DIRS, category))) return false;
  const dir = category === "root" ? libraryDir() : path.join(libraryDir(), CATEGORY_DIRS[category]);
  fs.mkdirSync(dir, { recursive: true });
  return (await shell.openPath(dir)) === "";
});

/** Ajustes: the folder picker for "Cambiar…" and "Importar carpeta". Resolves to the path, or null if cancelled. */
ipcMain.handle("dialog:choose-folder", async (event, purpose) => {
  if (!fromApp(event) || event.sender !== mainWindow?.webContents) return null;
  const titles = { library: "Elige dónde guardar la biblioteca", import: "Elige la carpeta que quieres importar" };
  if (!Object.hasOwn(titles, purpose)) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: titles[purpose],
    properties: ["openDirectory", ...(purpose === "library" ? ["createDirectory"] : [])],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
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
