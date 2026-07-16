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
import type { AlphaFeedStreamSession } from "../src/electron/alphaFeedStreamBridge.ts";
import type { AlphaFeedProviderHealth } from "../src/electron/alphaFeedBridge.ts";
import { createYahooFinanceIntradayProvider } from "../src/features/marketData/yahooFinanceIntradayProvider.ts";

test("market data IPC channels are stable provider-neutral contracts", () => {
  assert.deepEqual(marketDataIpcChannels, {
    getProviderStatus: "marketData:getProviderStatus",
    fetchQuoteSnapshot: "marketData:fetchQuoteSnapshot",
    fetchHistoricalBars: "marketData:fetchHistoricalBars",
    fetchIntradayBars: "marketData:fetchIntradayBars",
    searchInstruments: "marketData:searchInstruments",
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
    "yahoo-finance",
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

test("market data IPC handlers search instruments through the primary provider", async () => {
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createEmptyCredentialStore(),
    stockSdkOperations: {
      fetchQuoteSnapshot: async () => [],
      fetchHistoricalBars: async () => [],
      fetchIntradayBars: async () => [],
      searchInstruments: async () => [{ code: "usaapl.oq", name: "Apple", market: "us" }],
    },
  });

  const result = await handlers.searchInstruments({
    context: { source: "chart" },
    query: "AAPL",
    markets: ["US"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, [{ provider: "stock-sdk", market: "US", symbol: "AAPL.US", name: "Apple" }]);
});

test("market data IPC handlers validate exact US, HK and CN codes through quote fallback", async () => {
  const quoteRequests: Array<{ market: string; providerSymbol: string }> = [];
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createEmptyCredentialStore(),
    stockSdkOperations: {
      fetchQuoteSnapshot: async (requests) => {
        const request = requests[0];
        if (!request) return [];

        quoteRequests.push({ market: request.market, providerSymbol: request.providerSymbol });
        if (request.market === "US") {
          return [{
            code: "AAPL", name: "Apple", price: 210, previousClose: 208,
            open: 209, high: 211, low: 207, volume: 1, amount: 1, time: "2026-07-06 16:00:01",
          }];
        }
        if (request.market === "HK") {
          return [{
            code: "00700", name: "Tencent", lastPrice: 83.2, prevClose: 82,
            open: 82, high: 84, low: 81, volume: 100, amount: 8320, time: "2026/07/07 16:08:52",
          }];
        }
        return [{
          code: "sh600519", name: "Kweichow Moutai", price: 1468.1, previousClose: 1460,
          open: 1462, high: 1475, low: 1458, volume: 1000, amount: 1_468_100, time: "2026/07/07 15:00:00",
        }];
      },
      fetchHistoricalBars: async () => [],
      fetchIntradayBars: async () => [],
      searchInstruments: async () => {
        throw new Error("search upstream unavailable");
      },
    },
  });

  const cases = [
    { query: "aapl", markets: ["US"] as const, expected: { market: "US", symbol: "AAPL.US", name: "Apple" } },
    { query: "00700", markets: ["HK"] as const, expected: { market: "HK", symbol: "00700.HK", name: "Tencent" } },
    { query: "600519", markets: ["CN"] as const, expected: { market: "CN", symbol: "600519.SH", name: "Kweichow Moutai" } },
  ];

  for (const entry of cases) {
    const result = await handlers.searchInstruments({
      context: { source: "chart" }, query: entry.query, markets: entry.markets,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data, [{ provider: "stock-sdk", ...entry.expected }]);
    }
  }

  assert.deepEqual(quoteRequests, [
    { market: "US", providerSymbol: "AAPL" },
    { market: "HK", providerSymbol: "00700" },
    { market: "CN", providerSymbol: "sh600519" },
  ]);
});

test("market data IPC handlers do not use quote fallback for name searches", async () => {
  let quoteCalls = 0;
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createEmptyCredentialStore(),
    stockSdkOperations: {
      fetchQuoteSnapshot: async () => {
        quoteCalls += 1;
        return [];
      },
      fetchHistoricalBars: async () => [],
      fetchIntradayBars: async () => [],
      searchInstruments: async () => {
        throw new Error("search upstream unavailable");
      },
    },
  });

  const result = await handlers.searchInstruments({
    context: { source: "chart" }, query: "Apple", markets: ["US"],
  });
  assert.equal(result.ok, false);
  assert.equal(quoteCalls, 0);
});

