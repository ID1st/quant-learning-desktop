import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aggregateBarsToTimeframe, createStrategySeriesByTimeframe } from "../src/features/strategies/strategySeries.ts";

function createMinuteBars(
  startTimestamp: number,
  count: number,
) {
  return Array.from({ length: count }, (_, index) => ({
  timestamp: startTimestamp + index * 60_000,
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100.5 + index,
  volume: 10,
  }));
}

const minuteBars = createMinuteBars(
  Date.UTC(2026, 6, 2, 13, 30),
  60,
);

describe("strategy timeframe series", () => {
  it("aggregates standard one-minute OHLCV bars without downsampling the primary input", () => {
    const bars = aggregateBarsToTimeframe({
      bars: minuteBars,
      market: "US",
      timeframe: "15m",
      asOfTimestamp: Date.UTC(2026, 6, 2, 20, 0),
    });

    assert.equal(bars.length, 4);
    assert.deepEqual(bars[0], {
      timestamp: Date.UTC(2026, 6, 2, 13, 30),
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
      market: "US",
      asOfTimestamp: Date.UTC(2026, 6, 2, 20, 0),
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
    const asOfTimestamp = minuteBars.at(-3)!.timestamp + 60_000;
    assert.equal(aggregateBarsToTimeframe({
      bars: minuteBars.slice(0, 58),
      market: "US",
      timeframe: "5m",
      asOfTimestamp,
    }).length, 11);
    assert.equal(aggregateBarsToTimeframe({
      bars: minuteBars.slice(0, 58),
      market: "US",
      timeframe: "15m",
      asOfTimestamp,
    }).length, 3);
  });

  it("anchors US hourly bars at 09:30 and emits the closed 30-minute tail", () => {
    const bars = createMinuteBars(
      Date.UTC(2026, 6, 2, 13, 30),
      390,
    );

    const aggregated = aggregateBarsToTimeframe({
      bars,
      market: "US",
      timeframe: "1h",
      asOfTimestamp: Date.UTC(2026, 6, 2, 20, 0),
    });

    assert.equal(aggregated.length, 7);
    assert.equal(aggregated[0]?.timestamp, Date.UTC(2026, 6, 2, 13, 30));
    assert.equal(aggregated.at(-1)?.timestamp, Date.UTC(2026, 6, 2, 19, 30));
  });

  it("does not aggregate CN minute bars across the lunch break", () => {
    const morning = createMinuteBars(
      Date.UTC(2026, 6, 30, 1, 30),
      120,
    );
    const afternoon = createMinuteBars(
      Date.UTC(2026, 6, 30, 5, 0),
      120,
    );

    const aggregated = aggregateBarsToTimeframe({
      bars: [...morning, ...afternoon],
      market: "CN",
      timeframe: "1h",
      asOfTimestamp: Date.UTC(2026, 6, 30, 7, 0),
    });

    assert.equal(aggregated.length, 4);
    assert.deepEqual(
      aggregated.map((bar) => bar.timestamp),
      [
        Date.UTC(2026, 6, 30, 1, 30),
        Date.UTC(2026, 6, 30, 2, 30),
        Date.UTC(2026, 6, 30, 5, 0),
        Date.UTC(2026, 6, 30, 6, 0),
      ],
    );
  });
});
