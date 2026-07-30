import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ema, highest, lowest, sma } from "@quant/pine-runtime";

import {
  createMachineLearningPriceTargetsStrategyDefinition,
  createMachineLearningPriceTargetsVisualFixture,
  createPresetStrategyRegistry,
  runRegisteredStrategy,
  type Bar,
} from "../src/index.ts";
import { machineLearningPriceTargetsTestSupport } from "../src/machineLearningPriceTargets.ts";

function createWaveBars(count: number, volume = 10_000): Bar[] {
  let close = 100;

  return Array.from({ length: count }, (_, index) => {
    const phase = Math.floor(index / 90) % 2 === 0 ? 1 : -1;
    close = Math.max(20, close + phase * 0.32 + Math.sin(index / 7) * 0.08);

    return {
      timestamp: 1_700_000_000_000 + index * 60_000,
      open: close - phase * 0.08,
      high: close + 0.35 + Math.sin(index / 13) ** 2 * 0.2,
      low: close - 0.35 - Math.cos(index / 17) ** 2 * 0.15,
      close,
      volume,
    };
  });
}

function run(bars: Bar[], confirmedThroughTimestamp?: number) {
  return runRegisteredStrategy(createPresetStrategyRegistry(), {
    strategyKey: "machine-learning-price-targets",
    symbol: "AAPL.US",
    market: "US",
    timeframe: "realtime",
    bars,
    confirmedThroughTimestamp,
    runMode: "realtime",
    enabled: true,
  }).output;
}

