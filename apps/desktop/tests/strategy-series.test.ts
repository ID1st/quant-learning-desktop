import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aggregateBarsToTimeframe, createStrategySeriesByTimeframe } from "../src/features/strategies/strategySeries.ts";

const minuteBars = Array.from({ length: 60 }, (_, index) => ({
  timestamp: Date.UTC(2025, 0, 1, 9, index),
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100.5 + index,
  volume: 10,
}));

describe("strategy timeframe series", () => {
  it("aggregates standard one-minute OHLCV bars without downsampling the primary input", () => {
    const bars = aggregateBarsToTimeframe(minuteBars, "15m");

    assert.equal(bars.length, 4);
    assert.deepEqual(bars[0], {
      timestamp: Date.UTC(2025, 0, 1, 9, 0),
      open: 100,
      high: 115,
      low: 99,
      close: 114.5,
      volume: 150,
    });
  });

  it("provides 5m/15m/30m/1h plus cached daily and weekly series", () => {
    const daily = [minuteBars[0]];
    const weekly = [minuteBars[0]];
    const series = createStrategySeriesByTimeframe({
      primaryBars: minuteBars,
      primaryTimeframe: "realtime",
      dailyBars: daily,
      weeklyBars: weekly,
    });

    assert.equal(series.realtime, minuteBars);
    assert.equal(series["1m"], minuteBars);
    assert.equal(series["5m"]?.length, 12);
    assert.equal(series["15m"]?.length, 4);
    assert.equal(series["30m"]?.length, 2);
    assert.equal(series["1h"]?.length, 1);
    assert.equal(series["1d"], daily);
    assert.equal(series["1w"], weekly);
  });

  it("does not expose a still-forming higher-timeframe bucket", () => {
    assert.equal(aggregateBarsToTimeframe(minuteBars.slice(0, 58), "5m").length, 11);
    assert.equal(aggregateBarsToTimeframe(minuteBars.slice(0, 58), "15m").length, 3);
  });
});
