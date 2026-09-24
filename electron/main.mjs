import { app, BrowserWindow, session } from "electron";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeDirectory = await mkdtemp(join(tmpdir(), "harmonic-lens-"));
const devServerArgument = process.argv.find((argument) => argument.startsWith("--dev-server-url="));
const devServerUrl = devServerArgument?.slice("--dev-server-url=".length);
let mainWindow;
let cleanupStarted = false;

// All Chromium profile state is transient. No preferences, recordings, or caches persist.
app.setPath("userData", join(runtimeDirectory, "user-data"));
app.setPath("cache", join(runtimeDirectory, "cache"));
app.setPath("sessionData", join(runtimeDirectory, "session"));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 580,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(join(appDirectory, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const pageUrl = webContents.getURL();
    const trustedPage = pageUrl.startsWith("file:") || (devServerUrl !== undefined && pageUrl.startsWith(devServerUrl));
    callback(permission === "media" && trustedPage);
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
