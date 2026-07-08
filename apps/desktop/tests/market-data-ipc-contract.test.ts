import assert from "node:assert/strict";
import { test } from "node:test";
import { createMarketDataIpcHandlers } from "../src/electron/marketDataIpcHandlers.ts";
import {
  createMarketDataIpcShellHandlers,
  marketDataIpcChannels,
  marketDataIpcDefaultProviderPriority,
  type MarketDataIpcQuoteSnapshotResult,
} from "../src/electron/marketDataIpcContract.ts";
import type { SecureCredentialStore } from "../src/electron/secureCredentialStore.ts";

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

test("market data IPC shell exposes provider status before live wiring", async () => {
  const handlers = createMarketDataIpcShellHandlers();
  const result = await handlers.getProviderStatus({ source: "diagnostics" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.priority, marketDataIpcDefaultProviderPriority);
  assert.deepEqual(result.data.providers, []);
});

test("market data IPC shell returns structured unavailable errors for unwired requests", async () => {
  const handlers = createMarketDataIpcShellHandlers();
  const result = await handlers.fetchQuoteSnapshot({
    context: { source: "chart" },
    items: [{ symbol: "AAPL.US", market: "US", name: "Apple Inc." }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
  assert.deepEqual(result.error.fallback.triedProviders, []);
  assert.deepEqual(result.error.health, []);
});

test("market data IPC handlers fetch quote snapshots through stock sdk primary without renderer credentials", async () => {
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createEmptyCredentialStore(),
    stockSdkOperations: {
      fetchQuoteSnapshot: async () => [
        {
          providerSymbol: "AAPL",
          code: "AAPL",
          price: 312.66,
          prevClose: 308.63,
          open: 307.36,
          high: 314.2,
          low: 307,
          volume: 1,
          amount: 1,
          time: "2026-07-06 16:00:01",
        },
      ],
      fetchHistoricalBars: async () => [],
      fetchIntradayBars: async () => [],
    },
  });

  const result = await handlers.fetchQuoteSnapshot({
    context: { source: "chart" },
    items: [{ symbol: "AAPL.US", market: "US", name: "Apple Inc." }],
    providerPolicy: { stockSdkPrimaryEnabled: true },
  });

  assert.equal(result.ok, true);
  assert.equal(result.meta.provider, "stock-sdk");
  assert.deepEqual(result.meta.fallback.triedProviders, ["stock-sdk"]);
  assert.equal(result.data[0]?.symbol, "AAPL.US");
});

test("market data IPC handlers return no capable provider when stock sdk is disabled and no fallback credentials exist", async () => {
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createEmptyCredentialStore(),
    stockSdkOperations: {
      fetchQuoteSnapshot: async () => {
        throw new Error("should not be called");
      },
      fetchHistoricalBars: async () => [],
      fetchIntradayBars: async () => [],
    },
  });

  const result = await handlers.fetchQuoteSnapshot({
    context: { source: "chart" },
    items: [{ symbol: "AAPL.US", market: "US", name: "Apple Inc." }],
    providerPolicy: { stockSdkPrimaryEnabled: false },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_CAPABLE_PROVIDER");
  assert.deepEqual(result.error.fallback.triedProviders, []);
});

function createEmptyCredentialStore(): SecureCredentialStore {
  return {
    saveAlphaFeedCredentials: () => undefined,
    readAlphaFeedCredentials: () => null,
    clearAlphaFeedCredentials: () => undefined,
    saveAlphaFeedStreamCredentials: () => undefined,
    readAlphaFeedStreamCredentials: () => null,
    clearAlphaFeedStreamCredentials: () => undefined,
    saveLongPortCredentials: () => undefined,
    readLongPortCredentials: () => null,
    clearLongPortCredentials: () => undefined,
  };
}
