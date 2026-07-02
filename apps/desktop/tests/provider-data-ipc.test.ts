import assert from "node:assert/strict";
import { test } from "node:test";
import { createProviderDataIpcHandlers, providerDataIpcChannels } from "../src/electron/providerDataIpcContract.ts";

test("provider data IPC channels are stable string contracts", () => {
  assert.deepEqual(providerDataIpcChannels, {
    verifyAlphaFeedCredentials: "providerData:verifyAlphaFeedCredentials",
    fetchAlphaFeedQuoteSnapshot: "providerData:fetchAlphaFeedQuoteSnapshot",
    fetchAlphaFeedHistoricalBars: "providerData:fetchAlphaFeedHistoricalBars",
    fetchAlphaFeedIntradayBars: "providerData:fetchAlphaFeedIntradayBars",
    connectAlphaFeedStream: "providerData:connectAlphaFeedStream",
    readAlphaFeedStreamSnapshot: "providerData:readAlphaFeedStreamSnapshot",
    disconnectAlphaFeedStream: "providerData:disconnectAlphaFeedStream",
    verifyLongPortCredentials: "providerData:verifyLongPortCredentials",
    fetchLongPortQuoteSnapshot: "providerData:fetchLongPortQuoteSnapshot",
  });
});

test("provider data IPC handlers delegate to injected provider functions", async () => {
  const calls: string[] = [];
  const handlers = createProviderDataIpcHandlers({
    verifyAlphaFeedCredentials: async (credentials) => {
      calls.push(`alpha-verify:${credentials.apiKey}`);
      return {
        ok: true,
        summary: {
          apiUrl: credentials.apiUrl,
          apiKeyPreview: "alph...1234",
          markets: ["US"],
          verifiedAt: "2026-07-01T00:00:00.000Z",
          authMode: "api-key",
        },
      };
    },
    fetchAlphaFeedQuoteSnapshot: async (_credentials, watchlist) => {
      calls.push(`alpha-quotes:${watchlist.length}`);
      return { ok: true, snapshots: [] };
    },
    fetchAlphaFeedHistoricalBars: async (_credentials, request) => {
      calls.push(`alpha-history:${request.symbol}`);
      return { ok: true, bars: [] };
    },
    fetchAlphaFeedIntradayBars: async (_credentials, request) => {
      calls.push(`alpha-intraday:${request.timeframe}`);
      return { ok: true, bars: [] };
    },
    connectAlphaFeedStream: async (request) => {
      calls.push(`alpha-stream-connect:${request.mode}`);
      return {
        ok: true,
        state: "connected",
        health: { status: "ok", message: "connected", checkedAt: "2026-07-01T00:00:00.000Z", latencyMs: 1 },
      };
    },
    readAlphaFeedStreamSnapshot: async () => {
      calls.push("alpha-stream-read");
      return {
        ok: true,
        state: "connected",
        snapshots: [],
        health: { status: "ok", message: "connected", checkedAt: "2026-07-01T00:00:00.000Z", latencyMs: 1 },
      };
    },
    disconnectAlphaFeedStream: async () => {
      calls.push("alpha-stream-disconnect");
      return {
        ok: true,
        state: "idle",
        health: { status: "ok", message: "disconnected", checkedAt: "2026-07-01T00:00:00.000Z", latencyMs: 1 },
      };
    },
    verifyLongPortCredentials: async (credentials) => {
      calls.push(`longport-verify:${credentials.appKey}`);
      return {
        ok: true,
        summary: {
          apiUrl: credentials.apiUrl,
          appKeyPreview: "app...key",
          accessTokenPreview: "tok...ken",
          markets: ["US", "HK", "CN"],
          verifiedAt: "2026-07-01T00:00:00.000Z",
          authMode: "legacy-api-key",
        },
      };
    },
    fetchLongPortQuoteSnapshot: async (_credentials, watchlist) => {
      calls.push(`longport-quotes:${watchlist[0]?.symbol}`);
      return { ok: true, snapshots: [] };
    },
  });

  await handlers.verifyAlphaFeedCredentials({ apiUrl: "https://api.alphafeed.org", apiKey: "alpha-key" });
  await handlers.fetchAlphaFeedQuoteSnapshot({ apiUrl: "https://api.alphafeed.org", apiKey: "alpha-key" }, [
    { symbol: "AAPL.US", name: "Apple Inc.", market: "US", source: "preset" },
  ]);
  await handlers.fetchAlphaFeedHistoricalBars({ apiUrl: "https://api.alphafeed.org", apiKey: "alpha-key" }, {
    symbol: "AAPL.US",
    market: "US",
    timeframe: "1d",
  });
  await handlers.fetchAlphaFeedIntradayBars({ apiUrl: "https://api.alphafeed.org", apiKey: "alpha-key" }, {
    symbol: "AAPL.US",
    market: "US",
    timeframe: "15m",
  });
  await handlers.connectAlphaFeedStream({
    credentials: { wsUrl: "wss://api.tickflow.org/v1/ws/stream", apiKey: "stream-key" },
    mode: "watchlist",
    watchlist: [{ symbol: "AAPL.US", name: "Apple Inc.", market: "US", source: "preset" }],
  });
  await handlers.readAlphaFeedStreamSnapshot();
  await handlers.disconnectAlphaFeedStream();
  await handlers.verifyLongPortCredentials({
    apiUrl: "https://openapi.longportapp.com",
    appKey: "app-key",
    appSecret: "app-secret",
    accessToken: "access-token",
  });
  await handlers.fetchLongPortQuoteSnapshot(
    {
      apiUrl: "https://openapi.longportapp.com",
      appKey: "app-key",
      appSecret: "app-secret",
      accessToken: "access-token",
    },
    [{ symbol: "AAPL.US", name: "Apple Inc.", market: "US", source: "preset" }],
  );

  assert.deepEqual(calls, [
    "alpha-verify:alpha-key",
    "alpha-quotes:1",
    "alpha-history:AAPL.US",
    "alpha-intraday:15m",
    "alpha-stream-connect:watchlist",
    "alpha-stream-read",
    "alpha-stream-disconnect",
    "longport-verify:app-key",
    "longport-quotes:AAPL.US",
  ]);
});
