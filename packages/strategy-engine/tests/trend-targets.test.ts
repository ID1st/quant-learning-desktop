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

test("Trend Targets exposes Pine-style core parameters", () => {
  const registry = createPresetStrategyRegistry();
  const strategy = registry.get("trend-targets");
  const parameterKeys = strategy?.parameterSchema.map((parameter) => parameter.key) ?? [];

  assert.deepEqual(parameterKeys, [
    "supertrendFactor",
    "supertrendAtrPeriod",
    "wmaLength",
    "emaLength",
    "confirmationCount",
    "showTargets",
    "atrPeriod",
    "stopLossAtrMultiplier",
    "targetOneMultiplier",
    "targetTwoMultiplier",
    "targetThreeMultiplier",
    "showStopLoss",
  ]);
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
      wmaLength: 3,
      targetThreeMultiplier: 1.5,
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

test("Trend Targets projects target lines from the latest signal", () => {
  const registry = createPresetStrategyRegistry();
  const result = runRegisteredStrategy(registry, {
    strategyKey: "trend-targets",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    runMode: "backtest",
    bars: [
      bar(0, 100, 103, 99, 101),
      bar(15, 101, 104, 100, 102),
      bar(30, 102, 105, 101, 105),
      bar(45, 105, 106, 97, 98),
      bar(60, 98, 101, 96, 100),
      bar(75, 100, 103, 98, 102),
    ],
    parameters: {
      wmaLength: 3,
      targetThreeMultiplier: 1.5,
      showStopLoss: true,
    },
  });

  const latestSignal = result.output.signals[result.output.signals.length - 1];
  const projectedPriceLines = result.output.render.elements.filter(
    (element) => element.kind === "price-line" && element.fromTimestamp === latestSignal.timestamp,
  );
  const projectedBands = result.output.render.elements.filter(
    (element) => element.kind === "band" && element.fromTimestamp === latestSignal.timestamp,
  );

  assert.equal(result.output.signals.length, 2);
  assert.equal(result.output.signals[0].type, "buy");
  assert.equal(result.output.signals[1].type, "sell");
  assert.equal(result.output.render.elements.filter((element) => element.kind === "signal-marker").length, 2);
  assert.equal(projectedPriceLines.length, 5);
  assert.equal(projectedBands.length, 2);
  assert.equal(projectedPriceLines.some((element) => element.label.startsWith("Entry")), true);
  assert.equal(projectedPriceLines.some((element) => element.label.startsWith("✓ 目标3")), true);
  assert.equal(projectedPriceLines.some((element) => element.label.includes("TP")), false);
  assert.equal(projectedPriceLines.some((element) => element.label.startsWith("✕ SL")), true);
});

test("Trend Targets applies ATR stop and target multipliers", () => {
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
      wmaLength: 3,
      atrPeriod: 2,
      stopLossAtrMultiplier: 2,
      targetOneMultiplier: 0.25,
      targetTwoMultiplier: 0.75,
      targetThreeMultiplier: 1.25,
      showTargets: true,
      showStopLoss: true,
    },
  });

  const entryPrice = Number(result.output.metrics.entryPrice);
  const stopPrice = Number(result.output.metrics.stopPrice);
  const riskDistance = Math.abs(entryPrice - stopPrice);

  assert.equal(result.output.metrics.targetOne, entryPrice + riskDistance * 0.25);
  assert.equal(result.output.metrics.targetTwo, entryPrice + riskDistance * 0.75);
  assert.equal(result.output.metrics.targetThree, entryPrice + riskDistance * 1.25);
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
