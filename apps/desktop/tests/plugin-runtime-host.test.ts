import assert from "node:assert/strict";
import test from "node:test";
import type { StrategyInput } from "@quant/strategy-engine";
import { createPluginRuntimeHost } from "../src/electron/pluginRuntimeHost.ts";
import type { PluginManager } from "../src/electron/pluginManager.ts";

const record = {
  manifest: {
    id: "com.quant.strategy.sample",
    name: "Sample",
    version: "1.0.0",
    type: "strategy" as const,
    kind: "strategy" as const,
    main: "dist/index.js",
    entry: "dist/index.js",
    engine: {},
    permissions: ["strategy:run"] as const,
    capabilities: ["strategy"] as const,
  },
  status: "enabled" as const,
  installedAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  failureCount: 0,
};

function createManager(): PluginManager {
  return {
    list: () => [record],
    installFromDirectory: async () => record,
    setEnabled: async () => record,
    recordRuntimeFailure: async (_id, message) => ({ ...record, status: "degraded" as const, failureCount: 1, lastError: message }),
    uninstall: async () => undefined,
    readEnabledRuntimeModules: async () => [{ plugin: record, source: "export function activate() {}" }],
  };
}

function createInput(): StrategyInput {
  return {
    symbol: "AAPL.US",
    market: "US",
    timeframe: "1d",
    bars: [{ timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
    parameters: {},
    runMode: "backtest",
  };
}

test("plugin runtime host does not read or execute third-party source", async () => {
  let sourceRead = false;
  const manager = createManager();
  manager.readEnabledRuntimeModules = async () => {
    sourceRead = true;
    return [{ plugin: record, source: "export function activate() {}" }];
  };
  const host = createPluginRuntimeHost({
    manager,
  });

  const snapshot = await host.refresh();
  assert.deepEqual(snapshot.strategies, []);
  assert.equal(sourceRead, false);
  await assert.rejects(
    () => host.runStrategy(record.manifest.id, `${record.manifest.id}:signal`, createInput()),
    /disabled until a no-Node sandbox is available/i,
  );
  host.dispose();
});

test("plugin runtime host reports the disabled execution attempt without starting a process", async () => {
  const failures: string[] = [];
  const manager = createManager();
  manager.recordRuntimeFailure = async (_id, message) => {
    failures.push(message);
    return { ...record, status: "degraded" as const, failureCount: 1, lastError: message };
  };
  const host = createPluginRuntimeHost({
    manager,
  });

  await assert.rejects(
    () => host.runStrategy(record.manifest.id, `${record.manifest.id}:signal`, createInput()),
    /disabled until a no-Node sandbox is available/i,
  );
  assert.equal(failures.length, 1);
});
