import type { Market, Timeframe } from "@quant/shared";
import { appLocalDatabase, type LocalDatabase } from "../persistence/localDatabase.ts";
import { sanitizeMarketDataProviderId, type MarketDataProviderId } from "./marketDataProviderIds.ts";
import type { MarketDataUpstream } from "./marketDataProviderGateway.ts";
import { isMarketDataBarQualityValid } from "./marketDataQuality.ts";

export interface MarketDataBar {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  provider: MarketDataProviderId;
  upstream?: MarketDataUpstream;
}

export interface MarketBarCacheKey {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  adjust?: "none" | "forward" | "backward";
}

export interface MarketBarCacheMetadata extends MarketBarCacheKey {
  provider: MarketDataProviderId;
  providers?: MarketDataProviderId[];
  firstTimestamp: number;
  lastTimestamp: number;
  barCount: number;
  estimatedBytes: number;
  retentionDays: number;
  updatedAt: string;
  upstream?: MarketDataUpstream;
  legacy?: boolean;
  historicalCompletion?: MarketBarCacheHistoricalCompletion;
}

export interface MarketBarCacheHistoricalCompletion {
  targetBars: number;
  confirmedBars: number;
  targetSatisfied: boolean;
  stopReason: "target_reached" | "sources_exhausted";
}

export interface MarketBarCacheSummary {
  entries: MarketBarCacheMetadata[];
  totalBarCount: number;
  totalEstimatedBytes: number;
  updatedAt?: string;
}

export interface WriteMarketBarCacheOptions {
  database?: LocalDatabase;
  mergeExisting?: boolean;
  historicalCompletion?: MarketBarCacheHistoricalCompletion;
}

export interface ReadMarketBarCacheOptions {
  database?: LocalDatabase;
}

export interface PruneMarketBarCacheOptions {
  database?: LocalDatabase;
  now?: number;
}

const STORAGE_VERSION = 1;
const COLLECTION_PREFIX = "market-bars";
const INDEX_COLLECTION_KEY = `${COLLECTION_PREFIX}:index`;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const maximumHistoricalCacheGapMs = 180 * millisecondsPerDay;
// Providers anchor one daily session between local midnight and market noon.
// Keep the window below 24 hours so adjacent sessions remain distinct.
const maximumDailyProviderTimestampSkewMs = 20 * 60 * 60 * 1000;

function isHistoricalTimeframe(timeframe: Timeframe) {
  return timeframe === "1d" || timeframe === "1w";
}

function getAdjustment(key: MarketBarCacheKey) {
  return isHistoricalTimeframe(key.timeframe) ? key.adjust ?? "none" : undefined;
}

function isLegacyHistoricalKey(key: MarketBarCacheKey | MarketBarCacheMetadata) {
  return "legacy" in key && key.legacy === true && isHistoricalTimeframe(key.timeframe);
}

function createCollectionKey(key: MarketBarCacheKey | MarketBarCacheMetadata) {
  const base = `${COLLECTION_PREFIX}:${key.market}:${key.symbol}:${key.timeframe}`;
  if (!isHistoricalTimeframe(key.timeframe) || isLegacyHistoricalKey(key)) {
    return base;
  }

  return `${base}:adjust:${getAdjustment(key)}`;
}

