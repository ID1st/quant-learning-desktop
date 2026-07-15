import assert from "node:assert/strict";
import test from "node:test";
import type { PluginManager } from "../src/electron/pluginManager.ts";
import type { PluginRuntimeHost } from "../src/electron/pluginRuntimeHost.ts";
import { createPluginIpcHandlers, pluginIpcChannels } from "../src/electron/pluginIpcContract.ts";

const record = {
  manifest: {
    id: "com.quant.strategy.sample",
    name: "Sample Strategy",
    version: "1.0.0",
    type: "strategy" as const,
    kind: "strategy" as const,
    main: "dist/index.js",
    entry: "dist/index.js",
    engine: {},
    permissions: ["market-data:read", "strategy:run"] as const,
    capabilities: ["strategy"] as const,
  },
  status: "enabled" as const,
  installedAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  failureCount: 0,
};

test("plugin IPC exposes management plus a source-free isolated runtime boundary", () => {
  assert.deepEqual(pluginIpcChannels, {
    list: "plugins:list",
    installLocal: "plugins:installLocal",
    setEnabled: "plugins:setEnabled",
    reportRuntimeFailure: "plugins:reportRuntimeFailure",
    uninstall: "plugins:uninstall",
    getRuntimeSnapshot: "plugins:getRuntimeSnapshot",
    runStrategy: "plugins:runStrategy",
  });
});

test("plugin IPC returns isolated descriptors and routes strategy execution without sending source", async () => {
  const calls: string[] = [];
  const manager: PluginManager = {
    list: () => [record],
    installFromDirectory: async () => record,
    setEnabled: async () => record,
    recordRuntimeFailure: async () => ({ ...record, status: "degraded" as const, failureCount: 1 }),
    uninstall: async (id) => { calls.push(`uninstall:${id}`); },
    readEnabledRuntimeModules: async () => [{ plugin: record, source: "export function activate() {}" }],
  };
  const runtime: PluginRuntimeHost = {
    async refresh() {
      calls.push("refresh");
      return { strategies: [{ kind: "strategy", pluginId: record.manifest.id, key: `${record.manifest.id}:signal`, name: "Sample", version: "1.0.0", description: "test", supportedMarkets: ["US"], supportedTimeframes: ["1d"], parameterSchema: [] }], logs: [], failures: [] };
    },
    async runStrategy(pluginId, key) {
      calls.push(`run:${pluginId}:${key}`);
      return { signals: [], overlays: [], render: { strategyId: key, strategyName: "Sample", enabled: true, zIndex: 20, elements: [] }, metrics: {}, logs: [], alerts: [] };
    },
    dispose: () => undefined,
  };
  const handlers = createPluginIpcHandlers(manager, runtime);
  const snapshot = await handlers.getRuntimeSnapshot();
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.ok && "source" in snapshot.data.strategies[0]!, false);
  const execution = await handlers.runStrategy(record.manifest.id, `${record.manifest.id}:signal`, {
    symbol: "AAPL.US", market: "US", timeframe: "1d", bars: [], parameters: {}, runMode: "backtest",
  });
  assert.equal(execution.ok, true);
  assert.deepEqual(calls, ["refresh", `run:${record.manifest.id}:${record.manifest.id}:signal`]);
});
