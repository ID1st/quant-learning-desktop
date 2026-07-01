import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALPHAFEED_DEFAULT_API_URL,
  fetchAlphaFeedHistoricalBars,
  fetchAlphaFeedIntradayBars,
  fetchAlphaFeedQuoteSnapshots,
  normalizeAlphaFeedApiCredentials,
  verifyAlphaFeedApiCredentials,
} from "../src/index.ts";

function createJsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("normalizeAlphaFeedApiCredentials", () => {
  it("normalizes the official endpoint and trims the API key", () => {
    const credentials = normalizeAlphaFeedApiCredentials({
      apiUrl: `${ALPHAFEED_DEFAULT_API_URL}/`,
      apiKey: "  alpha-key-1234  ",
    });

    assert.equal(credentials.apiUrl, ALPHAFEED_DEFAULT_API_URL);
    assert.equal(credentials.apiKey, "alpha-key-1234");
  });

  it("rejects unsafe endpoints and short API keys", () => {
    assert.throws(
      () => normalizeAlphaFeedApiCredentials({ apiUrl: "file:///tmp/key", apiKey: "alpha-key-1234" }),
      /http 或 https/,
    );
    assert.throws(() => normalizeAlphaFeedApiCredentials({ apiUrl: ALPHAFEED_DEFAULT_API_URL, apiKey: "short" }), /至少需要 8 位/);
  });
});

describe("fetchAlphaFeedQuoteSnapshots", () => {
  it("calls the quote endpoint with X-API-Key and maps quote snapshots", async () => {
    let observedUrl = "";
    let observedApiKey = "";

    const snapshots = await fetchAlphaFeedQuoteSnapshots(
      { apiUrl: ALPHAFEED_DEFAULT_API_URL, apiKey: "alpha-key-1234" },
      [
        { symbol: "600519.SH", market: "CN" },
        { symbol: "AAPL.US", market: "US" },
      ],
      {
        now: () => new Date("2026-07-01T00:00:00.000Z"),
        fetcher: async (input, init) => {
          observedUrl = String(input);
          observedApiKey = new Headers(init?.headers).get("X-API-Key") ?? "";

          return createJsonResponse({
            data: [
              {
                symbol: "600519.SH",
                region: "CN",
                last_price: 1468.1,
                prev_close: 1460.21,
                open: 1461,
                high: 1472,
                low: 1455,
                volume: 1000,
                amount: 1468100,
                timestamp: 1782864000000,
                ext: { name: "贵州茅台", change_pct: 0.0054 },
              },
            ],
          });
        },
      },
    );

    assert.equal(observedApiKey, "alpha-key-1234");
    assert.match(observedUrl, /\/v1\/quotes\?symbols=600519\.SH%2CAAPL\.US$/);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.provider, "alphafeed");
    assert.equal(snapshots[0]?.market, "CN");
    assert.equal(snapshots[0]?.lastPrice, 1468.1);
    assert.equal(snapshots[0]?.changePercent, 0.54);
    assert.equal(snapshots[0]?.quoteTime, "2026-07-01T00:00:00.000Z");
    assert.equal(snapshots[0]?.receivedAt, "2026-07-01T00:00:00.000Z");
  });

  it("turns permission errors into provider-specific messages", async () => {
    await assert.rejects(
      () =>
        fetchAlphaFeedQuoteSnapshots(
          { apiUrl: ALPHAFEED_DEFAULT_API_URL, apiKey: "alpha-key-1234" },
          [{ symbol: "600519.SH", market: "CN" }],
          {
            fetcher: async () => createJsonResponse({ code: 403, message: "forbidden" }, { status: 403 }),
          },
        ),
      /套餐无此功能或市场权限/,
    );
  });
});

describe("verifyAlphaFeedApiCredentials", () => {
  it("returns a redacted binding summary after a successful probe", async () => {
    const summary = await verifyAlphaFeedApiCredentials(
      { apiUrl: ALPHAFEED_DEFAULT_API_URL, apiKey: "alpha-key-1234" },
      {
        now: () => new Date("2026-07-01T00:00:00.000Z"),
        fetcher: async () =>
          createJsonResponse({
            data: [
              {
                symbol: "600519.SH",
                region: "CN",
                last_price: 1468.1,
                prev_close: 1460.21,
                open: 1461,
                high: 1472,
                low: 1455,
                volume: 1000,
                amount: 1468100,
                timestamp: 1782864000000,
              },
            ],
          }),
      },
    );

    assert.equal(summary.apiUrl, ALPHAFEED_DEFAULT_API_URL);
    assert.equal(summary.apiKeyPreview, "alph****1234");
    assert.deepEqual(summary.markets, ["CN", "US", "HK"]);
    assert.equal(JSON.stringify(summary).includes("alpha-key-1234"), false);
  });
});

