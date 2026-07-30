import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDuckDbMarketBarRepository } from "../src/electron/duckDbMarketBarRepository.ts";
import type {
  MarketBarCacheKey,
  MarketDataBar,
} from "../src/features/marketData/marketBarCacheService.ts";

const key: MarketBarCacheKey = {
  symbol: "AAPL.US",
  market: "US",
  timeframe: "1m",
};

function bar(timestamp: number, close: number): MarketDataBar {
  return {
    ...key,
    timestamp,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
    provider: "stock-sdk",
    upstream: "tencent",
  };
}

test("DuckDB market cache persists sorted unique bars and metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quant-duckdb-cache-"));
  const databasePath = join(directory, "market-cache.duckdb");
  try {
    const repository = await createDuckDbMarketBarRepository(databasePath);
    const written = await repository.write(key, [
      bar(2_000, 102),
      bar(1_000, 101),
      bar(2_000, 103),
    ]);
    assert.deepEqual(await repository.legacyMigrationState(), {
      status: "pending",
    });
    await repository.recordLegacyMigration("failed", "LEGACY_IMPORT_FAILED");
    await repository.dispose();

    const reopened = await createDuckDbMarketBarRepository(databasePath);
    const cached = await reopened.read(key);
    const summary = await reopened.summary();
    assert.equal((await reopened.legacyMigrationState()).errorCode, "LEGACY_IMPORT_FAILED");
    await reopened.recordLegacyMigration("complete");
    await reopened.dispose();

    assert.deepEqual(
      written.map((item) => [item.timestamp, item.close]),
      [
        [1_000, 101],
        [2_000, 103],
      ],
    );
    assert.deepEqual(cached, written);
    assert.equal(summary.entries.length, 1);
    assert.equal(summary.totalBarCount, 2);
    assert.deepEqual(summary.entries[0]?.providers, ["stock-sdk"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("DuckDB market cache merges, prunes and clears entries transactionally", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quant-duckdb-cache-"));
  try {
    const repository = await createDuckDbMarketBarRepository(
      join(directory, "market-cache.duckdb"),
    );
    const now = Date.UTC(2026, 6, 30);
    await repository.write(key, [bar(now - 40 * 24 * 60 * 60 * 1_000, 90), bar(now - 1_000, 100)]);
    await repository.write(key, [bar(now, 101)], {
      mergeExisting: true,
    });

    const pruneResult = await repository.prune(now);
    assert.equal(pruneResult.removedBars, 1);
    assert.deepEqual(
      (await repository.read(key)).map((item) => item.close),
      [100, 101],
    );

    assert.equal(await repository.clearAll(), 1);
    assert.equal((await repository.summary()).entries.length, 0);
    await repository.dispose();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
