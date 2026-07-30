import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LocalDatabase,
  createMemoryStorageDriver,
} from "../src/features/persistence/localDatabase.ts";
import {
  clearAllMarketBarCache,
  pruneMarketBarCache,
  readMarketBarCache,
  readMarketBarCacheSummary,
  writeMarketBarCache,
  type MarketDataBar,
} from "../src/features/marketData/marketBarCacheService.ts";

function createTestDatabase(seed: Record<string, string> = {}) {
  return new LocalDatabase(createMemoryStorageDriver(seed), "test");
}

const cacheKey = {
  symbol: "600519.SH",
  market: "CN" as const,
  timeframe: "1d" as const,
};

test("writeMarketBarCache stores sorted unique bars for one symbol and timeframe", () => {
  const database = createTestDatabase();
  const bars: MarketDataBar[] = [
    {
      symbol: "600519.SH",
      market: "CN",
      timeframe: "1d",
      timestamp: 1782864000000,
      open: 1460,
      high: 1472,
      low: 1455,
      close: 1468.1,
      volume: 1100,
      amount: 1614910,
      provider: "alphafeed",
    },
    {
      symbol: "600519.SH",
      market: "CN",
      timeframe: "1d",
      timestamp: 1782777600000,
      open: 1450,
      high: 1468,
      low: 1448,
      close: 1462,
      volume: 1000,
      provider: "alphafeed",
    },
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "1d",
      timestamp: 1782777600000,
      open: 280,
      high: 286,
      low: 279,
      close: 285,
      volume: 1000,
      provider: "alphafeed",
    },
  ];

  const written = writeMarketBarCache(cacheKey, bars, { database });
  const cached = readMarketBarCache(cacheKey, { database });

  assert.deepEqual(
    written.map((bar) => bar.timestamp),
    [1782777600000, 1782864000000],
  );
  assert.equal(cached.length, 2);
  assert.equal(cached[0]?.close, 1462);
  assert.equal(cached[1]?.amount, 1614910);
});

test("writeMarketBarCache can merge a sparse refresh without deleting cached history", () => {
  const database = createTestDatabase();
  const firstDay = Date.UTC(2026, 6, 1);
  const secondDay = Date.UTC(2026, 6, 2);
  const thirdDay = Date.UTC(2026, 6, 3);
  const createBar = (timestamp: number, close: number): MarketDataBar => ({
    ...cacheKey,
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
    provider: "stock-sdk",
  });
  writeMarketBarCache(
    cacheKey,
    [createBar(firstDay, 100), createBar(secondDay, 101), createBar(thirdDay, 102)],
    { database },
  );

  writeMarketBarCache(cacheKey, [createBar(thirdDay, 103)], { database, mergeExisting: true });

  assert.deepEqual(
    readMarketBarCache(cacheKey, { database }).map((item) => [item.timestamp, item.close]),
    [
      [firstDay, 100],
      [secondDay, 101],
      [thirdDay, 103],
    ],
  );
});

test("market bar cache metadata preserves MLPT coverage and contributing providers", () => {
  const database = createTestDatabase();
  const key = { symbol: "AAPL.US", market: "US" as const, timeframe: "realtime" as const };
  writeMarketBarCache(
    key,
    [
      {
        ...key,
        timestamp: 1_800_000_000_000,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 100,
        provider: "stock-sdk",
      },
      {
        ...key,
        timestamp: 1_800_000_060_000,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 100,
        provider: "longbridge",
      },
    ],
    {
      database,
      historicalCompletion: {
        targetBars: 5_000,
        confirmedBars: 2,
        targetSatisfied: false,
        stopReason: "sources_exhausted",
      },
    },
  );

  const metadata = readMarketBarCacheSummary(database).entries[0];
  assert.deepEqual(metadata?.providers, ["stock-sdk", "longbridge"]);
  assert.deepEqual(metadata?.historicalCompletion, {
    targetBars: 5_000,
    confirmedBars: 2,
    targetSatisfied: false,
    stopReason: "sources_exhausted",
  });
});

test("writeMarketBarCache keeps one daily bar when providers timestamp the same trading day differently", () => {
  const database = createTestDatabase();
  const key = {
    symbol: "09988.HK",
    market: "HK" as const,
    timeframe: "1d" as const,
  };
  const createBar = (
    timestamp: number,
    close: number,
    provider: MarketDataBar["provider"],
  ): MarketDataBar => ({
    ...key,
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
    provider,
  });

  writeMarketBarCache(
    key,
    [
      createBar(Date.UTC(2026, 6, 24), 109, "alphafeed-rest"),
      createBar(Date.UTC(2026, 6, 25), 111, "alphafeed-rest"),
    ],
    { database },
  );
  const written = writeMarketBarCache(
    key,
    [createBar(Date.UTC(2026, 6, 24, 4), 110, "stock-sdk")],
    { database, mergeExisting: true },
  );

  assert.equal(written.length, 2);
  assert.deepEqual(
    readMarketBarCache(key, { database }).map((bar) => [bar.provider, bar.close]),
    [
      ["stock-sdk", 110],
      ["alphafeed-rest", 111],
    ],
  );
});

