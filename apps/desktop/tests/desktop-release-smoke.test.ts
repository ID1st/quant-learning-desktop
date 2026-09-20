import assert from "node:assert/strict";
import test from "node:test";

import {
  releaseSmokeBar,
  runReleaseSmokeProbe,
  validateReleaseSmokeUserDataPath,
} from "../src/electron/releaseSmoke.ts";
import type { MarketBarCacheRepository } from "../src/features/marketData/marketBarCacheRepository.ts";
import type {
  MarketBarCacheKey,
  MarketDataBar,
} from "../src/features/marketData/marketBarCacheService.ts";

function createRepository(): MarketBarCacheRepository {
  let bars: MarketDataBar[] = [];
  return {
    async read() {
      return bars;
    },
    async write(_key: MarketBarCacheKey, nextBars: MarketDataBar[]) {
      bars = nextBars;
      return bars;
    },
    async summary() {
      return { entries: [], totalBarCount: bars.length, totalEstimatedBytes: 0 };
    },
    async prune() {
      return { removedEntries: 0, removedBars: 0, remainingEntries: 0 };
    },
    async clear() {
      return false;
    },
    async clearAll() {
      bars = [];
      return 0;
    },
    async legacyMigrationState() {
      return { status: "pending" };
    },
    async recordLegacyMigration() {},
    async dispose() {},
  };
}

test("release smoke probe seeds and verifies a stable DuckDB marker bar", async () => {
  const repository = createRepository();
  assert.deepEqual(await runReleaseSmokeProbe(repository, "seed"), {
    mode: "seed",
    markerTimestamp: releaseSmokeBar.timestamp,
    verified: true,
  });
  assert.deepEqual(await runReleaseSmokeProbe(repository, "verify"), {
    mode: "verify",
    markerTimestamp: releaseSmokeBar.timestamp,
    verified: true,
  });
});

test("release smoke userData path must be a descendant of the temporary root", () => {
  assert.doesNotThrow(() =>
    validateReleaseSmokeUserDataPath("C:\\Temp\\quant-release-smoke\\user-data", "C:\\Temp"),
  );
  assert.throws(
    () => validateReleaseSmokeUserDataPath("C:\\Users\\Admin", "C:\\Temp"),
    /temporary directory/u,
  );
  assert.throws(
    () => validateReleaseSmokeUserDataPath("C:\\Temp", "C:\\Temp"),
    /temporary directory/u,
  );
});

test("release smoke accepts a macOS path after /var resolves to /private/var", () => {
  const canonicalize = (path: string) =>
    path.replace(/^C:\\var(?=\\|$)/iu, "C:\\private\\var");

  assert.doesNotThrow(() =>
    validateReleaseSmokeUserDataPath(
      "C:\\private\\var\\folders\\quant-renderer-smoke\\user-data",
      "C:\\var\\folders\\quant-renderer-smoke",
      canonicalize,
    ),
  );
});
