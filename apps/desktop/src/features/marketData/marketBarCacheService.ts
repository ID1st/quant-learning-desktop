import type { Market, Timeframe } from "@quant/shared";
import { appLocalDatabase, type LocalDatabase } from "../persistence/localDatabase.ts";
import type { MarketDataProviderId } from "./marketDataSyncService.ts";

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
}

export interface MarketBarCacheKey {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
}

export interface MarketBarCacheMetadata extends MarketBarCacheKey {
  provider: MarketDataProviderId;
  firstTimestamp: number;
  lastTimestamp: number;
  barCount: number;
  estimatedBytes: number;
  retentionDays: number;
  updatedAt: string;
}

export interface MarketBarCacheSummary {
  entries: MarketBarCacheMetadata[];
  totalBarCount: number;
  totalEstimatedBytes: number;
  updatedAt?: string;
}

export interface WriteMarketBarCacheOptions {
  database?: LocalDatabase;
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

function createCollectionKey(key: MarketBarCacheKey) {
  return `${COLLECTION_PREFIX}:${key.market}:${key.symbol}:${key.timeframe}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeMarket(value: unknown): Market | null {
  return value === "US" || value === "HK" || value === "CN" ? value : null;
}

function sanitizeTimeframe(value: unknown): Timeframe | null {
  return value === "1m" || value === "5m" || value === "15m" || value === "30m" || value === "1h" || value === "1d" || value === "1w"
    ? value
    : null;
}

function sanitizeProvider(value: unknown): MarketDataProviderId | null {
  return value === "alphafeed" || value === "longport" ? value : null;
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

  return {
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
  };
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
    firstTimestamp: candidate.firstTimestamp,
    lastTimestamp: candidate.lastTimestamp,
    barCount: Math.max(0, Math.floor(candidate.barCount)),
    estimatedBytes: Math.max(0, Math.floor(candidate.estimatedBytes)),
    retentionDays: sanitizeRetentionDays(timeframe, candidate.retentionDays),
    updatedAt: candidate.updatedAt,
  };
}

function sanitizeMetadataList(value: unknown): MarketBarCacheMetadata[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map(sanitizeMetadata).filter((item): item is MarketBarCacheMetadata => item !== null);
}

function normalizeBars(bars: MarketDataBar[]) {
  const byTimestamp = new Map<number, MarketDataBar>();

  for (const bar of bars) {
    byTimestamp.set(bar.timestamp, bar);
  }

  return Array.from(byTimestamp.values()).sort((left, right) => left.timestamp - right.timestamp);
}

function getDefaultMarketBarRetentionDays(timeframe: Timeframe) {
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

function removeMetadata(database: LocalDatabase, key: MarketBarCacheKey) {
  writeMetadataIndex(
    database,
    readMetadataIndex(database).filter((entry) => createCollectionKey(entry) !== createCollectionKey(key)),
  );
}

function upsertMetadata(database: LocalDatabase, key: MarketBarCacheKey, bars: MarketDataBar[]) {
  if (bars.length === 0) {
    removeMetadata(database, key);
    return;
  }

  const metadata: MarketBarCacheMetadata = {
    symbol: key.symbol,
    market: key.market,
    timeframe: key.timeframe,
    provider: bars[0]?.provider ?? "alphafeed",
    firstTimestamp: bars[0]?.timestamp ?? 0,
    lastTimestamp: bars[bars.length - 1]?.timestamp ?? 0,
    barCount: bars.length,
    estimatedBytes: new TextEncoder().encode(JSON.stringify(bars)).byteLength,
    retentionDays: getDefaultMarketBarRetentionDays(key.timeframe),
    updatedAt: new Date().toISOString(),
  };

  writeMetadataIndex(database, [...readMetadataIndex(database).filter((entry) => createCollectionKey(entry) !== createCollectionKey(key)), metadata]);
}

export function writeMarketBarCache(key: MarketBarCacheKey, bars: MarketDataBar[], options: WriteMarketBarCacheOptions = {}) {
  const database = options.database ?? appLocalDatabase;
  const normalizedBars = normalizeBars(
    bars.filter((bar) => bar.symbol === key.symbol && bar.market === key.market && bar.timeframe === key.timeframe),
  );

  database.writeDocument(createCollectionKey(key), STORAGE_VERSION, normalizedBars);
  upsertMetadata(database, key, normalizedBars);
  return normalizedBars;
}

export function readMarketBarCache(key: MarketBarCacheKey, options: ReadMarketBarCacheOptions = {}) {
  const database = options.database ?? appLocalDatabase;
  return database.readDocument(createCollectionKey(key), {
    version: STORAGE_VERSION,
    fallback: [],
    sanitize: sanitizeBars,
  });
}

export function clearMarketBarCache(key: MarketBarCacheKey, database: LocalDatabase = appLocalDatabase) {
  database.removeDocument(createCollectionKey(key));
  removeMetadata(database, key);
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
