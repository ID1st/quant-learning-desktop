import test from "node:test";
import assert from "node:assert/strict";

import {
  createChartWatchlistWarmupPlan,
  isChartWarmupCacheFresh,
} from "../src/features/marketData/chartWatchlistWarmupService.ts";

test("watchlist warmup puts every active-symbol period ahead of background work", () => {
  const plan = createChartWatchlistWarmupPlan(
    [
      { market: "US", symbol: "AAPL.US" },
      { market: "US", symbol: "TSLA.US" },
    ],
    { market: "US", symbol: "TSLA.US" },
  );

  assert.deepEqual(plan.slice(0, 3).map((task) => `${task.symbol}:${task.timeframe}:${task.priority}`), [
    "TSLA.US:1d:active",
    "TSLA.US:1w:active",
    "TSLA.US:realtime:active",
  ]);
  assert.equal(plan.length, 6);
});

test("watchlist warmup only treats recent timeframe caches as fresh", () => {
  const now = Date.parse("2026-07-11T09:00:00.000Z");

  assert.equal(isChartWarmupCacheFresh("realtime", "2026-07-11T08:59:30.000Z", now), true);
  assert.equal(isChartWarmupCacheFresh("realtime", "2026-07-11T08:58:00.000Z", now), false);
  assert.equal(isChartWarmupCacheFresh("1w", "2026-07-11T05:00:00.000Z", now), true);
});