export function normalizeMarketBarCacheKey(key: MarketBarCacheKey): MarketBarCacheKey {
  const adjust = getAdjustment(key);
  return adjust ? { ...key, adjust } : { ...key };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeMarket(value: unknown): Market | null {
  return value === "US" || value === "HK" || value === "CN" ? value : null;
}

function sanitizeTimeframe(value: unknown): Timeframe | null {
  return value === "realtime" ||
    value === "1m" ||
    value === "5m" ||
    value === "15m" ||
    value === "30m" ||
    value === "1h" ||
    value === "1d" ||
    value === "1w"
    ? value
    : null;
}

function sanitizeProvider(value: unknown): MarketDataProviderId | null {
  return sanitizeMarketDataProviderId(value);
}

function sanitizeUpstream(value: unknown): MarketDataUpstream | undefined {
  return value === "tencent" || value === "eastmoney" || value === "alphafeed" || value === "longbridge" || value === "yahoo-finance"
    ? value
    : undefined;
}

function sanitizeAdjustment(value: unknown): MarketBarCacheKey["adjust"] | undefined {
  return value === "none" || value === "forward" || value === "backward" ? value : undefined;
}

function sanitizeRetentionDays(timeframe: Timeframe, value: unknown) {
  const fallback = getDefaultMarketBarRetentionDays(timeframe);
  return isFiniteNumber(value) && value > 0 ? Math.floor(value) : fallback;
}

function sanitizeBar(value: unknown): MarketDataBar | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<MarketDataBar>;
  const market = sanitizeMarket(candidate.market);
  const timeframe = sanitizeTimeframe(candidate.timeframe);
  const provider = sanitizeProvider(candidate.provider);

  if (
    !market ||
    !timeframe ||
    !provider ||
    typeof candidate.symbol !== "string" ||
    !isFiniteNumber(candidate.timestamp) ||
    !isFiniteNumber(candidate.open) ||
    !isFiniteNumber(candidate.high) ||
    !isFiniteNumber(candidate.low) ||
    !isFiniteNumber(candidate.close) ||
    !isFiniteNumber(candidate.volume)
  ) {
    return null;
  }

  const bar: MarketDataBar = {
    symbol: candidate.symbol,
    market,
    timeframe,
    timestamp: candidate.timestamp,
    open: candidate.open,
    high: candidate.high,
    low: candidate.low,
    close: candidate.close,
    volume: candidate.volume,
    amount: isFiniteNumber(candidate.amount) ? candidate.amount : undefined,
    provider,
    upstream: sanitizeUpstream(candidate.upstream),
  };

  return isMarketDataBarQualityValid(bar) ? bar : null;
}

function sanitizeBars(value: unknown): MarketDataBar[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const bars = value.map(sanitizeBar).filter((bar): bar is MarketDataBar => bar !== null);
  return bars.length === value.length ? bars : null;
}

function sanitizeMetadata(value: unknown): MarketBarCacheMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<MarketBarCacheMetadata>;
  const market = sanitizeMarket(candidate.market);
  const timeframe = sanitizeTimeframe(candidate.timeframe);
  const provider = sanitizeProvider(candidate.provider);
  const adjustment = sanitizeAdjustment(candidate.adjust);
  const legacy = isHistoricalTimeframe(timeframe ?? "1d") && adjustment === undefined;
  const providers = Array.isArray(candidate.providers)
    ? candidate.providers
        .map(sanitizeProvider)
        .filter((provider): provider is MarketDataProviderId => provider !== null)
    : undefined;
  const historicalCompletion = sanitizeHistoricalCompletion(candidate.historicalCompletion);

  if (
    !market ||
    !timeframe ||
    !provider ||
    typeof candidate.symbol !== "string" ||
    !isFiniteNumber(candidate.firstTimestamp) ||
    !isFiniteNumber(candidate.lastTimestamp) ||
    !isFiniteNumber(candidate.barCount) ||
    !isFiniteNumber(candidate.estimatedBytes) ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    symbol: candidate.symbol,
    market,
    timeframe,
    provider,
    ...(providers?.length ? { providers: Array.from(new Set(providers)) } : {}),
    ...(adjustment ? { adjust: adjustment } : {}),
    firstTimestamp: candidate.firstTimestamp,
    lastTimestamp: candidate.lastTimestamp,
    barCount: Math.max(0, Math.floor(candidate.barCount)),
    estimatedBytes: Math.max(0, Math.floor(candidate.estimatedBytes)),
    retentionDays: sanitizeRetentionDays(timeframe, candidate.retentionDays),
    updatedAt: candidate.updatedAt,
    upstream: sanitizeUpstream(candidate.upstream),
    ...(legacy ? { legacy: true } : {}),
    ...(historicalCompletion ? { historicalCompletion } : {}),
  };
}

