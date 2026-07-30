import type {
  LegacyMarketCacheMigrationErrorCode,
  LegacyMarketCacheMigrationState,
  MarketBarCachePruneResult,
  MarketBarCacheRepository,
  MarketBarCacheWriteOptions,
} from "../features/marketData/marketBarCacheRepository.ts";
import type {
  MarketBarCacheHistoricalCompletion,
  MarketBarCacheKey,
  MarketBarCacheSummary,
  MarketDataBar,
} from "../features/marketData/marketBarCacheService.ts";
import { sanitizeMarketDataProviderId } from "../features/marketData/marketDataProviderIds.ts";
import { isMarketDataBarQualityValid } from "../features/marketData/marketDataQuality.ts";

const markets = new Set(["US", "HK", "CN"]);
const timeframes = new Set(["realtime", "1m", "5m", "15m", "30m", "1h", "1d", "1w"]);
const adjustments = new Set(["none", "forward", "backward"]);
const upstreams = new Set(["tencent", "eastmoney", "alphafeed", "longbridge", "yahoo-finance"]);
const maximumWriteBars = 1_000;
const maximumReadBars = 50_000;

export type MarketBarCacheIpcErrorCode =
  "INVALID_REQUEST" | "STORAGE_UNAVAILABLE" | "MIGRATION_FAILED";

export type MarketBarCacheIpcResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: MarketBarCacheIpcErrorCode;
        readonly message: string;
      };
    };

export interface MarketBarCacheReadRequest {
  readonly key: MarketBarCacheKey;
  readonly limit?: number;
}

export interface MarketBarCacheWriteRequest {
  readonly key: MarketBarCacheKey;
  readonly bars: readonly MarketDataBar[];
  readonly options?: MarketBarCacheWriteOptions;
}

export interface MarketBarCachePruneRequest {
  readonly now?: number;
}

export interface LegacyMarketCacheMigrationRecordRequest {
  readonly status: "failed" | "complete";
  readonly errorCode?: LegacyMarketCacheMigrationErrorCode;
}

export interface MarketBarCacheIpcBridge {
  read(
    request: MarketBarCacheReadRequest,
  ): Promise<MarketBarCacheIpcResult<readonly MarketDataBar[]>>;
  write(
    request: MarketBarCacheWriteRequest,
  ): Promise<MarketBarCacheIpcResult<readonly MarketDataBar[]>>;
  summary(): Promise<MarketBarCacheIpcResult<MarketBarCacheSummary>>;
  prune(
    request?: MarketBarCachePruneRequest,
  ): Promise<MarketBarCacheIpcResult<MarketBarCachePruneResult>>;
  clear(key: MarketBarCacheKey): Promise<MarketBarCacheIpcResult<boolean>>;
  clearAll(): Promise<MarketBarCacheIpcResult<number>>;
  legacyMigrationState(): Promise<MarketBarCacheIpcResult<LegacyMarketCacheMigrationState>>;
  recordLegacyMigration(
    request: LegacyMarketCacheMigrationRecordRequest,
  ): Promise<MarketBarCacheIpcResult<null>>;
}

export type MarketBarCacheIpcHandlers = MarketBarCacheIpcBridge;

export const marketBarCacheIpcChannels = {
  read: "marketBarCache:read",
  write: "marketBarCache:write",
  summary: "marketBarCache:summary",
  prune: "marketBarCache:prune",
  clear: "marketBarCache:clear",
  clearAll: "marketBarCache:clearAll",
  legacyMigrationState: "marketBarCache:legacyMigrationState",
  recordLegacyMigration: "marketBarCache:recordLegacyMigration",
} as const;

function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
}

function assertFiniteRange(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be a finite number between ${minimum} and ${maximum}.`);
  }
}

function assertIntegerRange(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  assertFiniteRange(value, name, minimum, maximum);
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer.`);
  }
}

export function assertMarketBarCacheKey(value: unknown): asserts value is MarketBarCacheKey {
  assertRecord(value, "key");
  if (!markets.has(String(value.market))) {
    throw new TypeError("key.market is invalid.");
  }
  if (
    typeof value.symbol !== "string" ||
    value.symbol.trim().length === 0 ||
    value.symbol.length > 64
  ) {
    throw new TypeError("key.symbol is invalid.");
  }
  if (!timeframes.has(String(value.timeframe))) {
    throw new TypeError("key.timeframe is invalid.");
  }
  if (value.adjust !== undefined && !adjustments.has(String(value.adjust))) {
    throw new TypeError("key.adjust is invalid.");
  }
  if (value.adjust !== undefined && value.timeframe !== "1d" && value.timeframe !== "1w") {
    throw new TypeError("key.adjust is only valid for historical timeframes.");
  }
}

function assertHistoricalCompletion(
  value: unknown,
): asserts value is MarketBarCacheHistoricalCompletion {
  assertRecord(value, "options.historicalCompletion");
  assertIntegerRange(
    value.targetBars,
    "options.historicalCompletion.targetBars",
    1,
    maximumReadBars,
  );
  assertIntegerRange(
    value.confirmedBars,
    "options.historicalCompletion.confirmedBars",
    0,
    maximumReadBars,
  );
  if (typeof value.targetSatisfied !== "boolean") {
    throw new TypeError("options.historicalCompletion.targetSatisfied must be a boolean.");
  }
  if (value.stopReason !== "target_reached" && value.stopReason !== "sources_exhausted") {
    throw new TypeError("options.historicalCompletion.stopReason is invalid.");
  }
}

