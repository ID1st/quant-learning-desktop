import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createPresetStrategyRegistry, type Bar } from "@quant/strategy-engine";
import {
  buildChartStrategyLogItems,
  buildChartStrategySignalRows,
  runChartStrategies,
  type ChartStrategyWorkspaceState,
} from "../src/features/strategies/chartStrategyRuntime.ts";

const bars: Bar[] = [
  { timestamp: Date.parse("2026-07-07T13:30:00.000Z"), open: 100, high: 101, low: 99, close: 100, volume: 1000 },
  { timestamp: Date.parse("2026-07-07T13:31:00.000Z"), open: 100, high: 102, low: 99, close: 101, volume: 1200 },
  { timestamp: Date.parse("2026-07-07T13:32:00.000Z"), open: 101, high: 104, low: 100, close: 103, volume: 1300 },
  { timestamp: Date.parse("2026-07-07T13:33:00.000Z"), open: 103, high: 106, low: 102, close: 105, volume: 1400 },
  { timestamp: Date.parse("2026-07-07T13:34:00.000Z"), open: 105, high: 107, low: 104, close: 106, volume: 1500 },
];

describe("chart strategy runtime", () => {
  it("runs UTORB and Trend Targets from the same normalized realtime bars", () => {
    const registry = createPresetStrategyRegistry();
    const strategies = ["utorb", "trend-targets"].map((key) => registry.get(key));
    assert.ok(strategies[0]);
    assert.ok(strategies[1]);
    const realtimeBars = Array.from({ length: 18 }, (_, index): Bar => {
      const timestamp = Date.parse("2026-07-07T13:30:00.000Z") + index * 60_000;
      const isBreakout = index >= 16;
      return {
        timestamp,
        open: isBreakout ? 102 + index * 0.1 : 100,
        high: isBreakout ? 105 + index * 0.1 : 102,
        low: isBreakout ? 101 : 99,
        close: isBreakout ? 104 + index * 0.1 : index % 2 === 0 ? 100.5 : 101,
        volume: 1000 + index,
      };
    });
    const settingsByStrategyKey: Record<string, ChartStrategyWorkspaceState> = {
      utorb: {
        enabled: true,
        showLayer: true,
        parameters: { openingRangeMinutes: 15, showTargets: true },
      },
      "trend-targets": {
        enabled: true,
        showLayer: true,
        parameters: {
          wmaLength: 2,
          emaLength: 2,
          targetOneMultiplier: 0.5,
          targetTwoMultiplier: 1,
          targetThreeMultiplier: 1.5,
          showStopLoss: true,
        },
      },
    };

    const runs = runChartStrategies({
      strategies: strategies as NonNullable<(typeof strategies)[number]>[],
      registry,
      settingsByStrategyKey,
      resolveDefaultSettings: (strategy) => settingsByStrategyKey[strategy.key]!,
      symbol: "AAPL.US",
      market: "US",
      timeframe: "realtime",
      bars: realtimeBars,
    });

    assert.equal(runs.length, 2);
    assert.equal(runs[0]?.result.input.bars, realtimeBars);
    assert.ok((runs.find((run) => run.strategy.key === "utorb")?.result.output.signals.length ?? 0) > 0);
    assert.ok((runs.find((run) => run.strategy.key === "trend-targets")?.result.output.render.elements.length ?? 0) > 0);
  });

  it("runs preset strategies from normalized market bars and exposes chart-facing output", () => {
    const registry = createPresetStrategyRegistry();
    const strategy = registry.get("trend-targets");
    assert.ok(strategy);

    const settings: ChartStrategyWorkspaceState = {
      enabled: true,
      showLayer: true,
      parameters: {
        wmaLength: 2,
        emaLength: 2,
        targetOneMultiplier: 0.5,
        targetTwoMultiplier: 1,
        targetThreeMultiplier: 1.5,
        showStopLoss: true,
      },
    };

    const [run] = runChartStrategies({
      strategies: [strategy],
      registry,
      settingsByStrategyKey: { [strategy.key]: settings },
      resolveDefaultSettings: () => settings,
      symbol: "AAPL.US",
      market: "US",
      timeframe: "realtime",
      bars,
    });

    assert.equal(run?.result.input.bars, bars);
    assert.equal(run?.result.input.parameters.wmaLength, 2);
    assert.ok((run?.result.output.signals.length ?? 0) > 0);
    assert.ok((run?.result.output.render.elements.length ?? 0) > 0);
    assert.ok(run?.result.output.logs.some((item) => item.includes("Trend Targets")));

    const signalRows = buildChartStrategySignalRows([run!]);
    assert.ok(signalRows.some((row) => row.direction === "买入"));

    const logItems = buildChartStrategyLogItems([run!], { symbol: "AAPL", timeframe: "realtime" });
    assert.ok(logItems.some((item) => item.includes("运行 Trend Targets")));
  });

  it("recomputes strategy input when parameter settings change", () => {
    const registry = createPresetStrategyRegistry();
    const strategy = registry.get("trend-targets");
    assert.ok(strategy);

    const makeSettings = (targetThreeMultiplier: number): ChartStrategyWorkspaceState => ({
      enabled: true,
      showLayer: true,
      parameters: {
        wmaLength: 2,
        emaLength: 2,
        targetOneMultiplier: 0.5,
        targetTwoMultiplier: 1,
        targetThreeMultiplier,
        showStopLoss: true,
      },
    });

    const firstRun = runChartStrategies({
      strategies: [strategy],
      registry,
      settingsByStrategyKey: { [strategy.key]: makeSettings(1.5) },
      resolveDefaultSettings: (_strategy, _index) => makeSettings(1.5),
      symbol: "AAPL.US",
      market: "US",
      timeframe: "realtime",
      bars,
    })[0];
    const secondRun = runChartStrategies({
      strategies: [strategy],
      registry,
      settingsByStrategyKey: { [strategy.key]: makeSettings(3) },
      resolveDefaultSettings: (_strategy, _index) => makeSettings(3),
      symbol: "AAPL.US",
      market: "US",
      timeframe: "realtime",
      bars,
    })[0];

    assert.equal(firstRun?.result.input.parameters.targetThreeMultiplier, 1.5);
    assert.equal(secondRun?.result.input.parameters.targetThreeMultiplier, 3);
    assert.notDeepEqual(firstRun?.result.output.metrics, secondRun?.result.output.metrics);
  });
});
