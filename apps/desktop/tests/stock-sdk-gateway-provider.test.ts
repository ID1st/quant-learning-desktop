import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createStockSdkGatewayProvider,
  normalizeStockSdkSymbol,
  toStockSdkBarRequest,
  toStockSdkQuoteRequest,
  type StockSdkGatewayProviderOperations,
  type StockSdkQuoteRequest,
} from "../src/features/marketData/stockSdkGatewayProvider.ts";
import { createStockSdkGatewayProviderOperations } from "../src/features/marketData/stockSdkProviderOperations.ts";
import { createMarketDataGateway, createMarketDataProviderRegistry } from "../src/features/marketData/marketDataProviderGateway.ts";
import type {
  GatewayMarketDataProvider,
  GatewayMarketQuoteSnapshot,
  MarketDataProviderCapability,
} from "../src/features/marketData/marketDataProviderGateway.ts";

const fallbackCapability: MarketDataProviderCapability = {
  realtimeQuote: true,
  historicalBars: false,
  intradayBars: false,
  websocket: false,
  batchQuote: true,
  markets: ["US"],
  timeframes: ["realtime"],
  delayLevel: "realtime",
};

describe("Stock SDK symbol normalization", () => {
  it("normalizes app symbols to stock-sdk quote and bar symbols", () => {
    assert.equal(normalizeStockSdkSymbol("600519.SH", "CN", "quote"), "sh600519");
    assert.equal(normalizeStockSdkSymbol("000001.SZ", "CN", "quote"), "sz000001");
    assert.equal(normalizeStockSdkSymbol("600519.SH", "CN", "historical"), "600519");
    assert.equal(normalizeStockSdkSymbol("00700.HK", "HK", "quote"), "00700");
    assert.equal(normalizeStockSdkSymbol("hk700", "HK", "intraday"), "00700");
    assert.equal(normalizeStockSdkSymbol("AAPL.US", "US", "quote"), "AAPL");
    assert.equal(normalizeStockSdkSymbol("AAPL.US", "US", "historical"), "105.AAPL");
  });

  it("creates provider requests without losing the app-facing symbol", () => {
    assert.deepEqual(toStockSdkQuoteRequest({ market: "CN", symbol: "600519.SH" }), {
      market: "CN",
      symbol: "600519.SH",
      providerSymbol: "sh600519",
    });

    assert.deepEqual(toStockSdkBarRequest({ market: "US", symbol: "AAPL.US", timeframe: "1w", count: 120 }, "historical"), {
      market: "US",
      symbol: "AAPL.US",
      providerSymbol: "105.AAPL",
      timeframe: "1w",
      period: "weekly",
      count: 120,
      startTime: undefined,
      endTime: undefined,
    });
  });
});

