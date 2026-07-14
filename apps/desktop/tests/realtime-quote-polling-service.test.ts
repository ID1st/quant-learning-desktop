import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createQuotePollingBatches,
  createSnapshotCacheWriteGate,
  defaultRealtimePollIntervalMs,
  mergeQuoteSnapshots,
  sanitizeRealtimePollIntervalMs,
} from "../src/features/marketData/realtimeQuotePollingService.ts";
import type { MarketQuoteSnapshot, MarketWatchlistItem } from "../src/features/marketData/marketDataSyncService.ts";

function item(index: number): MarketWatchlistItem {
  return {
    symbol: `TEST${index}.US`,
    name: `Test ${index}`,
    market: "US",
    source: "preset",
  };
}

test("createQuotePollingBatches dedupes watchlist items and caps each request batch", () => {
  const watchlist = [item(1), item(1), ...Array.from({ length: 35 }, (_, index) => item(index + 2))];
  const batches = createQuotePollingBatches(watchlist, 30);

  assert.equal(batches.length, 2);
  assert.equal(batches[0]?.length, 30);
  assert.equal(batches[1]?.length, 6);
  assert.equal(new Set(batches.flat().map((entry) => `${entry.market}:${entry.symbol}`)).size, 36);
});

test("sanitizeRealtimePollIntervalMs allows 10 second high-frequency polling and rejects unsafe values", () => {
  assert.equal(defaultRealtimePollIntervalMs, 10_000);
  assert.equal(sanitizeRealtimePollIntervalMs(10_000), 10_000);
  assert.equal(sanitizeRealtimePollIntervalMs(5_000), 10_000);
  assert.equal(sanitizeRealtimePollIntervalMs("10000"), 10_000);
});

test("mergeQuoteSnapshots replaces only updated symbols and keeps previous snapshots as fallback", () => {
  const previous: MarketQuoteSnapshot = {
    symbol: "AAPL.US",
    market: "US",
    lastPrice: 200,
    previousClose: 198,
    changePercent: 1,
    volume: 100,
    quoteTime: "2026-07-02T01:00:00.000Z",
    receivedAt: "2026-07-02T01:00:00.000Z",
    provider: "alphafeed",
  };
  const next: MarketQuoteSnapshot = {
    ...previous,
    lastPrice: 201,
    receivedAt: "2026-07-02T01:00:10.000Z",
  };
  const merged = mergeQuoteSnapshots({ "US:AAPL.US": previous, "US:TSLA.US": { ...previous, symbol: "TSLA.US" } }, [next]);

  assert.equal(merged["US:AAPL.US"]?.lastPrice, 201);
  assert.equal(merged["US:TSLA.US"]?.lastPrice, 200);
});

test("snapshot cache write gate writes immediately per context and throttles repeated snapshots", () => {
  const gate = createSnapshotCacheWriteGate(30_000);

  assert.equal(gate.shouldWrite("US:AAPL.US:realtime", 1_000), true);
  assert.equal(gate.shouldWrite("US:AAPL.US:realtime", 10_000), false);
  assert.equal(gate.shouldWrite("US:AAPL.US:realtime", 31_000), true);
  assert.equal(gate.shouldWrite("US:TSLA.US:realtime", 31_001), true);
});