function sanitizeHistoricalCompletion(value: unknown): MarketBarCacheHistoricalCompletion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<MarketBarCacheHistoricalCompletion>;
  if (
    !isFiniteNumber(candidate.targetBars) ||
    !isFiniteNumber(candidate.confirmedBars) ||
    typeof candidate.targetSatisfied !== "boolean" ||
    (candidate.stopReason !== "target_reached" && candidate.stopReason !== "sources_exhausted")
  ) {
    return undefined;
  }
  return {
    targetBars: Math.max(1, Math.floor(candidate.targetBars)),
    confirmedBars: Math.max(0, Math.floor(candidate.confirmedBars)),
    targetSatisfied: candidate.targetSatisfied,
    stopReason: candidate.stopReason,
  };
}

function sanitizeMetadataList(value: unknown): MarketBarCacheMetadata[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map(sanitizeMetadata).filter((item): item is MarketBarCacheMetadata => item !== null);
}

export function normalizeMarketDataBars(bars: MarketDataBar[]) {
  const byTimestamp = new Map<number, { bar: MarketDataBar; inputIndex: number }>();

  bars.forEach((bar, inputIndex) => {
    byTimestamp.set(bar.timestamp, { bar, inputIndex });
  });

  const sorted = Array.from(byTimestamp.values()).sort(
    (left, right) => left.bar.timestamp - right.bar.timestamp,
  );
  if (sorted[0]?.bar.timeframe !== "1d") {
    return sorted.map(({ bar }) => bar);
  }

  const dailyBars: Array<{
    firstTimestamp: number;
    selected: { bar: MarketDataBar; inputIndex: number };
  }> = [];
  for (const candidate of sorted) {
    const currentDay = dailyBars[dailyBars.length - 1];
    if (
      currentDay &&
      candidate.bar.timestamp - currentDay.firstTimestamp < maximumDailyProviderTimestampSkewMs
    ) {
      if (candidate.inputIndex > currentDay.selected.inputIndex) {
        currentDay.selected = candidate;
      }
      continue;
    }

    dailyBars.push({
      firstTimestamp: candidate.bar.timestamp,
      selected: candidate,
    });
  }

  return dailyBars
    .map(({ selected }) => selected.bar)
    .sort((left, right) => left.timestamp - right.timestamp);
}

export function hasContinuousHistoricalCache(bars: readonly MarketDataBar[], timeframe: Timeframe) {
  if (!isHistoricalTimeframe(timeframe) || bars.length < 2) {
    return true;
  }

  return bars.every((bar, index) => index === 0 || bar.timestamp - bars[index - 1]!.timestamp <= maximumHistoricalCacheGapMs);
}

export function getDefaultMarketBarRetentionDays(timeframe: Timeframe) {
  if (timeframe === "realtime") {
    return 45;
  }

  if (timeframe === "1m" || timeframe === "5m" || timeframe === "15m") {
    return 30;
  }

  if (timeframe === "30m" || timeframe === "1h") {
    return 180;
  }

  return 1825;
}

function readMetadataIndex(database: LocalDatabase) {
  return database.readDocument(INDEX_COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: [],
    sanitize: sanitizeMetadataList,
  });
}

function writeMetadataIndex(database: LocalDatabase, entries: MarketBarCacheMetadata[]) {
  const deduped = new Map<string, MarketBarCacheMetadata>();

  for (const entry of entries) {
    deduped.set(createCollectionKey(entry), entry);
  }

  database.writeDocument(
    INDEX_COLLECTION_KEY,
    STORAGE_VERSION,
    Array.from(deduped.values()).sort((left, right) => createCollectionKey(left).localeCompare(createCollectionKey(right))),
  );
}