test("writeMarketBarCache records cache metadata for governance", () => {
  const database = createTestDatabase();
  const bars: MarketDataBar[] = [
    {
      symbol: "600519.SH",
      market: "CN",
      timeframe: "1d",
      timestamp: 1782777600000,
      open: 1450,
      high: 1468,
      low: 1448,
      close: 1462,
      volume: 1000,
      provider: "alphafeed",
    },
    {
      symbol: "600519.SH",
      market: "CN",
      timeframe: "1d",
      timestamp: 1782864000000,
      open: 1460,
      high: 1472,
      low: 1455,
      close: 1468.1,
      volume: 1100,
      provider: "alphafeed",
    },
  ];

  writeMarketBarCache(cacheKey, bars, { database });
  const summary = readMarketBarCacheSummary(database);

  assert.equal(summary.entries.length, 1);
  assert.equal(summary.totalBarCount, 2);
  assert.equal(summary.entries[0]?.symbol, "600519.SH");
  assert.equal(summary.entries[0]?.provider, "alphafeed");
  assert.equal(summary.entries[0]?.firstTimestamp, 1782777600000);
  assert.equal(summary.entries[0]?.lastTimestamp, 1782864000000);
  assert.equal(summary.entries[0]?.retentionDays, 1825);
  assert.ok(summary.totalEstimatedBytes > 0);
});

test("writeMarketBarCache accepts realtime bars and keeps enough retention for ML warmup", () => {
  const database = createTestDatabase();
  const realtimeKey = {
    symbol: "AAPL.US",
    market: "US" as const,
    timeframe: "realtime" as const,
  };

  writeMarketBarCache(
    realtimeKey,
    [
      {
        symbol: "AAPL.US",
        market: "US",
        timeframe: "realtime",
        timestamp: Date.UTC(2026, 6, 1, 14, 30, 10),
        open: 219.48,
        high: 219.48,
        low: 219.48,
        close: 219.48,
        volume: 1000,
        provider: "alphafeed",
      },
    ],
    { database },
  );

  const summary = readMarketBarCacheSummary(database);

  assert.equal(readMarketBarCache(realtimeKey, { database }).length, 1);
  assert.equal(summary.entries[0]?.timeframe, "realtime");
  assert.equal(summary.entries[0]?.retentionDays, 45);
});

test("writeMarketBarCache accepts gateway provider ids and keeps them readable", () => {
  const database = createTestDatabase();
  const bars: MarketDataBar[] = [
    {
      symbol: "600519.SH",
      market: "CN",
      timeframe: "1d",
      timestamp: 1782777600000,
      open: 1450,
      high: 1468,
      low: 1448,
      close: 1462,
      volume: 1000,
      provider: "stock-sdk",
    },
    {
      symbol: "600519.SH",
      market: "CN",
      timeframe: "1d",
      timestamp: 1782864000000,
      open: 1460,
      high: 1472,
      low: 1455,
      close: 1468.1,
      volume: 1100,
      provider: "alphafeed-rest",
    },
  ];

  writeMarketBarCache(cacheKey, bars, { database });
  const cached = readMarketBarCache(cacheKey, { database });
  const summary = readMarketBarCacheSummary(database);

  assert.deepEqual(
    cached.map((bar) => bar.provider),
    ["stock-sdk", "alphafeed-rest"],
  );
  assert.equal(summary.entries[0]?.provider, "stock-sdk");
});

