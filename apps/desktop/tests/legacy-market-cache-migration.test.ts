import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalDatabase,
  createMemoryStorageDriver,
} from "../src/features/persistence/localDatabase.ts";
import { migrateLegacyMarketBarCache } from "../src/features/marketData/legacyMarketBarCacheMigration.ts";
import { createMemoryMarketBarRepository } from "../src/features/marketData/memoryMarketBarRepository.ts";
import {
  readMarketBarCacheSummary,
  writeMarketBarCache,
  type MarketBarCacheKey,
  type MarketDataBar,
} from "../src/features/marketData/marketBarCacheService.ts";

const key: MarketBarCacheKey = {
  market: "US",
  symbol: "AAPL.US",
  timeframe: "1m",
};

function bar(timestamp: number): MarketDataBar {
  return {
    ...key,
    timestamp,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 10,
    provider: "stock-sdk",
  };
}

test("legacy cache migration deletes each entry only after verified import", async () => {
  const database = new LocalDatabase(createMemoryStorageDriver(), "migration");
  writeMarketBarCache(key, [bar(1_000), bar(2_000)], {
    database,
  });
  const repository = createMemoryMarketBarRepository();

  const result = await migrateLegacyMarketBarCache({
    legacyDatabase: database,
    repository,
  });

  assert.deepEqual(result, { status: "complete", migratedEntries: 1 });
  assert.equal(readMarketBarCacheSummary(database).entries.length, 0);
  assert.equal((await repository.read(key)).length, 2);
  assert.equal((await repository.legacyMigrationState()).status, "complete");
});

test("legacy cache migration retains source data when import fails", async () => {
  const database = new LocalDatabase(createMemoryStorageDriver(), "migration");
  writeMarketBarCache(key, [bar(1_000)], { database });
  const memoryRepository = createMemoryMarketBarRepository();
  const repository = {
    ...memoryRepository,
    async write(): Promise<MarketDataBar[]> {
      throw new Error("write failed");
    },
  };

  const result = await migrateLegacyMarketBarCache({
    legacyDatabase: database,
    repository,
  });

  assert.deepEqual(result, {
    status: "failed",
    errorCode: "LEGACY_IMPORT_FAILED",
  });
  assert.equal(readMarketBarCacheSummary(database).entries.length, 1);
  assert.deepEqual(await repository.legacyMigrationState(), {
    status: "failed",
    errorCode: "LEGACY_IMPORT_FAILED",
    updatedAt: (await repository.legacyMigrationState()).updatedAt,
  });
});