describe("Machine Learning Price Targets preset", () => {
  it("calculates all eight source-aligned feature series", () => {
    const bars = createWaveBars(1_200);
    const scaledTrend = bars.map((_, index) => (index % 180 < 90 ? 1 : 0));
    const features = machineLearningPriceTargetsTestSupport.calculateFeatureSeries(
      bars,
      scaledTrend,
    );

    assert.equal(features.length, 8);
    assert.equal(features[7], scaledTrend);
    assert.ok(features.every((feature) => Number.isFinite(feature.at(-1))));

    const ranges = bars.map((bar) => bar.high - bar.low);
    const volatility = sma(ranges, 40);
    const volatilityMean = ema(volatility, 20);
    const volatilityChange = volatility.map((value, index) =>
      value !== null && volatilityMean[index] !== null ? value - volatilityMean[index]! : null,
    );
    const acceleration = ema(volatilityChange, 10);
    const secondDerivative = volatilityChange.map((value, index) =>
      value !== null && acceleration[index] !== null ? value - acceleration[index]! : null,
    );
    const normalizedLatest = (series: readonly (number | null)[]) => {
      const low = lowest(series, 1_000).at(-1)!;
      const high = highest(series, 1_000).at(-1)!;
      return ((series.at(-1)! - low) / (high - low)) * 100;
    };

    assert.ok(Math.abs(features[2]!.at(-1)! - normalizedLatest(volatilityChange)) < 1e-12);
    assert.ok(Math.abs(features[3]!.at(-1)! - normalizedLatest(secondDerivative)) < 1e-12);
  });

  it("uses Euclidean RBF weights and rejects invalid reward/risk boundaries", () => {
    const feature = (value: number) => ({
      values: Array(8).fill(value) as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ],
    });
    const predicted = machineLearningPriceTargetsTestSupport.predictRbf(
      [
        { features: feature(0), target: 0.1 },
        { features: feature(1), target: 0.3 },
      ],
      feature(0),
      2,
    );
    const distantWeight = Math.exp(-2);
    const expected = (0.1 + distantWeight * 0.3) / (1 + distantWeight);

    assert.ok(predicted !== null && Math.abs(predicted - expected) < 1e-12);
    assert.equal(machineLearningPriceTargetsTestSupport.calculateRewardRisk(null), null);
    assert.equal(machineLearningPriceTargetsTestSupport.calculateRewardRisk(0), null);
    assert.equal(machineLearningPriceTargetsTestSupport.calculateRewardRisk(1), null);
    assert.equal(machineLearningPriceTargetsTestSupport.calculateRewardRisk(0.5), 1);
  });

  it("uses the conservative stop when one confirmed candle touches both levels", () => {
    assert.equal(
      machineLearningPriceTargetsTestSupport.resolveTradeHit(
        {
          direction: 1,
          targetPrice: 110,
          stopPrice: 90,
        },
        {
          high: 111,
          low: 89,
        },
      ),
      "stop",
    );
  });

  it("registers a disabled realtime-only indicator with its history requirement", () => {
    const strategy = createMachineLearningPriceTargetsStrategyDefinition();

    assert.equal(strategy.key, "machine-learning-price-targets");
    assert.equal(strategy.defaultEnabled, false);
    assert.equal(strategy.strategyType, "indicator");
    assert.deepEqual(strategy.supportedMarkets, ["CN", "HK", "US"]);
    assert.deepEqual(strategy.supportedTimeframes, ["realtime"]);
    assert.deepEqual(strategy.realtimeHistoryRequirement, {
      minimumBars: 1_000,
      preferredBars: 5_000,
      sessionCount: 22,
    });
  });

  it("keeps the full HUD hidden before 1000 confirmed bars", () => {
    const output = run(createWaveBars(999));

    assert.equal(output.signals.length, 0);
    assert.equal(output.overlays.length, 0);
    assert.equal(output.metrics.modelReady, 0);
    assert.equal(output.metrics.confirmedBarCount, 999);
    assert.deepEqual(output.render.hudPanels, []);
    assert.match(output.logs.join(" "), /预热/);
  });

  it("keeps the full HUD hidden while waiting for the first valid training sample", () => {
    const output = run(createWaveBars(1_000));

    assert.equal(output.metrics.modelReady, 0);
    assert.equal(output.signals.length, 0);
    assert.equal(output.metrics.trainingSampleCount, 0);
    assert.deepEqual(output.render.hudPanels, []);
  });

  it("fails closed when the vendor provides no cumulative volume", () => {
    const output = run(createWaveBars(1_200, 0));

    assert.equal(output.signals.length, 0);
    assert.equal(output.overlays.length, 0);
    assert.match(output.logs.join(" "), /成交量不可用/);
  });

  it("trains RBF samples and emits chart/HUD output after warm-up", () => {
    const output = run(createWaveBars(1_800));
    const elementKinds = new Set(output.overlays.map((element) => element.kind));

    assert.ok((output.metrics.trainingSampleCount ?? 0) > 0);
    assert.equal(output.metrics.modelReady, 1);
    assert.ok(elementKinds.has("candle-style"));
    assert.ok(elementKinds.has("band"));
    assert.ok(elementKinds.has("signal-marker"));
    assert.equal(output.render.hudPanels?.[0]?.rows.length, 6);
    assert.ok(output.overlays.length <= 1_000);
    assert.ok(output.signals.some((signal) => signal.type === "buy"));
    assert.ok(output.signals.some((signal) => signal.type === "sell"));
  });

  it("does not let an unconfirmed final candle change committed state", () => {
    const bars = createWaveBars(1_800);
    const confirmedThroughTimestamp = bars.at(-2)!.timestamp;
    const changed = bars.map((bar, index) =>
      index === bars.length - 1
        ? { ...bar, high: bar.high + 80, low: Math.max(1, bar.low - 80), close: bar.close + 50 }
        : bar,
    );

    const baseline = run(bars, confirmedThroughTimestamp);
    const withChangedOpenBar = run(changed, confirmedThroughTimestamp);

    assert.deepEqual(withChangedOpenBar.signals, baseline.signals);
    assert.deepEqual(withChangedOpenBar.overlays, baseline.overlays);
    assert.deepEqual(withChangedOpenBar.metrics, baseline.metrics);
  });

  it("keeps a fixed visual fixture with target, risk, marker, candle and HUD states", () => {
    const output = run(createMachineLearningPriceTargetsVisualFixture());
    const kinds = new Set(output.render.elements.map((element) => element.kind));

    assert.ok(kinds.has("band"));
    assert.ok(kinds.has("signal-marker"));
    assert.ok(kinds.has("candle-style"));
    assert.equal(output.render.hudPanels?.[0]?.placement, "top-right");
  });
});
