import { app, BrowserWindow, Menu, session, systemPreferences } from "electron";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { allowsMicrophoneCheck, allowsMicrophonePermission } from "./security.mjs";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeDirectory = await mkdtemp(join(tmpdir(), "harmonic-lens-"));
const devServerArgument = process.argv.find((argument) => argument.startsWith("--dev-server-url="));
const devServerUrl = devServerArgument?.slice("--dev-server-url=".length);
const trustedFileUrl = pathToFileURL(join(appDirectory, "..", "dist", "index.html")).href;
let mainWindow;
let cleanupStarted = false;

// Only the cache is transient. The default profile directory stays, because it is where the app's few preferences
// (voice type, range, microphone calibration) live in localStorage; no audio or recordings are ever written.
app.setPath("cache", join(runtimeDirectory, "cache"));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 580,
    title: "Harmonic Lens",
    backgroundColor: "#0b0e13", // matches the page, so there is no white flash before it paints
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  // The app is a single local page: it never opens windows, and it never navigates away from itself.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const strip = (u) => { try { const x = new URL(u); x.hash = ""; x.search = ""; return x.href; } catch { return u; } };
    if (strip(url) !== strip(mainWindow.webContents.getURL())) event.preventDefault();
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(join(appDirectory, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  // No stock File/Edit/View menu on Windows and Linux; macOS keeps a minimal one (Quit, copy and paste, window).
  Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]) : null);
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _requestingOrigin, details) => {
    return allowsMicrophoneCheck({
      permission,
      pageUrl: webContents?.getURL() ?? "",
      requestingUrl: details?.requestingUrl,
      isMainFrame: details?.isMainFrame,
      requestWebContentsId: webContents?.id,
      mainWebContentsId: mainWindow?.webContents.id,
      trustedFileUrl,
      devServerUrl,
      mediaType: details?.mediaType
    });
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const allowedByPolicy = allowsMicrophonePermission({
      permission,
      pageUrl: webContents.getURL(),
      requestingUrl: details.requestingUrl,
      isMainFrame: details.isMainFrame,
      requestWebContentsId: webContents.id,
      mainWebContentsId: mainWindow?.webContents.id,
      trustedFileUrl,
      devServerUrl,
      mediaTypes: details.mediaTypes
    });
    if (!allowedByPolicy || process.platform !== "darwin") {
      callback(allowedByPolicy);
      return;
    }

    // Chromium permission and macOS TCC are independent gates. Request TCC only
    // after the trusted renderer asks for microphone access from a user action.
    void systemPreferences.askForMediaAccess("microphone")
      .then(callback)
      .catch(() => callback(false));
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", (event) => {
  if (cleanupStarted) return;
  cleanupStarted = true;
  event.preventDefault();
  void rm(runtimeDirectory, { recursive: true, force: true }).finally(() => app.exit(0));
});
