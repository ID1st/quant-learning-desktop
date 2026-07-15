import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createPluginUtilityRuntime } from "../src/electron/pluginUtilityProcess.ts";
import type { PluginRuntimeHostResponse } from "../src/electron/pluginRuntimeProtocol.ts";

const pluginId = "com.quant.strategy.sma-crossover";

test("utility runtime activates and executes the bundled strategy without renderer imports", async () => {
  const responses: PluginRuntimeHostResponse[] = [];
  const runtime = createPluginUtilityRuntime((response) => responses.push(response));
  const source = await readFile(join(process.cwd(), "examples", "plugins", "sma-crossover", "dist", "index.js"), "utf8");
  await runtime({
    id: "refresh",
    type: "refresh",
    modules: [{ plugin: { manifest: { id: pluginId } }, source } as never],
  });
  const snapshot = responses.pop();
  assert.equal(snapshot?.ok, true);
  assert.equal(snapshot && snapshot.ok && snapshot.type === "refresh" ? snapshot.snapshot.strategies[0]?.key : null, `${pluginId}:signal`);

  const bars = Array.from({ length: 22 }, (_, index) => {
    const close = index === 21 ? 30 : 10;
    return { timestamp: index + 1, open: close, high: close, low: close, close, volume: 100 };
  });
  await runtime({
    id: "run",
    type: "run-strategy",
    pluginId,
    key: `${pluginId}:signal`,
    input: { symbol: "AAPL.US", market: "US", timeframe: "1d", bars, parameters: {}, runMode: "backtest", enabled: true },
  });
  const result = responses.pop();
  assert.equal(result?.ok, true);
  assert.equal(result && result.ok && result.type === "run-strategy" ? result.output.signals.length : 0, 1);
});

test("utility runtime rejects imports and leaves the other plugin runtime usable", async () => {
  const responses: PluginRuntimeHostResponse[] = [];
  const runtime = createPluginUtilityRuntime((response) => responses.push(response));
  await runtime({
    id: "refresh",
    type: "refresh",
    modules: [
      { plugin: { manifest: { id: "com.quant.strategy.unsafe" } }, source: 'import fs from "node:fs"; export function activate() {}' },
      { plugin: { manifest: { id: "com.quant.strategy.ok" } }, source: 'export function activate(context) { context.registerStrategy({ key: "com.quant.strategy.ok:signal", name: "OK", version: "1.0.0", description: "OK", supportedMarkets: ["US"], supportedTimeframes: ["1d"], parameterSchema: [], run() { return { signals: [], overlays: [], render: { enabled: true, zIndex: 1, elements: [] }, metrics: {}, logs: [], alerts: [] }; } }); }' },
    ] as never,
  });
  const snapshot = responses.pop();
  assert.equal(snapshot?.ok, true);
  assert.equal(snapshot && snapshot.ok && snapshot.type === "refresh" ? snapshot.snapshot.failures[0]?.pluginId : null, "com.quant.strategy.unsafe");
  assert.equal(snapshot && snapshot.ok && snapshot.type === "refresh" ? snapshot.snapshot.strategies.length : 0, 1);
});

test("utility runtime does not partially activate a plugin with duplicate strategy keys", async () => {
  const responses: PluginRuntimeHostResponse[] = [];
  const runtime = createPluginUtilityRuntime((response) => responses.push(response));
  const source = 'export function activate(context) { const strategy = { key: "com.quant.strategy.duplicate:signal", name: "Duplicate", version: "1.0.0", description: "test", supportedMarkets: ["US"], supportedTimeframes: ["1d"], parameterSchema: [], run() { return { signals: [], overlays: [], render: { enabled: true, zIndex: 1, elements: [] }, metrics: {}, logs: [], alerts: [] }; } }; context.registerStrategy(strategy); context.registerStrategy(strategy); }';
  await runtime({
    id: "refresh",
    type: "refresh",
    modules: [{ plugin: { manifest: { id: "com.quant.strategy.duplicate" } }, source }] as never,
  });
  const snapshot = responses.pop();
  assert.equal(snapshot?.ok, true);
  assert.equal(snapshot && snapshot.ok && snapshot.type === "refresh" ? snapshot.snapshot.failures[0]?.pluginId : null, "com.quant.strategy.duplicate");
  assert.equal(snapshot && snapshot.ok && snapshot.type === "refresh" ? snapshot.snapshot.strategies.length : 0, 0);
});
