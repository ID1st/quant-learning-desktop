import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { DuckDBConnection, DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";

import type {
  LegacyMarketCacheMigrationErrorCode,
  LegacyMarketCacheMigrationState,
  MarketBarCacheRepository,
  MarketBarCacheWriteOptions,
} from "../features/marketData/marketBarCacheRepository.ts";
import {
  getDefaultMarketBarRetentionDays,
  hasContinuousHistoricalCache,
  normalizeMarketBarCacheKey,
  normalizeMarketDataBars,
  type MarketBarCacheHistoricalCompletion,
  type MarketBarCacheKey,
  type MarketBarCacheMetadata,
  type MarketBarCacheSummary,
  type MarketDataBar,
} from "../features/marketData/marketBarCacheService.ts";
import { isMarketDataBarQualityValid } from "../features/marketData/marketDataQuality.ts";
import type { MarketDataProviderId } from "../features/marketData/marketDataProviderIds.ts";
import type { MarketDataUpstream } from "../features/marketData/marketDataProviderGateway.ts";

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

const schemaMigrations = [
  {
    version: 1,
    name: "initial_market_bar_cache",
    sql: `
  CREATE TABLE market_bars (
    market VARCHAR NOT NULL,
    symbol VARCHAR NOT NULL,
    timeframe VARCHAR NOT NULL,
    adjustment VARCHAR NOT NULL,
    timestamp BIGINT NOT NULL,
    open DOUBLE NOT NULL,
    high DOUBLE NOT NULL,
    low DOUBLE NOT NULL,
    close DOUBLE NOT NULL,
    volume DOUBLE NOT NULL,
    amount DOUBLE,
    provider VARCHAR NOT NULL,
    upstream VARCHAR,
    PRIMARY KEY (market, symbol, timeframe, adjustment, timestamp)
  );

  CREATE TABLE market_bar_cache_entries (
    market VARCHAR NOT NULL,
    symbol VARCHAR NOT NULL,
    timeframe VARCHAR NOT NULL,
    adjustment VARCHAR NOT NULL,
    provider VARCHAR NOT NULL,
    providers_json VARCHAR NOT NULL,
    first_timestamp BIGINT NOT NULL,
    last_timestamp BIGINT NOT NULL,
    bar_count INTEGER NOT NULL,
    estimated_bytes BIGINT NOT NULL,
    retention_days INTEGER NOT NULL,
    updated_at VARCHAR NOT NULL,
    upstream VARCHAR,
    historical_completion_json VARCHAR,
    PRIMARY KEY (market, symbol, timeframe, adjustment)
  );
`,
  },
  {
    version: 2,
    name: "legacy_cache_migration_state",
    sql: `
      CREATE TABLE market_cache_migrations (
        name VARCHAR PRIMARY KEY,
        status VARCHAR NOT NULL,
        error_code VARCHAR,
        updated_at VARCHAR NOT NULL
      );
    `,
  },
] as const;

type DuckDbRow = Record<string, unknown>;

function databaseAdjustment(key: MarketBarCacheKey) {
  return key.adjust ?? "none";
}

function isHistoricalTimeframe(timeframe: MarketBarCacheKey["timeframe"]) {
  return timeframe === "1d" || timeframe === "1w";
}

function keyValues(key: MarketBarCacheKey): DuckDBValue[] {
  const normalizedKey = normalizeMarketBarCacheKey(key);
  return [
    normalizedKey.market,
    normalizedKey.symbol,
    normalizedKey.timeframe,
    databaseAdjustment(normalizedKey),
  ];
}

function asNumber(value: unknown) {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function metadataKey(row: DuckDbRow): MarketBarCacheKey {
  const timeframe = String(row.timeframe) as MarketBarCacheKey["timeframe"];
  return {
    market: String(row.market) as MarketBarCacheKey["market"],
    symbol: String(row.symbol),
    timeframe,
    ...(isHistoricalTimeframe(timeframe)
      ? { adjust: String(row.adjustment) as NonNullable<MarketBarCacheKey["adjust"]> }
      : {}),
  };
}

async function queryRows(connection: DuckDBConnection, sql: string, values: DuckDBValue[] = []) {
  const result = await connection.runAndReadAll(sql, values);
  return result.getRowObjectsJS() as DuckDbRow[];
}

async function applySchema(connection: DuckDBConnection) {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS cache_schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const applied = new Set(
    (await queryRows(connection, "SELECT version FROM cache_schema_migrations")).map((row) =>
      asNumber(row.version),
    ),
  );

  for (const migration of schemaMigrations) {
    if (applied.has(migration.version)) {
      continue;
    }
    await connection.run("BEGIN TRANSACTION");
    try {
      await connection.run(migration.sql);
      await connection.run("INSERT INTO cache_schema_migrations (version, name) VALUES (?, ?)", [
        migration.version,
        migration.name,
      ]);
      await connection.run("COMMIT");
    } catch (error) {
      await connection.run("ROLLBACK");
      throw error;
    }
  }
}

class DuckDbMarketBarCacheRepository implements MarketBarCacheRepository {
  private operationQueue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private readonly instance: DuckDBInstance;
  private readonly connection: DuckDBConnection;

  constructor(instance: DuckDBInstance, connection: DuckDBConnection) {
    this.instance = instance;
    this.connection = connection;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error("Market bar cache repository is closed."));
    }

    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readRaw(key: MarketBarCacheKey, maximumRows?: number) {
    const normalizedKey = normalizeMarketBarCacheKey(key);
    const rows = await queryRows(
      this.connection,
      `SELECT
         market, symbol, timeframe, timestamp, open, high, low, close,
         volume, amount, provider, upstream
       FROM market_bars
       WHERE market = ? AND symbol = ? AND timeframe = ? AND adjustment = ?
       ORDER BY timestamp
       ${maximumRows === undefined ? "" : "LIMIT ?"}`,
      maximumRows === undefined
        ? keyValues(normalizedKey)
        : [...keyValues(normalizedKey), maximumRows],
    );
    const bars = rows.map((row): MarketDataBar => ({
      market: String(row.market) as MarketDataBar["market"],
      symbol: String(row.symbol),
      timeframe: String(row.timeframe) as MarketDataBar["timeframe"],
      timestamp: asNumber(row.timestamp),
      open: asNumber(row.open),
      high: asNumber(row.high),
      low: asNumber(row.low),
      close: asNumber(row.close),
      volume: asNumber(row.volume),
      ...(row.amount === null || row.amount === undefined ? {} : { amount: asNumber(row.amount) }),
      provider: String(row.provider) as MarketDataProviderId,
      ...(asOptionalString(row.upstream)
        ? { upstream: asOptionalString(row.upstream) as MarketDataUpstream }
        : {}),
    }));

    if (!hasContinuousHistoricalCache(bars, normalizedKey.timeframe)) {
      await this.clearRaw(normalizedKey);
      return [];
    }
    return bars;
  }

  private async clearRaw(key: MarketBarCacheKey) {
    const values = keyValues(key);
    const existing = await queryRows(
      this.connection,
      `SELECT 1 AS present
       FROM market_bar_cache_entries
       WHERE market = ? AND symbol = ? AND timeframe = ? AND adjustment = ?`,
      values,
    );
    if (existing.length === 0) {
      return false;
    }

    await this.connection.run("BEGIN TRANSACTION");
    try {
      await this.connection.run(
        `DELETE FROM market_bars
         WHERE market = ? AND symbol = ? AND timeframe = ? AND adjustment = ?`,
        values,
      );
      await this.connection.run(
        `DELETE FROM market_bar_cache_entries
         WHERE market = ? AND symbol = ? AND timeframe = ? AND adjustment = ?`,
        values,
      );
      await this.connection.run("COMMIT");
      return true;
    } catch (error) {
      await this.connection.run("ROLLBACK");
      throw error;
    }
  }

  private async writeRaw(
    key: MarketBarCacheKey,
    bars: MarketDataBar[],
    options: MarketBarCacheWriteOptions,
  ) {
    const normalizedKey = normalizeMarketBarCacheKey(key);
    const candidateBars = options.mergeExisting
      ? [...(await this.readRaw(normalizedKey)), ...bars]
      : bars;
    const normalizedBars = normalizeMarketDataBars(
      candidateBars.filter(
        (bar) =>
          bar.market === normalizedKey.market &&
          bar.symbol === normalizedKey.symbol &&
          bar.timeframe === normalizedKey.timeframe &&
          isMarketDataBarQualityValid(bar),
      ),
    );

    if (normalizedBars.length === 0) {
      await this.clearRaw(normalizedKey);
      return [];
    }

    const values = keyValues(normalizedKey);
    const providers = Array.from(new Set(normalizedBars.map((bar) => bar.provider)));
    const metadataProvider = normalizedBars[0]!.provider;
    const upstream = normalizedBars[0]!.upstream;
    const historicalCompletion = options.historicalCompletion;
    const updatedAt = new Date().toISOString();

    await this.connection.run("BEGIN TRANSACTION");
    try {
      await this.connection.run(
        `DELETE FROM market_bars
         WHERE market = ? AND symbol = ? AND timeframe = ? AND adjustment = ?`,
        values,
      );
      await this.connection.run(
        `DELETE FROM market_bar_cache_entries
         WHERE market = ? AND symbol = ? AND timeframe = ? AND adjustment = ?`,
        values,
      );

      const insertBar = await this.connection.prepare(`
        INSERT INTO market_bars (
          market, symbol, timeframe, adjustment, timestamp,
          open, high, low, close, volume, amount, provider, upstream
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      try {
        for (const bar of normalizedBars) {
          insertBar.bind([
            normalizedKey.market,
            normalizedKey.symbol,
            normalizedKey.timeframe,
            databaseAdjustment(normalizedKey),
            BigInt(bar.timestamp),
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.volume,
            bar.amount ?? null,
            bar.provider,
            bar.upstream ?? null,
          ]);
          await insertBar.run();
          insertBar.clearBindings();
        }
      } finally {
        insertBar.destroySync();
      }

      await this.connection.run(
        `INSERT INTO market_bar_cache_entries (
          market, symbol, timeframe, adjustment, provider, providers_json,
          first_timestamp, last_timestamp, bar_count, estimated_bytes,
          retention_days, updated_at, upstream, historical_completion_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ...values,
          metadataProvider,
          JSON.stringify(providers),
          BigInt(normalizedBars[0]!.timestamp),
          BigInt(normalizedBars.at(-1)!.timestamp),
          normalizedBars.length,
          BigInt(Buffer.byteLength(JSON.stringify(normalizedBars), "utf8")),
          getDefaultMarketBarRetentionDays(normalizedKey.timeframe),
          updatedAt,
          upstream ?? null,
          historicalCompletion ? JSON.stringify(historicalCompletion) : null,
        ],
      );
      await this.connection.run("COMMIT");
      return normalizedBars;
    } catch (error) {
      await this.connection.run("ROLLBACK");
      throw error;
    }
  }

  read(key: MarketBarCacheKey) {
    return this.enqueue(() => this.readRaw(key, 50_000));
  }

  write(key: MarketBarCacheKey, bars: MarketDataBar[], options: MarketBarCacheWriteOptions = {}) {
    return this.enqueue(() => this.writeRaw(key, bars, options));
  }

  summary(): Promise<MarketBarCacheSummary> {
    return this.enqueue(async () => {
      const rows = await queryRows(
        this.connection,
        `SELECT *
         FROM market_bar_cache_entries
         ORDER BY market, symbol, timeframe, adjustment`,
      );
      const entries = rows.map((row): MarketBarCacheMetadata => {
        const key = metadataKey(row);
        const providers = parseJson<MarketDataProviderId[]>(row.providers_json) ?? [
          String(row.provider) as MarketDataProviderId,
        ];
        const historicalCompletion = parseJson<MarketBarCacheHistoricalCompletion>(
          row.historical_completion_json,
        );
        return {
          ...key,
          provider: String(row.provider) as MarketDataProviderId,
          providers,
          firstTimestamp: asNumber(row.first_timestamp),
          lastTimestamp: asNumber(row.last_timestamp),
          barCount: asNumber(row.bar_count),
          estimatedBytes: asNumber(row.estimated_bytes),
          retentionDays: asNumber(row.retention_days),
          updatedAt: String(row.updated_at),
          ...(asOptionalString(row.upstream)
            ? { upstream: asOptionalString(row.upstream) as MarketDataUpstream }
            : {}),
          ...(historicalCompletion ? { historicalCompletion } : {}),
        };
      });

      return {
        entries,
        totalBarCount: entries.reduce((total, entry) => total + entry.barCount, 0),
        totalEstimatedBytes: entries.reduce((total, entry) => total + entry.estimatedBytes, 0),
        updatedAt: entries.reduce<string | undefined>(
          (latest, entry) => (!latest || entry.updatedAt > latest ? entry.updatedAt : latest),
          undefined,
        ),
      };
    });
  }

  prune(now = Date.now()) {
    return this.enqueue(async () => {
      const rows = await queryRows(
        this.connection,
        "SELECT * FROM market_bar_cache_entries ORDER BY market, symbol, timeframe, adjustment",
      );
      let removedEntries = 0;
      let removedBars = 0;

      for (const row of rows) {
        const key = metadataKey(row);
        const bars = await this.readRaw(key);
        const cutoff = now - asNumber(row.retention_days) * millisecondsPerDay;
        const retainedBars = bars.filter((bar) => bar.timestamp >= cutoff);
        removedBars += bars.length - retainedBars.length;

        if (retainedBars.length === 0) {
          if (await this.clearRaw(key)) {
            removedEntries += 1;
          }
        } else if (retainedBars.length !== bars.length) {
          await this.writeRaw(key, retainedBars, {
            historicalCompletion: parseJson<MarketBarCacheHistoricalCompletion>(
              row.historical_completion_json,
            ),
          });
        }
      }

      const remaining = await queryRows(
        this.connection,
        "SELECT COUNT(*) AS count FROM market_bar_cache_entries",
      );
      return {
        removedEntries,
        removedBars,
        remainingEntries: asNumber(remaining[0]?.count ?? 0),
      };
    });
  }

  clear(key: MarketBarCacheKey) {
    return this.enqueue(() => this.clearRaw(key));
  }

  clearAll() {
    return this.enqueue(async () => {
      const rows = await queryRows(
        this.connection,
        "SELECT COUNT(*) AS count FROM market_bar_cache_entries",
      );
      const entryCount = asNumber(rows[0]?.count ?? 0);
      await this.connection.run("BEGIN TRANSACTION");
      try {
        await this.connection.run("DELETE FROM market_bars");
        await this.connection.run("DELETE FROM market_bar_cache_entries");
        await this.connection.run("COMMIT");
      } catch (error) {
        await this.connection.run("ROLLBACK");
        throw error;
      }
      return entryCount;
    });
  }

  legacyMigrationState(): Promise<LegacyMarketCacheMigrationState> {
    return this.enqueue(async () => {
      const rows = await queryRows(
        this.connection,
        `SELECT status, error_code, updated_at
         FROM market_cache_migrations
         WHERE name = ?`,
        ["local_storage_market_cache_v1"],
      );
      const row = rows[0];
      if (!row) {
        return { status: "pending" };
      }
      const status = row.status === "complete" || row.status === "failed" ? row.status : "pending";
      const errorCode = asOptionalString(row.error_code) as
        LegacyMarketCacheMigrationErrorCode | undefined;
      return {
        status,
        ...(errorCode ? { errorCode } : {}),
        ...(asOptionalString(row.updated_at)
          ? { updatedAt: asOptionalString(row.updated_at) }
          : {}),
      };
    });
  }

  recordLegacyMigration(
    status: "failed" | "complete",
    errorCode?: LegacyMarketCacheMigrationErrorCode,
  ) {
    return this.enqueue(async () => {
      await this.connection.run(
        `INSERT OR REPLACE INTO market_cache_migrations (
          name, status, error_code, updated_at
        ) VALUES (?, ?, ?, ?)`,
        ["local_storage_market_cache_v1", status, errorCode ?? null, new Date().toISOString()],
      );
    });
  }

  async dispose() {
    if (this.closed) {
      return;
    }
    await this.operationQueue;
    this.closed = true;
    this.connection.closeSync();
    this.instance.closeSync();
  }
}

export async function createDuckDbMarketBarRepository(
  databasePath: string,
): Promise<MarketBarCacheRepository> {
  await mkdir(dirname(databasePath), { recursive: true });
  const instance = await DuckDBInstance.create(databasePath);
  try {
    const connection = await instance.connect();
    try {
      await applySchema(connection);
      return new DuckDbMarketBarCacheRepository(instance, connection);
    } catch (error) {
      connection.closeSync();
      throw error;
    }
  } catch (error) {
    instance.closeSync();
    throw error;
  }
}
