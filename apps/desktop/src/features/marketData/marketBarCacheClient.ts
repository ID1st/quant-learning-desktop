import type {
  MarketBarCacheIpcBridge,
  MarketBarCacheIpcResult,
} from "../../electron/marketBarCacheIpcContract.ts";
import type {
  MarketBarCacheRepository,
  MarketBarCacheWriteOptions,
} from "./marketBarCacheRepository.ts";
import type { MarketBarCacheKey, MarketDataBar } from "./marketBarCacheService.ts";
import { createMemoryMarketBarRepository } from "./memoryMarketBarRepository.ts";
import { appLocalDatabase } from "../persistence/localDatabase.ts";
import { migrateLegacyMarketBarCache } from "./legacyMarketBarCacheMigration.ts";

const maximumWriteBatchSize = 1_000;

function unwrap<T>(result: MarketBarCacheIpcResult<T>) {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}

function createIpcMarketBarRepository(bridge: MarketBarCacheIpcBridge): MarketBarCacheRepository {
  return {
    async read(key) {
      return [...unwrap(await bridge.read({ key }))];
    },
    async write(
      key: MarketBarCacheKey,
      bars: MarketDataBar[],
      options: MarketBarCacheWriteOptions = {},
    ) {
      if (bars.length === 0) {
        unwrap(await bridge.clear(key));
        return [];
      }

      let written: readonly MarketDataBar[] = [];
      for (let offset = 0; offset < bars.length; offset += maximumWriteBatchSize) {
        const isFirstBatch = offset === 0;
        const isFinalBatch = offset + maximumWriteBatchSize >= bars.length;
        written = unwrap(
          await bridge.write({
            key,
            bars: bars.slice(offset, offset + maximumWriteBatchSize),
            options: {
              mergeExisting: isFirstBatch ? options.mergeExisting : true,
              ...(isFinalBatch && options.historicalCompletion
                ? { historicalCompletion: options.historicalCompletion }
                : {}),
            },
          }),
        );
      }
      return [...written];
    },
    async summary() {
      return unwrap(await bridge.summary());
    },
    async prune(now) {
      return unwrap(await bridge.prune(now === undefined ? undefined : { now }));
    },
    async clear(key) {
      return unwrap(await bridge.clear(key));
    },
    async clearAll() {
      return unwrap(await bridge.clearAll());
    },
    async legacyMigrationState() {
      return unwrap(await bridge.legacyMigrationState());
    },
    async recordLegacyMigration(status, errorCode) {
      unwrap(
        await bridge.recordLegacyMigration({
          status,
          ...(errorCode ? { errorCode } : {}),
        }),
      );
    },
    async dispose() {},
  };
}

function gateRepositoryOnMigration(
  baseRepository: MarketBarCacheRepository,
  migration: Promise<unknown>,
): MarketBarCacheRepository {
  const waitForMigration = async () => {
    try {
      await migration;
    } catch {
      // Cache operations remain available even if migration state could not be
      // recorded. Legacy source data is retained for the next startup retry.
    }
  };
  return {
    async read(key) {
      await waitForMigration();
      return baseRepository.read(key);
    },
    async write(key, bars, options) {
      await waitForMigration();
      return baseRepository.write(key, bars, options);
    },
    async summary() {
      await waitForMigration();
      return baseRepository.summary();
    },
    async prune(now) {
      await waitForMigration();
      return baseRepository.prune(now);
    },
    async clear(key) {
      await waitForMigration();
      return baseRepository.clear(key);
    },
    async clearAll() {
      await waitForMigration();
      return baseRepository.clearAll();
    },
    async legacyMigrationState() {
      await waitForMigration();
      return baseRepository.legacyMigrationState();
    },
    async recordLegacyMigration(status, errorCode) {
      await waitForMigration();
      return baseRepository.recordLegacyMigration(status, errorCode);
    },
    async dispose() {
      await waitForMigration();
      return baseRepository.dispose();
    },
  };
}

let repository: MarketBarCacheRepository | undefined;

export function getMarketBarCacheRepository(): MarketBarCacheRepository {
  if (repository) {
    return repository;
  }
  const bridge = typeof window === "undefined" ? undefined : window.quantDesktop?.marketBarCache;
  if (bridge) {
    const ipcRepository = createIpcMarketBarRepository(bridge);
    repository = gateRepositoryOnMigration(
      ipcRepository,
      migrateLegacyMarketBarCache({
        legacyDatabase: appLocalDatabase,
        repository: ipcRepository,
      }),
    );
  } else {
    repository = createMemoryMarketBarRepository();
  }
  return repository;
}
