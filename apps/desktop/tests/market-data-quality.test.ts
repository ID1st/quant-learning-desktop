import assert from "node:assert/strict";
import test from "node:test";
import { gatewayBarsToMarketDataBars } from "../src/features/marketData/chartMarketDataGateway.ts";
import { inspectMarketDataBars } from "../src/features/marketData/marketDataQuality.ts";
import { LocalDatabase, createMemoryStorageDriver } from "../src/features/persistence/localDatabase.ts";
import { readMarketBarCache, writeMarketBarCache, type MarketDataBar } from "../src/features/marketData/marketBarCacheService.ts";

const baseBar: MarketDataBar = {
  symbol: "AAPL.US",
  market: "US",
  timeframe: "1d",
  timestamp: Date.UTC(2026, 6, 13),
  open: 200,
  high: 205,
  low: 198,
  close: 202,
  volume: 1_000,
  provider: "stock-sdk",
};

test("market data quality rejects zero prices, negative volume, and inconsistent OHLC", () => {
  const report = inspectMarketDataBars([
    baseBar,
    { ...baseBar, timestamp: baseBar.timestamp + 1, open: 0 },
    { ...baseBar, timestamp: baseBar.timestamp + 2, volume: -1 },
    { ...baseBar, timestamp: baseBar.timestamp + 3, high: 201 },
  ]);

  assert.equal(report.validBars.length, 1);
  assert.equal(report.rejectedCount, 3);
  assert.equal(report.issues["invalid-price"], 1);
  assert.equal(report.issues["invalid-volume"], 1);
  assert.equal(report.issues["inconsistent-ohlc"], 1);
});

test("market bar cache refuses invalid records before they reach chart and strategy readers", () => {
  const database = new LocalDatabase(createMemoryStorageDriver(), "market-quality-test");
  const key = { symbol: "AAPL.US", market: "US" as const, timeframe: "1d" as const };

  const written = writeMarketBarCache(key, [baseBar, { ...baseBar, timestamp: baseBar.timestamp + 1, close: 0 }], { database });

  assert.equal(written.length, 1);
  assert.deepEqual(readMarketBarCache(key, { database }).map((bar) => bar.close), [202]);
});

test("gateway conversion rejects malformed upstream bars before the chart cache write", () => {
  const converted = gatewayBarsToMarketDataBars([
    baseBar,
    { ...baseBar, timestamp: baseBar.timestamp + 1, high: 201 },
  ]);

  assert.deepEqual(converted.map((bar) => bar.close), [202]);
});