function assertBar(value: unknown, key: MarketBarCacheKey, index: number) {
  assertRecord(value, `bars[${index}]`);
  if (
    value.market !== key.market ||
    value.symbol !== key.symbol ||
    value.timeframe !== key.timeframe
  ) {
    throw new TypeError(`bars[${index}] does not match the cache key.`);
  }
  assertIntegerRange(value.timestamp, `bars[${index}].timestamp`, 0, Number.MAX_SAFE_INTEGER);
  for (const field of ["open", "high", "low", "close", "volume"] as const) {
    assertFiniteRange(value[field], `bars[${index}].${field}`, 0, Number.MAX_VALUE);
  }
  if (value.amount !== undefined) {
    assertFiniteRange(value.amount, `bars[${index}].amount`, 0, Number.MAX_VALUE);
  }
  if (!sanitizeMarketDataProviderId(value.provider)) {
    throw new TypeError(`bars[${index}].provider is invalid.`);
  }
  if (value.upstream !== undefined && !upstreams.has(String(value.upstream))) {
    throw new TypeError(`bars[${index}].upstream is invalid.`);
  }
  if (!isMarketDataBarQualityValid(value as unknown as MarketDataBar)) {
    throw new TypeError(`bars[${index}] has invalid OHLC data.`);
  }
}

export function assertMarketBarCacheReadRequest(
  value: unknown,
): asserts value is MarketBarCacheReadRequest {
  assertRecord(value, "request");
  assertMarketBarCacheKey(value.key);
  if (value.limit !== undefined) {
    assertIntegerRange(value.limit, "request.limit", 1, maximumReadBars);
  }
}

export function assertMarketBarCacheWriteRequest(
  value: unknown,
): asserts value is MarketBarCacheWriteRequest {
  assertRecord(value, "request");
  assertMarketBarCacheKey(value.key);
  const key = value.key;
  if (!Array.isArray(value.bars) || value.bars.length < 1 || value.bars.length > maximumWriteBars) {
    throw new TypeError(`bars must contain between 1 and ${maximumWriteBars} entries.`);
  }
  value.bars.forEach((bar, index) => assertBar(bar, key, index));
  if (value.options !== undefined) {
    assertRecord(value.options, "options");
    if (
      value.options.mergeExisting !== undefined &&
      typeof value.options.mergeExisting !== "boolean"
    ) {
      throw new TypeError("options.mergeExisting must be a boolean.");
    }
    if (value.options.historicalCompletion !== undefined) {
      assertHistoricalCompletion(value.options.historicalCompletion);
    }
  }
}

export function assertMarketBarCachePruneRequest(
  value: unknown,
): asserts value is MarketBarCachePruneRequest {
  if (value === undefined) {
    return;
  }
  assertRecord(value, "request");
  if (value.now !== undefined) {
    assertIntegerRange(value.now, "request.now", 0, Number.MAX_SAFE_INTEGER);
  }
}

export function assertLegacyMarketCacheMigrationRecordRequest(
  value: unknown,
): asserts value is LegacyMarketCacheMigrationRecordRequest {
  assertRecord(value, "request");
  if (value.status !== "failed" && value.status !== "complete") {
    throw new TypeError("request.status is invalid.");
  }
  if (
    value.errorCode !== undefined &&
    value.errorCode !== "LEGACY_ENTRY_INVALID" &&
    value.errorCode !== "LEGACY_IMPORT_FAILED" &&
    value.errorCode !== "LEGACY_VERIFICATION_FAILED"
  ) {
    throw new TypeError("request.errorCode is invalid.");
  }
  if (value.status === "complete" && value.errorCode !== undefined) {
    throw new TypeError("request.errorCode must be omitted for a complete migration.");
  }
}

function storageFailure<T>(): MarketBarCacheIpcResult<T> {
  return {
    ok: false,
    error: {
      code: "STORAGE_UNAVAILABLE",
      message: "Market cache operation failed.",
    },
  };
}

export function createMarketBarCacheIpcHandlers(
  repository: MarketBarCacheRepository,
): MarketBarCacheIpcHandlers {
  return {
    async read(request) {
      try {
        const bars = await repository.read(request.key);
        return {
          ok: true,
          data: bars.slice(0, request.limit ?? maximumReadBars),
        };
      } catch {
        return storageFailure();
      }
    },
    async write(request) {
      try {
        return {
          ok: true,
          data: await repository.write(request.key, [...request.bars], request.options),
        };
      } catch {
        return storageFailure();
      }
    },
    async summary() {
      try {
        return { ok: true, data: await repository.summary() };
      } catch {
        return storageFailure();
      }
    },
    async prune(request) {
      try {
        return {
          ok: true,
          data: await repository.prune(request?.now),
        };
      } catch {
        return storageFailure();
      }
    },
    async clear(key) {
      try {
        return { ok: true, data: await repository.clear(key) };
      } catch {
        return storageFailure();
      }
    },
    async clearAll() {
      try {
        return { ok: true, data: await repository.clearAll() };
      } catch {
        return storageFailure();
      }
    },
    async legacyMigrationState() {
      try {
        return { ok: true, data: await repository.legacyMigrationState() };
      } catch {
        return storageFailure();
      }
    },
    async recordLegacyMigration(request) {
      try {
        await repository.recordLegacyMigration(request.status, request.errorCode);
        return { ok: true, data: null };
      } catch {
        return storageFailure();
      }
    },
  };
}
