import assert from "node:assert/strict";
import test from "node:test";
import { createChartIndicatorLayers, defaultChartIndicatorSettings } from "../src/features/chartIndicators/chartIndicators.ts";

test("indicator layers honor available enabled and visible lifecycle states", () => {
  const candles = Array.from({ length: 24 }, (_, index) => ({ time: String(index), timestamp: index, open: 100 + index, high: 101 + index, low: 99 + index, close: 100 + index, volume: 1 }));
  const layers = createChartIndicatorLayers(candles, { ...defaultChartIndicatorSettings, bollingerBands: { ...defaultChartIndicatorSettings.bollingerBands, enabled: true, visible: false } });
  assert.equal(layers.length, 2);
  assert.equal(layers.find((layer) => layer.id === "indicator-bollinger-bands")?.visible, false);
  assert.equal(createChartIndicatorLayers(candles, { ...defaultChartIndicatorSettings, movingAverage: { ...defaultChartIndicatorSettings.movingAverage, available: false } }).length, 0);
});
