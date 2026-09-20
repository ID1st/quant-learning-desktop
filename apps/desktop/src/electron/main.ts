import { app, BrowserWindow, powerMonitor } from "electron";
import { join } from "node:path";
import { createMarketDataIpcHandlers, registerMarketDataIpcHandlers } from "./marketDataIpc";
import { registerMarketBarCacheIpcHandlers } from "./marketBarCacheIpc";
import { createMarketBarCacheIpcHandlers } from "./marketBarCacheIpcContract";
import { createDuckDbMarketBarRepository } from "./duckDbMarketBarRepository";
import { createMemoryMarketBarRepository } from "../features/marketData/memoryMarketBarRepository";
import { registerProviderDataIpcHandlers } from "./providerDataIpc";
import { registerPluginIpcHandlers } from "./pluginIpc";
import { createPluginManager } from "./pluginManager";
import { createPluginIpcHandlers } from "./pluginIpcContract";
import { createPluginRuntimeHost } from "./pluginRuntimeHost";
import { startDesktopDiagnostics } from "./desktopDiagnostics";
import { resolveAuthBaseUrl } from "./authRuntimeConfig";
import { registerDiagnosticsIpcHandlers } from "./diagnosticsIpc";
import { createDiagnosticsIpcHandlers } from "./diagnosticsIpcContract";
import {
  createMainSecureCredentialStore,
  registerSecureCredentialIpcHandlers,
} from "./secureCredentialIpc";
import {
  createDesktopRendererSecurityPolicy,
  isTrustedRendererUrl,
  type DesktopRendererSecurityPolicy,
} from "./electronSecurity";
import { registerAuthIpcHandlers } from "./authIpc";
import { createMainAuthSessionManager } from "./mainAuth";
import type { AuthSessionManager } from "./authSessionManager";
import {
  runReleaseSmokeProbe,
  validateReleaseSmokeUserDataPath,
  type ReleaseSmokeMode,
} from "./releaseSmoke";

const releaseSmokeRequested = process.argv.includes("--release-smoke");
const packagedRendererSmokeRequested = process.argv.includes("--packaged-renderer-smoke");
if (process.platform === "darwin") {
  app.disableHardwareAcceleration();
}
if (releaseSmokeRequested || packagedRendererSmokeRequested) {
  const userDataPath = process.env.QUANT_RELEASE_SMOKE_USER_DATA?.trim();
  if (!userDataPath) {
    throw new Error("QUANT_RELEASE_SMOKE_USER_DATA is required for release smoke mode.");
  }
  validateReleaseSmokeUserDataPath(userDataPath, app.getPath("temp"));
  app.setPath("userData", userDataPath);
}
declare const __QUANT_AUTH_BASE_URL__: string;

const authenticationOrigin = new URL(resolveAuthBaseUrl(__QUANT_AUTH_BASE_URL__, app.isPackaged))
  .origin;
const desktopDiagnostics = startDesktopDiagnostics(authenticationOrigin);

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
    const delay = Math.min(Math.max(deadline - Date.now() + 250, 250), 2_147_000_000);
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
  const resolvedSecurityPolicy =
    securityPolicy ??
    createDesktopRendererSecurityPolicy({
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
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl) => {
      desktopDiagnostics.log(
        "error",
        `renderer-load-failed:${errorCode}:${errorDescription}:${validatedUrl}`,
      );
    },
  );
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    desktopDiagnostics.log("error", `renderer-process-gone:${details.reason}:${details.exitCode}`);
  });
  mainWindow.on("unresponsive", () => {
    desktopDiagnostics.log("error", "renderer-unresponsive");
  });
  if (packagedRendererSmokeRequested) {
    const timeout = setTimeout(() => {
      process.stderr.write(
        "Packaged renderer smoke timed out before a usable page was rendered.\n",
      );
      app.exit(1);
    }, 20_000);
    mainWindow.webContents.once("did-finish-load", () => {
      void mainWindow.webContents
        .executeJavaScript(
          `(async () => {
            const deadline = Date.now() + 15000;
            while (Date.now() < deadline) {
              const root = document.getElementById("root");
              const guard = document.querySelector("[data-renderer-startup-guard]");
              if (root?.innerText.trim() && !guard) {
                return { ok: true, title: document.title, textLength: root.innerText.trim().length };
              }
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            return {
              ok: false,
              title: document.title,
              text: document.getElementById("root")?.innerText.slice(0, 500) ?? "",
              guard: Boolean(document.querySelector("[data-renderer-startup-guard]"))
            };
          })()`,
          true,
        )
        .then((result: unknown) => {
          clearTimeout(timeout);
          process.stdout.write(`${JSON.stringify(result)}\n`);
          app.exit(
            result && typeof result === "object" && "ok" in result && result.ok === true ? 0 : 1,
          );
        })
        .catch((error: unknown) => {
          clearTimeout(timeout);
          process.stderr.write(`Packaged renderer smoke failed: ${String(error)}\n`);
          app.exit(1);
        });
    });
  }

  if (rendererDevServer) {
    void mainWindow.loadURL(rendererDevServer);
  } else {
    void mainWindow.loadFile(windowConfig.rendererEntry).catch((error: unknown) => {
      desktopDiagnostics.log("error", "renderer-load-file-rejected", error);
    });
  }

  return mainWindow;
}

