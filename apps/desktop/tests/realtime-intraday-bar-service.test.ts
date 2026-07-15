import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateRealtimePointBarsToMinuteCandles,
  analyzeRealtimeHistoryGap,
  mergeHistoricalRealtimeBarsWithLiveBars,
  mergeRealtimeSnapshotMinuteBar,
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

test("mergeRealtimeSnapshotMinuteBar updates one canonical OHLC candle per exchange minute", () => {
  const bars = [
    snapshot("2026-07-01T14:30:00.000Z", 210),
    snapshot("2026-07-01T14:30:10.000Z", 211),
    snapshot("2026-07-01T14:30:20.000Z", 209),
  ].reduce<MarketDataBar[]>((current, item) => mergeRealtimeSnapshotMinuteBar(current, key, item), []);

  assert.equal(bars.length, 1);
  assert.deepEqual(
    [new Date(bars[0]!.timestamp).toISOString(), bars[0]!.open, bars[0]!.high, bars[0]!.low, bars[0]!.close],
    ["2026-07-01T14:30:00.000Z", 210, 211, 209, 209],
  );
});

test("mergeRealtimeSnapshotMinuteBar assigns candles by exchange quote time instead of receive time", () => {
  const delayedSnapshot = {
    ...snapshot("2026-07-01T14:31:05.000Z", 212),
    quoteTime: "2026-07-01T14:30:59.000Z",
  };

  const bars = mergeRealtimeSnapshotMinuteBar([], key, delayedSnapshot);

  assert.equal(bars[0]?.timestamp, Date.parse("2026-07-01T14:30:00.000Z"));
});

