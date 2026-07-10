import assert from "node:assert/strict";
import test from "node:test";

import { createYahooFinanceIntradayProvider } from "../src/features/marketData/yahooFinanceIntradayProvider.ts";

test("Yahoo Finance emergency provider maps US one-minute bars within the requested time window", async () => {
  const provider = createYahooFinanceIntradayProvider({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                timestamp: [1_783_000_000, 1_783_000_060, 1_783_000_120],
                indicators: {
                  quote: [
                    {
                      open: [315.5, 315.7, 315.6],
                      high: [315.8, 315.9, 315.8],
                      low: [315.4, 315.5, 315.4],
                      close: [315.7, 315.6, 315.75],
                      volume: [100, 120, 90],
                    },
                  ],
                },
              },
            ],
          },
        }),
        { status: 200 },
      ),
  });

  const bars = await provider.fetchIntradayBars({
    market: "US",
    symbol: "AAPL.US",
    timeframe: "1m",
    startTime: 1_783_000_030_000,
    endTime: 1_783_000_120_000,
  });

  assert.deepEqual(
    bars.map((bar) => [bar.provider, bar.symbol, bar.timestamp, bar.close]),
    [
      ["yahoo-finance", "AAPL.US", 1_783_000_060_000, 315.6],
      ["yahoo-finance", "AAPL.US", 1_783_000_120_000, 315.75],
    ],
  );
  assert.equal((await provider.getHealth()).status, "healthy");
});

test("Yahoo Finance emergency provider rejects unsupported intraday requests", async () => {
  const provider = createYahooFinanceIntradayProvider({ fetchImpl: async () => new Response("{}", { status: 200 }) });

  await assert.rejects(
    () => provider.fetchIntradayBars({ market: "HK", symbol: "00700.HK", timeframe: "1m" }),
    /仅支持美股 realtime、1m、1d 和 1w 数据/,
  );
});

test("Yahoo Finance emergency provider retries transient network failures once", async () => {
  let calls = 0;
  const provider = createYahooFinanceIntradayProvider({
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error("fetch failed: UND_ERR_SOCKET");
      return new Response(JSON.stringify({
        chart: { result: [{ timestamp: [1_783_000_000], indicators: { quote: [{ open: [315], high: [316], low: [314], close: [315.5], volume: [1] }] } }] },
      }), { status: 200 });
    },
  });

  const bars = await provider.fetchIntradayBars({ market: "US", symbol: "AAPL.US", timeframe: "1m" });
  assert.equal(calls, 2);
  assert.equal(bars[0]?.provider, "yahoo-finance");
});

test("Yahoo Finance emergency provider maps US daily history", async () => {
  const provider = createYahooFinanceIntradayProvider({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                timestamp: [1_783_000_000],
                indicators: { quote: [{ open: [315.5], high: [316], low: [315], close: [315.7], volume: [100] }] },
              },
            ],
          },
        }),
        { status: 200 },
      ),
  });

  const bars = await provider.fetchHistoricalBars({ market: "US", symbol: "AAPL.US", timeframe: "1d" });

  assert.equal(bars[0]?.timeframe, "1d");
  assert.equal(bars[0]?.provider, "yahoo-finance");
});
