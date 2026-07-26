import assert from "node:assert/strict";
import test from "node:test";
import { createChartMarketDataAccess } from "../src/features/marketData/chartMarketDataGateway.ts";

test("chart access forwards MLPT completion policy and diagnostics through provider-neutral IPC", async () => {
  let receivedRequest: unknown;
  const access = await createChartMarketDataAccess({
    bridge: {
      marketData: {
        async fetchIntradayBars(request: unknown) {
          receivedRequest = request;
          return {
            ok: true,
            data: [],
            meta: {
              provider: "stock-sdk",
              servedAt: "2026-07-25T00:00:00.000Z",
              fallback: { activeProvider: "stock-sdk", triedProviders: ["stock-sdk"] },
              health: {
                provider: "stock-sdk",
                status: "healthy",
                message: "ok",
                checkedAt: "2026-07-25T00:00:00.000Z",
                capability: {
                  realtimeQuote: true,
                  historicalBars: true,
                  intradayBars: true,
                  websocket: false,
                  batchQuote: true,
                  markets: ["US", "HK", "CN"],
                  timeframes: ["realtime", "1m"],
                  delayLevel: "unknown",
                },
              },
              historicalCompletion: {
                purpose: "mlpt",
                targetBars: 1_000,
                confirmedBars: 1_000,
                targetSatisfied: true,
                contributions: [{ provider: "stock-sdk", bars: 600 }, { provider: "longbridge", bars: 400 }],
                failures: [],
                stopReason: "target_reached",
              },
            },
          };
        },
      },
    } as unknown as QuantDesktopBridge,
    enableStockSdkPrimary: true,
  });

  const result = await access.fetchBars({
    capability: "intradayBars",
    request: { market: "US", symbol: "AAPL.US", timeframe: "1m", count: 1_000 },
    mlptHistory: {
      targetBars: 1_000,
      confirmedThroughTimestamp: 1_800_000_000_000,
      knownTimestamps: [1_799_999_940_000],
    },
  });

  assert.deepEqual(
    (receivedRequest as { providerPolicy: { mlptHistory: unknown } }).providerPolicy.mlptHistory,
    {
      targetBars: 1_000,
      confirmedThroughTimestamp: 1_800_000_000_000,
      knownTimestamps: [1_799_999_940_000],
    },
  );
  assert.equal(result.ok ? result.historicalCompletion?.confirmedBars : 0, 1_000);
});
