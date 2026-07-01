const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

const isDev = Boolean(process.env.APP_XRAY_DEV_SERVER_URL);

function createMainWindow() {
  const window = new BrowserWindow({
    title: "App X-Ray",
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 720,
    backgroundColor: "#f6f8f7",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppNavigation(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });

  if (isDev) {
    window.loadURL(process.env.APP_XRAY_DEV_SERVER_URL);
    return;
  }

  window.loadFile(path.join(__dirname, "..", "app-dist", "index.html"));
}

function isAllowedAppNavigation(url) {
  if (isDev && process.env.APP_XRAY_DEV_SERVER_URL && url.startsWith(process.env.APP_XRAY_DEV_SERVER_URL)) {
    return true;
  }
  return url.startsWith("file://");
}

function openExternalUrl(url) {
  if (/^https?:\/\//.test(url)) {
    shell.openExternal(url);
  }
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