describe("Stock SDK gateway provider", () => {
  it("normalizes searchable US, HK and CN instruments for the application", async () => {
    const provider = createStockSdkGatewayProvider(
      {
        fetchQuoteSnapshot: async () => [],
        fetchHistoricalBars: async () => [],
        fetchIntradayBars: async () => [],
        searchInstruments: async () => [
          { code: "usaapl.oq", name: "Apple", market: "us" },
          { code: "hk00700", name: "Tencent", market: "hk" },
          { code: "sz000700", name: "Test CN", market: "sz" },
        ],
      },
      { enabled: true },
    );

    assert.deepEqual(await provider.searchInstruments("a"), [
      { provider: "stock-sdk", market: "US", symbol: "AAPL.US", name: "Apple" },
      { provider: "stock-sdk", market: "HK", symbol: "00700.HK", name: "Tencent" },
      { provider: "stock-sdk", market: "CN", symbol: "000700.SZ", name: "Test CN" },
    ]);
  });

  it("is unconfigured by default so the gateway falls back without calling it", async () => {
    const stockSdkProvider = createStockSdkGatewayProvider(createThrowingOperations());
    const fallbackQuote: GatewayMarketQuoteSnapshot = {
      provider: "alphafeed-rest",
      market: "US",
      symbol: "AAPL.US",
      price: 294.28,
      timestamp: 1_788_288_000_000,
    };
    const fallbackProvider: GatewayMarketDataProvider = {
      id: "alphafeed-rest",
      displayName: "AlphaFeed REST",
      capability: fallbackCapability,
      getHealth: async () => ({
        provider: "alphafeed-rest",
        status: "healthy",
        message: "ok",
        checkedAt: "2026-07-07T00:00:00.000Z",
        capability: fallbackCapability,
      }),
      fetchQuoteSnapshot: async () => [fallbackQuote],
    };
    const gateway = createMarketDataGateway(createMarketDataProviderRegistry([stockSdkProvider, fallbackProvider]));

    const result = await gateway.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);

    assert.equal(result.ok, true);
    assert.equal(result.provider, "alphafeed-rest");
    assert.deepEqual(result.triedProviders, ["stock-sdk", "alphafeed-rest"]);
    assert.deepEqual(result.data, [fallbackQuote]);
  });

  it("maps stock-sdk quotes into provider-neutral snapshots even when batch results are unordered", async () => {
    const capturedRequests: StockSdkQuoteRequest[][] = [];
    const provider = createStockSdkGatewayProvider(
      {
        fetchQuoteSnapshot: async (requests) => {
          capturedRequests.push([...requests]);
          return [
            {
              symbol: "AAPL.OQ",
              name: "Apple",
              current: 294.28,
              lastClose: 294.34,
              timestamp: 1_788_288_000_000,
            },
            {
              code: "00700",
              name: "Tencent",
              lastPrice: 83.2,
              prevClose: 82,
              time: "2026/07/07 16:08:52",
            },
            {
              code: "sh600519",
              name: "Kweichow Moutai",
              price: "1468.1",
              previousClose: 1460,
              open: 1462,
              high: 1475,
              low: 1458,
              changePercent: 0.54,
              volume: 1000,
              amount: 1_468_100,
              datetime: "2026-07-07 14:30:00",
            },
          ];
        },
        fetchHistoricalBars: async () => [],
        fetchIntradayBars: async () => [],
      },
      { enabled: true },
    );
    const gateway = createMarketDataGateway(createMarketDataProviderRegistry([provider]), ["stock-sdk"]);

    const result = await gateway.fetchQuoteSnapshot([
      { market: "CN", symbol: "600519.SH" },
      { market: "HK", symbol: "00700.HK" },
      { market: "US", symbol: "AAPL.US" },
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(
      capturedRequests[0]?.map((request) => request.providerSymbol),
      ["sh600519", "00700", "AAPL"],
    );
    assert.deepEqual(
      result.data.map((snapshot) => [snapshot.provider, snapshot.market, snapshot.symbol, snapshot.price]),
      [
        ["stock-sdk", "CN", "600519.SH", 1468.1],
        ["stock-sdk", "HK", "00700.HK", 83.2],
        ["stock-sdk", "US", "AAPL.US", 294.28],
      ],
    );
  });

  it("does not map unmatched stock-sdk quote records to the requested symbol by array index", async () => {
    const provider = createStockSdkGatewayProvider(
      {
        fetchQuoteSnapshot: async () => [
          {
            name: "Kweichow Moutai",
            price: 1199.3,
            previousClose: 1188.8,
            timestamp: 1_788_288_000_000,
          },
        ],
        fetchHistoricalBars: async () => [],
        fetchIntradayBars: async () => [],
      },
      { enabled: true },
    );

    await assert.rejects(
      () => provider.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]),
      /returned no quote for AAPL\.US/,
    );
  });

  it("keeps US share-class suffixes while matching a provider quote", async () => {
    const provider = createStockSdkGatewayProvider(
      {
        fetchQuoteSnapshot: async () => [
          { code: "BRK.A", name: "Berkshire Hathaway", price: 750_000, timestamp: 1_788_288_000_000 },
        ],
        fetchHistoricalBars: async () => [],
        fetchIntradayBars: async () => [],
      },
      { enabled: true },
    );

    const snapshots = await provider.fetchQuoteSnapshot([{ market: "US", symbol: "BRK.A.US" }]);

    assert.equal(snapshots[0]?.symbol, "BRK.A.US");
    assert.equal(snapshots[0]?.price, 750_000);
  });

  it("maps historical and intraday bars while repairing deterministic zero opens", async () => {
    const capturedHistorical: string[] = [];
    const capturedIntraday: string[] = [];
    const provider = createStockSdkGatewayProvider(
      {
        fetchQuoteSnapshot: async () => [],
        fetchHistoricalBars: async (request) => {
          capturedHistorical.push(`${request.providerSymbol}:${request.period}`);
          return [
            { date: "2026-07-06", open: 290, high: 296, low: 289, close: 294, volume: 1000 },
            { date: "2026-07-07", open: 294, high: 298, low: 293, close: 297, volume: 1200 },
          ];
        },
        fetchIntradayBars: async (request) => {
          capturedIntraday.push(`${request.providerSymbol}:${request.period}`);
          return [
            { datetime: "2026-07-07 09:30:00", open: 0, high: 83.5, low: 83.1, close: 83.2, volume: 100 },
            { datetime: "2026-07-07 09:31:00", open: 0, high: 83.6, low: 83.2, close: 83.4, volume: 120 },
            { datetime: "2026-07-08 09:30:00", open: 0, high: 85.1, low: 84.9, close: 85, volume: 90 },
          ];
        },
      },
      { enabled: true },
    );

    const historicalBars = await provider.fetchHistoricalBars({ market: "US", symbol: "AAPL.US", timeframe: "1w" });
    const intradayBars = await provider.fetchIntradayBars({ market: "HK", symbol: "00700.HK", timeframe: "1m" });

    assert.deepEqual(capturedHistorical, ["105.AAPL:weekly"]);
    assert.deepEqual(capturedIntraday, ["00700:1"]);
    assert.equal(historicalBars[0]?.provider, "stock-sdk");
    assert.equal(historicalBars[0]?.timeframe, "1w");
    assert.equal(intradayBars[0]?.open, 83.2);
    assert.equal(intradayBars[1]?.open, 83.2);
    assert.equal(intradayBars[2]?.open, 85);
  });

  it("repairs a small provider rounding mismatch between close and high", async () => {
    const provider = createStockSdkGatewayProvider(
      {
        fetchQuoteSnapshot: async () => [],
        fetchHistoricalBars: async () => [],
        fetchIntradayBars: async () => [
          { datetime: "2026-07-09 16:00:00", open: 316.07, high: 316.21, low: 315.9, close: 316.22, volume: 12_800_715 },
        ],
      },
      { enabled: true },
    );

    const bars = await provider.fetchIntradayBars({ market: "US", symbol: "AAPL.US", timeframe: "1m" });

    assert.equal(bars[0]?.high, 316.22);
    assert.equal((await provider.getHealth()).status, "healthy");
  });

  it("rejects inconsistent OHLC values before they reach the chart", async () => {
    const provider = createStockSdkGatewayProvider(
      {
        fetchQuoteSnapshot: async () => [],
        fetchHistoricalBars: async () => [{ date: "2026-07-07", open: 10, high: 9, low: 8, close: 10, volume: 1 }],
        fetchIntradayBars: async () => [],
      },
      { enabled: true },
    );

    await assert.rejects(
      () => provider.fetchHistoricalBars({ market: "CN", symbol: "600519.SH", timeframe: "1d" }),
      /inconsistent OHLC/,
    );
    assert.equal((await provider.getHealth()).status, "unavailable");
  });

  it("reports a readable fallback-ready diagnostic for transient network failures", async () => {
    const provider = createStockSdkGatewayProvider(
      {
        fetchQuoteSnapshot: async () => [],
        fetchHistoricalBars: async () => [],
        fetchIntradayBars: async () => {
          throw new Error("fetch failed: UND_ERR_SOCKET");
        },
      },
      { enabled: true },
    );

    await assert.rejects(
      () => provider.fetchIntradayBars({ market: "US", symbol: "AAPL.US", timeframe: "1m" }),
      /UND_ERR_SOCKET/,
    );
    const health = await provider.getHealth();
    assert.equal(health.status, "unavailable");
    assert.equal(health.message, "Stock SDK 网络请求失败，已尝试备用数据源。");
  });
});

