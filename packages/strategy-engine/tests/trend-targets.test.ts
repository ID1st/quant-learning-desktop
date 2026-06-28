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

test("Trend Targets creates bullish breakout target visuals", () => {
  const registry = createPresetStrategyRegistry();
  const result = runRegisteredStrategy(registry, {
    strategyKey: "trend-targets",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    runMode: "backtest",
    bars: [
      bar(0, 100, 101, 99, 100),
      bar(15, 100, 102, 99, 101),
      bar(30, 101, 103, 100, 102),
      bar(45, 102, 106, 101, 105),
    ],
    parameters: {
      trendLength: 3,
      targetMultiplier: 1.5,
      showStopLoss: true,
    },
  });

  assert.equal(result.output.signals.length, 1);
  assert.equal(result.output.signals[0].type, "buy");
  assert.equal(result.output.metrics.signalCount, 1);
  assert.equal(result.output.render.elements.some((element) => element.kind === "trend-line" && element.tone === "bullish"), true);
  assert.equal(result.output.render.elements.filter((element) => element.kind === "price-line").length, 5);
  assert.equal(result.output.render.elements.filter((element) => element.kind === "signal-marker").length, 1);
});

test("Trend Targets creates bearish breakout target visuals", () => {
  const registry = createPresetStrategyRegistry();
  const result = runRegisteredStrategy(registry, {
    strategyKey: "trend-targets",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    runMode: "backtest",
    bars: [
      bar(0, 105, 106, 104, 105),
      bar(15, 105, 106, 103, 104),
      bar(30, 104, 105, 102, 103),
      bar(45, 103, 104, 99, 100),
    ],
    parameters: {
      trendLength: 3,
      targetMultiplier: 1.5,
      showStopLoss: false,
    },
  });

  assert.equal(result.output.signals.length, 1);
  assert.equal(result.output.signals[0].type, "sell");
  assert.equal(result.output.render.elements.some((element) => element.kind === "trend-line" && element.tone === "bearish"), true);
  assert.equal(
    result.output.render.elements.some((element) => element.kind === "price-line" && element.tone === "stop"),
    false,
  );
});

test("Trend Targets disabled run keeps render layer disabled", () => {
  const registry = createPresetStrategyRegistry();
  const result = runRegisteredStrategy(registry, {
    strategyKey: "trend-targets",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    runMode: "backtest",
    enabled: false,
    bars: [bar(0, 100, 101, 99, 100), bar(15, 100, 102, 99, 101), bar(30, 101, 103, 100, 102)],
  });

  assert.equal(result.output.render.enabled, false);
  assert.equal(result.output.render.elements.length, 0);
});
