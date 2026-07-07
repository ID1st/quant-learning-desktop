import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalDatabase, createMemoryStorageDriver } from "../src/features/persistence/localDatabase.ts";
import {
  readMarketBarCache,
  type MarketDataBar,
} from "../src/features/marketData/marketBarCacheService.ts";
import {
  readMarketQuoteSnapshotCache,
  readMarketDataSyncState,
  readMarketWatchlistCache,
  runInitialMarketDataSync,
  type MarketDataSyncState,
} from "../src/features/marketData/marketDataSyncService.ts";

function createTestDatabase() {
  return new LocalDatabase(createMemoryStorageDriver(), "test");
}

test("runInitialMarketDataSync stores completed sync state and default watchlist cache", async () => {
  const database = createTestDatabase();
  const updates: MarketDataSyncState[] = [];
  const historicalBars: MarketDataBar[] = [
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "1d",
      timestamp: 1782777600000,
      open: 280,
      high: 286,
      low: 279,
      close: 285,
      volume: 1000,
      amount: 285000,
      provider: "alphafeed",
    },
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "15m",
      timestamp: 1782778500000,
      open: 285,
      high: 287,
      low: 284,
      close: 286,
      volume: 500,
      amount: 143000,
      provider: "alphafeed",
    },
    {
      symbol: "TSLA.US",
      market: "US",
      timeframe: "1d",
      timestamp: 1782777600000,
      open: 180,
      high: 190,
      low: 179,
      close: 188,
      volume: 2000,
      amount: 376000,
      provider: "alphafeed",
    },
  ];

  const state = await runInitialMarketDataSync(
    {
      apiUrl: "https://openapi.longbridge.com",
      keyPreview: "app-****1234",
      markets: ["US", "HK"],
      verifiedAt: "2026-06-30T00:00:00.000Z",
      accountId: "member-42",
    },
    {
      database,
      delayMs: 0,
      fetchQuoteSnapshot: async (watchlist) =>
        watchlist.map((item, index) => ({
          symbol: item.symbol,
          market: item.market,
          lastPrice: 100 + index,
          previousClose: 99 + index,
          changePercent: 1.01,
          volume: 1000 + index,
          quoteTime: "2026-06-30T00:00:00.000Z",
          receivedAt: "2026-06-30T00:00:00.000Z",
          provider: "alphafeed",
        })),
      fetchHistoricalBars: async () => historicalBars,
      now: () => new Date("2026-06-30T00:00:00.000Z"),
      onUpdate: (nextState) => updates.push(nextState),
    },
  );

  assert.equal(state.status, "completed");
  assert.equal(state.watchlistCount, 3);
  assert.equal(state.quoteSnapshotCount, 3);
  assert.equal(state.historicalBarCount, 3);
  assert.deepEqual(
    state.steps.map((step) => step.status),
    ["completed", "completed", "completed", "completed", "completed"],
  );

  const storedState = readMarketDataSyncState(database);
  assert.equal(storedState?.status, "completed");
  assert.equal(storedState?.accountId, "member-42");
  assert.equal(updates.at(-1)?.status, "completed");

  const watchlist = readMarketWatchlistCache(database);
  assert.deepEqual(
    watchlist.map((item) => item.symbol),
    ["AAPL.US", "TSLA.US", "09988.HK"],
  );

  const snapshots = readMarketQuoteSnapshotCache(database);
  assert.deepEqual(
    snapshots.map((item) => item.symbol),
    ["AAPL.US", "TSLA.US", "09988.HK"],
  );
  assert.equal(snapshots[0]?.lastPrice, 100);

  const aaplBars = readMarketBarCache(
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "1d",
    },
    { database },
  );
  assert.equal(aaplBars.length, 1);
  assert.equal(aaplBars[0]?.close, 285);

  const aaplIntradayBars = readMarketBarCache(
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "15m",
    },
    { database },
  );
  assert.equal(aaplIntradayBars.length, 1);
  assert.equal(aaplIntradayBars[0]?.close, 286);
});