test("market data IPC handlers expose provider status from secure main-side provider registry", async () => {
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createCredentialStoreWithFallbackCredentials(),
    stockSdkOperations: {
      fetchQuoteSnapshot: async () => [],
      fetchHistoricalBars: async () => [],
      fetchIntradayBars: async () => [],
    },
  });

  const result = await handlers.getProviderStatus({ source: "diagnostics" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.priority, marketDataIpcDefaultProviderPriority);
  assert.deepEqual(
    result.data.providers.map((provider) => provider.provider),
    ["stock-sdk", "alphafeed-rest", "longbridge", "yahoo-finance"],
  );
  assert.deepEqual(
    result.data.providers.map((provider) => provider.status),
    ["healthy", "healthy", "delayed", "healthy"],
  );
  assert.equal(result.data.capabilities.length, 4);
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

test("market data IPC handlers preserve provider diagnostics when a primary provider request fails", async () => {
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createEmptyCredentialStore(),
    stockSdkOperations: {
      fetchQuoteSnapshot: async () => {
        throw new Error("stock quote unavailable");
      },
      fetchHistoricalBars: async () => [],
      fetchIntradayBars: async () => [],
    },
  });

  const result = await handlers.fetchQuoteSnapshot({
    context: { source: "chart" },
    items: [{ symbol: "AAPL.US", market: "US", name: "Apple Inc." }],
    providerPolicy: { stockSdkPrimaryEnabled: true },
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(result.ok ? "" : result.error.provider, "stock-sdk");
  assert.deepEqual(result.ok ? [] : result.error.fallback.triedProviders, ["stock-sdk"]);
  assert.equal(result.ok ? "" : result.error.health[0]?.provider, "stock-sdk");
  assert.equal(result.ok ? "" : result.error.health[0]?.status, "unavailable");
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

test("market data IPC handlers fetch CN historical bars through stock sdk primary", async () => {
  const calls: string[] = [];
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createEmptyCredentialStore(),
    stockSdkOperations: {
      fetchQuoteSnapshot: async () => [],
      fetchHistoricalBars: async () => {
        calls.push("history");
        return [{ date: "2026-07-06", open: 307.36, high: 314.2, low: 307, close: 312.66, volume: 1 }];
      },
      fetchIntradayBars: async () => {
        calls.push("intraday");
        return [];
      },
    },
  });

  const result = await handlers.fetchHistoricalBars({
    context: { source: "chart" },
    request: { symbol: "600519.SH", market: "CN", timeframe: "1d", count: 600 },
    providerPolicy: { stockSdkPrimaryEnabled: true },
  });

  assert.equal(result.ok, true);
  assert.equal(result.meta.provider, "stock-sdk");
  assert.equal(result.data[0]?.timeframe, "1d");
  assert.deepEqual(calls, ["history"]);
});

test("market data IPC handlers fetch CN realtime history through Stock SDK intraday bars", async () => {
  const calls: string[] = [];
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createEmptyCredentialStore(),
    stockSdkOperations: {
      fetchQuoteSnapshot: async () => [],
      fetchHistoricalBars: async () => {
        calls.push("history");
        return [];
      },
      fetchIntradayBars: async () => {
        calls.push("intraday");
        return [{ time: "2026-07-06 09:30", open: 0, high: 286.9, low: 286.61, close: 286.86, volume: 1 }];
      },
    },
  });

  const result = await handlers.fetchIntradayBars({
    context: { source: "chart" },
    request: { symbol: "600519.SH", market: "CN", timeframe: "1m", count: 1_000 },
    providerPolicy: { stockSdkPrimaryEnabled: true },
  });

  assert.equal(result.ok, true);
  assert.equal(result.meta.provider, "stock-sdk");
  assert.equal(result.data[0]?.timeframe, "1m");
  assert.deepEqual(calls, ["intraday"]);
});

