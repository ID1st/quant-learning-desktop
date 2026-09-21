import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { createMarketDataIpcHandlers, registerMarketDataIpcHandlers } from "./marketDataIpc.ts";
import type { SecureCredentialStore } from "./secureCredentialStore.ts";
import { createDesktopRendererSecurityPolicy } from "./electronSecurity.ts";

const request = {
  context: { source: "diagnostics" as const },
  query: "NOK",
  markets: ["US", "HK", "CN"] as const,
  providerPolicy: { stockSdkPrimaryEnabled: true },
};

void app.whenReady().then(async () => {
  const rendererDiagnostics: string[] = [];
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.on("console-message", (_event, level, message, lineNumber, sourceId) => {
    rendererDiagnostics.push(`[console:${level}] ${sourceId}:${lineNumber} ${message}`);
  });
  window.webContents.on("preload-error", (_event, path, error) => {
    rendererDiagnostics.push(`[preload] ${path} ${error.message}`);
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    rendererDiagnostics.push(`[load:${errorCode}] ${validatedURL} ${errorDescription}`);
  });

  try {
    const rendererEntry = join(__dirname, "../renderer/index.html");
    registerMarketDataIpcHandlers(
      createDesktopRendererSecurityPolicy({ rendererEntry }),
      createMarketDataIpcHandlers({ credentialStore: createSmokeCredentialStore() }),
    );
    await window.loadFile(rendererEntry);
    const bridgeAvailable = await window.webContents.executeJavaScript(
      "typeof window.quantDesktop?.marketData?.searchInstruments === 'function'",
      true,
    );
    if (!bridgeAvailable) {
      throw new Error("Electron preload bridge does not expose marketData.searchInstruments.");
    }
    const result = await window.webContents.executeJavaScript(
      `window.quantDesktop.marketData.searchInstruments(${JSON.stringify(request)})`,
      true,
    );
    const ok = Boolean(result?.ok) && Array.isArray(result.data) && result.data.length > 0;
    console.log(JSON.stringify({ ok, result }));
    app.exit(ok ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error([message, ...rendererDiagnostics].join("\n"));
    app.exit(1);
  } finally {
    window.destroy();
  }
});

function createSmokeCredentialStore(): SecureCredentialStore {
  return {
    saveAlphaFeedCredentials: async () => undefined,
    readAlphaFeedCredentials: async () => null,
    clearAlphaFeedCredentials: () => undefined,
    saveAlphaFeedStreamCredentials: async () => undefined,
    readAlphaFeedStreamCredentials: async () => null,
    clearAlphaFeedStreamCredentials: () => undefined,
    saveLongPortCredentials: async () => undefined,
    readLongPortCredentials: async () => null,
    clearLongPortCredentials: () => undefined,
  };
}
