import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createPresetStrategyRegistry,
  type Bar,
  type StrategySignal,
} from "@quant/strategy-engine";
import {
  buildChartStrategyLogItems,
  buildChartStrategySignalRows,
  formatChartStrategySignalName,
  getMlptChartNotice,
  getRealtimeStrategyHistoryRequirement,
  runChartStrategies,
  type ChartStrategyWorkspaceState,
} from "../src/features/strategies/chartStrategyRuntime.ts";

const bars: Bar[] = [10, 11, 12, 11, 10, 9, 10, 11, 12, 13].map((close, index) => ({
  timestamp: Date.parse("2026-07-07T13:30:00.000Z") + index * 60_000,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1000 + index * 100,
}));

describe("chart strategy runtime", () => {
  it("formats MLPT warm-up as a compact chart notice and hides it when ready", () => {
    const strategy = createPresetStrategyRegistry().get("machine-learning-price-targets")!;
    const createRun = (modelReady: number, confirmedBarCount: number) => ({
      strategy,
      settings: { enabled: true, showLayer: true, parameters: {} },
      result: {
        strategy,
        input: {
          symbol: "AAPL.US",
          market: "US" as const,
          timeframe: "realtime" as const,
          bars: [],
          parameters: {},
        },
        output: {
          signals: [],
          overlays: [],
          render: {
            strategyId: strategy.key,
            strategyName: strategy.name,
            enabled: true,
            zIndex: 30,
            elements: [],
          },
          metrics: { modelReady, confirmedBarCount },
          logs: [],
          alerts: [],
        },
      },
    });

    assert.equal(
      getMlptChartNotice([createRun(0, 420)]),
      "MLPT 数据不足：已确认 420 / 1000 根分钟线，模型估计图层暂未加载",
    );
    assert.equal(
      getMlptChartNotice([createRun(0, 1_000)]),
      "MLPT 正在等待有效训练样本，模型估计图层暂未加载",
    );
    assert.equal(getMlptChartNotice([createRun(1, 1_200)]), null);
  });

  it("hides LuxAlgo and AlgoAlpha suffixes in strategy display names", () => {
    assert.equal(
      formatChartStrategySignalName({
        key: "smart-money-concepts",
        name: "Smart Money Concepts [LuxAlgo]",
      }),
      "Smart Money Concepts",
    );
    assert.equal(
      formatChartStrategySignalName({ key: "example-plugin", name: "Example [LuxAlgo]" }),
      "Example",
    );
    assert.equal(
      formatChartStrategySignalName({
        key: "machine-learning-price-targets",
        name: "Machine Learning Price Target Prediction Signals [AlgoAlpha]",
      }),
      "Machine Learning Price Target Prediction Signals",
    );
  });

  it("presents internal strategy signal types as neutral condition events", () => {
    const strategy = createPresetStrategyRegistry().get("utorb")!;
    const signals: StrategySignal[] = [
      { timestamp: bars[0]!.timestamp, type: "buy", price: 10 },
      { timestamp: bars[1]!.timestamp, type: "sell", price: 11 },
      { timestamp: bars[2]!.timestamp, type: "exit", price: 12 },
      { timestamp: bars[3]!.timestamp, type: "alert", price: 11 },
    ];
    const run = {
      strategy,
      settings: { enabled: true, showLayer: true, parameters: {} },
      result: {
        strategy,
        input: {
          symbol: "AAPL.US",
          market: "US" as const,
          timeframe: "realtime" as const,
          bars,
          parameters: {},
          runMode: "realtime" as const,
        },
        output: {
          signals,
          overlays: [],
          render: {
            strategyId: strategy.key,
            strategyName: strategy.name,
            enabled: true,
            zIndex: 30,
            elements: [],
          },
          metrics: {},
          logs: [],
          alerts: [],
        },
      },
    };

    assert.deepEqual(
      buildChartStrategySignalRows([run]).map(({ direction, tone }) => ({ direction, tone })),
      [
        { direction: "向上条件触发", tone: "buy" },
        { direction: "向下条件触发", tone: "sell" },
        { direction: "条件失效", tone: "exit" },
        { direction: "规则条件触发", tone: "alert" },
      ],
    );
  });

  it("uses the largest enabled realtime history requirement", () => {
    const registry = createPresetStrategyRegistry();
    const strategies = registry.list();
    const disabled = Object.fromEntries(
      strategies.map((strategy) => [
        strategy.key,
        { enabled: false, showLayer: true, parameters: {} },
      ]),
    );

    assert.deepEqual(getRealtimeStrategyHistoryRequirement(strategies, disabled), {
      minimumBars: 0,
      preferredBars: 2_500,
      sessionCount: 5,
    });
    assert.deepEqual(
      getRealtimeStrategyHistoryRequirement(strategies, {
        ...disabled,
        "machine-learning-price-targets": { enabled: true, showLayer: true, parameters: {} },
      }),
      {
        minimumBars: 1_000,
        preferredBars: 5_000,
        sessionCount: 22,
      },
    );
  });

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
        parameters: {
          sessionStartHour: 8,
          sessionStartMinute: 30,
          openingRangeMinutes: 15,
          timezoneMode: "fixed-offset",
          timezoneOffsetHours: -5,
          showTargets: true,
        },
      },
      "trend-targets": {
        enabled: true,
        showLayer: true,
        parameters: {
          wmaLength: 2,
          emaLength: 2,
          supertrendFactor: 1,
          supertrendAtrPeriod: 2,
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
    assert.ok(
      (runs.find((run) => run.strategy.key === "utorb")?.result.output.signals.length ?? 0) > 0,
    );
    assert.ok(
      (runs.find((run) => run.strategy.key === "trend-targets")?.result.output.render.elements
        .length ?? 0) > 0,
    );
    assert.ok(
      runs
        .find((run) => run.strategy.key === "utorb")
        ?.result.output.render.elements.some(
          (element) => element.kind === "price-line" && element.toTimestamp !== undefined,
        ),
    );
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
        supertrendFactor: 1,
        supertrendAtrPeriod: 2,
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
    assert.ok(signalRows.some((row) => row.direction === "向上条件触发"));

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
        supertrendFactor: 1,
        supertrendAtrPeriod: 2,
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

  it("passes the confirmed bar boundary into strategy input", () => {
    const registry = createPresetStrategyRegistry();
    const strategy = registry.get("machine-learning-price-targets");
    assert.ok(strategy);
    const confirmedThroughTimestamp = bars.at(-2)!.timestamp;
    const settings = { enabled: true, showLayer: true, parameters: {} };

    const [result] = runChartStrategies({
      strategies: [strategy],
      registry,
      settingsByStrategyKey: { [strategy.key]: settings },
      resolveDefaultSettings: () => settings,
      symbol: "AAPL.US",
      market: "US",
      timeframe: "realtime",
      bars,
      confirmedThroughTimestamp,
    });

    assert.equal(result?.result.input.confirmedThroughTimestamp, confirmedThroughTimestamp);
    assert.equal(result?.result.input.runMode, "realtime");
  });

  it("reuses MLPT output while only the unconfirmed candle changes", () => {
    const registry = createPresetStrategyRegistry();
    const baseStrategy = registry.get("machine-learning-price-targets");
    assert.ok(baseStrategy);
    let executionCount = 0;
    const strategy = {
      ...baseStrategy,
      run(input: Parameters<typeof baseStrategy.run>[0]) {
        executionCount += 1;
        return baseStrategy.run(input);
      },
    };
    registry.register(strategy);
    const mlptBars = Array.from({ length: 1_200 }, (_, index): Bar => {
      const close = 100 + Math.sin(index / 20) * 4 + index * 0.005;
      return {
        timestamp: Date.parse("2026-01-01T00:00:00Z") + index * 60_000,
        open: close - 0.1,
        high: close + 0.5,
        low: close - 0.5,
        close,
        volume: 10_000,
      };
    });
    const confirmedThroughTimestamp = mlptBars.at(-2)!.timestamp;
    const settings = { enabled: true, showLayer: true, parameters: {} };
    const run = (inputBars: Bar[]) =>
      runChartStrategies({
        strategies: [strategy],
        registry,
        settingsByStrategyKey: { [strategy.key]: settings },
        resolveDefaultSettings: () => settings,
        symbol: "AAPL.US",
        market: "US",
        timeframe: "realtime",
        bars: inputBars,
        confirmedThroughTimestamp,
      })[0]!;

    const first = run(mlptBars);
    const changedOpenCandle = mlptBars.map((bar, index) =>
      index === mlptBars.length - 1 ? { ...bar, close: bar.close + 20, high: bar.high + 20 } : bar,
    );
    const second = run(changedOpenCandle);

    assert.equal(executionCount, 1);
    assert.deepEqual(second.result.output, first.result.output);
    assert.equal(second.result.input.bars, changedOpenCandle);

    const correctedHistory = changedOpenCandle.map((bar, index) =>
      index === 500 ? { ...bar, close: bar.close + 1 } : bar,
    );
    run(correctedHistory);
    assert.equal(executionCount, 2);
  });
});
