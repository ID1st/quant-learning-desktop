import { app, BrowserWindow, powerMonitor } from "electron";
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
import { registerAuthIpcHandlers } from "./authIpc";
import { createMainAuthSessionManager } from "./mainAuth";
import type { AuthSessionManager } from "./authSessionManager";

function configureAuthLifecycle(manager: AuthSessionManager): () => void {
  let expiryTimer: NodeJS.Timeout | null = null;
  const scheduleExpiryCheck = manager.subscribe((state) => {
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
    if (!state.session) {
      return;
    }
    const deadline = Math.min(
      Date.parse(state.session.entitlementEndsAt),
      Date.parse(state.session.offlineUntil),
    );
    const delay = Math.min(
      Math.max(deadline - Date.now() + 250, 250),
      2_147_000_000,
    );
    expiryTimer = setTimeout(() => {
      void manager.revalidate();
    }, delay);
    expiryTimer.unref();
  });
  const handleResume = () => {
    void manager.revalidate();
  };
  powerMonitor.on("resume", handleResume);
  const recoveryTimer = setInterval(() => {
    void manager.getSnapshot().then((result) => {
      if (
        result.ok &&
        (result.data.phase === "AUTHENTICATED_OFFLINE" ||
          result.data.phase === "SERVICE_UNAVAILABLE")
      ) {
        void manager.revalidate();
      }
    });
  }, 30_000);
  recoveryTimer.unref();

  return () => {
    scheduleExpiryCheck();
    powerMonitor.removeListener("resume", handleResume);
    clearInterval(recoveryTimer);
    if (expiryTimer) {
      clearTimeout(expiryTimer);
    }
  };
}

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

void app.whenReady().then(async () => {
  const windowConfig = createMainWindowConfig();
  const securityPolicy = createDesktopRendererSecurityPolicy({
    rendererEntry: windowConfig.rendererEntry,
    rendererDevServerUrl: process.env.ELECTRON_RENDERER_URL,
  });
  const credentialStore = createMainSecureCredentialStore();
  const authManager = await createMainAuthSessionManager();
  const disposeAuthIpc = registerAuthIpcHandlers(
    securityPolicy,
    authManager,
  );
  const disposeAuthLifecycle = configureAuthLifecycle(authManager);
  registerMarketDataIpcHandlers(securityPolicy, createMarketDataIpcHandlers({ credentialStore }));
  registerProviderDataIpcHandlers(securityPolicy);
  registerSecureCredentialIpcHandlers(securityPolicy, credentialStore);
  const pluginManager = createPluginManager({ pluginsDirectory: join(app.getPath("userData"), "plugins") });
  const pluginRuntime = createPluginRuntimeHost({ manager: pluginManager });
  registerPluginIpcHandlers(securityPolicy, pluginManager, undefined, createPluginIpcHandlers(pluginManager, pluginRuntime));
  app.once("before-quit", () => {
    disposeAuthLifecycle();
    disposeAuthIpc();
    pluginRuntime.dispose();
  });
  const mainWindow = createMainWindow(securityPolicy);
  mainWindow.on("focus", () => {
    void authManager.revalidate();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWindow = createMainWindow(securityPolicy);
      nextWindow.on("focus", () => {
        void authManager.revalidate();
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
