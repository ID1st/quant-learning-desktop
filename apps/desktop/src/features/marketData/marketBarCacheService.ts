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

export interface WriteMarketBarCacheOptions {
  database?: LocalDatabase;
}

export interface ReadMarketBarCacheOptions {
  database?: LocalDatabase;
}

const STORAGE_VERSION = 1;
const COLLECTION_PREFIX = "market-bars";

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

function normalizeBars(bars: MarketDataBar[]) {
  const byTimestamp = new Map<number, MarketDataBar>();

  for (const bar of bars) {
    byTimestamp.set(bar.timestamp, bar);
  }

  return Array.from(byTimestamp.values()).sort((left, right) => left.timestamp - right.timestamp);
}

export function writeMarketBarCache(key: MarketBarCacheKey, bars: MarketDataBar[], options: WriteMarketBarCacheOptions = {}) {
  const database = options.database ?? appLocalDatabase;
  const normalizedBars = normalizeBars(
    bars.filter((bar) => bar.symbol === key.symbol && bar.market === key.market && bar.timeframe === key.timeframe),
  );

  database.writeDocument(createCollectionKey(key), STORAGE_VERSION, normalizedBars);
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
}
