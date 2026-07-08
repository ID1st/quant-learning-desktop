import assert from "node:assert/strict";
import { test } from "node:test";
import {
  marketDataIpcChannels,
  marketDataIpcDefaultProviderPriority,
  type MarketDataIpcQuoteSnapshotResult,
} from "../src/electron/marketDataIpcContract.ts";

test("market data IPC channels are stable provider-neutral contracts", () => {
  assert.deepEqual(marketDataIpcChannels, {
    getProviderStatus: "marketData:getProviderStatus",
    fetchQuoteSnapshot: "marketData:fetchQuoteSnapshot",
    fetchHistoricalBars: "marketData:fetchHistoricalBars",
    fetchIntradayBars: "marketData:fetchIntradayBars",
    connectQuoteStream: "marketData:connectQuoteStream",
    readQuoteStreamSnapshot: "marketData:readQuoteStreamSnapshot",
    disconnectQuoteStream: "marketData:disconnectQuoteStream",
  });
});

test("market data IPC default provider priority keeps stock sdk primary and existing fallbacks", () => {
  assert.deepEqual(marketDataIpcDefaultProviderPriority, [
    "stock-sdk",
    "alphafeed-rest",
    "alphafeed-websocket",
    "longbridge",
  ]);
});

test("market data IPC result shape carries provider metadata and fallback diagnostics", () => {
  const result = {
    ok: true,
    data: [
      {
        provider: "stock-sdk",
        market: "US",
        symbol: "AAPL.US",
        name: "Apple Inc.",
        price: 210,
        previousClose: 208,
        timestamp: 1_804_000_000_000,
        receivedAt: "2027-03-01T14:30:00.000Z",
        delayLevel: "unknown",
      },
    ],
    meta: {
      provider: "stock-sdk",
      servedAt: "2027-03-01T14:30:00.000Z",
      fallback: {
        activeProvider: "stock-sdk",
        triedProviders: ["stock-sdk"],
      },
      health: {
        provider: "stock-sdk",
        status: "healthy",
        message: "Stock SDK request succeeded.",
        checkedAt: "2027-03-01T14:30:00.000Z",
        capability: {
          realtimeQuote: true,
          historicalBars: true,
          intradayBars: true,
          websocket: false,
          batchQuote: true,
          markets: ["US", "HK", "CN"],
          timeframes: ["realtime", "1d", "1w"],
          delayLevel: "unknown",
        },
      },
    },
  } satisfies MarketDataIpcQuoteSnapshotResult;

  assert.equal(result.ok, true);
  assert.equal(result.data[0]?.provider, "stock-sdk");
  assert.equal(result.meta.fallback.triedProviders[0], "stock-sdk");
});
