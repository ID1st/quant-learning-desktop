import assert from "node:assert/strict";
import { join, resolve, sep } from "node:path";
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
  const temporaryRoot = resolve("release-smoke-test-root");
  assert.doesNotThrow(() =>
    validateReleaseSmokeUserDataPath(join(temporaryRoot, "user-data"), temporaryRoot),
  );
  assert.throws(
    () => validateReleaseSmokeUserDataPath(resolve("release-smoke-outside"), temporaryRoot),
    /temporary directory/u,
  );
  assert.throws(
    () => validateReleaseSmokeUserDataPath(temporaryRoot, temporaryRoot),
    /temporary directory/u,
  );
});

test("release smoke accepts a macOS path after /var resolves to /private/var", () => {
  const aliasedPrefix = resolve("virtual-var");
  const canonicalPrefix = resolve("virtual-private-var");
  const temporaryRoot = join(aliasedPrefix, "folders", "quant-renderer-smoke");
  const candidate = join(canonicalPrefix, "folders", "quant-renderer-smoke", "user-data");
  const canonicalize = (path: string) =>
    path === aliasedPrefix || path.startsWith(`${aliasedPrefix}${sep}`)
      ? `${canonicalPrefix}${path.slice(aliasedPrefix.length)}`
      : path;

  assert.doesNotThrow(() =>
    validateReleaseSmokeUserDataPath(candidate, temporaryRoot, canonicalize),
  );
});
