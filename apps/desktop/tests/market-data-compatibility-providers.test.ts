import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createAlphaFeedRestGatewayProvider,
  createAlphaFeedWebSocketGatewayProvider,
  createLongBridgeGatewayProvider,
} from "../src/features/marketData/marketDataCompatibilityProviders.ts";
import {
  createMarketDataGateway,
  createMarketDataProviderRegistry,
} from "../src/features/marketData/marketDataProviderGateway.ts";

const quoteSnapshot = {
  symbol: "AAPL.US",
  market: "US" as const,
  lastPrice: 294.28,
  previousClose: 294.34,
  openPrice: 294,
  highPrice: 295,
  lowPrice: 293,
  changePercent: -0.02,
  volume: 1000,
  amount: 294_280,
  quoteTime: "2026-07-07T13:30:00.000Z",
  receivedAt: "2026-07-07T13:30:01.000Z",
  provider: "alphafeed" as const,
};

const marketBar = {
  symbol: "AAPL.US",
  market: "US" as const,
  timeframe: "1d" as const,
  timestamp: 1_788_288_000_000,
  open: 294,
  high: 295,
  low: 293,
  close: 294.28,
  volume: 1000,
  amount: 294_280,
  provider: "alphafeed" as const,
};

describe("AlphaFeed REST gateway compatibility provider", () => {
  it("maps existing quote and bar results to the provider-neutral gateway shape", async () => {
    const provider = createAlphaFeedRestGatewayProvider({
      fetchQuoteSnapshot: async () => ({
        ok: true,
        snapshots: [quoteSnapshot],
        health: {
          status: "ok",
          message: "ok",
          checkedAt: "2026-07-07T00:00:00.000Z",
          latencyMs: 12,
        },
      }),
      fetchHistoricalBars: async () => ({
        ok: true,
        bars: [marketBar],
        health: {
          status: "ok",
          message: "ok",
          checkedAt: "2026-07-07T00:00:00.000Z",
          latencyMs: 12,
        },
      }),
      fetchIntradayBars: async () => ({
        ok: true,
        bars: [{ ...marketBar, timeframe: "realtime" }],
        health: {
          status: "ok",
          message: "ok",
          checkedAt: "2026-07-07T00:00:00.000Z",
          latencyMs: 12,
        },
      }),
    });
    const gateway = createMarketDataGateway(createMarketDataProviderRegistry([provider]), [
      "alphafeed-rest",
    ]);

    const quoteResult = await gateway.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);
    const historyResult = await gateway.fetchHistoricalBars({
      market: "US",
      symbol: "AAPL.US",
      timeframe: "1d",
    });

    assert.equal(quoteResult.ok, true);
    assert.equal(quoteResult.provider, "alphafeed-rest");
    assert.equal(quoteResult.data[0]?.provider, "alphafeed-rest");
    assert.equal(quoteResult.data[0]?.price, 294.28);
    assert.equal(historyResult.ok, true);
    assert.equal(historyResult.data[0]?.provider, "alphafeed-rest");
    assert.equal(historyResult.data[0]?.timeframe, "1d");
  });

  it("maps rate-limit failures to provider health and lets the gateway fallback", async () => {
    const alphaProvider = createAlphaFeedRestGatewayProvider({
      fetchQuoteSnapshot: async () => ({
        ok: false,
        error: {
          message: "rate limited",
          health: {
            status: "rate_limited",
            message: "rate limited",
            checkedAt: "2026-07-07T00:00:00.000Z",
            latencyMs: 12,
            nextRetryAt: "2026-07-07T00:02:00.000Z",
          },
        },
      }),
      fetchHistoricalBars: async () => ({
        ok: true,
        bars: [],
        health: {
          status: "ok",
          message: "ok",
          checkedAt: "2026-07-07T00:00:00.000Z",
          latencyMs: 1,
        },
      }),
      fetchIntradayBars: async () => ({
        ok: true,
        bars: [],
        health: {
          status: "ok",
          message: "ok",
          checkedAt: "2026-07-07T00:00:00.000Z",
          latencyMs: 1,
        },
      }),
    });
    const longBridgeProvider = createLongBridgeGatewayProvider({
      fetchQuoteSnapshot: async () => ({
        ok: true,
        snapshots: [{ ...quoteSnapshot, provider: "longport" }],
      }),
      fetchHistoricalBars: async () => ({ ok: true, bars: [] }),
    });
    const gateway = createMarketDataGateway(
      createMarketDataProviderRegistry([alphaProvider, longBridgeProvider]),
      ["alphafeed-rest", "longbridge"],
    );

    const result = await gateway.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);

    assert.equal(result.ok, true);
    assert.equal(result.provider, "longbridge");
    assert.deepEqual(result.triedProviders, ["alphafeed-rest", "longbridge"]);
    assert.equal(result.ok ? result.health.status : "", "delayed");
  });

  it("preserves rate-limit diagnostics when every fallback provider is unavailable", async () => {
    const alphaProvider = createAlphaFeedRestGatewayProvider({
      fetchQuoteSnapshot: async () => ({
        ok: false,
        error: {
          message: "rate limited",
          health: {
            status: "rate_limited",
            message: "rate limited",
            checkedAt: "2026-07-07T00:00:00.000Z",
            latencyMs: 12,
            nextRetryAt: "2026-07-07T00:02:00.000Z",
          },
        },
      }),
      fetchHistoricalBars: async () => ({
        ok: true,
        bars: [],
        health: {
          status: "ok",
          message: "ok",
          checkedAt: "2026-07-07T00:00:00.000Z",
          latencyMs: 1,
        },
      }),
      fetchIntradayBars: async () => ({
        ok: true,
        bars: [],
        health: {
          status: "ok",
          message: "ok",
          checkedAt: "2026-07-07T00:00:00.000Z",
          latencyMs: 1,
        },
      }),
    });
    const gateway = createMarketDataGateway(createMarketDataProviderRegistry([alphaProvider]), [
      "alphafeed-rest",
    ]);

    const result = await gateway.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);

    assert.equal(result.ok, false);
    assert.equal(result.ok ? "" : result.error.provider, "alphafeed-rest");
    assert.deepEqual(result.triedProviders, ["alphafeed-rest"]);
    assert.equal(result.ok ? "" : result.health[0]?.status, "rateLimited");
    assert.equal(result.ok ? "" : result.health[0]?.nextRetryAt, "2026-07-07T00:02:00.000Z");
  });
});

