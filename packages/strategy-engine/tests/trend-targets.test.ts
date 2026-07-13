import assert from "node:assert/strict";
import test from "node:test";
import { createPresetStrategyRegistry, runRegisteredStrategy, type Bar } from "../src/index.ts";

const start = Date.UTC(2026, 0, 2, 14, 30);
const minute = 60 * 1000;

function bar(offsetMinutes: number, close: number, spread = 1): Bar {
  return {
    timestamp: start + offsetMinutes * minute,
    open: close,
    high: close + spread,
    low: close - spread,
    close,
    volume: 100_000,
  };
}

function runTrendTargets(bars: Bar[], parameters: Record<string, unknown> = {}) {
  const registry = createPresetStrategyRegistry();
  return runRegisteredStrategy(registry, {
    strategyKey: "trend-targets",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    runMode: "backtest",
    bars,
    parameters: {
      supertrendFactor: 1,
      supertrendAtrPeriod: 2,
      wmaLength: 2,
      emaLength: 2,
      confirmationCount: 3,
      atrPeriod: 2,
      stopLossAtrMultiplier: 1,
      targetOneMultiplier: 0.5,
      targetTwoMultiplier: 1,
      targetThreeMultiplier: 1.5,
      showTargets: true,
      showStopLoss: true,
      ...parameters,
    },
  });
}

test("Trend Targets reproduces the Pine Supertrend midpoint WMA/EMA baseline and turn signals", () => {
  const bars = [10, 11, 12, 11, 10, 9, 10, 11, 12, 13].map((close, index) => bar(index * 15, close));
  const result = runTrendTargets(bars);
  const baselinePoints = result.output.render.elements
    .filter((element) => element.kind === "trend-line" && element.id.startsWith("trend-targets-baseline"))
    .flatMap((element) => element.kind === "trend-line" ? element.points : []);
  const pointAtMinute60 = baselinePoints.find((point) => point.timestamp === start + 60 * minute);

  assert.ok(pointAtMinute60);
  assert.ok(Math.abs(pointAtMinute60.price - 11.037037037037038) < 1e-9);
  assert.deepEqual(result.output.signals.filter((signal) => signal.type !== "alert").map((signal) => signal.type), ["sell", "buy"]);
  assert.deepEqual(result.output.signals.filter((signal) => signal.type !== "alert").map((signal) => signal.timestamp), [
    start + 75 * minute,
    start + 120 * minute,
  ]);
  assert.equal(result.output.metrics.entryPrice, 12);
  assert.equal(result.output.metrics.stopPrice, 9);
  assert.equal(result.output.metrics.targetThree, 16.5);
});

test("Trend Targets emits Pine rejection markers only after the configured consecutive confirmation count", () => {
  const bars = [10, 11, 12, 11, 10, 9, 10, 11, 12, 13, 14, 15].map((close, index) => bar(index * 15, close, 10));
  const strict = runTrendTargets(bars, { confirmationCount: 20 });
  const sensitive = runTrendTargets(bars, { confirmationCount: 1 });
  const strictRejections = strict.output.render.elements.filter((element) => element.id.startsWith("trend-targets-rejection"));
  const sensitiveRejections = sensitive.output.render.elements.filter((element) => element.id.startsWith("trend-targets-rejection"));

  assert.equal(strictRejections.length, 0);
  assert.ok(sensitiveRejections.length > 0);
  assert.equal(sensitive.output.signals.some((signal) => signal.type === "alert" && signal.label?.includes("拒绝")), true);
});

test("Trend Targets core Pine parameters change the calculated baseline", () => {
  const bars = Array.from({ length: 28 }, (_, index) => bar(index * 15, 100 + Math.sin(index / 2) * 6 + index * 0.15, 2 + index % 3));
  const baseline = (parameters: Record<string, unknown>) => runTrendTargets(bars, parameters).output.render.elements
    .filter((element) => element.kind === "trend-line" && element.id.startsWith("trend-targets-baseline"))
    .flatMap((element) => element.kind === "trend-line" ? element.points.map((point) => point.price) : []);

  const defaultBaseline = baseline({});
  assert.notDeepEqual(baseline({ supertrendFactor: 3 }), defaultBaseline);
  assert.notDeepEqual(baseline({ supertrendAtrPeriod: 4 }), defaultBaseline);
  assert.notDeepEqual(baseline({ wmaLength: 4 }), defaultBaseline);
  assert.notDeepEqual(baseline({ emaLength: 4 }), defaultBaseline);
});

test("Trend Targets exposes the Pine parameters and projects only the latest setup", () => {
  const registry = createPresetStrategyRegistry();
  const strategy = registry.get("trend-targets");
  const parameterKeys = strategy?.parameterSchema.map((parameter) => parameter.key) ?? [];
  const bars = [10, 11, 12, 11, 10, 9, 10, 11, 12, 13].map((close, index) => bar(index * 15, close));
  const result = runTrendTargets(bars);
  const latestSignal = result.output.signals.filter((signal) => signal.type === "buy" || signal.type === "sell").at(-1);
  const projectedPriceLines = result.output.render.elements.filter(
    (element) => element.kind === "price-line" && element.fromTimestamp === latestSignal?.timestamp,
  );

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
  assert.equal(projectedPriceLines.length, 5);
  assert.equal(projectedPriceLines.some((element) => element.kind === "price-line" && element.label.startsWith("Entry")), true);
  assert.equal(result.output.render.elements.filter((element) => element.kind === "band").length, 2);
});

test("Trend Targets hides the Pine setup projection when targets are disabled", () => {
  const bars = [10, 11, 12, 11, 10, 9, 10, 11, 12, 13].map((close, index) => bar(index * 15, close));
  const result = runTrendTargets(bars, { showTargets: false });

  assert.equal(result.output.render.elements.some((element) => element.kind === "price-line"), false);
  assert.equal(result.output.render.elements.some((element) => element.kind === "band"), false);
});

test("Trend Targets disabled run keeps the render layer disabled", () => {
  const registry = createPresetStrategyRegistry();
  const result = runRegisteredStrategy(registry, {
    strategyKey: "trend-targets",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    runMode: "backtest",
    enabled: false,
    bars: [bar(0, 10), bar(15, 11), bar(30, 12)],
  });

  assert.equal(result.output.render.enabled, false);
  assert.equal(result.output.render.elements.length, 0);
});
