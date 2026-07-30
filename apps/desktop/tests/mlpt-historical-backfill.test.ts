import assert from "node:assert/strict";
import test from "node:test";
import type { GatewayMarketDataBar } from "../src/features/marketData/marketDataProviderGateway.ts";
import {
  fetchMlptHistoricalBackfill,
  mergeMlptBarsByProviderPriority,
  type MlptHistoricalBackfillSource,
} from "../src/features/marketData/mlptHistoricalBackfillService.ts";

const minute = 60_000;
const endTime = Date.UTC(2026, 6, 24, 20, 0);

function createBars(
  provider: GatewayMarketDataBar["provider"],
  count: number,
  end = endTime,
  closeOffset = 0,
): GatewayMarketDataBar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + closeOffset + index / 100;
    return {
      provider,
      market: "US",
      symbol: "AAPL.US",
      timeframe: "1m",
      timestamp: end - (count - index) * minute,
      open: close - 0.1,
      high: close + 0.2,
      low: close - 0.2,
      close,
      volume: 100 + index,
    };
  });
}

function source(
  provider: MlptHistoricalBackfillSource["provider"],
  bars: readonly GatewayMarketDataBar[] | Error,
  calls: string[],
): MlptHistoricalBackfillSource {
  return {
    provider,
    async fetchBars() {
      calls.push(provider);
      if (bars instanceof Error) throw bars;
      return bars;
    },
  };
}

test("uses Stock SDK only when it already satisfies the requested MLPT coverage", async () => {
  const calls: string[] = [];
  const result = await fetchMlptHistoricalBackfill({
    request: { market: "US", symbol: "AAPL.US", timeframe: "1m", count: 1_000, endTime },
    targetBars: 1_000,
    confirmedThroughTimestamp: endTime,
    sources: [
      source("stock-sdk", createBars("stock-sdk", 1_000), calls),
      source("longbridge", createBars("longbridge", 1_000), calls),
      source("alphafeed-rest", createBars("alphafeed-rest", 1_000), calls),
    ],
  });

  assert.deepEqual(calls, ["stock-sdk"]);
  assert.equal(result.coverage.confirmedBars, 1_000);
  assert.equal(result.coverage.targetSatisfied, true);
  assert.deepEqual(result.contributions, [{ provider: "stock-sdk", bars: 1_000 }]);
});

test("keeps overlapping Stock SDK bars and uses LongBridge to fill missing MLPT history", async () => {
  const calls: string[] = [];
  const stockBars = createBars("stock-sdk", 600, endTime, 10);
  const longBridgeBars = createBars("longbridge", 1_000, endTime, 20);
  const result = await fetchMlptHistoricalBackfill({
    request: { market: "US", symbol: "AAPL.US", timeframe: "1m", count: 1_000, endTime },
    targetBars: 1_000,
    confirmedThroughTimestamp: endTime,
    sources: [
      source("stock-sdk", stockBars, calls),
      source("longbridge", longBridgeBars, calls),
      source("alphafeed-rest", createBars("alphafeed-rest", 1_000), calls),
    ],
  });

  assert.deepEqual(calls, ["stock-sdk", "longbridge"]);
  assert.equal(result.bars.length, 1_000);
  assert.equal(result.coverage.targetSatisfied, true);
  assert.equal(
    result.bars.find((bar) => bar.timestamp === stockBars[0]?.timestamp)?.provider,
    "stock-sdk",
  );
  assert.deepEqual(result.contributions, [
    { provider: "stock-sdk", bars: 600 },
    { provider: "longbridge", bars: 400 },
  ]);
});

test("falls back to AlphaFeed when LongBridge cannot provide MLPT history", async () => {
  const calls: string[] = [];
  const result = await fetchMlptHistoricalBackfill({
    request: { market: "US", symbol: "AAPL.US", timeframe: "1m", count: 1_000, endTime },
    targetBars: 1_000,
    confirmedThroughTimestamp: endTime,
    sources: [
      source("stock-sdk", createBars("stock-sdk", 500), calls),
      source("longbridge", new Error("rate limited with secret-token"), calls),
      source("alphafeed-rest", createBars("alphafeed-rest", 1_000), calls),
    ],
  });

  assert.deepEqual(calls, ["stock-sdk", "longbridge", "alphafeed-rest"]);
  assert.equal(result.coverage.targetSatisfied, true);
  assert.deepEqual(result.failures, [{ provider: "longbridge", reason: "request_failed" }]);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});

test("counts valid cached timestamps but excludes the open minute and invalid upstream bars", async () => {
  const calls: string[] = [];
  const stockBars = createBars("stock-sdk", 3, endTime + 2 * minute);
  stockBars[0] = { ...stockBars[0]!, high: stockBars[0]!.low - 1 };
  const result = await fetchMlptHistoricalBackfill({
    request: {
      market: "US",
      symbol: "AAPL.US",
      timeframe: "1m",
      count: 4,
      endTime: endTime + minute,
    },
    targetBars: 4,
    confirmedThroughTimestamp: endTime,
    knownTimestamps: [endTime - 10 * minute, endTime - 9 * minute],
    sources: [source("stock-sdk", stockBars, calls)],
  });

  assert.equal(result.bars.length, 1);
  assert.equal(result.coverage.confirmedBars, 3);
  assert.equal(result.coverage.targetSatisfied, false);
});

test("cache merge never lets a supplement overwrite a valid Stock SDK timestamp", () => {
  const stock = createBars("stock-sdk", 1, endTime, 10)[0]!;
  const longBridge = { ...stock, provider: "longbridge" as const, close: stock.close + 20 };
  const alphaFeed = { ...stock, provider: "alphafeed-rest" as const, close: stock.close + 30 };

  const merged = mergeMlptBarsByProviderPriority([alphaFeed, longBridge, stock]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.provider, "stock-sdk");
  assert.equal(merged[0]?.close, stock.close);
});