describe("Stock SDK provider operations", () => {
  it("prefers the Stock SDK Tencent timeline for current CN and HK intraday data", async () => {
    const timelineCalls: string[] = [];
    let minuteKlineCalls = 0;
    const operations = createStockSdkGatewayProviderOperations({
      search: async () => [],
      quotes: {
        cn: async () => [],
        hk: async () => [],
        us: async () => [],
        timeline: async (symbol) => {
          timelineCalls.push(symbol);
          return {
            date: "2026-07-10",
            data: [
              { time: "09:30", timestamp: 1_784_000_000_000, price: 1200, volume: 100, amount: 120_000 },
              { time: "09:31", timestamp: 1_784_000_060_000, price: 1201, volume: 160, amount: 192_060 },
            ],
          };
        },
      },
      kline: {
        cn: async () => [],
        cnMinute: async () => {
          minuteKlineCalls += 1;
          throw new Error("Stock SDK CN intraday timed out after 8000ms.");
        },
        hk: async () => [],
        hkMinute: async () => {
          minuteKlineCalls += 1;
          throw new Error("fetch failed: UND_ERR_SOCKET");
        },
        us: async () => [],
        usMinute: async () => [],
      },
    });

    const cnBars = await operations.fetchIntradayBars({
      market: "CN",
      symbol: "600519.SH",
      providerSymbol: "600519",
      timeframe: "1m",
      period: "1",
    });
    const hkBars = await operations.fetchIntradayBars({
      market: "HK",
      symbol: "00700.HK",
      providerSymbol: "00700",
      timeframe: "1m",
      period: "1",
    });

    assert.deepEqual(timelineCalls, ["sh600519", "hk00700"]);
    assert.equal(minuteKlineCalls, 0);
    assert.deepEqual(cnBars, [
      { timestamp: 1_784_000_000_000, open: 1200, high: 1200, low: 1200, close: 1200, volume: 100, amount: 120_000 },
      { timestamp: 1_784_000_060_000, open: 1201, high: 1201, low: 1201, close: 1201, volume: 60, amount: 72_060 },
    ]);
    assert.equal(hkBars.length, 2);
  });

  it("does not use the CN and HK Tencent timeline fallback for US minute data", async () => {
    let timelineCalled = false;
    const operations = createStockSdkGatewayProviderOperations({
      search: async () => [],
      quotes: {
        cn: async () => [],
        hk: async () => [],
        us: async () => [],
        timeline: async () => {
          timelineCalled = true;
          return { date: "2026-07-10", data: [] };
        },
      },
      kline: {
        cn: async () => [],
        cnMinute: async () => [],
        hk: async () => [],
        hkMinute: async () => [],
        us: async () => [],
        usMinute: async () => {
          throw new Error("fetch failed: UND_ERR_SOCKET");
        },
      },
    });

    await assert.rejects(
      () => operations.fetchIntradayBars({ market: "US", symbol: "AAPL.US", providerSymbol: "105.AAPL", timeframe: "1m", period: "1" }),
      /UND_ERR_SOCKET/,
    );
    assert.equal(timelineCalled, false);
  });

  it("uses ndays instead of strict start and end time options for intraday bars", async () => {
    const capturedOptions: Record<string, unknown>[] = [];
    const operations = createStockSdkGatewayProviderOperations({
      search: async () => [],
      quotes: {
        cn: async () => [],
        hk: async () => [],
        us: async () => [],
      },
      kline: {
        cn: async () => [],
        cnMinute: async () => [],
        hk: async () => [],
        hkMinute: async () => [],
        us: async () => [],
        usMinute: async (_symbol, options) => {
          capturedOptions.push(options);
          return [];
        },
      },
    });

    await operations.fetchIntradayBars({
      market: "US",
      symbol: "AAPL.US",
      providerSymbol: "105.AAPL",
      timeframe: "1m",
      period: "1",
      startTime: Date.parse("2026-07-07T13:30:00.000Z"),
      endTime: Date.parse("2026-07-07T20:00:00.000Z"),
    });

    assert.equal(capturedOptions[0]?.period, "1");
    assert.equal(capturedOptions[0]?.ndays, 5);
    assert.equal("startDate" in (capturedOptions[0] ?? {}), false);
    assert.equal("endDate" in (capturedOptions[0] ?? {}), false);
  });

  it("bounds daily and weekly history requests from the requested bar count", async () => {
    const capturedOptions: Record<string, unknown>[] = [];
    const operations = createStockSdkGatewayProviderOperations({
      search: async () => [],
      quotes: {
        cn: async () => [],
        hk: async () => [],
        us: async () => [],
      },
      kline: {
        cn: async () => [],
        cnMinute: async () => [],
        hk: async (_symbol, options) => {
          capturedOptions.push(options);
          return [];
        },
        hkMinute: async () => [],
        us: async () => [],
        usMinute: async () => [],
      },
    });

    await operations.fetchHistoricalBars({
      market: "HK",
      symbol: "00700.HK",
      providerSymbol: "00700",
      timeframe: "1d",
      period: "daily",
      count: 240,
    });
    await operations.fetchHistoricalBars({
      market: "HK",
      symbol: "00700.HK",
      providerSymbol: "00700",
      timeframe: "1w",
      period: "weekly",
      count: 260,
    });

    for (const options of capturedOptions) {
      assert.match(String(options.startDate), /^\d{8}$/);
      assert.match(String(options.endDate), /^\d{8}$/);
      assert.ok(String(options.startDate) < String(options.endDate));
    }
    assert.equal(capturedOptions[0]?.period, "daily");
    assert.equal(capturedOptions[1]?.period, "weekly");
  });

  it("temporarily short-circuits K-line requests after an upstream network failure", async () => {
    let klineCalls = 0;
    const operations = createStockSdkGatewayProviderOperations({
      search: async () => [],
      quotes: { cn: async () => [], hk: async () => [], us: async () => [] },
      kline: {
        cn: async () => {
          klineCalls += 1;
          throw new Error("fetch failed: connection reset");
        },
        cnMinute: async () => [],
        hk: async () => [],
        hkMinute: async () => [],
        us: async () => [],
        usMinute: async () => [],
      },
    });
    const request = { market: "CN" as const, symbol: "600519.SH", providerSymbol: "600519", timeframe: "1d" as const, period: "daily" as const };

    await assert.rejects(() => operations.fetchHistoricalBars(request), /connection reset/);
    await assert.rejects(() => operations.fetchHistoricalBars(request), /temporarily unavailable/);
    assert.equal(klineCalls, 1);
  });
});

function createThrowingOperations(): StockSdkGatewayProviderOperations {
  return {
    fetchQuoteSnapshot: async () => {
      throw new Error("stock-sdk should not be called");
    },
    fetchHistoricalBars: async () => {
      throw new Error("stock-sdk should not be called");
    },
    fetchIntradayBars: async () => {
      throw new Error("stock-sdk should not be called");
    },
    searchInstruments: async () => {
      throw new Error("stock-sdk should not be called");
    },
  };
}
