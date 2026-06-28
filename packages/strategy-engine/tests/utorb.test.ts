import assert from "node:assert/strict";
import test from "node:test";
import { createPresetStrategyRegistry, runRegisteredStrategy, type Bar } from "../src/index.ts";

const start = Date.UTC(2026, 0, 2, 14, 30);
const minute = 60 * 1000;

function bar(offsetMinutes: number, open: number, high: number, low: number, close: number): Bar {
  return {
    timestamp: start + offsetMinutes * minute,
    open,
    high,
    low,
    close,
    volume: 100000,
  };
}

test("UTORB calculates opening range and breakout visuals", () => {
  const registry = createPresetStrategyRegistry();
  const result = runRegisteredStrategy(registry, {
    strategyKey: "utorb",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    runMode: "backtest",
    bars: [
      bar(0, 100, 103, 99, 101),
      bar(15, 101, 104, 100, 102),
      bar(30, 102, 105, 101, 105),
      bar(45, 105, 106, 97, 98),
    ],
    parameters: {
      openingRangeMinutes: 30,
      showTargets: true,
    },
  });

  assert.equal(result.output.metrics.openingRangeHigh, 104);
  assert.equal(result.output.metrics.openingRangeLow, 99);
  assert.equal(result.output.signals.length, 2);
  assert.equal(result.output.signals[0].type, "buy");
  assert.equal(result.output.signals[1].type, "sell");
  assert.equal(result.output.render.elements.some((element) => element.kind === "band"), true);
  assert.equal(result.output.render.elements.filter((element) => element.kind === "signal-marker").length, 2);
  assert.equal(result.output.render.elements.filter((element) => element.kind === "price-line").length, 4);
});

test("UTORB disabled run keeps render layer disabled", () => {
  const registry = createPresetStrategyRegistry();
  const result = runRegisteredStrategy(registry, {
    strategyKey: "utorb",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    runMode: "backtest",
    enabled: false,
    bars: [bar(0, 100, 103, 99, 101), bar(15, 101, 104, 100, 102)],
  });

  assert.equal(result.output.render.enabled, false);
  assert.equal(result.output.render.elements.length, 0);
});

test("UTORB falls back when opening range minutes is not positive", () => {
  const registry = createPresetStrategyRegistry();
  const result = runRegisteredStrategy(registry, {
    strategyKey: "utorb",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    runMode: "backtest",
    bars: [
      bar(0, 100, 103, 99, 101),
      bar(15, 101, 104, 100, 102),
      bar(30, 102, 105, 101, 105),
    ],
    parameters: {
      openingRangeMinutes: 0,
    },
  });

  assert.equal(result.output.metrics.openingRangeHigh, 104);
  assert.equal(result.output.metrics.openingRangeLow, 99);
  assert.equal(result.input.parameters.openingRangeMinutes, 0);
});
