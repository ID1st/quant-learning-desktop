import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalDatabase, createMemoryStorageDriver } from "../src/features/persistence/localDatabase.ts";
import { readMarketBarCache, writeMarketBarCache, type MarketDataBar } from "../src/features/marketData/marketBarCacheService.ts";

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