test("readMarketDataSyncState falls back when stored sync data is malformed", () => {
  const driver = createMemoryStorageDriver({
    "test.market-data-sync-state": JSON.stringify({ status: "completed" }),
  });
  const database = new LocalDatabase(driver, "test");

  assert.equal(readMarketDataSyncState(database), null);
});

test("market data sync cache accepts gateway provider ids", async () => {
  const database = createTestDatabase();

  const state = await runInitialMarketDataSync(
    {
      apiUrl: "local://stock-sdk",
      keyPreview: "stock-sdk",
      markets: ["US"],
      verifiedAt: "2026-07-01T00:00:00.000Z",
    },
    {
      database,
      delayMs: 0,
      provider: "stock-sdk",
      fallbackProvider: "alphafeed-rest",
      fetchQuoteSnapshot: async (watchlist) =>
        watchlist.map((item) => ({
          symbol: item.symbol,
          market: item.market,
          lastPrice: 294.28,
          previousClose: 294.34,
          changePercent: -0.02,
          volume: 1000,
          quoteTime: "2026-07-01T00:00:00.000Z",
          receivedAt: "2026-07-01T00:00:01.000Z",
          provider: "stock-sdk",
        })),
      fetchHistoricalBars: async () => [
        {
          symbol: "AAPL.US",
          market: "US",
          timeframe: "1d",
          timestamp: 1782777600000,
          open: 294,
          high: 295,
          low: 293,
          close: 294.28,
          volume: 1000,
          provider: "longbridge",
        },
      ],
      now: () => new Date("2026-07-01T00:00:00.000Z"),
    },
  );

  assert.equal(state.provider, "stock-sdk");
  assert.equal(state.fallbackProvider, "alphafeed-rest");
  assert.equal(readMarketDataSyncState(database)?.provider, "stock-sdk");
  assert.equal(readMarketDataSyncState(database)?.fallbackProvider, "alphafeed-rest");
  assert.equal(readMarketQuoteSnapshotCache(database)[0]?.provider, "stock-sdk");
  assert.equal(
    readMarketBarCache(
      {
        symbol: "AAPL.US",
        market: "US",
        timeframe: "1d",
      },
      { database },
    )[0]?.provider,
    "longbridge",
  );
});

test("readMarketDataSyncState accepts gateway provider ids from existing storage", () => {
  const database = new LocalDatabase(
    createMemoryStorageDriver({
      "test.market-data-sync-state": JSON.stringify({
        version: 1,
        updatedAt: "2026-07-01T00:00:00.000Z",
        data: {
          version: 1,
          provider: "alphafeed-websocket",
          fallbackProvider: "longbridge",
          status: "completed",
          markets: ["US"],
          appKeyPreview: "stream",
          startedAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          watchlistCount: 1,
          quoteSnapshotCount: 1,
          historicalBarCount: 0,
          steps: [
            {
              id: "quote-snapshot",
              label: "quotes",
              status: "completed",
            },
          ],
        },
      }),
    }),
    "test",
  );

  const state = readMarketDataSyncState(database);

  assert.equal(state?.provider, "alphafeed-websocket");
  assert.equal(state?.fallbackProvider, "longbridge");
});

test("runInitialMarketDataSync stores failed state when historical bar sync fails", async () => {
  const database = createTestDatabase();

  await assert.rejects(
    () =>
      runInitialMarketDataSync(
        {
          apiUrl: "https://api.alphafeed.org",
          keyPreview: "alph****1234",
          markets: ["CN"],
          verifiedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          database,
          delayMs: 0,
          fetchHistoricalBars: async () => {
            throw new Error("no kline permission");
          },
          now: () => new Date("2026-07-01T00:00:00.000Z"),
        },
      ),
    /no kline permission/,
  );

  const storedState = readMarketDataSyncState(database);
  assert.equal(storedState?.status, "failed");
  assert.equal(storedState?.steps.find((step) => step.id === "historical-candles")?.status, "failed");
  assert.equal(storedState?.steps.find((step) => step.id === "historical-candles")?.message, "no kline permission");
});
