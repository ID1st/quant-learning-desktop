import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { createMarketDataIpcHandlers, registerMarketDataIpcHandlers } from "./marketDataIpc";
import { registerProviderDataIpcHandlers } from "./providerDataIpc";
import { registerPluginIpcHandlers } from "./pluginIpc";
import { createPluginManager } from "./pluginManager";
import { createPluginIpcHandlers } from "./pluginIpcContract";
import { createPluginRuntimeHost } from "./pluginRuntimeHost";
import { createMainSecureCredentialStore, registerSecureCredentialIpcHandlers } from "./secureCredentialIpc";
import {
  createDesktopRendererSecurityPolicy,
  isTrustedRendererUrl,
  type DesktopRendererSecurityPolicy,
} from "./electronSecurity";

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
    preloadEntry: join(__dirname, "../preload/preload.cjs"),
    rendererEntry: join(__dirname, "../renderer/index.html"),
  };
}

export function createMainWindow(securityPolicy?: DesktopRendererSecurityPolicy): BrowserWindow {
  const windowConfig = createMainWindowConfig();
  const rendererDevServer = process.env.ELECTRON_RENDERER_URL;
  const resolvedSecurityPolicy = securityPolicy ?? createDesktopRendererSecurityPolicy({
    rendererEntry: windowConfig.rendererEntry,
    rendererDevServerUrl: rendererDevServer,
  });
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
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const preventUntrustedNavigation = (event: { preventDefault(): void }, url: string) => {
    if (!isTrustedRendererUrl(url, resolvedSecurityPolicy)) event.preventDefault();
  };
  mainWindow.webContents.on("will-navigate", preventUntrustedNavigation);
  mainWindow.webContents.on("will-redirect", preventUntrustedNavigation);

  if (rendererDevServer) {
    void mainWindow.loadURL(rendererDevServer);
  } else {
    void mainWindow.loadFile(windowConfig.rendererEntry);
  }

  return mainWindow;
}

void app.whenReady().then(() => {
  const windowConfig = createMainWindowConfig();
  const securityPolicy = createDesktopRendererSecurityPolicy({
    rendererEntry: windowConfig.rendererEntry,
    rendererDevServerUrl: process.env.ELECTRON_RENDERER_URL,
  });
  const credentialStore = createMainSecureCredentialStore();
  registerMarketDataIpcHandlers(securityPolicy, createMarketDataIpcHandlers({ credentialStore }));
  registerProviderDataIpcHandlers(securityPolicy);
  registerSecureCredentialIpcHandlers(securityPolicy, credentialStore);
  const pluginManager = createPluginManager({ pluginsDirectory: join(app.getPath("userData"), "plugins") });
  const pluginRuntime = createPluginRuntimeHost({ manager: pluginManager });
  registerPluginIpcHandlers(securityPolicy, pluginManager, undefined, createPluginIpcHandlers(pluginManager, pluginRuntime));
  app.once("before-quit", () => pluginRuntime.dispose());
  createMainWindow(securityPolicy);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(securityPolicy);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
