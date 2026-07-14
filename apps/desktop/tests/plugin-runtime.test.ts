import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { activatePluginRuntimeModules } from "../src/features/plugins/pluginRuntime.ts";

const plugin = {
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
  installedAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  failureCount: 0,
};

async function importTestPluginModule(source: string) {
  return import(`data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`);
}

test("plugin runtime refuses source execution without an explicit isolated importer", async () => {
  const result = await activatePluginRuntimeModules([{ plugin, source: "export function activate() {}" }]);

  assert.equal(result.strategies.length, 0);
  assert.deepEqual(result.failures, [
    {
      pluginId: plugin.manifest.id,
      message: "第三方插件运行需要隔离宿主，当前运行时已停用。",
    },
  ]);
});

test("plugin runtime activates a namespaced strategy without exposing desktop internals", async () => {
  const result = await activatePluginRuntimeModules(
    [{ plugin, source: "export function activate() {}" }],
    async () => ({
      activate(context: { registerStrategy(strategy: unknown): void; log(message: string): void }) {
        context.log("activated");
        context.registerStrategy({
          key: "com.quant.strategy.sample:cross",
          name: "Cross Strategy",
          version: "1.0.0",
          description: "Sample plugin strategy",
          sourceType: "preset",
          supportedMarkets: ["US"],
          supportedTimeframes: ["1d"],
          parameterSchema: [],
          run: () => ({ signals: [], overlays: [], render: { strategyId: "com.quant.strategy.sample:cross", strategyName: "Cross Strategy", enabled: true, zIndex: 10, elements: [] }, metrics: {}, logs: [], alerts: [] }),
        });
      },
    }),
  );

  assert.equal(result.strategies.length, 1);
  assert.equal(result.strategies[0]?.sourceType, "plugin");
  assert.equal(result.strategies[0]?.sourceFile, plugin.manifest.id);
  assert.deepEqual(result.logs, [{ pluginId: plugin.manifest.id, message: "activated" }]);
});

test("plugin runtime isolates an invalid plugin without preventing other plugins from activating", async () => {
  const result = await activatePluginRuntimeModules(
    [
      { plugin, source: "broken" },
      { plugin: { ...plugin, manifest: { ...plugin.manifest, id: "com.quant.strategy.healthy" } }, source: "healthy" },
    ],
    async (source) =>
      source === "broken"
        ? { activate() { throw new Error("broken plugin"); } }
        : { activate(context: { registerStrategy(strategy: unknown): void }) {
            context.registerStrategy({
              key: "com.quant.strategy.healthy:sample",
              name: "Healthy Strategy",
              version: "1.0.0",
              description: "Healthy sample",
              sourceType: "plugin",
              supportedMarkets: ["US"],
              supportedTimeframes: ["1d"],
              parameterSchema: [],
              run: () => ({ signals: [], overlays: [], render: { strategyId: "com.quant.strategy.healthy:sample", strategyName: "Healthy Strategy", enabled: true, zIndex: 10, elements: [] }, metrics: {}, logs: [], alerts: [] }),
            });
          } },
  );

  assert.equal(result.strategies.length, 1);
  assert.deepEqual(result.failures, [{ pluginId: plugin.manifest.id, message: "broken plugin" }]);
});

test("the bundled SMA sample plugin registers chart render elements for its signals", async () => {
  const source = await readFile(join(process.cwd(), "examples", "plugins", "sma-crossover", "dist", "index.js"), "utf8");
  const samplePlugin = {
    ...plugin,
    manifest: { ...plugin.manifest, id: "com.quant.strategy.sma-crossover" },
  };
  const result = await activatePluginRuntimeModules([{ plugin: samplePlugin, source }], importTestPluginModule);
  const strategy = result.strategies[0];
  assert.ok(strategy);

  const bars = Array.from({ length: 22 }, (_value, index) => {
    const close = index === 21 ? 30 : 10;
    return { timestamp: index + 1, open: close, high: close, low: close, close, volume: 100 };
  });
  const output = strategy.run({
    symbol: "AAPL.US",
    market: "US",
    timeframe: "1d",
    bars,
    parameters: {},
    runMode: "realtime",
  });

  assert.equal(output.signals.length, 1);
  assert.equal(output.render.elements.length, 1);
  assert.equal(output.render.elements[0]?.kind, "signal-marker");
});
