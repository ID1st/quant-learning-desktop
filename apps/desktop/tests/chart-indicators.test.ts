import assert from "node:assert/strict";
import test from "node:test";
import {
  builtInChartIndicatorDefinitions,
  createChartIndicatorLayers,
  createChartIndicatorRegistry,
  createPluginIndicatorLayers,
  defaultChartIndicatorSettings,
  updateIndicatorInstance,
} from "../src/features/chartIndicators/chartIndicators.ts";

test("indicator layers honor available enabled and visible lifecycle states", () => {
  const candles = Array.from({ length: 24 }, (_, index) => ({ time: String(index), timestamp: index, open: 100 + index, high: 101 + index, low: 99 + index, close: 100 + index, volume: 1 }));
  const layers = createChartIndicatorLayers(candles, updateIndicatorInstance(defaultChartIndicatorSettings, "boll", (current) => ({ ...current, enabled: true, visible: false }), builtInChartIndicatorDefinitions[2]));
  assert.equal(layers.length, 2);
  assert.equal(layers.find((layer) => layer.id === "indicator-boll")?.visible, false);
  assert.equal(createChartIndicatorLayers(candles, updateIndicatorInstance(defaultChartIndicatorSettings, "sma", (current) => ({ ...current, available: false }), builtInChartIndicatorDefinitions[0])).length, 0);
});

test("indicator instances render SMA, EMA and BOLL through the same registry model", () => {
  const candles = Array.from({ length: 24 }, (_, index) => ({ time: String(index), timestamp: index, open: 100 + index, high: 101 + index, low: 99 + index, close: 100 + index, volume: 1 }));
  const settings = updateIndicatorInstance(defaultChartIndicatorSettings, "ema", (current) => ({ ...current, enabled: true, parameters: { ...current.parameters, window: 6 } }), builtInChartIndicatorDefinitions[1]);
  const layers = createChartIndicatorLayers(candles, settings);
  assert.deepEqual(layers.map((layer) => layer.id), ["indicator-sma", "indicator-ema"]);
  assert.equal(layers[1]?.elements[0]?.points?.length, candles.length);
});

test("indicator registry exposes a plugin-safe registration boundary", () => {
  const registry = createChartIndicatorRegistry();
  registry.register({ id: "plugin-test", name: "插件测试指标", parameters: [{ key: "window", label: "周期", type: "number", defaultValue: 20 }], evaluate: () => null });
  assert.equal(registry.get("plugin-test")?.parameters[0]?.key, "window");
  assert.throws(() => registry.register({ id: "plugin-test", name: "重复", parameters: [], evaluate: () => null }), /重复指标注册/);
});

test("plugin indicator layers use declared defaults and isolate evaluation failures", () => {
  const candles = [{ time: "1", timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 1 }];
  const definitions = [
    {
      id: "com.quant.indicator.sample:line",
      name: "Plugin Line",
      parameters: [{ key: "window", label: "窗口", type: "number", defaultValue: 8 }],
      evaluate: (_items, parameters) => ({ id: "plugin-line", name: String(parameters.window), source: "indicator", enabled: true, visible: true, zIndex: 30, elements: [] }),
    },
    { id: "com.quant.indicator.sample:broken", name: "Broken", parameters: [], evaluate: () => { throw new Error("broken"); } },
  ];
  const pluginSettings = updateIndicatorInstance(defaultChartIndicatorSettings, "com.quant.indicator.sample:line", (current) => ({ ...current, enabled: true, parameters: { ...current.parameters, window: 13 } }), definitions[0]);
  const layers = createPluginIndicatorLayers(candles, definitions, pluginSettings);

  assert.deepEqual(layers.map((layer) => layer.id), ["plugin-line"]);
  assert.equal(layers[0]?.name, "13");
});
