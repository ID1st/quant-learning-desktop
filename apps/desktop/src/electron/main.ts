import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { createMarketDataIpcHandlers, registerMarketDataIpcHandlers } from "./marketDataIpc";
import { registerProviderDataIpcHandlers } from "./providerDataIpc";
import { createMainSecureCredentialStore, registerSecureCredentialIpcHandlers } from "./secureCredentialIpc";

export interface DesktopWindowOptions {
  title: string;
  width: number;
  height: number;
  preloadEntry: string;
  rendererEntry: string;
}

export function createMainWindowConfig(): DesktopWindowOptions {
  return {
    title: "量化学习桌面版",
    width: 1440,
    height: 960,
    preloadEntry: join(__dirname, "../preload/preload.mjs"),
    rendererEntry: join(__dirname, "../renderer/index.html"),
  };
}

export function createMainWindow(): BrowserWindow {
  const windowConfig = createMainWindowConfig();
  const mainWindow = new BrowserWindow({
    title: windowConfig.title,
    width: windowConfig.width,
    height: windowConfig.height,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#071019",
    webPreferences: {
      preload: windowConfig.preloadEntry,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const rendererDevServer = process.env.ELECTRON_RENDERER_URL;

  if (rendererDevServer) {
    void mainWindow.loadURL(rendererDevServer);
  } else {
    void mainWindow.loadFile(windowConfig.rendererEntry);
  }

  return mainWindow;
}

void app.whenReady().then(() => {
  const credentialStore = createMainSecureCredentialStore();
  registerMarketDataIpcHandlers(createMarketDataIpcHandlers({ credentialStore }));
  registerProviderDataIpcHandlers();
  registerSecureCredentialIpcHandlers(credentialStore);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