test("readMarketBarCacheSummary accepts gateway provider ids in existing metadata", () => {
  const database = createTestDatabase({
    "test.market-bars:index": JSON.stringify({
      version: 1,
      updatedAt: "2026-07-01T00:00:00.000Z",
      data: [
        {
          symbol: "AAPL.US",
          market: "US",
          timeframe: "realtime",
          provider: "alphafeed-websocket",
          firstTimestamp: 1782777600000,
          lastTimestamp: 1782777610000,
          barCount: 2,
          estimatedBytes: 200,
          retentionDays: 2,
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          symbol: "09988.HK",
          market: "HK",
          timeframe: "1d",
          provider: "longbridge",
          firstTimestamp: 1782777600000,
          lastTimestamp: 1782864000000,
          barCount: 2,
          estimatedBytes: 200,
          retentionDays: 1825,
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    }),
  });

  assert.deepEqual(
    readMarketBarCacheSummary(database).entries.map((entry) => entry.provider),
    ["alphafeed-websocket", "longbridge"],
  );
});

test("readMarketBarCache falls back to an empty array for malformed cache data", () => {
  const database = createTestDatabase({
    "test.market-bars:CN:600519.SH:1d": JSON.stringify({
      version: 1,
      updatedAt: "2026-07-01T00:00:00.000Z",
      data: [{ symbol: "600519.SH", close: "bad" }],
    }),
  });

  assert.deepEqual(readMarketBarCache(cacheKey, { database }), []);
});

test("readMarketBarCache discards a historical cache with a multi-month data discontinuity", () => {
  const database = createTestDatabase();
  const key = { symbol: "SPCX.US", market: "US" as const, timeframe: "1d" as const };
  const createBar = (timestamp: number, close: number): MarketDataBar => ({
    ...key,
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
    provider: "stock-sdk",
  });

  writeMarketBarCache(
    key,
    [createBar(Date.UTC(2021, 8, 23), 28.89), createBar(Date.UTC(2026, 6, 10), 145.3)],
    { database },
  );

  assert.deepEqual(readMarketBarCache(key, { database }), []);
  assert.equal(readMarketBarCacheSummary(database).entries.length, 0);
});

test("pruneMarketBarCache removes bars outside the retention window", () => {
  const database = createTestDatabase();
  const now = Date.UTC(2026, 6, 1);
  const key = {
    symbol: "AAPL.US",
    market: "US" as const,
    timeframe: "15m" as const,
  };
  const bars: MarketDataBar[] = [
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "15m",
      timestamp: now - 31 * 24 * 60 * 60 * 1000,
      open: 280,
      high: 286,
      low: 279,
      close: 285,
      volume: 1000,
      provider: "alphafeed",
    },
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "15m",
      timestamp: now - 2 * 24 * 60 * 60 * 1000,
      open: 285,
      high: 288,
      low: 284,
      close: 287,
      volume: 1200,
      provider: "alphafeed",
    },
  ];

  writeMarketBarCache(key, bars, { database });
  const result = pruneMarketBarCache({ database, now });

  assert.equal(result.removedBars, 1);
  assert.equal(result.remainingEntries, 1);
  assert.deepEqual(
    readMarketBarCache(key, { database }).map((bar) => bar.close),
    [287],
  );
  assert.equal(readMarketBarCacheSummary(database).totalBarCount, 1);
});

test("clearAllMarketBarCache removes every indexed cache entry", () => {
  const database = createTestDatabase();
  writeMarketBarCache(
    cacheKey,
    [
      {
        symbol: "600519.SH",
        market: "CN",
        timeframe: "1d",
        timestamp: 1782777600000,
        open: 1450,
        high: 1468,
        low: 1448,
        close: 1462,
        volume: 1000,
        provider: "alphafeed",
      },
    ],
    { database },
  );

  assert.equal(clearAllMarketBarCache(database), 1);
  assert.deepEqual(readMarketBarCache(cacheKey, { database }), []);
  assert.equal(readMarketBarCacheSummary(database).entries.length, 0);
});

test("historical cache isolates adjustment modes and drops legacy unadjusted entries on first read", () => {
  const database = createTestDatabase();
  const legacyBar: MarketDataBar = {
    symbol: "AAPL.US",
    market: "US",
    timeframe: "1d",
    timestamp: 1782777600000,
    open: 280,
    high: 286,
    low: 279,
    close: 285,
    volume: 1000,
    provider: "stock-sdk",
  };
  database.writeDocument("market-bars:US:AAPL.US:1d", 1, [legacyBar]);
  database.writeDocument("market-bars:index", 1, [
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "1d",
      provider: "stock-sdk",
      firstTimestamp: legacyBar.timestamp,
      lastTimestamp: legacyBar.timestamp,
      barCount: 1,
      estimatedBytes: 100,
      retentionDays: 1825,
      updatedAt: "2026-07-11T00:00:00.000Z",
    },
  ]);

  const rawKey = {
    symbol: "AAPL.US",
    market: "US" as const,
    timeframe: "1d" as const,
    adjust: "none" as const,
  };
  const forwardKey = { ...rawKey, adjust: "forward" as const };

  assert.deepEqual(readMarketBarCache(rawKey, { database }), []);
  assert.equal(readMarketBarCacheSummary(database).entries.length, 0);

  writeMarketBarCache(rawKey, [{ ...legacyBar, close: 285, upstream: "tencent" }], { database });
  writeMarketBarCache(
    forwardKey,
    [
      {
        ...legacyBar,
        open: 250,
        high: 255,
        low: 245,
        close: 250,
        upstream: "tencent",
      },
    ],
    { database },
  );

  assert.equal(readMarketBarCache(rawKey, { database })[0]?.close, 285);
  assert.equal(readMarketBarCache(forwardKey, { database })[0]?.close, 250);
  assert.equal(readMarketBarCache(forwardKey, { database })[0]?.upstream, "tencent");
});