test("market data IPC handlers fall back to optional Yahoo Finance after Stock SDK K-lines fail", async () => {
  let stockSdkHistoricalCalls = 0;
  let stockSdkIntradayCalls = 0;
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createEmptyCredentialStore(),
    stockSdkOperations: {
      fetchQuoteSnapshot: async () => [],
      fetchHistoricalBars: async () => {
        stockSdkHistoricalCalls += 1;
        throw new Error("Stock SDK network unavailable");
      },
      fetchIntradayBars: async () => {
        stockSdkIntradayCalls += 1;
        throw new Error("Stock SDK network unavailable");
      },
    },
    yahooFinanceProvider: createYahooFinanceIntradayProvider({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            chart: {
              result: [
                {
                  timestamp: [1_783_000_000],
                  indicators: { quote: [{ open: [315.5], high: [315.8], low: [315.4], close: [315.7], volume: [100] }] },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    }),
  });

  const result = await handlers.fetchIntradayBars({
    context: { source: "chart" },
    request: { symbol: "AAPL.US", market: "US", timeframe: "1m" },
    providerPolicy: { stockSdkPrimaryEnabled: true },
  });
  const historical = await handlers.fetchHistoricalBars({
    context: { source: "chart" },
    request: { symbol: "AAPL.US", market: "US", timeframe: "1d" },
    providerPolicy: { stockSdkPrimaryEnabled: true },
  });

  assert.equal(result.ok, true);
  assert.equal(result.meta.provider, "yahoo-finance");
  assert.deepEqual(result.meta.fallback.triedProviders, ["stock-sdk", "yahoo-finance"]);
  assert.equal(result.data[0]?.symbol, "AAPL.US");
  assert.equal(historical.ok, true);
  assert.equal(historical.meta.provider, "yahoo-finance");
  assert.deepEqual(historical.meta.fallback.triedProviders, ["stock-sdk", "yahoo-finance"]);
  assert.equal(stockSdkIntradayCalls, 1);
  assert.equal(stockSdkHistoricalCalls, 1);
});

test("market data IPC handlers control quote stream through secure desktop credentials", async () => {
  const calls: string[] = [];
  const streamSession: AlphaFeedStreamSession = {
    async connect(request) {
      calls.push(`connect:${request.mode}:${Boolean(request.credentials.apiKey)}:${request.watchlist.length}`);
      return {
        ok: true,
        state: "connected",
        health: createStreamHealth("ok", "stream connected"),
      };
    },
    async readSnapshot() {
      calls.push("read");
      return {
        ok: true,
        state: "connected",
        health: createStreamHealth("ok", "stream updated"),
        snapshots: [
          {
            symbol: "AAPL.US",
            market: "US",
            lastPrice: 312.66,
            previousClose: 308.63,
            openPrice: 307.36,
            highPrice: 314.2,
            lowPrice: 307,
            changePercent: 1.31,
            volume: 100,
            amount: 31_266,
            quoteTime: "2026-07-06T20:00:01.000Z",
            receivedAt: "2026-07-06T20:00:02.000Z",
            provider: "alphafeed",
          },
        ],
      };
    },
    async disconnect() {
      calls.push("disconnect");
      return {
        ok: true,
        state: "idle",
        health: createStreamHealth("ok", "stream disconnected"),
      };
    },
  };
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createCredentialStoreWithStreamCredentials(),
    streamSession,
  });

  const connected = await handlers.connectQuoteStream({
    context: { source: "chart" },
    items: [{ symbol: "AAPL.US", market: "US", name: "Apple Inc." }],
    providerPolicy: { alphaFeedStreamMode: "all-symbols" },
  });
  const snapshot = await handlers.readQuoteStreamSnapshot({
    context: { source: "chart" },
    items: [{ symbol: "AAPL.US", market: "US", name: "Apple Inc." }],
  });
  const disconnected = await handlers.disconnectQuoteStream({ source: "chart" });

  assert.equal(connected.ok, true);
  assert.equal(connected.ok ? connected.data.state : "", "connected");
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.ok ? snapshot.data.snapshots[0]?.provider : "", "alphafeed-websocket");
  assert.equal(snapshot.ok ? snapshot.data.snapshots[0]?.price : 0, 312.66);
  assert.equal(disconnected.ok, true);
  assert.equal(disconnected.ok ? disconnected.data.state : "", "idle");
  assert.deepEqual(calls, ["connect:all-symbols:true:1", "read", "disconnect"]);
});