describe("AlphaFeed WebSocket gateway compatibility provider", () => {
  it("wraps stream snapshot reads as realtime quote snapshots", async () => {
    const provider = createAlphaFeedWebSocketGatewayProvider({
      connectStream: async () => ({
        ok: true,
        state: "connected",
        health: {
          status: "ok",
          message: "connected",
          checkedAt: "2026-07-07T00:00:00.000Z",
          latencyMs: 1,
        },
      }),
      readStreamSnapshot: async () => ({
        ok: true,
        state: "connected",
        snapshots: [quoteSnapshot],
        health: {
          status: "ok",
          message: "connected",
          checkedAt: "2026-07-07T00:00:00.000Z",
          latencyMs: 1,
        },
      }),
      disconnectStream: async () => ({
        ok: true,
        state: "idle",
        health: {
          status: "ok",
          message: "disconnected",
          checkedAt: "2026-07-07T00:00:00.000Z",
          latencyMs: 1,
        },
      }),
    });
    const gateway = createMarketDataGateway(createMarketDataProviderRegistry([provider]), [
      "alphafeed-websocket",
    ]);

    await provider.connectStream([{ market: "US", symbol: "AAPL.US" }]);
    const result = await gateway.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);

    assert.equal(result.ok, true);
    assert.equal(result.provider, "alphafeed-websocket");
    assert.equal(result.data[0]?.provider, "alphafeed-websocket");
  });
});

describe("LongBridge gateway compatibility provider", () => {
  it("wraps existing quote and historical bar operations without changing their legacy result contracts", async () => {
    const provider = createLongBridgeGatewayProvider({
      fetchQuoteSnapshot: async () => ({
        ok: true,
        snapshots: [{ ...quoteSnapshot, provider: "longport" }],
      }),
      fetchHistoricalBars: async () => ({
        ok: true,
        bars: [{ ...marketBar, provider: "longport" }],
      }),
    });
    const gateway = createMarketDataGateway(createMarketDataProviderRegistry([provider]), [
      "longbridge",
    ]);

    const quoteResult = await gateway.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);
    const barResult = await gateway.fetchHistoricalBars({
      market: "US",
      symbol: "AAPL.US",
      timeframe: "1d",
    });

    assert.equal(quoteResult.ok, true);
    assert.equal(quoteResult.data[0]?.provider, "longbridge");
    assert.equal(barResult.ok, true);
    assert.equal(barResult.data[0]?.provider, "longbridge");
    assert.equal(barResult.health.status, "delayed");
  });
});
