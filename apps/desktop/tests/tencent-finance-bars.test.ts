import assert from "node:assert/strict";
import { test } from "node:test";
import { createTencentFinanceBarsOperations } from "../src/electron/tencentFinanceBars.ts";
import { createMarketDataIpcHandlers } from "../src/electron/marketDataIpcHandlers.ts";
import { createStockSdkGatewayProvider } from "../src/features/marketData/stockSdkGatewayProvider.ts";
import { createStockSdkGatewayProviderOperations } from "../src/features/marketData/stockSdkProviderOperations.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("Tencent Finance history maps market symbols and preserves requested adjustment", async () => {
  const urls: string[] = [];
  const operations = createTencentFinanceBarsOperations({
    fetchImpl: async (input) => {
      const url = String(input);
      urls.push(url);
      const param = new URL(url).searchParams.get("param") ?? "";
      const symbol = param.split(",")[0] ?? "";
      const dataKey = param.endsWith(",qfq") ? "qfqday" : "day";
      return jsonResponse({
        code: 0,
        data: {
          [symbol]: {
            [dataKey]: [["2026-07-10", "1182.2", "1204.98", "1204.98", "1170.28", "52213"]],
          },
        },
      });
    },
  });

  const [cn, hk, us] = await Promise.all([
    operations.fetchHistoricalBars({ market: "CN", symbol: "600519.SH", providerSymbol: "600519", timeframe: "1d", period: "daily", adjust: "forward" }),
    operations.fetchHistoricalBars({ market: "HK", symbol: "00700.HK", providerSymbol: "00700", timeframe: "1d", period: "daily" }),
    operations.fetchHistoricalBars({ market: "US", symbol: "AAPL.US", providerSymbol: "105.AAPL", timeframe: "1d", period: "daily" }),
  ]);

  assert.equal(cn[0]?.close, 1204.98);
  assert.equal(hk[0]?.upstream, "tencent");
  assert.equal(us[0]?.upstream, "tencent");
  const params = urls.map((url) => new URL(url).searchParams.get("param"));
  assert.ok(params.includes("sh600519,day,,,240,qfq"));
  assert.ok(params.includes("hk00700,day,,,240,"));
  assert.ok(params.includes("usAAPL.OQ,day,,,240,"));
});

test("Tencent Finance history retries a US ticker with the NYSE suffix after an empty NASDAQ response", async () => {
  const urls: string[] = [];
  const operations = createTencentFinanceBarsOperations({
    fetchImpl: async (input) => {
      const url = String(input);
      urls.push(url);
      const symbol = new URL(url).searchParams.get("param")?.split(",")[0] ?? "";
      return jsonResponse({
        code: 0,
        data: symbol.endsWith(".N")
          ? { [symbol]: { day: [["2026-07-10", "290", "291", "292", "289", "1000"]] } }
          : { [symbol]: { day: [] } },
      });
    },
  });

  const bars = await operations.fetchHistoricalBars({
    market: "US",
    symbol: "JPM.US",
    providerSymbol: "105.JPM",
    timeframe: "1d",
    period: "daily",
  });

  assert.equal(bars.length, 1);
  assert.match(urls[0] ?? "", /usJPM.OQ/u);
  assert.match(urls[1] ?? "", /usJPM.N/u);
});

test("Tencent Finance history prefers a complete AMEX series over a partial NASDAQ result", async () => {
  const urls: string[] = [];
  const rows = (count: number) => Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
    return [
      date,
      "100",
      "101",
      "102",
      "99",
      "1000",
    ];
  });
  const operations = createTencentFinanceBarsOperations({
    fetchImpl: async (input) => {
      const url = String(input);
      urls.push(url);
      const symbol = new URL(url).searchParams.get("param")?.split(",")[0] ?? "";
      const count = symbol.endsWith(".OQ") ? 5 : symbol.endsWith(".N") ? 1 : 56;
      return jsonResponse({ code: 0, data: { [symbol]: { week: rows(count) } } });
    },
  });

  const bars = await operations.fetchHistoricalBars({
    market: "US",
    symbol: "SPCX.US",
    providerSymbol: "105.SPCX",
    timeframe: "1w",
    period: "weekly",
    count: 260,
  });

  assert.equal(bars.length, 56);
  assert.match(urls[0] ?? "", /usSPCX.OQ/u);
  assert.match(urls[1] ?? "", /usSPCX.N/u);
  assert.match(urls[2] ?? "", /usSPCX.AM/u);
});

test("Tencent Finance deduplicates an in-flight history request and retries one transient upstream failure", async () => {
  let calls = 0;
  const operations = createTencentFinanceBarsOperations({
    fetchImpl: async (input) => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ code: 1, msg: "temporary" }, 503);
      }
      const symbol = new URL(String(input)).searchParams.get("param")?.split(",")[0] ?? "";
      return jsonResponse({
        code: 0,
        data: { [symbol]: { day: [["2026-07-10", "100", "101", "102", "99", "1000"]] } },
      });
    },
  });
  const request = { market: "CN" as const, symbol: "600519.SH", providerSymbol: "600519", timeframe: "1d" as const, period: "daily" as const };

  const [first, second] = await Promise.all([
    operations.fetchHistoricalBars(request),
    operations.fetchHistoricalBars(request),
  ]);

  assert.equal(calls, 2);
  assert.equal(first[0]?.close, 101);
  assert.equal(second[0]?.close, 101);
});

