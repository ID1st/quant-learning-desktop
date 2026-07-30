import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMarketBarCacheReadRequest,
  assertMarketBarCacheWriteRequest,
  createMarketBarCacheIpcHandlers,
} from "../src/electron/marketBarCacheIpcContract.ts";
import type { MarketBarCacheRepository } from "../src/features/marketData/marketBarCacheRepository.ts";
import type {
  MarketBarCacheKey,
  MarketDataBar,
} from "../src/features/marketData/marketBarCacheService.ts";

const key: MarketBarCacheKey = {
  market: "US",
  symbol: "AAPL.US",
  timeframe: "1m",
};

const validBar: MarketDataBar = {
  ...key,
  timestamp: Date.UTC(2026, 6, 30, 13, 30),
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 1_000,
  provider: "stock-sdk",
};

test("market cache IPC validation caps batch writes and reads", () => {
  assert.doesNotThrow(() =>
    assertMarketBarCacheWriteRequest({
      key,
      bars: [validBar],
      options: { mergeExisting: true },
    }),
  );
  assert.throws(
    () =>
      assertMarketBarCacheWriteRequest({
        key,
        bars: Array.from({ length: 1_001 }, () => validBar),
      }),
    /between 1 and 1000/u,
  );
  assert.throws(
    () => assertMarketBarCacheReadRequest({ key, limit: 50_001 }),
    /between 1 and 50000/u,
  );
  assert.throws(
    () =>
      assertMarketBarCacheWriteRequest({
        key,
        bars: [{ ...validBar, high: 98 }],
      }),
    /OHLC/u,
  );
});

test("market cache IPC handlers narrow repository results and failures", async () => {
  const repository: MarketBarCacheRepository = {
    async read() {
      return [validBar, { ...validBar, timestamp: validBar.timestamp + 60_000 }];
    },
    async write(_key, bars) {
      return bars;
    },
    async summary() {
      throw new Error("database unavailable");
    },
    async prune() {
      return { removedEntries: 0, removedBars: 0, remainingEntries: 0 };
    },
    async clear() {
      return true;
    },
    async clearAll() {
      return 0;
    },
    async legacyMigrationState() {
      return { status: "pending" };
    },
    async recordLegacyMigration() {},
    async dispose() {},
  };
  const handlers = createMarketBarCacheIpcHandlers(repository);

  assert.deepEqual(await handlers.read({ key, limit: 1 }), {
    ok: true,
    data: [validBar],
  });
  assert.deepEqual(await handlers.summary(), {
    ok: false,
    error: {
      code: "STORAGE_UNAVAILABLE",
      message: "Market cache operation failed.",
    },
  });
});