function discardLegacyHistoricalCache(database: LocalDatabase, key: MarketBarCacheKey) {
  if (!isHistoricalTimeframe(key.timeframe)) {
    return;
  }

  const legacyEntries = readMetadataIndex(database).filter(
    (entry) =>
      entry.legacy === true &&
      entry.symbol === key.symbol &&
      entry.market === key.market &&
      entry.timeframe === key.timeframe,
  );

  if (legacyEntries.length === 0) {
    return;
  }

  const legacyKeys = new Set(legacyEntries.map((entry) => createCollectionKey(entry)));
  legacyEntries.forEach((entry) => database.removeDocument(createCollectionKey(entry)));
  writeMetadataIndex(
    database,
    readMetadataIndex(database).filter((entry) => !legacyKeys.has(createCollectionKey(entry))),
  );
}

function removeMetadata(database: LocalDatabase, key: MarketBarCacheKey) {
  writeMetadataIndex(
    database,
    readMetadataIndex(database).filter((entry) => createCollectionKey(entry) !== createCollectionKey(key)),
  );
}

function upsertMetadata(
  database: LocalDatabase,
  key: MarketBarCacheKey,
  bars: MarketDataBar[],
  historicalCompletion?: MarketBarCacheHistoricalCompletion,
) {
  if (bars.length === 0) {
    removeMetadata(database, key);
    return;
  }

  const existingMetadata = readMetadataIndex(database).find(
    (entry) => createCollectionKey(entry) === createCollectionKey(key),
  );
  const metadata: MarketBarCacheMetadata = {
    symbol: key.symbol,
    market: key.market,
    timeframe: key.timeframe,
    ...(getAdjustment(key) ? { adjust: getAdjustment(key) } : {}),
    provider: bars[0]?.provider ?? "alphafeed",
    providers: Array.from(new Set(bars.map((bar) => bar.provider))),
    firstTimestamp: bars[0]?.timestamp ?? 0,
    lastTimestamp: bars[bars.length - 1]?.timestamp ?? 0,
    barCount: bars.length,
    estimatedBytes: new TextEncoder().encode(JSON.stringify(bars)).byteLength,
    retentionDays: getDefaultMarketBarRetentionDays(key.timeframe),
    updatedAt: new Date().toISOString(),
    upstream: bars[0]?.upstream,
    ...((historicalCompletion ?? existingMetadata?.historicalCompletion)
      ? { historicalCompletion: historicalCompletion ?? existingMetadata?.historicalCompletion }
      : {}),
  };

  writeMetadataIndex(database, [...readMetadataIndex(database).filter((entry) => createCollectionKey(entry) !== createCollectionKey(key)), metadata]);
}

export function writeMarketBarCache(key: MarketBarCacheKey, bars: MarketDataBar[], options: WriteMarketBarCacheOptions = {}) {
  const database = options.database ?? appLocalDatabase;
  const normalizedKey = normalizeMarketBarCacheKey(key);
  discardLegacyHistoricalCache(database, normalizedKey);
  const candidateBars = options.mergeExisting
    ? [...readMarketBarCache(normalizedKey, { database }), ...bars]
    : bars;
  const normalizedBars = normalizeMarketDataBars(
    candidateBars.filter(
      (bar) =>
        bar.symbol === normalizedKey.symbol &&
        bar.market === normalizedKey.market &&
        bar.timeframe === normalizedKey.timeframe &&
        isMarketDataBarQualityValid(bar),
    ),
  );

  database.writeDocument(createCollectionKey(normalizedKey), STORAGE_VERSION, normalizedBars);
  upsertMetadata(database, normalizedKey, normalizedBars, options.historicalCompletion);
  return normalizedBars;
}