test("Tencent Finance caps concurrent upstream history requests at two", async () => {
  let active = 0;
  let peak = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operations = createTencentFinanceBarsOperations({
    fetchImpl: async (input) => {
      active += 1;
      peak = Math.max(peak, active);
      await gate;
      active -= 1;
      const symbol = new URL(String(input)).searchParams.get("param")?.split(",")[0] ?? "";
      return jsonResponse({
        code: 0,
        data: { [symbol]: { day: [["2026-07-10", "100", "101", "102", "99", "1000"]] } },
      });
    },
  });

  const requests = ["600519", "600000", "600001", "600002"].map((code) =>
    operations.fetchHistoricalBars({ market: "CN", symbol: `${code}.SH`, providerSymbol: code, timeframe: "1d", period: "daily" }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(peak, 2);
  release?.();
  await Promise.all(requests);
});

test("Tencent Finance intraday maps A-share lots to shares and keeps Hong Kong volume in shares", async () => {
  const operations = createTencentFinanceBarsOperations({
    fetchImpl: async (input) => {
      const code = new URL(String(input)).searchParams.get("code") ?? "";
      return jsonResponse({
        code: 0,
        data: {
          [code]: {
            data: {
              date: "20260710",
              data: code.startsWith("sh")
                ? ["0930 100 2 20000", "0931 101 5 50300"]
                : ["0930 400 200 80000", "0931 401 260 104260"],
            },
          },
        },
      });
    },
  });

  const cn = await operations.fetchIntradayBars({ market: "CN", symbol: "600519.SH", providerSymbol: "600519", timeframe: "1m", period: "1" });
  const hk = await operations.fetchIntradayBars({ market: "HK", symbol: "00700.HK", providerSymbol: "00700", timeframe: "1m", period: "1" });

  assert.deepEqual(cn.map((bar) => bar.volume), [200, 300]);
  assert.deepEqual(hk.map((bar) => bar.volume), [200, 60]);
  assert.equal(cn[1]?.close, 101);
  assert.equal(hk[1]?.amount, 24260);
});

test("Tencent Finance does not turn a closed US single-point response into live intraday history", async () => {
  const operations = createTencentFinanceBarsOperations({
    fetchImpl: async () =>
      jsonResponse({
        code: 0,
        data: { usAAPL: { data: { date: "", data: ["1600 315.32 34132321"] } } },
      }),
  });

  await assert.rejects(
    () => operations.fetchIntradayBars({ market: "US", symbol: "AAPL.US", providerSymbol: "105.AAPL", timeframe: "1m", period: "1" }),
    /no usable intraday data/i,
  );
});

test("Stock SDK bar operations use the main-process Tencent route instead of sdk.kline", async () => {
  const calls: string[] = [];
  const operations = createStockSdkGatewayProviderOperations(undefined, {
    tencentBars: {
      async fetchHistoricalBars(request) {
        calls.push(`history:${request.market}:${request.period}`);
        return [{ timestamp: 1_784_000_000_000, open: 100, high: 101, low: 99, close: 100, volume: 200, upstream: "tencent" }];
      },
      async fetchIntradayBars(request) {
        calls.push(`intraday:${request.market}:${request.period}`);
        return [{ timestamp: 1_784_000_060_000, open: 100, high: 101, low: 99, close: 101, volume: 20, upstream: "tencent" }];
      },
    },
  });

  const historical = await operations.fetchHistoricalBars({
    market: "US",
    symbol: "AAPL.US",
    providerSymbol: "105.AAPL",
    timeframe: "1d",
    period: "daily",
  });
  const intraday = await operations.fetchIntradayBars({
    market: "US",
    symbol: "AAPL.US",
    providerSymbol: "105.AAPL",
    timeframe: "1m",
    period: "1",
  });

  assert.deepEqual(calls, ["history:US:daily", "intraday:US:1"]);
  assert.equal(historical[0]?.upstream, "tencent");
  assert.equal(intraday[0]?.close, 101);
});

test("Stock SDK gateway retains Tencent provenance while keeping the product provider stable", async () => {
  const provider = createStockSdkGatewayProvider({
    fetchQuoteSnapshot: async () => [],
    fetchHistoricalBars: async () => [
      { timestamp: 1_784_000_000_000, open: 100, high: 101, low: 99, close: 100, volume: 200, upstream: "tencent" },
    ],
    fetchIntradayBars: async () => [],
  }, { enabled: true });

  const bars = await provider.fetchHistoricalBars({ market: "US", symbol: "AAPL.US", timeframe: "1d" });
  const health = await provider.getHealth();

  assert.equal(bars[0]?.provider, "stock-sdk");
  assert.equal(bars[0]?.upstream, "tencent");
  assert.equal(health.upstream, "tencent");
  assert.match(health.message, /腾讯财经/u);
});

test("Electron market-data IPC uses the Tencent history route for the Stock SDK primary provider", async () => {
  const handlers = createMarketDataIpcHandlers({
    credentialStore: {
      readAlphaFeedCredentials: () => null,
      readLongPortCredentials: () => null,
    } as never,
    tencentFinanceBars: {
      async fetchHistoricalBars() {
        return [{ timestamp: 1_784_000_000_000, open: 100, high: 101, low: 99, close: 100, volume: 200, upstream: "tencent" }];
      },
      async fetchIntradayBars() {
        return [];
      },
    },
  });

  const result = await handlers.fetchHistoricalBars({
    context: { source: "chart" },
    request: { market: "US", symbol: "AAPL.US", timeframe: "1d" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.data[0]?.provider : "", "stock-sdk");
  assert.equal(result.ok ? result.data[0]?.upstream : "", "tencent");
  assert.equal(result.ok ? result.meta.health.upstream : "", "tencent");
});
