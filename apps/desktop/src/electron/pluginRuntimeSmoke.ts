import { app } from "electron";
import { createPluginRuntimeHost } from "./pluginRuntimeHost.ts";
import type { InstalledPluginRecord, PluginManager } from "./pluginManager.ts";

const pluginId = "com.quant.smoke.strategy";
const source = `export function activate(context) {
  context.registerStrategy({
    key: "com.quant.smoke.strategy:signal",
    name: "Smoke strategy",
    version: "1.0.0",
    description: "Electron utility-process smoke test.",
    supportedMarkets: ["US"],
    supportedTimeframes: ["1d"],
    parameterSchema: [],
    run(input) {
      return {
        signals: input.bars.length ? [{ id: "smoke", timestamp: input.bars.at(-1).timestamp, direction: "up" }] : [],
        overlays: [],
        render: { enabled: true, zIndex: 20, elements: [] },
        metrics: { bars: input.bars.length },
        logs: [],
        alerts: []
      };
    }
  });
}`;

void app.whenReady().then(async () => {
  const host = createPluginRuntimeHost({ manager: createSmokePluginManager() });
  try {
    const snapshot = await host.refresh();
    let blocked = false;
    try {
      await host.runStrategy(pluginId, `${pluginId}:signal`, {
        symbol: "AAPL.US",
        market: "US",
        timeframe: "1d",
        bars: [{ timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
        parameters: {},
        runMode: "backtest",
      });
    } catch (error) {
      blocked = error instanceof Error && error.message.includes("disabled until a no-Node sandbox is available");
    }
    console.log(JSON.stringify({ ok: snapshot.strategies.length === 0 && blocked }));
    app.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    app.exit(1);
  } finally {
    host.dispose();
  }
});

function createSmokePluginManager(): PluginManager {
  const record: InstalledPluginRecord = {
    manifest: {
      id: pluginId,
      name: "Smoke strategy",
      version: "1.0.0",
      type: "strategy" as const,
      kind: "strategy" as const,
      main: "dist/index.js",
      entry: "dist/index.js",
      engine: {},
      permissions: ["strategy:run"],
      capabilities: ["strategy"],
    },
    status: "enabled" as const,
    installedAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    failureCount: 0,
  };
  return {
    list: () => [record],
    installFromDirectory: async () => record,
    setEnabled: async () => record,
    recordRuntimeFailure: async () => record,
    uninstall: async () => undefined,
    readEnabledRuntimeModules: async () => [{ plugin: record, source }],
  };
}