export function readMarketBarCache(key: MarketBarCacheKey, options: ReadMarketBarCacheOptions = {}) {
  const database = options.database ?? appLocalDatabase;
  const normalizedKey = normalizeMarketBarCacheKey(key);
  discardLegacyHistoricalCache(database, normalizedKey);
  const bars = database.readDocument(createCollectionKey(normalizedKey), {
    version: STORAGE_VERSION,
    fallback: [],
    sanitize: sanitizeBars,
  });
  const normalizedBars = normalizeMarketDataBars(bars);

  if (!hasContinuousHistoricalCache(normalizedBars, normalizedKey.timeframe)) {
    database.removeDocument(createCollectionKey(normalizedKey));
    removeMetadata(database, normalizedKey);
    return [];
  }

  return normalizedBars;
}

export function clearMarketBarCache(key: MarketBarCacheKey, database: LocalDatabase = appLocalDatabase) {
  const normalizedKey = normalizeMarketBarCacheKey(key);
  discardLegacyHistoricalCache(database, normalizedKey);
  database.removeDocument(createCollectionKey(normalizedKey));
  removeMetadata(database, normalizedKey);
}

export function readMarketBarCacheSummary(database: LocalDatabase = appLocalDatabase): MarketBarCacheSummary {
  const entries = readMetadataIndex(database);
  return {
    entries,
    totalBarCount: entries.reduce((total, entry) => total + entry.barCount, 0),
    totalEstimatedBytes: entries.reduce((total, entry) => total + entry.estimatedBytes, 0),
    updatedAt: entries.reduce<string | undefined>((latest, entry) => {
      if (!latest || entry.updatedAt > latest) {
        return entry.updatedAt;
      }

      return latest;
    }, undefined),
  };
}

export function clearAllMarketBarCache(database: LocalDatabase = appLocalDatabase) {
  const entries = readMetadataIndex(database);

  entries.forEach((entry) => {
    database.removeDocument(createCollectionKey(entry));
  });

  database.writeDocument(INDEX_COLLECTION_KEY, STORAGE_VERSION, []);
  return entries.length;
}

export function pruneMarketBarCache(options: PruneMarketBarCacheOptions = {}) {
  const database = options.database ?? appLocalDatabase;
  const now = options.now ?? Date.now();
  const entries = readMetadataIndex(database);
  let removedEntries = 0;
  let removedBars = 0;

  for (const entry of entries) {
    const cutoff = now - entry.retentionDays * millisecondsPerDay;
    const bars = readMarketBarCache(entry, { database });
    const retainedBars = bars.filter((bar) => bar.timestamp >= cutoff);

    removedBars += bars.length - retainedBars.length;

    if (retainedBars.length === 0) {
      clearMarketBarCache(entry, database);
      removedEntries += 1;
      continue;
    }

    if (retainedBars.length !== bars.length) {
      writeMarketBarCache(entry, retainedBars, { database });
    }
  }

  return {
    removedEntries,
    removedBars,
    remainingEntries: readMetadataIndex(database).length,
  };
}

/**
 * First-stable-release migration adapter. It deliberately reads the exact
 * legacy collection key without triggering the normal historical-key cleanup.
 * Remove this adapter in the second stable release after migration telemetry
 * confirms completion.
 */
export function readLegacyMarketBarCacheEntry(
  entry: MarketBarCacheMetadata,
  database: LocalDatabase = appLocalDatabase,
) {
  const bars = database.readDocument(createCollectionKey(entry), {
    version: STORAGE_VERSION,
    fallback: [],
    sanitize: sanitizeBars,
  });
  return normalizeMarketDataBars(bars);
}

export function removeLegacyMarketBarCacheEntry(
  entry: MarketBarCacheMetadata,
  database: LocalDatabase = appLocalDatabase,
) {
  const collectionKey = createCollectionKey(entry);
  database.removeDocument(collectionKey);
  writeMetadataIndex(
    database,
    readMetadataIndex(database).filter(
      (candidate) => createCollectionKey(candidate) !== collectionKey,
    ),
  );
}
