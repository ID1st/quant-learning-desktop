import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createChartMarketDataGateways,
  gatewayQuoteSnapshotsToMarketQuoteSnapshots,
} from "../src/features/marketData/chartMarketDataGateway.ts";

const alphaFeedCredentials = { apiUrl: "https://example.test", apiKey: "alpha-key" };
const longPortCredentials = {
  apiUrl: "https://longbridge.test",
  appKey: "app-key",
  appSecret: "app-secret",
  accessToken: "access-token",
};

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
  name: "Apple Inc.",
};

const bar = {
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
  provider: "longport" as const,
};

describe("chart market data gateways", () => {
  it("keeps the chart history path on LongBridge before AlphaFeed fallback", async () => {
    const calls: string[] = [];
    const gateways = createChartMarketDataGateways({
      bridge: {
        platform: "desktop",
        version: "test",
        alphaFeed: {
          fetchQuoteSnapshot: async () => {
            calls.push("alphafeed.quote");
            return { ok: true, snapshots: [quoteSnapshot], health: health("ok") };
          },
          fetchHistoricalBars: async () => {
            calls.push("alphafeed.history");
            return { ok: true, bars: [{ ...bar, provider: "alphafeed" }], health: health("ok") };
          },
          fetchIntradayBars: async () => {
            calls.push("alphafeed.intraday");
            return { ok: true, bars: [{ ...bar, provider: "alphafeed" }], health: health("ok") };
          },
        },
        longPort: {
          fetchQuoteSnapshot: async () => {
            calls.push("longbridge.quote");
            return { ok: true, snapshots: [{ ...quoteSnapshot, provider: "longport" }] };
          },
          fetchHistoricalBars: async () => {
            calls.push("longbridge.history");
            return { ok: true, bars: [bar] };
          },
        },
      } as QuantDesktopBridge,
      alphaFeedCredentials,
      longPortCredentials,
    });

    const result = await gateways.historicalBars.fetchHistoricalBars({ market: "US", symbol: "AAPL.US", timeframe: "1d" });

    assert.equal(result.ok, true);
    assert.equal(result.provider, "longbridge");
    assert.deepEqual(calls, ["longbridge.history"]);
  });

  it("keeps realtime quote polling on AlphaFeed REST before LongBridge fallback", async () => {
    const calls: string[] = [];
    const gateways = createChartMarketDataGateways({
      bridge: {
        platform: "desktop",
        version: "test",
        alphaFeed: {
          fetchQuoteSnapshot: async () => {
            calls.push("alphafeed.quote");
            return { ok: true, snapshots: [quoteSnapshot], health: health("ok") };
          },
          fetchHistoricalBars: async () => {
            calls.push("alphafeed.history");
            return { ok: true, bars: [], health: health("ok") };
          },
          fetchIntradayBars: async () => {
            calls.push("alphafeed.intraday");
            return { ok: true, bars: [], health: health("ok") };
          },
        },
        longPort: {
          fetchQuoteSnapshot: async () => {
            calls.push("longbridge.quote");
            return { ok: true, snapshots: [{ ...quoteSnapshot, provider: "longport" }] };
          },
          fetchHistoricalBars: async () => {
            calls.push("longbridge.history");
            return { ok: true, bars: [] };
          },
        },
      } as QuantDesktopBridge,
      alphaFeedCredentials,
      longPortCredentials,
    });

    const result = await gateways.quoteSnapshots.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);

    assert.equal(result.ok, true);
    assert.equal(result.provider, "alphafeed-rest");
    assert.deepEqual(calls, ["alphafeed.quote"]);
  });

  it("converts gateway snapshots back to chart snapshots without dropping daily merge fields", () => {
    const [snapshot] = gatewayQuoteSnapshotsToMarketQuoteSnapshots([
      {
        provider: "alphafeed-rest",
        market: "US",
        symbol: "AAPL.US",
        name: "Apple Inc.",
        price: 294.28,
        previousClose: 294.34,
        openPrice: 294,
        highPrice: 295,
        lowPrice: 293,
        changePercent: -0.02,
        timestamp: new Date("2026-07-07T13:30:00.000Z").getTime(),
        receivedAt: "2026-07-07T13:30:01.000Z",
        volume: 1000,
        amount: 294_280,
      },
    ]);

    assert.equal(snapshot?.provider, "alphafeed-rest");
    assert.equal(snapshot?.previousClose, 294.34);
    assert.equal(snapshot?.openPrice, 294);
    assert.equal(snapshot?.highPrice, 295);
    assert.equal(snapshot?.lowPrice, 293);
    assert.equal(snapshot?.amount, 294_280);
  });
});

function health(status: AlphaFeedProviderHealth["status"]): AlphaFeedProviderHealth {
  return {
    status,
    message: status,
    checkedAt: "2026-07-07T00:00:00.000Z",
    latencyMs: 1,
  };
}
