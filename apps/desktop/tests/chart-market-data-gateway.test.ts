import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createChartMarketDataAccess,
  createChartMarketDataGateways,
  gatewayBarsToMarketDataBars,
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
  it("uses provider-neutral desktop IPC access without touching legacy provider credentials", async () => {
    const calls: string[] = [];
    const access = await createChartMarketDataAccess({
      enableStockSdkPrimary: true,
      bridge: {
        platform: "desktop",
        version: "test",
        secureCredentials: {
          readAlphaFeed: async () => {
            throw new Error("legacy alpha credentials should not be read");
          },
          readAlphaFeedStream: async () => {
            throw new Error("legacy stream credentials should not be read");
          },
          readLongPort: async () => {
            throw new Error("legacy longbridge credentials should not be read");
          },
        },
        alphaFeed: {
          fetchQuoteSnapshot: async () => {
            throw new Error("legacy alpha quote should not be called");
          },
          fetchHistoricalBars: async () => {
            throw new Error("legacy alpha bars should not be called");
          },
          fetchIntradayBars: async () => {
            throw new Error("legacy alpha intraday should not be called");
          },
        },
        longPort: {
          fetchQuoteSnapshot: async () => {
            throw new Error("legacy longbridge quote should not be called");
          },
          fetchHistoricalBars: async () => {
            throw new Error("legacy longbridge bars should not be called");
          },
        },
        marketData: {
          getProviderStatus: async () => {
            throw new Error("provider status is not part of this chart access path");
          },
          fetchQuoteSnapshot: async () => {
            calls.push("marketData.quote");
            return {
              ok: true,
              data: [
                {
                  provider: "stock-sdk",
                  market: "US",
                  symbol: "AAPL.US",
                  name: "Apple Inc.",
                  price: 312.66,
                  previousClose: 308.63,
                  timestamp: 1_788_566_401_000,
                  receivedAt: "2026-07-06T20:00:01.000Z",
                  delayLevel: "unknown",
                },
              ],
              meta: marketDataMeta("stock-sdk", "realtimeQuote"),
            };
          },
          fetchHistoricalBars: async () => {
            calls.push("marketData.history");
            return {
              ok: true,
              data: [{ ...bar, provider: "stock-sdk" }],
              meta: marketDataMeta("stock-sdk", "historicalBars"),
            };
          },
          fetchIntradayBars: async () => {
            calls.push("marketData.intraday");
            return {
              ok: true,
              data: [{ ...bar, provider: "stock-sdk", timeframe: "1m" }],
              meta: marketDataMeta("stock-sdk", "intradayBars"),
            };
          },
          connectQuoteStream: async () => {
            calls.push("marketData.stream.connect");
            return {
              ok: true,
              data: { state: "connected" },
              meta: marketDataMeta("alphafeed-websocket", "realtimeQuote"),
            };
          },
          readQuoteStreamSnapshot: async () => {
            calls.push("marketData.stream.read");
            return {
              ok: true,
              data: {
                state: "connected",
                snapshots: [
                  {
                    provider: "alphafeed-websocket",
                    market: "US",
                    symbol: "AAPL.US",
                    price: 313,
                    previousClose: 308.63,
                    timestamp: 1_788_566_402_000,
                    receivedAt: "2026-07-06T20:00:02.000Z",
                    delayLevel: "realtime",
                  },
                ],
              },
              meta: marketDataMeta("alphafeed-websocket", "realtimeQuote"),
            };
          },
          disconnectQuoteStream: async () => {
            calls.push("marketData.stream.disconnect");
            return {
              ok: true,
              data: { state: "idle" },
              meta: marketDataMeta("alphafeed-websocket", "realtimeQuote"),
            };
          },
        },
      } as QuantDesktopBridge,
    });

    const quote = await access.fetchQuoteSnapshotBatch([{ market: "US", symbol: "AAPL.US", name: "Apple Inc.", source: "preset" }]);
    const history = await access.fetchBars({
      capability: "historicalBars",
      request: { market: "US", symbol: "AAPL.US", timeframe: "1d" },
    });
    const intraday = await access.fetchBars({
      capability: "intradayBars",
      request: { market: "US", symbol: "AAPL.US", timeframe: "1m" },
    });
    const connected = await access.connectQuoteStream([{ market: "US", symbol: "AAPL.US", name: "Apple Inc.", source: "preset" }]);
    const stream = await access.readQuoteStreamSnapshot([{ market: "US", symbol: "AAPL.US", name: "Apple Inc.", source: "preset" }]);
    await access.disconnectQuoteStream();

    assert.equal(access.hasQuoteSource, true);
    assert.equal(access.hasHistoricalSource, true);
    assert.equal(access.hasIntradaySource, true);
    assert.equal(access.hasStreamSource, true);
    assert.equal(quote.ok, true);
    assert.equal(quote.ok ? quote.health.provider : "", "stock-sdk");
    assert.equal(history.ok, true);
    assert.equal(history.ok ? history.data[0]?.provider : "", "stock-sdk");
    assert.equal(intraday.ok, true);
    assert.equal(intraday.ok ? intraday.data[0]?.timeframe : "", "1m");
    assert.equal(connected?.provider, "alphafeed-websocket");
    assert.equal(stream.ok, true);
    assert.equal(stream.ok ? stream.snapshots[0]?.provider : "", "alphafeed-websocket");
    assert.deepEqual(calls, [
      "marketData.quote",
      "marketData.history",
      "marketData.intraday",
      "marketData.stream.connect",
      "marketData.stream.read",
      "marketData.stream.disconnect",
    ]);
  });

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

  it("uses stock-sdk first when the guarded primary switch is enabled", async () => {
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
            return { ok: true, bars: [{ ...bar, timeframe: "1m", provider: "alphafeed" }], health: health("ok") };
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
      enableStockSdkPrimary: true,
      stockSdkOperations: {
        fetchQuoteSnapshot: async () => {
          calls.push("stock.quote");
          return [
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
          ];
        },
        fetchHistoricalBars: async () => {
          calls.push("stock.history");
          return [{ date: "2026-07-06", open: 307.36, high: 314.2, low: 307, close: 312.66, volume: 1 }];
        },
        fetchIntradayBars: async () => {
          calls.push("stock.intraday");
          return [{ time: "2026-07-06 09:30", open: 0, high: 286.9, low: 286.61, close: 286.86, volume: 1 }];
        },
      },
    });

    const quoteResult = await gateways.quoteSnapshots.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);
    const historyResult = await gateways.historicalBars.fetchHistoricalBars({ market: "US", symbol: "AAPL.US", timeframe: "1d" });
    const intradayResult = await gateways.intradayBars.fetchIntradayBars({ market: "US", symbol: "AAPL.US", timeframe: "1m" });

    assert.equal(quoteResult.ok, true);
    assert.equal(quoteResult.provider, "stock-sdk");
    assert.equal(historyResult.ok, true);
    assert.equal(historyResult.provider, "stock-sdk");
    assert.equal(intradayResult.ok, true);
    assert.equal(intradayResult.provider, "stock-sdk");
    assert.deepEqual(calls, ["stock.quote", "stock.history", "stock.intraday"]);
  });

  it("can use stock-sdk without fallback provider credentials when the guarded switch is enabled", async () => {
    const gateways = createChartMarketDataGateways({
      enableStockSdkPrimary: true,
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
        fetchHistoricalBars: async () => [{ date: "2026-07-06", open: 307.36, high: 314.2, low: 307, close: 312.66, volume: 1 }],
        fetchIntradayBars: async () => [{ time: "2026-07-06 09:30", open: 0, high: 286.9, low: 286.61, close: 286.86, volume: 1 }],
      },
    });

    const quoteResult = await gateways.quoteSnapshots.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);
    const historyResult = await gateways.historicalBars.fetchHistoricalBars({ market: "US", symbol: "AAPL.US", timeframe: "1d" });

    assert.equal(quoteResult.ok, true);
    assert.equal(quoteResult.provider, "stock-sdk");
    assert.equal(historyResult.ok, true);
    assert.equal(historyResult.provider, "stock-sdk");
  });

  it("falls back to existing providers when stock-sdk is enabled but unavailable", async () => {
    const calls: string[] = [];
    const createGateways = () => createChartMarketDataGateways({
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
            return { ok: true, bars: [{ ...bar, timeframe: "1m", provider: "alphafeed" }], health: health("ok") };
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
      enableStockSdkPrimary: true,
      stockSdkOperations: {
        fetchQuoteSnapshot: async () => {
          calls.push("stock.quote");
          throw new Error("stock quote unavailable");
        },
        fetchHistoricalBars: async () => {
          calls.push("stock.history");
          throw new Error("stock history unavailable");
        },
        fetchIntradayBars: async () => {
          calls.push("stock.intraday");
          throw new Error("stock intraday unavailable");
        },
      },
    });

    const quoteResult = await createGateways().quoteSnapshots.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);
    const historyResult = await createGateways().historicalBars.fetchHistoricalBars({ market: "US", symbol: "AAPL.US", timeframe: "1d" });
    const intradayResult = await createGateways().intradayBars.fetchIntradayBars({ market: "US", symbol: "AAPL.US", timeframe: "1m" });

    assert.equal(quoteResult.ok, true);
    assert.equal(quoteResult.provider, "alphafeed-rest");
    assert.equal(historyResult.ok, true);
    assert.equal(historyResult.provider, "longbridge");
    assert.equal(intradayResult.ok, true);
    assert.equal(intradayResult.provider, "alphafeed-rest");
    assert.deepEqual(calls, [
      "stock.quote",
      "alphafeed.quote",
      "stock.history",
      "longbridge.history",
      "stock.intraday",
      "alphafeed.intraday",
    ]);
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

  it("can normalize intraday gateway bars into realtime cache bars", () => {
    const [realtimeBar] = gatewayBarsToMarketDataBars(
      [
        {
          provider: "stock-sdk",
          market: "US",
          symbol: "AAPL.US",
          timeframe: "1m",
          timestamp: Date.parse("2026-07-07T13:30:00.000Z"),
          open: 310,
          high: 311,
          low: 309,
          close: 310.66,
          volume: 1000,
        },
      ],
      "realtime",
    );

    assert.equal(realtimeBar?.provider, "stock-sdk");
    assert.equal(realtimeBar?.timeframe, "realtime");
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

function marketDataMeta(
  provider: "stock-sdk" | "alphafeed-websocket",
  capability: "realtimeQuote" | "historicalBars" | "intradayBars",
) {
  return {
    provider,
    servedAt: "2026-07-07T00:00:00.000Z",
    fallback: {
      activeProvider: provider,
      triedProviders: [provider],
    },
    health: {
      provider,
      status: "healthy",
      message: "ok",
      checkedAt: "2026-07-07T00:00:00.000Z",
      capability: {
        realtimeQuote: capability === "realtimeQuote",
        historicalBars: capability === "historicalBars",
        intradayBars: capability === "intradayBars",
        websocket: provider === "alphafeed-websocket",
        batchQuote: capability === "realtimeQuote" && provider !== "alphafeed-websocket",
        markets: ["US", "HK", "CN"],
        timeframes: capability === "historicalBars" ? ["1d", "1w"] : ["realtime"],
        delayLevel: provider === "alphafeed-websocket" ? "realtime" : "unknown",
      },
    },
  } as const;
}
