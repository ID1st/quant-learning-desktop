import type { LocalDatabase } from "../persistence/localDatabase.ts";
import type {
  LegacyMarketCacheMigrationErrorCode,
  MarketBarCacheRepository,
} from "./marketBarCacheRepository.ts";
import {
  readLegacyMarketBarCacheEntry,
  readMarketBarCacheSummary,
  removeLegacyMarketBarCacheEntry,
  type MarketBarCacheMetadata,
  type MarketDataBar,
} from "./marketBarCacheService.ts";

const migrationBatchSize = 1_000;

export interface LegacyMarketBarCacheMigrationOptions {
  legacyDatabase: LocalDatabase;
  repository: MarketBarCacheRepository;
}

export type LegacyMarketBarCacheMigrationResult =
  | {
      status: "complete";
      migratedEntries: number;
      alreadyComplete?: boolean;
    }
  | {
      status: "failed";
      errorCode: LegacyMarketCacheMigrationErrorCode;
    };

function matchesEntryKey(bar: MarketDataBar, entry: MarketBarCacheMetadata) {
  return (
    bar.market === entry.market && bar.symbol === entry.symbol && bar.timeframe === entry.timeframe
  );
}

function entryMatchesBars(entry: MarketBarCacheMetadata, bars: readonly MarketDataBar[]) {
  return (
    bars.length > 0 &&
    bars.length === entry.barCount &&
    bars[0]?.timestamp === entry.firstTimestamp &&
    bars.at(-1)?.timestamp === entry.lastTimestamp &&
    bars.every((bar) => matchesEntryKey(bar, entry))
  );
}

function metadataMatchesEntry(
  expected: MarketBarCacheMetadata,
  actual: MarketBarCacheMetadata | undefined,
) {
  return (
    actual !== undefined &&
    actual.market === expected.market &&
    actual.symbol === expected.symbol &&
    actual.timeframe === expected.timeframe &&
    (actual.adjust ?? "none") === (expected.adjust ?? "none") &&
    actual.barCount === expected.barCount &&
    actual.firstTimestamp === expected.firstTimestamp &&
    actual.lastTimestamp === expected.lastTimestamp
  );
}

async function failMigration(
  repository: MarketBarCacheRepository,
  errorCode: LegacyMarketCacheMigrationErrorCode,
): Promise<LegacyMarketBarCacheMigrationResult> {
  await repository.recordLegacyMigration("failed", errorCode);
  return { status: "failed", errorCode };
}

export async function migrateLegacyMarketBarCache(
  options: LegacyMarketBarCacheMigrationOptions,
): Promise<LegacyMarketBarCacheMigrationResult> {
  const state = await options.repository.legacyMigrationState();
  if (state.status === "complete") {
    return {
      status: "complete",
      migratedEntries: 0,
      alreadyComplete: true,
    };
  }

  const entries = readMarketBarCacheSummary(options.legacyDatabase).entries;
  let migratedEntries = 0;
  for (const entry of entries) {
    const bars = readLegacyMarketBarCacheEntry(entry, options.legacyDatabase);
    if (!entryMatchesBars(entry, bars)) {
      return failMigration(options.repository, "LEGACY_ENTRY_INVALID");
    }

    try {
      for (let offset = 0; offset < bars.length; offset += migrationBatchSize) {
        const finalBatch = offset + migrationBatchSize >= bars.length;
        await options.repository.write(entry, bars.slice(offset, offset + migrationBatchSize), {
          mergeExisting: offset > 0,
          ...(finalBatch && entry.historicalCompletion
            ? { historicalCompletion: entry.historicalCompletion }
            : {}),
        });
      }
    } catch {
      return failMigration(options.repository, "LEGACY_IMPORT_FAILED");
    }

    let importedEntry: MarketBarCacheMetadata | undefined;
    try {
      importedEntry = (await options.repository.summary()).entries.find(
        (candidate) =>
          candidate.market === entry.market &&
          candidate.symbol === entry.symbol &&
          candidate.timeframe === entry.timeframe &&
          (candidate.adjust ?? "none") === (entry.adjust ?? "none"),
      );
    } catch {
      return failMigration(options.repository, "LEGACY_VERIFICATION_FAILED");
    }
    if (!metadataMatchesEntry(entry, importedEntry)) {
      return failMigration(options.repository, "LEGACY_VERIFICATION_FAILED");
    }

    removeLegacyMarketBarCacheEntry(entry, options.legacyDatabase);
    migratedEntries += 1;
  }

  await options.repository.recordLegacyMigration("complete");
  return { status: "complete", migratedEntries };
}