test("mergeRealtimeSnapshotMinuteBar converts cumulative quote volume into minute volume", () => {
  const snapshots = [
    { ...snapshot("2026-07-01T14:30:10.000Z", 210), volume: 1_000, amount: 210_000 },
    { ...snapshot("2026-07-01T14:31:10.000Z", 211), volume: 1_125, amount: 236_375 },
    { ...snapshot("2026-07-01T14:31:40.000Z", 212), volume: 1_150, amount: 241_675 },
  ];

  const bars = snapshots.reduce<MarketDataBar[]>(
    (current, item) => mergeRealtimeSnapshotMinuteBar(current, key, item),
    [],
  );

  assert.deepEqual(bars.map((item) => item.volume), [1_000, 150]);
  assert.deepEqual(bars.map((item) => item.amount), [210_000, 31_675]);
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

test("retainRecentRealtimeSessions keeps five sessions for recursive strategy warmup", () => {
  const bars = [
    bar(Date.UTC(2026, 5, 25, 14, 30), 198),
    bar(Date.UTC(2026, 5, 26, 14, 30), 199),
    bar(Date.UTC(2026, 5, 29, 14, 30), 200),
    bar(Date.UTC(2026, 5, 30, 14, 30), 201),
    bar(Date.UTC(2026, 6, 1, 14, 30), 202),
    bar(Date.UTC(2026, 6, 2, 14, 30), 203),
  ];

  const retained = retainRecentRealtimeSessions(bars, "US");

  assert.deepEqual(
    retained.map((item) => item.close),
    [199, 200, 201, 202, 203],
  );
});

test("mergeHistoricalRealtimeBarsWithLiveBars keeps newer AlphaFeed points after delayed LongBridge history", () => {
  const key = { symbol: "9988.HK", market: "HK" as const, timeframe: "realtime" as const };
  const historicalBars = [
    {
      ...key,
      timestamp: Date.parse("2026-07-02T02:00:00.000Z"),
      open: 80,
      high: 80,
      low: 80,
      close: 80,
      volume: 1000,
      provider: "longport" as const,
    },
  ];
  const currentBars = [
    ...historicalBars,
    {
      ...key,
      timestamp: Date.parse("2026-07-02T02:15:00.000Z"),
      open: 80.5,
      high: 80.5,
      low: 80.5,
      close: 80.5,
      volume: 1200,
      provider: "alphafeed" as const,
    },
  ];

  const merged = mergeHistoricalRealtimeBarsWithLiveBars(historicalBars, currentBars, key);

  assert.deepEqual(
    merged.map((bar) => [bar.timestamp, bar.provider, bar.close]),
    [
      [Date.parse("2026-07-02T02:00:00.000Z"), "longport", 80],
      [Date.parse("2026-07-02T02:15:00.000Z"), "alphafeed", 80.5],
    ],
  );
});

test("mergeHistoricalRealtimeBarsWithLiveBars keeps newer gateway live-provider points", () => {
  const key = {
    symbol: "AAPL.US",
    market: "US" as const,
    timeframe: "realtime" as const,
  };

  const merged = mergeHistoricalRealtimeBarsWithLiveBars(
    [
      {
        ...key,
        timestamp: Date.UTC(2026, 6, 1, 13, 30),
        open: 294,
        high: 294,
        low: 294,
        close: 294,
        volume: 1000,
        provider: "longbridge",
      },
    ],
    [
      {
        ...key,
        timestamp: Date.UTC(2026, 6, 1, 13, 30, 10),
        open: 294.28,
        high: 294.28,
        low: 294.28,
        close: 294.28,
        volume: 1001,
        provider: "alphafeed-websocket",
      },
      {
        ...key,
        timestamp: Date.UTC(2026, 6, 1, 13, 30, 20),
        open: 294.3,
        high: 294.3,
        low: 294.3,
        close: 294.3,
        volume: 1002,
        provider: "stock-sdk",
      },
    ],
    key,
  );

  assert.deepEqual(
    merged.map((bar) => bar.provider),
    ["longbridge", "alphafeed-websocket", "stock-sdk"],
  );
});

test("mergeHistoricalRealtimeBarsWithLiveBars lets a live update refresh the same historical minute", () => {
  const timestamp = Date.UTC(2026, 6, 1, 13, 30);
  const historical = {
    ...key,
    timestamp,
    open: 200,
    high: 201,
    low: 199,
    close: 200,
    volume: 1_000,
    provider: "longbridge" as const,
  };
  const live = {
    ...key,
    timestamp,
    open: 200,
    high: 202,
    low: 198,
    close: 201,
    volume: 120,
    provider: "stock-sdk" as const,
  };

  const merged = mergeHistoricalRealtimeBarsWithLiveBars([historical], [live], key);

  assert.equal(merged.length, 1);
  assert.deepEqual(
    [merged[0]?.open, merged[0]?.high, merged[0]?.low, merged[0]?.close, merged[0]?.volume, merged[0]?.provider],
    [200, 202, 198, 201, 120, "stock-sdk"],
  );
});

test("mergeHistoricalRealtimeBarsWithLiveBars retains the previous cached market session when the source only returns today", () => {
  const key = { symbol: "00700.HK", market: "HK" as const, timeframe: "realtime" as const };
  const previousSessionBar = {
    ...key,
    timestamp: Date.parse("2026-07-10T08:00:00.000Z"),
    open: 400,
    high: 400,
    low: 400,
    close: 400,
    volume: 1000,
    provider: "stock-sdk" as const,
  };
  const currentSessionBar = {
    ...key,
    timestamp: Date.parse("2026-07-13T01:30:00.000Z"),
    open: 401,
    high: 401,
    low: 401,
    close: 401,
    volume: 1000,
    provider: "stock-sdk" as const,
  };

  const merged = mergeHistoricalRealtimeBarsWithLiveBars([currentSessionBar], [previousSessionBar], key);

  assert.deepEqual(merged.map((bar) => bar.timestamp), [previousSessionBar.timestamp, currentSessionBar.timestamp]);
});

test("analyzeRealtimeHistoryGap reports delayed history bridged by AlphaFeed live points", () => {
  const key = { symbol: "9988.HK", market: "HK" as const, timeframe: "realtime" as const };
  const bars: MarketDataBar[] = [
    {
      ...key,
      timestamp: Date.parse("2026-07-02T02:00:00.000Z"),
      open: 80,
      high: 80,
      low: 80,
      close: 80,
      volume: 1000,
      provider: "longport",
    },
    {
      ...key,
      timestamp: Date.parse("2026-07-02T02:15:00.000Z"),
      open: 80.5,
      high: 80.5,
      low: 80.5,
      close: 80.5,
      volume: 1200,
      provider: "alphafeed",
    },
  ];

  const gap = analyzeRealtimeHistoryGap(bars, key, Date.parse("2026-07-02T02:16:00.000Z"), 5 * 60_000);

  assert.equal(gap.hasGap, true);
  assert.equal(gap.isBridgedByLiveData, true);
  assert.equal(gap.gapMs, 15 * 60_000);
});
