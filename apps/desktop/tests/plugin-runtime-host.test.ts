import assert from "node:assert/strict";
import test from "node:test";
import type { StrategyInput } from "@quant/strategy-engine";
import { createPluginRuntimeHost } from "../src/electron/pluginRuntimeHost.ts";
import type { PluginRuntimeHostRequest, PluginRuntimeHostResponse } from "../src/electron/pluginRuntimeProtocol.ts";
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

test("plugin runtime host keeps source in the main-to-utility boundary and returns descriptors only", async () => {
  let onMessage: ((message: PluginRuntimeHostResponse) => void) | undefined;
  let onExit: (() => void) | undefined;
  const received: PluginRuntimeHostRequest[] = [];
  const host = createPluginRuntimeHost({
    manager: createManager(),
    spawn: () => ({
      postMessage(message) {
        received.push(message);
        if (message.type === "refresh") {
          onMessage?.({ id: message.id, ok: true, type: "refresh", snapshot: {
            strategies: [{ kind: "strategy", pluginId: record.manifest.id, key: `${record.manifest.id}:signal`, name: "Sample", version: "1.0.0", description: "test", supportedMarkets: ["US"], supportedTimeframes: ["1d"], parameterSchema: [] }],
            logs: [],
            failures: [],
          } });
        }
        if (message.type === "run-strategy") {
          onMessage?.({ id: message.id, ok: true, type: "run-strategy", output: { signals: [], overlays: [], render: { strategyId: message.key, strategyName: "Sample", enabled: true, zIndex: 20, elements: [] }, metrics: {}, logs: [], alerts: [] } });
        }
      },
      kill: () => true,
      on(event, listener) {
        if (event === "message") onMessage = listener as (message: PluginRuntimeHostResponse) => void;
        if (event === "exit") onExit = listener as () => void;
        return this;
      },
    }),
  });

  const snapshot = await host.refresh();
  assert.equal(snapshot.strategies[0]?.key, `${record.manifest.id}:signal`);
  assert.equal(received[0]?.type, "refresh");
  assert.equal("source" in (snapshot.strategies[0] ?? {}), false);
  const output = await host.runStrategy(record.manifest.id, `${record.manifest.id}:signal`, createInput());
  assert.equal(output.render.strategyId, `${record.manifest.id}:signal`);
  host.dispose();
  onExit?.();
});

test("plugin runtime host terminates an unresponsive utility process", async () => {
  let killed = false;
  const host = createPluginRuntimeHost({
    manager: createManager(),
    operationTimeoutMs: 10,
    spawn: () => ({
      postMessage: () => undefined,
      kill: () => (killed = true),
      on() { return this; },
    }),
  });

  await assert.rejects(() => host.refresh(), /timed out/i);
  assert.equal(killed, true);
});