describe("fetchAlphaFeedHistoricalBars", () => {
  it("calls the historical K-line endpoint and maps columnar OHLCV data", async () => {
    let observedUrl = "";
    let observedApiKey = "";

    const bars = await fetchAlphaFeedHistoricalBars(
      { apiUrl: ALPHAFEED_DEFAULT_API_URL, apiKey: "alpha-key-1234" },
      {
        symbol: "600519.SH",
        market: "CN",
        timeframe: "1d",
        count: 2,
        adjust: "forward",
        startTime: 1782777600000,
        endTime: 1782864000000,
      },
      {
        fetcher: async (input, init) => {
          observedUrl = String(input);
          observedApiKey = new Headers(init?.headers).get("X-API-Key") ?? "";

          return createJsonResponse({
            data: {
              timestamp: [1782777600000, 1782864000000],
              open: [1450, 1460],
              high: [1468, 1472],
              low: [1448, 1455],
              close: [1462, 1468.1],
              volume: [1000, 1100],
              amount: [1462000, 1614910],
            },
          });
        },
      },
    );

    assert.equal(observedApiKey, "alpha-key-1234");
    assert.match(observedUrl, /\/v1\/klines\?/);
    assert.match(observedUrl, /symbol=600519\.SH/);
    assert.match(observedUrl, /period=1d/);
    assert.match(observedUrl, /count=2/);
    assert.match(observedUrl, /start_time=1782777600000/);
    assert.match(observedUrl, /end_time=1782864000000/);
    assert.match(observedUrl, /adjust=forward/);
    assert.equal(bars.length, 2);
    assert.deepEqual(bars[1], {
      symbol: "600519.SH",
      market: "CN",
      timeframe: "1d",
      timestamp: 1782864000000,
      open: 1460,
      high: 1472,
      low: 1455,
      close: 1468.1,
      volume: 1100,
      amount: 1614910,
      provider: "alphafeed",
    });
  });

  it("rejects malformed columnar K-line data", async () => {
    await assert.rejects(
      () =>
        fetchAlphaFeedHistoricalBars(
          { apiUrl: ALPHAFEED_DEFAULT_API_URL, apiKey: "alpha-key-1234" },
          { symbol: "600519.SH", market: "CN", timeframe: "1d" },
          {
            fetcher: async () =>
              createJsonResponse({
                data: {
                  timestamp: [1782864000000],
                  open: [1460],
                  high: [],
                  low: [1455],
                  close: [1468.1],
                  volume: [1100],
                  amount: [1614910],
                },
              }),
          },
        ),
      /K 线列式数据长度不一致/,
    );
  });
});

describe("fetchAlphaFeedIntradayBars", () => {
  it("calls the K-line endpoint for intraday periods and maps 1h to AlphaFeed 60m period", async () => {
    let observedUrl = "";

    const bars = await fetchAlphaFeedIntradayBars(
      { apiUrl: ALPHAFEED_DEFAULT_API_URL, apiKey: "alpha-key-1234" },
      { symbol: "AAPL.US", market: "US", timeframe: "1h", count: 1 },
      {
        fetcher: async (input) => {
          observedUrl = String(input);

          return createJsonResponse({
            data: {
              timestamp: [1782864000000],
              open: [284],
              high: [286],
              low: [283],
              close: [285],
              volume: [1200],
              amount: [342000],
            },
          });
        },
      },
    );

    assert.match(observedUrl, /\/v1\/klines\?/);
    assert.doesNotMatch(observedUrl, /\/v1\/klines\/intraday/);
    assert.match(observedUrl, /symbol=AAPL\.US/);
    assert.match(observedUrl, /period=60m/);
    assert.equal(bars[0]?.timeframe, "1h");
    assert.equal(bars[0]?.close, 285);
  });
});
