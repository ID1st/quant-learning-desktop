import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateRealtimePointBarsToMinuteCandles,
  mergeRealtimeSnapshotPointBars,
  retainRecentRealtimeSessions,
} from "../src/features/marketData/realtimeIntradayBarService.ts";
import type { MarketQuoteSnapshot } from "../src/features/marketData/marketDataSyncService.ts";
import type { MarketBarCacheKey, MarketDataBar } from "../src/features/marketData/marketBarCacheService.ts";

const key: MarketBarCacheKey = {
  symbol: "AAPL.US",
  market: "US",
  timeframe: "realtime",
};

function snapshot(receivedAt: string, price: number): MarketQuoteSnapshot {
  return {
    symbol: "AAPL.US",
    market: "US",
    lastPrice: price,
    previousClose: 200,
    changePercent: ((price - 200) / 200) * 100,
    volume: 1000,
    quoteTime: receivedAt,
    receivedAt,
    provider: "alphafeed",
  };
}

function bar(timestamp: number, close: number): MarketDataBar {
  return {
    symbol: "AAPL.US",
    market: "US",
    timeframe: "realtime",
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    provider: "alphafeed",
  };
}

test("mergeRealtimeSnapshotPointBars appends 10 second quote points for line rendering", () => {
  const bars = [
    snapshot("2026-07-01T14:30:00.000Z", 210),
    snapshot("2026-07-01T14:30:10.000Z", 211),
    snapshot("2026-07-01T14:30:20.000Z", 209),
  ].reduce<MarketDataBar[]>((current, item) => mergeRealtimeSnapshotPointBars(current, key, item), []);

  assert.deepEqual(
    bars.map((item) => [new Date(item.timestamp).toISOString(), item.close]),
    [
      ["2026-07-01T14:30:00.000Z", 210],
      ["2026-07-01T14:30:10.000Z", 211],
      ["2026-07-01T14:30:20.000Z", 209],
    ],
  );
  assert.equal(bars.every((item) => item.open === item.high && item.high === item.low && item.low === item.close), true);
});

test("aggregateRealtimePointBarsToMinuteCandles creates derived minute candles", () => {
  const bars = [
    bar(Date.UTC(2026, 6, 1, 14, 30, 0), 210),
    bar(Date.UTC(2026, 6, 1, 14, 30, 10), 211),
    bar(Date.UTC(2026, 6, 1, 14, 30, 20), 209),
    bar(Date.UTC(2026, 6, 1, 14, 31, 0), 212),
  ];

  const candles = aggregateRealtimePointBarsToMinuteCandles(bars);

  assert.equal(candles.length, 2);
  assert.equal(candles[0]?.open, 210);
  assert.equal(candles[0]?.high, 211);
  assert.equal(candles[0]?.low, 209);
  assert.equal(candles[0]?.close, 209);
  assert.equal(candles[1]?.close, 212);
});

test("retainRecentRealtimeSessions keeps at least current and previous market sessions", () => {
  const bars = [
    bar(Date.UTC(2026, 5, 29, 14, 30), 200),
    bar(Date.UTC(2026, 5, 30, 14, 30), 201),
    bar(Date.UTC(2026, 6, 1, 14, 30), 202),
  ];

  const retained = retainRecentRealtimeSessions(bars, "US");

  assert.deepEqual(
    retained.map((item) => item.close),
    [201, 202],
  );
});
