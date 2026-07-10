import assert from "node:assert/strict";
import test from "node:test";
import { createChartIndicatorLayers, createChartIndicatorRegistry, defaultChartIndicatorSettings } from "../src/features/chartIndicators/chartIndicators.ts";

test("indicator layers honor available enabled and visible lifecycle states", () => {
  const candles = Array.from({ length: 24 }, (_, index) => ({ time: String(index), timestamp: index, open: 100 + index, high: 101 + index, low: 99 + index, close: 100 + index, volume: 1 }));
  const layers = createChartIndicatorLayers(candles, { ...defaultChartIndicatorSettings, bollingerBands: { ...defaultChartIndicatorSettings.bollingerBands, enabled: true, visible: false } });
  assert.equal(layers.length, 2);
  assert.equal(layers.find((layer) => layer.id === "indicator-bollinger-bands")?.visible, false);
  assert.equal(createChartIndicatorLayers(candles, { ...defaultChartIndicatorSettings, movingAverage: { ...defaultChartIndicatorSettings.movingAverage, available: false } }).length, 0);
});

test("indicator registry exposes a plugin-safe registration boundary", () => {
  const registry = createChartIndicatorRegistry();
  registry.register({ id: "plugin-test", name: "插件测试指标", parameters: [{ key: "window", label: "周期", type: "number", defaultValue: 20 }], evaluate: () => null });
  assert.equal(registry.get("plugin-test")?.parameters[0]?.key, "window");
  assert.throws(() => registry.register({ id: "plugin-test", name: "重复", parameters: [], evaluate: () => null }), /重复指标注册/);
});
