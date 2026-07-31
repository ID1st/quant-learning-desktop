import { isAbsolute, relative, resolve } from "node:path";

import type { MarketBarCacheRepository } from "../features/marketData/marketBarCacheRepository.ts";
import type {
  MarketBarCacheKey,
  MarketDataBar,
} from "../features/marketData/marketBarCacheService.ts";

export type ReleaseSmokeMode = "seed" | "verify";

export const releaseSmokeKey: MarketBarCacheKey = {
  market: "US",
  symbol: "RELEASE.SMOKE",
  timeframe: "realtime",
};

export const releaseSmokeBar: MarketDataBar = {
  ...releaseSmokeKey,
  timestamp: Date.UTC(2000, 0, 3, 14, 30),
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 1,
  provider: "stock-sdk",
};

export function validateReleaseSmokeUserDataPath(candidate: string, temporaryRoot: string) {
  const resolvedCandidate = resolve(candidate);
  const resolvedRoot = resolve(temporaryRoot);
  const relativePath = relative(resolvedRoot, resolvedCandidate);
  if (
    !isAbsolute(resolvedCandidate) ||
    relativePath === "" ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Release smoke userData path must be inside the temporary directory.");
  }
}

export async function runReleaseSmokeProbe(
  repository: MarketBarCacheRepository,
  mode: ReleaseSmokeMode,
) {
  if (mode === "seed") {
    await repository.write(releaseSmokeKey, [releaseSmokeBar], { mergeExisting: true });
  }
  const bars = await repository.read(releaseSmokeKey);
  const verified = bars.some(
    (bar) =>
      bar.timestamp === releaseSmokeBar.timestamp &&
      bar.open === releaseSmokeBar.open &&
      bar.high === releaseSmokeBar.high &&
      bar.low === releaseSmokeBar.low &&
      bar.close === releaseSmokeBar.close &&
      bar.volume === releaseSmokeBar.volume,
  );
  if (!verified) {
    throw new Error("DuckDB release smoke marker was not preserved.");
  }
  return {
    mode,
    markerTimestamp: releaseSmokeBar.timestamp,
    verified,
  } as const;
}
