import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Timeframe } from "@quant/shared";

import {
  createPresetStrategyRegistry,
  runRegisteredStrategy,
  type Bar,
} from "../src/index.ts";
import { createSmcVisualFixture } from "../src/smartMoneyConceptsVisualFixture.ts";

function makeWaveBars(count: number, timeframe: Timeframe = "realtime"): Bar[] {
  const interval =
    timeframe === "1w" ? 7 * 24 * 60 * 60 * 1_000 : timeframe === "1d" ? 24 * 60 * 60 * 1_000 : 60_000;
  const start = Date.UTC(2024, 0, 1);

  return Array.from({ length: count }, (_, index) => {
    const trend = index * 0.035;
    const wave = Math.sin(index / 5.5) * 7 + Math.sin(index / 17) * 2;
    const close = 100 + trend + wave;
    const open = close - Math.sin(index / 3) * 0.8;
    const high = Math.max(open, close) + 0.8 + (index % 7) * 0.04;
    const low = Math.min(open, close) - 0.8 - (index % 5) * 0.04;

    return {
      timestamp: start + index * interval,
      open,
      high,
      low,
      close,
      volume: 1_000 + index * 10,
    };
  });
}

describe("Smart Money Concepts preset", () => {
  it("registers a disabled-by-default SMC indicator with visual color parameters", () => {
    const definition = createPresetStrategyRegistry().get("smart-money-concepts");

    assert.ok(definition);
    assert.equal(definition.strategyType, "indicator");
    assert.equal(definition.defaultEnabled, false);
    assert.deepEqual(definition.supportedMarkets, ["CN", "HK", "US"]);
    assert.deepEqual(definition.supportedTimeframes, ["realtime", "1m", "5m", "15m", "30m", "1h", "1d", "1w"]);
    assert.equal(definition.parameterSchema.some((parameter) => parameter.type === "color"), true);
    const parameterKeys = definition.parameterSchema.map((parameter) => parameter.key);
    for (const key of
      [
        "mode",
        "style",
        "showInternalStructure",
        "showSwingStructure",
        "showInternalOrderBlocks",
        "showSwingOrderBlocks",
        "showEqualHighLow",
        "showFairValueGaps",
        "showDailyLevels",
        "showWeeklyLevels",
        "showMonthlyLevels",
        "showPremiumDiscountZones",
      ]) {
      assert.ok(parameterKeys.includes(key), `missing SMC parameter: ${key}`);
    }
  });

  it("keeps the documented structure and ATR warm-up semantics", () => {
    const output = runRegisteredStrategy(createPresetStrategyRegistry(), {
        strategyKey: "smart-money-concepts",
        symbol: "CN:000001",
        market: "CN",
        timeframe: "realtime",
        bars: makeWaveBars(40),
        runMode: "realtime",
        enabled: true,
        parameters: {},
      }).output;

    assert.equal(output.metrics["Structure Ready"], 0);
    assert.equal(output.metrics["ATR Ready"], 0);
    assert.match(output.logs.join(" "), /51/);
    assert.match(output.logs.join(" "), /200/);
  });

  it("emits anchored SMC overlays without fabricating trades or PnL", () => {
    const output = runRegisteredStrategy(createPresetStrategyRegistry(), {
        strategyKey: "smart-money-concepts",
        symbol: "US:SPY",
        market: "US",
        timeframe: "realtime",
        bars: makeWaveBars(260),
        runMode: "realtime",
        enabled: true,
        parameters: {
          swingLength: 10,
          showSwingOrderBlocks: true,
          showFairValueGaps: true,
          showPremiumDiscountZones: true,
          showTrendCandles: true,
          showSwingPoints: true,
        },
      }).output;

    assert.equal(output.metrics["Structure Ready"], 1);
    assert.equal(output.metrics["ATR Ready"], 1);
    assert.ok(output.overlays.some((element) => element.kind === "price-line" && element.label));
    assert.ok(output.overlays.some((element) => element.kind === "label"));
    assert.ok(output.overlays.some((element) => element.kind === "band"));
    assert.ok(output.overlays.some((element) => element.kind === "candle-style"));
    assert.ok(output.signals.every((signal) => signal.type === "alert"));
    assert.equal(Object.keys(output.metrics).some((label) => /pnl|return|win rate/i.test(label)), false);
  });

  it("uses only confirmed higher-timeframe bars for previous levels", () => {
    const dailyBars = makeWaveBars(12, "1d");
    const cutoff = dailyBars.at(-1)!.timestamp + 12 * 60 * 60 * 1_000;
    const intradayBars = makeWaveBars(240).map((bar, index) => ({
      ...bar,
      timestamp: cutoff - (239 - index) * 60_000,
    }));

    const output = runRegisteredStrategy(createPresetStrategyRegistry(), {
        strategyKey: "smart-money-concepts",
        symbol: "HK:00700",
        market: "HK",
        timeframe: "realtime",
        bars: intradayBars,
        seriesByTimeframe: {
          "1d": dailyBars,
        },
        runMode: "realtime",
        enabled: true,
        parameters: {
          showDailyLevels: true,
        },
      }).output;

    const levelLabels = output.overlays
      .filter((element) => element.kind === "price-line")
      .map((element) => element.label);

    assert.ok(levelLabels.includes("PDH"));
    assert.ok(levelLabels.includes("PDL"));
    assert.equal(levelLabels.includes("CDH"), false);
    assert.equal(levelLabels.includes("CDL"), false);
  });

  it("returns no visuals or events when explicitly disabled", () => {
    const output = runRegisteredStrategy(createPresetStrategyRegistry(), {
        strategyKey: "smart-money-concepts",
        symbol: "US:SPY",
        market: "US",
        timeframe: "realtime",
        bars: makeWaveBars(260),
        runMode: "realtime",
        enabled: false,
        parameters: {},
      }).output;

    assert.deepEqual(output.overlays, []);
    assert.deepEqual(output.signals, []);
  });

  it("keeps a fixed visual fixture covering the reference image states", () => {
    const output = runRegisteredStrategy(createPresetStrategyRegistry(), {
      strategyKey: "smart-money-concepts",
      symbol: "US:DXY",
      market: "US",
      timeframe: "realtime",
      bars: createSmcVisualFixture(),
      runMode: "realtime",
      enabled: true,
      parameters: {
        swingLength: 10,
        showSwingPoints: true,
        showSwingOrderBlocks: true,
        showFairValueGaps: true,
        fairValueGapAutoThreshold: false,
        showPremiumDiscountZones: true,
        equalHighLowLength: 10,
        equalHighLowThreshold: 0.5,
      },
    }).output;

    const priceLineLabels = output.overlays
      .filter((element) => element.kind === "price-line")
      .map((element) => element.label);
    const textLabels = output.overlays
      .filter((element) => element.kind === "label")
      .map((element) => element.text);
    const bandIds = output.overlays
      .filter((element) => element.kind === "band")
      .map((element) => element.id);

    assert.ok(priceLineLabels.includes("BOS"));
    assert.ok(priceLineLabels.includes("CHoCH"));
    assert.ok(priceLineLabels.some((label) => label === "Strong High" || label === "Strong Low"));
    assert.ok(priceLineLabels.some((label) => label === "Weak High" || label === "Weak Low"));
    assert.ok(textLabels.includes("EQH"));
    assert.ok(bandIds.some((id) => id.startsWith("smc-order-block-")));
    assert.ok(bandIds.some((id) => id.startsWith("smc-fvg-")));
    assert.ok(bandIds.includes("smc-zone-premium"));
    assert.ok(bandIds.includes("smc-zone-equilibrium"));
    assert.ok(bandIds.includes("smc-zone-discount"));
    assert.ok((output.metrics["Active Order Blocks"] ?? 0) >= 2);
    assert.ok(output.alerts.some((alert) => alert.includes("Order Block Breakout")));
  });

  it("does not draw an equal high before the second pivot is confirmed", () => {
    const bars = createSmcVisualFixture();
    const run = (visibleBars: Bar[]) =>
      runRegisteredStrategy(createPresetStrategyRegistry(), {
        strategyKey: "smart-money-concepts",
        symbol: "US:DXY",
        market: "US",
        timeframe: "realtime",
        bars: visibleBars,
        runMode: "realtime",
        enabled: true,
        parameters: {
          equalHighLowLength: 10,
          equalHighLowThreshold: 0.5,
        },
      }).output;
    const equalLabels = (output: ReturnType<typeof run>) =>
      output.overlays.filter((element) => element.kind === "label" && element.text === "EQH");

    assert.equal(equalLabels(run(bars.slice(0, 230))).length, 0);
    assert.equal(equalLabels(run(bars.slice(0, 231))).length, 1);
  });
});