void app
  .whenReady()
  .then(async () => {
    if (releaseSmokeRequested) {
      const mode = process.env.QUANT_RELEASE_SMOKE_MODE?.trim() as ReleaseSmokeMode;
      if (mode !== "seed" && mode !== "verify") {
        throw new Error("QUANT_RELEASE_SMOKE_MODE must be seed or verify.");
      }
      const repository = await createDuckDbMarketBarRepository(
        join(app.getPath("userData"), "data", "market-cache.duckdb"),
      );
      try {
        const result = await runReleaseSmokeProbe(repository, mode);
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } finally {
        await repository.dispose();
        desktopDiagnostics.dispose();
      }
      app.quit();
      return;
    }

    const windowConfig = createMainWindowConfig();
    const securityPolicy = createDesktopRendererSecurityPolicy({
      rendererEntry: windowConfig.rendererEntry,
      rendererDevServerUrl: process.env.ELECTRON_RENDERER_URL,
    });
    const credentialStore = createMainSecureCredentialStore();
    const authManager = await createMainAuthSessionManager();
    const disposeAuthIpc = registerAuthIpcHandlers(securityPolicy, authManager);
    const disposeAuthLifecycle = configureAuthLifecycle(authManager);
    const mainWindow = createMainWindow(securityPolicy);
    mainWindow.on("focus", () => {
      void authManager.revalidate();
    });
    const marketBarCacheRepository =
      process.platform === "darwin"
        ? createMemoryMarketBarRepository()
        : await createDuckDbMarketBarRepository(
            join(app.getPath("userData"), "data", "market-cache.duckdb"),
          );
    const disposeMarketBarCacheIpc = registerMarketBarCacheIpcHandlers(
      securityPolicy,
      createMarketBarCacheIpcHandlers(marketBarCacheRepository),
    );
    const disposeDiagnosticsIpc = registerDiagnosticsIpcHandlers(
      securityPolicy,
      createDiagnosticsIpcHandlers(desktopDiagnostics),
    );
    registerMarketDataIpcHandlers(securityPolicy, createMarketDataIpcHandlers({ credentialStore }));
    registerProviderDataIpcHandlers(securityPolicy);
    registerSecureCredentialIpcHandlers(securityPolicy, credentialStore);
    const pluginManager = createPluginManager({
      pluginsDirectory: join(app.getPath("userData"), "plugins"),
    });
    const pluginRuntime = createPluginRuntimeHost({ manager: pluginManager });
    registerPluginIpcHandlers(
      securityPolicy,
      pluginManager,
      undefined,
      createPluginIpcHandlers(pluginManager, pluginRuntime),
    );
    app.once("before-quit", () => {
      disposeAuthLifecycle();
      disposeAuthIpc();
      disposeMarketBarCacheIpc();
      disposeDiagnosticsIpc();
      void marketBarCacheRepository.dispose();
      pluginRuntime.dispose();
      desktopDiagnostics.dispose();
    });
    desktopDiagnostics.log("info", "desktop-ready");

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const nextWindow = createMainWindow(securityPolicy);
        nextWindow.on("focus", () => {
          void authManager.revalidate();
        });
      }
    });
  })
  .catch((error: unknown) => {
    desktopDiagnostics.log("error", "desktop-startup-failed", error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
