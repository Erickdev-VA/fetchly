// The only bridge between the page and Electron. The page gets a few named
// functions, never ipcRenderer or Node itself; main.cjs re-checks every call
// (who sent it, and that any path stays inside the library folder).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fetchly", {
  isDesktop: true,
  /** Opens Documentos\Fetchly\Música or \Videos in Explorer. */
  openLibraryFolder: (category) => ipcRenderer.invoke("library:open-folder", category),
  /** Opens Explorer with the file selected. */
  showItemInFolder: (filePath) => ipcRenderer.invoke("library:show-item", filePath),
  /** Sends a library file to the Recycle Bin. */
  trashItem: (filePath) => ipcRenderer.invoke("library:trash-item", filePath),
  player: {
    publishState: (snapshot) => ipcRenderer.send("player:state", snapshot),
    /** Commands from the taskbar thumbnail and the tray. Returns the unsubscribe function. */
    onCommand: (listener) => {
      // The page only ever sees the command, never the IPC event.
      const wrapped = (_event, command) => listener(command);
      ipcRenderer.on("player:command", wrapped);
      return () => ipcRenderer.removeListener("player:command", wrapped);
    },
  },
  mini: {
    /** From the main window: opens the mini player (or brings it forward). */
    open: () => ipcRenderer.send("mini:open"),
    // The rest only answer the mini player's own window.
    getState: () => ipcRenderer.invoke("mini:get-state"),
    /** What's playing, each time it changes. Returns the unsubscribe function. */
    onState: (listener) => {
      const wrapped = (_event, state) => listener(state);
      ipcRenderer.on("mini:state", wrapped);
      return () => ipcRenderer.removeListener("mini:state", wrapped);
    },
    command: (command) => ipcRenderer.send("mini:command", command),
    setPinned: (pinned) => ipcRenderer.invoke("mini:set-pinned", pinned),
    close: () => ipcRenderer.send("mini:close"),
    showApp: () => ipcRenderer.send("mini:show-app"),
  },
});
