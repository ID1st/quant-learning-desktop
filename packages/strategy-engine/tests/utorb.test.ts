import assert from "node:assert/strict";
import test from "node:test";
import { createPresetStrategyRegistry, runRegisteredStrategy, type Bar } from "../src/index.ts";

function bar(timestamp: string, open: number, high: number, low: number, close: number, volume = 100): Bar {
  return { timestamp: Date.parse(timestamp), open, high, low, close, volume };
}

function runUtorb(bars: Bar[], parameters: Record<string, unknown> = {}) {
  const registry = createPresetStrategyRegistry();
  return runRegisteredStrategy(registry, {
    strategyKey: "utorb",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    runMode: "backtest",
    bars,
    parameters: {
      sessionStartHour: 9,
      sessionStartMinute: 30,
      openingRangeMinutes: 30,
      sessionDays: "1234567",
      timezoneOffsetHours: -5,
      rangeSource: "high-low",
      showTargets: true,
      extensionType: "multiples",
      extensionMultiplierOne: 1,
      extensionMultiplierTwo: 2,
      extensionMultiplierThree: 3,
      showVolumeProfile: true,
      volumeProfileRows: 5,
      stopPlotting: true,
      plottingEndHour: 17,
      showTrailingStop: true,
      trailingStopAtrMultiplier: 1,
      trailingStopAtrPeriod: 2,
      showOptimizer: true,
      ...parameters,
    },
  });
}

const twoSessionBars = [
  bar("2026-01-02T14:30:00Z", 100, 102, 99, 101, 100),
  bar("2026-01-02T14:45:00Z", 101, 103, 100, 102, 200),
  bar("2026-01-02T15:00:00Z", 103, 108, 102, 104, 300),
  bar("2026-01-02T15:15:00Z", 100, 101, 97, 98, 400),
  bar("2026-01-02T15:30:00Z", 98, 99, 96, 97, 500),
  bar("2026-01-03T14:30:00Z", 200, 202, 198, 201, 100),
  bar("2026-01-03T14:45:00Z", 201, 204, 200, 203, 200),
  bar("2026-01-03T15:00:00Z", 204, 211, 203, 206, 300),
  bar("2026-01-03T15:15:00Z", 206, 208, 205, 207, 400),
  bar("2026-01-03T15:30:00Z", 207, 223, 207, 220, 500),
];

test("UTORB reproduces Pine sessions, resets daily, and emits one breakout per direction per session", () => {
  const result = runUtorb(twoSessionBars);
  const directionalSignals = result.output.signals.filter((signal) => signal.type === "buy" || signal.type === "sell");

  assert.equal(result.output.metrics.totalSessions, 2);
  assert.deepEqual(directionalSignals.map((signal) => signal.type), ["buy", "sell", "buy"]);
  assert.deepEqual(directionalSignals.map((signal) => signal.timestamp), [
    Date.parse("2026-01-02T15:00:00Z"),
    Date.parse("2026-01-02T15:15:00Z"),
    Date.parse("2026-01-03T15:00:00Z"),
  ]);
  assert.equal(directionalSignals[0]?.label, "多头突破（低量）");
  assert.equal(result.output.metrics.openingRangeHigh, 204);
  assert.equal(result.output.metrics.openingRangeLow, 198);
});

test("UTORB plots the Pine opening range and all six extension levels for the latest session", () => {
  const result = runUtorb(twoSessionBars);
  const latestStart = Date.parse("2026-01-03T14:30:00Z");
  const latestLines = result.output.render.elements.filter(
    (element) => element.kind === "price-line" && element.fromTimestamp === latestStart,
  );

  assert.deepEqual(latestLines.filter((line) => line.kind === "price-line").map((line) => line.price).sort((a, b) => a - b), [
    180, 186, 192, 198, 204, 210, 216, 222,
  ]);
  assert.ok(latestLines.every((line) => line.kind === "price-line" && line.toTimestamp === Date.parse("2026-01-03T22:00:00Z")));
  assert.equal(result.output.render.elements.some((element) => element.kind === "band" && element.id.includes("opening-range")), true);
});

test("UTORB honors candle-body range source and Fibonacci extensions", () => {
  const result = runUtorb(twoSessionBars.slice(0, 5), {
    rangeSource: "close",
    extensionType: "fibonacci",
    showVolumeProfile: false,
  });

  assert.equal(result.output.metrics.openingRangeHigh, 102);
  assert.equal(result.output.metrics.openingRangeLow, 100);
  assert.equal(result.output.metrics.upperTargetOne, 102.764);
  assert.equal(result.output.metrics.upperTargetTwo, 103.236);
  assert.equal(result.output.metrics.upperTargetThree, 104);
});

test("UTORB exposes Pine target hit rates, trailing stop, optimizer, and volume profile output", () => {
  const result = runUtorb(twoSessionBars);

  assert.equal(result.output.metrics.upperTargetOneHits, 2);
  assert.equal(result.output.metrics.upperTargetOneHitRate, 100);
  assert.ok(Number.isFinite(result.output.metrics.bestTrailingStopMultiplier));
  assert.ok(result.output.render.elements.some((element) => element.kind === "trend-line" && element.id.startsWith("utorb-trail")));
  assert.ok(result.output.render.elements.some((element) => element.kind === "band" && element.id.startsWith("utorb-volume-profile")));
  assert.equal(result.output.alerts.some((alert) => alert.includes("最终多头目标")), true);
});

test("UTORB exposes parameters corresponding to Pine inputs", () => {
  const registry = createPresetStrategyRegistry();
  const strategy = registry.get("utorb");

  assert.deepEqual(strategy?.parameterSchema.map((parameter) => parameter.key), [
    "sessionStartHour",
    "sessionStartMinute",
    "openingRangeMinutes",
    "sessionDays",
    "timezoneOffsetHours",
    "rangeSource",
    "showTargets",
    "extensionType",
    "extensionMultiplierOne",
    "extensionMultiplierTwo",
    "extensionMultiplierThree",
    "showVolumeProfile",
    "volumeProfileRows",
    "volumeProfileWidthPercent",
    "stopPlotting",
    "plottingEndHour",
    "showTrailingStop",
    "trailingStopAtrMultiplier",
    "trailingStopAtrPeriod",
    "showOptimizer",
  ]);
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
    bars: twoSessionBars,
  });

  assert.equal(result.output.render.enabled, false);
  assert.equal(result.output.render.elements.length, 0);
});
