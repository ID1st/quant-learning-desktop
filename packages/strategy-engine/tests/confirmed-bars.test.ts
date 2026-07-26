import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPresetStrategyRegistry,
  runRegisteredStrategy,
  type Bar,
} from "../src/index.ts";

function createBars(count: number): Bar[] {
  const start = Date.parse("2026-07-07T13:30:00Z");
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.02 + Math.sin(index / 5) * 4;
    return {
      timestamp: start + index * 60_000,
      open: close - 0.2,
      high: close + 0.8,
      low: close - 0.8,
      close,
      volume: 1_000 + index,
    };
  });
}

describe("confirmed realtime strategy boundary", () => {
  for (const strategyKey of ["utorb", "trend-targets", "smart-money-concepts"]) {
    it(`${strategyKey} ignores changes to the open candle`, () => {
      const registry = createPresetStrategyRegistry();
      const bars = createBars(260);
      const confirmedThroughTimestamp = bars.at(-2)!.timestamp;
      const changed = bars.map((bar, index) =>
        index === bars.length - 1
          ? { ...bar, high: bar.high + 100, low: Math.max(0.01, bar.low - 90), close: bar.close + 70 }
          : bar);
      const run = (inputBars: Bar[]) => runRegisteredStrategy(registry, {
        strategyKey,
        symbol: "AAPL.US",
        market: "US",
        timeframe: "realtime",
        bars: inputBars,
        confirmedThroughTimestamp,
        runMode: "realtime",
        enabled: true,
        parameters: strategyKey === "utorb"
          ? { sessionStartHour: 9, sessionStartMinute: 30, timezoneMode: "market" }
          : strategyKey === "smart-money-concepts"
            ? { swingLength: 10, showSwingPoints: true }
            : {},
      }).output;

      assert.deepEqual(run(changed), run(bars));
    });
  }
});
