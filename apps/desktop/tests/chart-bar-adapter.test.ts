import assert from "node:assert/strict";
import { test } from "node:test";
import { marketBarsToCandles, marketBarsToStrategyBars } from "../src/features/marketData/chartBarAdapter.ts";
import type { MarketDataBar } from "../src/features/marketData/marketBarCacheService.ts";

const baseBar: MarketDataBar = {
  symbol: "AAPL.US",
  market: "US",
  timeframe: "1d",
  timestamp: Date.UTC(2026, 5, 30),
  open: 280,
  high: 286,
  low: 279,
  close: 285,
  volume: 1024,
  provider: "alphafeed",
};

test("marketBarsToStrategyBars keeps only finite renderable OHLCV bars", () => {
  const bars = marketBarsToStrategyBars([
    baseBar,
    { ...baseBar, timestamp: Date.UTC(2026, 6, 1), high: 270 },
    { ...baseBar, timestamp: Number.NaN },
  ]);

  assert.deepEqual(bars, [
    {
      timestamp: Date.UTC(2026, 5, 30),
      open: 280,
      high: 286,
      low: 279,
      close: 285,
      volume: 1024,
    },
  ]);
});

test("marketBarsToCandles formats labels in Beijing time for chart rendering", () => {
  const candles = marketBarsToCandles([
    baseBar,
    {
      ...baseBar,
      timeframe: "15m",
      timestamp: Date.UTC(2026, 5, 30, 14, 45),
    },
    {
      ...baseBar,
      timestamp: Date.UTC(2026, 5, 30, 13, 30),
    },
    {
      ...baseBar,
      timeframe: "realtime",
      timestamp: Date.UTC(2026, 5, 30, 14, 45, 10),
    },
  ]);

  assert.equal(candles[0]?.time, "2026-06-30");
  assert.equal(candles[1]?.time, "2026-06-30 22:45");
  assert.equal(candles[1]?.close, 285);
  assert.equal(candles[2]?.time, "2026-06-30");
  assert.equal(candles[3]?.time, "2026-06-30 22:45:10");
});