test("market data IPC stream connect reports unconfigured when stream credentials are absent", async () => {
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createEmptyCredentialStore(),
  });

  const result = await handlers.connectQuoteStream({
    context: { source: "chart" },
    items: [{ symbol: "AAPL.US", market: "US", name: "Apple Inc." }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.error.code, "PROVIDER_UNCONFIGURED");
  assert.deepEqual(result.ok ? [] : result.error.fallback.triedProviders, ["alphafeed-websocket"]);
});

test("market data IPC stream maps permission and rate-limit health into provider-neutral diagnostics", async () => {
  const states: Array<ReturnType<typeof createStreamHealth>> = [
    createStreamHealth("permission_denied", "stream permission denied"),
    createStreamHealth("rate_limited", "stream rate limited", "2026-07-06T20:02:00.000Z"),
  ];
  const streamSession: AlphaFeedStreamSession = {
    async connect() {
      const health = states.shift() ?? createStreamHealth("ok", "stream connected");
      return { ok: true, state: "fallback", health };
    },
    async readSnapshot() {
      return { ok: true, state: "fallback", health: createStreamHealth("error", "fallback"), snapshots: [] };
    },
    async disconnect() {
      return { ok: true, state: "idle", health: createStreamHealth("ok", "stream disconnected") };
    },
  };
  const handlers = createMarketDataIpcHandlers({
    credentialStore: createCredentialStoreWithStreamCredentials(),
    streamSession,
  });

  const unauthorized = await handlers.connectQuoteStream({
    context: { source: "chart" },
    items: [{ symbol: "AAPL.US", market: "US", name: "Apple Inc." }],
  });
  const rateLimited = await handlers.connectQuoteStream({
    context: { source: "chart" },
    items: [{ symbol: "AAPL.US", market: "US", name: "Apple Inc." }],
  });

  assert.equal(unauthorized.ok, true);
  assert.equal(unauthorized.ok ? unauthorized.meta.health.status : "", "unauthorized");
  assert.equal(unauthorized.ok ? unauthorized.data.state : "", "fallback");
  assert.equal(rateLimited.ok, true);
  assert.equal(rateLimited.ok ? rateLimited.meta.health.status : "", "rateLimited");
  assert.equal(rateLimited.ok ? rateLimited.meta.health.nextRetryAt : "", "2026-07-06T20:02:00.000Z");
});

function createStreamHealth(status: AlphaFeedProviderHealth["status"], message: string, nextRetryAt?: string) {
  return {
    status,
    message,
    checkedAt: "2026-07-06T20:00:00.000Z",
    latencyMs: 1,
    nextRetryAt,
  };
}

function createCredentialStoreWithStreamCredentials(): SecureCredentialStore {
  return {
    ...createEmptyCredentialStore(),
    readAlphaFeedStreamCredentials: () => ({ wsUrl: "wss://stream.example.test", apiKey: "stream-key" }),
  };
}

function createCredentialStoreWithFallbackCredentials(): SecureCredentialStore {
  return {
    ...createEmptyCredentialStore(),
    readAlphaFeedCredentials: () => ({ apiUrl: "https://alpha.example.test", apiKey: "alpha-test-key" }),
    readLongPortCredentials: () => ({
      apiUrl: "https://longbridge.example.test",
      appKey: "long-app-key",
      appSecret: "long-app-secret",
      accessToken: "long-access-token",
    }),
  };
}

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
