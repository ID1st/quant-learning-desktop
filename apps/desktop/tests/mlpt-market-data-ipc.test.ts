import assert from "node:assert/strict";
import test from "node:test";
import { createMarketDataIpcHandlers } from "../src/electron/marketDataIpcHandlers.ts";
import { assertMarketDataProviderPolicy } from "../src/electron/electronSecurity.ts";
import type { GatewayMarketDataBar } from "../src/features/marketData/marketDataProviderGateway.ts";
import type { MlptHistoricalBackfillSource } from "../src/features/marketData/mlptHistoricalBackfillService.ts";

const minute = 60_000;
const endTime = Date.UTC(2026, 6, 24, 20, 0);

function bars(
  provider: GatewayMarketDataBar["provider"],
  count: number,
): GatewayMarketDataBar[] {
  return Array.from({ length: count }, (_, index) => ({
    provider,
    market: "US",
    symbol: "AAPL.US",
    timeframe: "1m",
    timestamp: endTime - (count - index) * minute,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 100,
  }));
}

function source(
  provider: MlptHistoricalBackfillSource["provider"],
  data: readonly GatewayMarketDataBar[],
  calls: string[],
): MlptHistoricalBackfillSource {
  return {
    provider,
    async fetchBars() {
      calls.push(provider);
      return data;
    },
  };
}

test("MLPT intraday IPC keeps Stock SDK first and reports source contributions", async () => {
  const calls: string[] = [];
  const handlers = createMarketDataIpcHandlers({
    mlptHistoricalSources: [
      source("stock-sdk", bars("stock-sdk", 600), calls),
      source("longbridge", bars("longbridge", 1_000), calls),
      source("alphafeed-rest", bars("alphafeed-rest", 1_000), calls),
    ],
  });

  const result = await handlers.fetchIntradayBars({
    context: { source: "strategy" },
    request: {
      market: "US",
      symbol: "AAPL.US",
      timeframe: "1m",
      count: 1_000,
      endTime,
    },
    providerPolicy: {
      stockSdkPrimaryEnabled: true,
      mlptHistory: {
        targetBars: 1_000,
        confirmedThroughTimestamp: endTime,
        knownTimestamps: [],
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["stock-sdk", "longbridge"]);
  assert.deepEqual(result.ok ? result.meta.fallback.triedProviders : [], ["stock-sdk", "longbridge"]);
  assert.deepEqual(result.ok ? result.meta.historicalCompletion?.contributions : [], [
    { provider: "stock-sdk", bars: 600 },
    { provider: "longbridge", bars: 400 },
  ]);
  assert.equal(result.ok ? result.meta.historicalCompletion?.confirmedBars : 0, 1_000);
});

test("MLPT provider policy rejects excessive or malformed renderer input", () => {
  assert.throws(
    () =>
      assertMarketDataProviderPolicy({
        mlptHistory: {
          targetBars: 5_001,
          confirmedThroughTimestamp: endTime,
          knownTimestamps: [],
        },
      }),
    /targetBars/,
  );
  assert.throws(
    () =>
      assertMarketDataProviderPolicy({
        mlptHistory: {
          targetBars: 1_000,
          confirmedThroughTimestamp: endTime,
          knownTimestamps: ["not-a-timestamp"],
        },
      }),
    /knownTimestamps/,
  );
});
