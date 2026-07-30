import type {
  MarketBarCachePruneResult,
  MarketBarCacheRepository,
  MarketBarCacheWriteOptions,
} from "./marketBarCacheRepository.ts";
import {
  getDefaultMarketBarRetentionDays,
  normalizeMarketBarCacheKey,
  normalizeMarketDataBars,
  type MarketBarCacheKey,
  type MarketBarCacheMetadata,
  type MarketBarCacheSummary,
  type MarketDataBar,
} from "./marketBarCacheService.ts";
import { isMarketDataBarQualityValid } from "./marketDataQuality.ts";

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

function cacheIdentity(key: MarketBarCacheKey) {
  const normalized = normalizeMarketBarCacheKey(key);
  return [
    normalized.market,
    normalized.symbol,
    normalized.timeframe,
    normalized.adjust ?? "none",
  ].join(":");
}

export function createMemoryMarketBarRepository(): MarketBarCacheRepository {
  const barsByKey = new Map<string, MarketDataBar[]>();
  const metadataByKey = new Map<string, MarketBarCacheMetadata>();
  let legacyMigrationState: Awaited<ReturnType<MarketBarCacheRepository["legacyMigrationState"]>> =
    { status: "pending" };

  async function write(
    key: MarketBarCacheKey,
    bars: MarketDataBar[],
    options: MarketBarCacheWriteOptions = {},
  ) {
    const normalizedKey = normalizeMarketBarCacheKey(key);
    const identity = cacheIdentity(normalizedKey);
    const candidates = options.mergeExisting ? [...(barsByKey.get(identity) ?? []), ...bars] : bars;
    const normalizedBars = normalizeMarketDataBars(
      candidates.filter(
        (bar) =>
          bar.market === normalizedKey.market &&
          bar.symbol === normalizedKey.symbol &&
          bar.timeframe === normalizedKey.timeframe &&
          isMarketDataBarQualityValid(bar),
      ),
    );
    if (normalizedBars.length === 0) {
      barsByKey.delete(identity);
      metadataByKey.delete(identity);
      return [];
    }

    const providers = Array.from(new Set(normalizedBars.map((bar) => bar.provider)));
    const existingMetadata = metadataByKey.get(identity);
    const historicalCompletion =
      options.historicalCompletion ?? existingMetadata?.historicalCompletion;
    const storedBars = normalizedBars.map((bar) => ({ ...bar }));
    barsByKey.set(identity, storedBars);
    metadataByKey.set(identity, {
      ...normalizedKey,
      provider: storedBars[0]!.provider,
      providers,
      firstTimestamp: storedBars[0]!.timestamp,
      lastTimestamp: storedBars.at(-1)!.timestamp,
      barCount: storedBars.length,
      estimatedBytes: new TextEncoder().encode(JSON.stringify(storedBars)).byteLength,
      retentionDays: getDefaultMarketBarRetentionDays(normalizedKey.timeframe),
      updatedAt: new Date().toISOString(),
      ...(storedBars[0]!.upstream ? { upstream: storedBars[0]!.upstream } : {}),
      ...(historicalCompletion ? { historicalCompletion } : {}),
    });
    return storedBars.map((bar) => ({ ...bar }));
  }

  async function summary(): Promise<MarketBarCacheSummary> {
    const entries = Array.from(metadataByKey.values())
      .map((entry) => ({
        ...entry,
        ...(entry.providers ? { providers: [...entry.providers] } : {}),
      }))
      .sort((left, right) => cacheIdentity(left).localeCompare(cacheIdentity(right)));
    return {
      entries,
      totalBarCount: entries.reduce((total, entry) => total + entry.barCount, 0),
      totalEstimatedBytes: entries.reduce((total, entry) => total + entry.estimatedBytes, 0),
      updatedAt: entries.reduce<string | undefined>(
        (latest, entry) => (!latest || entry.updatedAt > latest ? entry.updatedAt : latest),
        undefined,
      ),
    };
  }

  return {
    async read(key) {
      return (barsByKey.get(cacheIdentity(key)) ?? []).map((bar) => ({
        ...bar,
      }));
    },
    write,
    summary,
    async prune(now = Date.now()): Promise<MarketBarCachePruneResult> {
      let removedEntries = 0;
      let removedBars = 0;
      for (const [identity, metadata] of [...metadataByKey.entries()]) {
        const bars = barsByKey.get(identity) ?? [];
        const cutoff = now - metadata.retentionDays * millisecondsPerDay;
        const retained = bars.filter((bar) => bar.timestamp >= cutoff);
        removedBars += bars.length - retained.length;
        if (retained.length === 0) {
          barsByKey.delete(identity);
          metadataByKey.delete(identity);
          removedEntries += 1;
        } else if (retained.length !== bars.length) {
          await write(metadata, retained, {
            historicalCompletion: metadata.historicalCompletion,
          });
        }
      }
      return {
        removedEntries,
        removedBars,
        remainingEntries: metadataByKey.size,
      };
    },
    async clear(key) {
      const identity = cacheIdentity(key);
      const existed = metadataByKey.delete(identity);
      barsByKey.delete(identity);
      return existed;
    },
    async clearAll() {
      const count = metadataByKey.size;
      barsByKey.clear();
      metadataByKey.clear();
      return count;
    },
    async legacyMigrationState() {
      return { ...legacyMigrationState };
    },
    async recordLegacyMigration(status, errorCode) {
      legacyMigrationState = {
        status,
        ...(errorCode ? { errorCode } : {}),
        updatedAt: new Date().toISOString(),
      };
    },
    async dispose() {
      barsByKey.clear();
      metadataByKey.clear();
    },
  };
}
