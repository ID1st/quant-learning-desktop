import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DuckDBInstance } from "@duckdb/node-api";

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

test("DuckDB market cache rejects mismatched bars and closes idempotently", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quant-duckdb-cache-"));
  try {
    const repository = await createDuckDbMarketBarRepository(
      join(directory, "market-cache.duckdb"),
    );

    assert.equal(await repository.clear(key), false);
    assert.deepEqual(
      await repository.write(key, [
        { ...bar(1_000, 100), market: "HK" },
        { ...bar(2_000, 100), low: 101 },
      ]),
      [],
    );
    assert.equal((await repository.summary()).totalBarCount, 0);

    await repository.recordLegacyMigration("complete");
    const migrationState = await repository.legacyMigrationState();
    assert.equal(migrationState.status, "complete");
    assert.equal(typeof migrationState.updatedAt, "string");
    assert.equal(migrationState.errorCode, undefined);

    await repository.dispose();
    await repository.dispose();
    await assert.rejects(repository.read(key), /repository is closed/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("DuckDB market cache fails closed on discontinuous historical data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quant-duckdb-cache-"));
  const dailyKey: MarketBarCacheKey = {
    symbol: "AAPL.US",
    market: "US",
    timeframe: "1d",
    adjust: "forward",
  };
  try {
    const repository = await createDuckDbMarketBarRepository(
      join(directory, "market-cache.duckdb"),
    );
    const dailyBar = (timestamp: number, close: number): MarketDataBar => ({
      ...dailyKey,
      timestamp,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100,
      amount: 10_000,
      provider: "stock-sdk",
    });
    const firstSession = Date.UTC(2026, 0, 2);
    const secondSession = Date.UTC(2026, 7, 2);
    await repository.write(dailyKey, [
      ...Array.from({ length: 12 }, (_, index) =>
        dailyBar(firstSession + index * 24 * 60 * 60 * 1_000, 100 + index),
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        dailyBar(secondSession + index * 24 * 60 * 60 * 1_000, 120 + index),
      ),
    ]);

    assert.deepEqual(await repository.read(dailyKey), []);
    assert.equal((await repository.summary()).entries.length, 0);
    assert.equal(await repository.clear(dailyKey), false);
    await repository.dispose();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("DuckDB market cache preserves adjustment, providers and completion metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quant-duckdb-cache-"));
  const databasePath = join(directory, "market-cache.duckdb");
  const dailyKey: MarketBarCacheKey = {
    symbol: "AAPL.US",
    market: "US",
    timeframe: "1d",
    adjust: "none",
  };
  const day = 24 * 60 * 60 * 1_000;
  try {
    const repository = await createDuckDbMarketBarRepository(databasePath);
    const first = {
      ...bar(Date.UTC(2026, 6, 27), 100),
      ...dailyKey,
      timeframe: "1d" as const,
      provider: "stock-sdk" as const,
      upstream: undefined,
    };
    const second = {
      ...bar(first.timestamp + day, 101),
      ...dailyKey,
      timeframe: "1d" as const,
      provider: "alphafeed-rest" as const,
      upstream: "alphafeed" as const,
    };
    await repository.write(dailyKey, [first, second], {
      historicalCompletion: {
        targetBars: 2,
        confirmedBars: 2,
        targetSatisfied: true,
        stopReason: "target_reached",
      },
    });
    const summary = await repository.summary();
    assert.deepEqual(summary.entries[0]?.providers, ["stock-sdk", "alphafeed-rest"]);
    assert.equal(summary.entries[0]?.adjust, "none");
    assert.equal(summary.entries[0]?.upstream, undefined);
    assert.equal(summary.entries[0]?.historicalCompletion?.targetSatisfied, true);
    assert.equal(typeof summary.updatedAt, "string");
    assert.equal(summary.totalEstimatedBytes > 0, true);
    assert.equal(await repository.clear(dailyKey), true);
    await repository.dispose();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("DuckDB metadata parsing falls back safely for malformed stored JSON and status", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quant-duckdb-cache-"));
  const databasePath = join(directory, "market-cache.duckdb");
  try {
    const repository = await createDuckDbMarketBarRepository(databasePath);
    await repository.write(key, [bar(1_000, 100)]);
    await repository.recordLegacyMigration("failed", "LEGACY_IMPORT_MISMATCH");
    await repository.dispose();

    const instance = await DuckDBInstance.create(databasePath);
    const connection = await instance.connect();
    await connection.run(
      `UPDATE market_bar_cache_entries
       SET providers_json = 'not-json', historical_completion_json = 'not-json'`,
    );
    await connection.run(
      `UPDATE market_cache_migrations
       SET status = 'unknown', error_code = '', updated_at = ''`,
    );
    connection.closeSync();
    instance.closeSync();

    const reopened = await createDuckDbMarketBarRepository(databasePath);
    const summary = await reopened.summary();
    assert.deepEqual(summary.entries[0]?.providers, ["stock-sdk"]);
    assert.equal(summary.entries[0]?.historicalCompletion, undefined);
    assert.deepEqual(await reopened.legacyMigrationState(), { status: "pending" });
    await reopened.dispose();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("DuckDB pruning removes entries whose entire retention window expired", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quant-duckdb-cache-"));
  try {
    const repository = await createDuckDbMarketBarRepository(
      join(directory, "market-cache.duckdb"),
    );
    const now = Date.UTC(2026, 6, 30);
    await repository.write(key, [bar(now - 45 * 24 * 60 * 60 * 1_000, 90)]);

    assert.deepEqual(await repository.prune(now), {
      removedEntries: 1,
      removedBars: 1,
      remainingEntries: 0,
    });
    await repository.dispose();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
