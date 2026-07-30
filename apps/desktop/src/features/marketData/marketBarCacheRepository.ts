import type {
  MarketBarCacheHistoricalCompletion,
  MarketBarCacheKey,
  MarketBarCacheSummary,
  MarketDataBar,
} from "./marketBarCacheService.ts";

export interface MarketBarCacheWriteOptions {
  mergeExisting?: boolean;
  historicalCompletion?: MarketBarCacheHistoricalCompletion;
}

export interface MarketBarCachePruneResult {
  removedEntries: number;
  removedBars: number;
  remainingEntries: number;
}

export type LegacyMarketCacheMigrationErrorCode =
  | "LEGACY_ENTRY_INVALID"
  | "LEGACY_IMPORT_FAILED"
  | "LEGACY_VERIFICATION_FAILED";

export interface LegacyMarketCacheMigrationState {
  status: "pending" | "failed" | "complete";
  errorCode?: LegacyMarketCacheMigrationErrorCode;
  updatedAt?: string;
}

export interface MarketBarCacheRepository {
  read(key: MarketBarCacheKey): Promise<MarketDataBar[]>;
  write(
    key: MarketBarCacheKey,
    bars: MarketDataBar[],
    options?: MarketBarCacheWriteOptions,
  ): Promise<MarketDataBar[]>;
  summary(): Promise<MarketBarCacheSummary>;
  prune(now?: number): Promise<MarketBarCachePruneResult>;
  clear(key: MarketBarCacheKey): Promise<boolean>;
  clearAll(): Promise<number>;
  legacyMigrationState(): Promise<LegacyMarketCacheMigrationState>;
  recordLegacyMigration(
    state: Exclude<LegacyMarketCacheMigrationState["status"], "pending">,
    errorCode?: LegacyMarketCacheMigrationErrorCode,
  ): Promise<void>;
  dispose(): Promise<void>;
}
