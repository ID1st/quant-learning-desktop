import type { Market } from "@quant/shared";
import { appLocalDatabase, type LocalDatabase } from "../persistence/localDatabase.ts";
import { writeMarketBarCache, type MarketDataBar } from "./marketBarCacheService.ts";
import {
  sanitizeMarketDataProviderId,
  type GatewayMarketDataProviderId,
  type LegacyMarketDataProviderId,
  type MarketDataProviderId,
} from "./marketDataProviderIds.ts";

export { sanitizeMarketDataProviderId, type GatewayMarketDataProviderId, type LegacyMarketDataProviderId, type MarketDataProviderId };

export type MarketDataSyncStepId =
  | "api-verification"
  | "market-permissions"
  | "watchlist-cache"
  | "quote-snapshot"
  | "historical-candles";
export type MarketDataSyncStepStatus = "pending" | "running" | "completed" | "failed";
export type MarketDataSyncStatus = "idle" | "running" | "completed" | "failed";

export interface MarketDataProviderBinding {
  apiUrl: string;
  keyPreview: string;
  markets: Market[];
  verifiedAt: string;
  accountId?: string;
}

export interface MarketWatchlistItem {
  symbol: string;
  name: string;
  market: Market;
  source: "preset" | "user";
}

export interface MarketQuoteSnapshot {
  symbol: string;
  market: Market;
  lastPrice: number;
  previousClose: number;
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  changePercent: number;
  volume: number;
  amount?: number;
  quoteTime: string;
  receivedAt: string;
  provider: MarketDataProviderId;
}

export interface MarketDataSyncStep {
  id: MarketDataSyncStepId;
  label: string;
  status: MarketDataSyncStepStatus;
  message?: string;
  completedAt?: string;
}

export interface MarketDataSyncState {
  version: 1;
  provider: MarketDataProviderId;
  fallbackProvider?: MarketDataProviderId;
  status: MarketDataSyncStatus;
  markets: Market[];
  appKeyPreview: string;
  accountId?: string;
  startedAt: string;
  updatedAt: string;
  watchlistCount: number;
  quoteSnapshotCount: number;
  historicalBarCount: number;
  steps: MarketDataSyncStep[];
}

export interface RunInitialMarketDataSyncOptions {
  database?: LocalDatabase;
  delayMs?: number;
  fetchQuoteSnapshot?: (watchlist: MarketWatchlistItem[]) => Promise<MarketQuoteSnapshot[]>;
  fetchHistoricalBars?: (watchlist: MarketWatchlistItem[]) => Promise<MarketDataBar[]>;
  provider?: MarketDataProviderId;
  fallbackProvider?: MarketDataProviderId;
  onUpdate?: (state: MarketDataSyncState) => void;
  now?: () => Date;
}

const SYNC_STATE_COLLECTION_KEY = "market-data-sync-state";
const WATCHLIST_COLLECTION_KEY = "market-watchlist-cache";
const QUOTE_SNAPSHOT_COLLECTION_KEY = "market-quote-snapshot-cache";
const STORAGE_VERSION = 1;

export const initialMarketDataSyncSteps: Array<Pick<MarketDataSyncStep, "id" | "label">> = [
  { id: "api-verification", label: "确认数据源 API 验证结果" },
  { id: "market-permissions", label: "记录美股、港股、A股市场权限" },
  { id: "watchlist-cache", label: "准备默认观察列表缓存" },
  { id: "quote-snapshot", label: "拉取观察列表基础报价快照" },
  { id: "historical-candles", label: "同步默认观察列表 K 线缓存" },
];

const presetWatchlist: MarketWatchlistItem[] = [
  { symbol: "AAPL.US", name: "Apple Inc.", market: "US", source: "preset" },
  { symbol: "TSLA.US", name: "Tesla", market: "US", source: "preset" },
  { symbol: "09988.HK", name: "阿里巴巴", market: "HK", source: "preset" },
  { symbol: "600519.SH", name: "贵州茅台", market: "CN", source: "preset" },
];

function createPendingSteps(): MarketDataSyncStep[] {
  return initialMarketDataSyncSteps.map((step) => ({ ...step, status: "pending" }));
}

function createWatchlist(markets: Market[]) {
  const allowedMarkets = new Set(markets);
  return presetWatchlist.filter((item) => allowedMarkets.has(item.market));
}

function wait(delayMs: number) {
  return delayMs > 0 ? new Promise((resolve) => globalThis.setTimeout(resolve, delayMs)) : Promise.resolve();
}

function writeSyncState(database: LocalDatabase, state: MarketDataSyncState) {
  database.writeDocument(SYNC_STATE_COLLECTION_KEY, STORAGE_VERSION, state);
}

function writeWatchlist(database: LocalDatabase, watchlist: MarketWatchlistItem[]) {
  database.writeDocument(WATCHLIST_COLLECTION_KEY, STORAGE_VERSION, watchlist);
}

function writeQuoteSnapshots(database: LocalDatabase, snapshots: MarketQuoteSnapshot[]) {
  database.writeDocument(QUOTE_SNAPSHOT_COLLECTION_KEY, STORAGE_VERSION, snapshots);
}

function writeHistoricalBars(database: LocalDatabase, bars: MarketDataBar[]) {
  const groups = new Map<string, MarketDataBar[]>();

  for (const bar of bars) {
    const key = `${bar.market}:${bar.symbol}:${bar.timeframe}`;
    groups.set(key, [...(groups.get(key) ?? []), bar]);
  }

  for (const groupBars of groups.values()) {
    const firstBar = groupBars[0];
    if (!firstBar) {
      continue;
    }

    writeMarketBarCache(
      {
        symbol: firstBar.symbol,
        market: firstBar.market,
        timeframe: firstBar.timeframe,
      },
      groupBars,
      { database, mergeExisting: true },
    );
  }
}

function sanitizeSyncStep(value: unknown): MarketDataSyncStep | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const step = value as Partial<MarketDataSyncStep>;
  if (typeof step.id !== "string" || typeof step.label !== "string" || typeof step.status !== "string") {
    return null;
  }

  if (!["pending", "running", "completed", "failed"].includes(step.status)) {
    return null;
  }

  return {
    id: step.id as MarketDataSyncStepId,
    label: step.label,
    status: step.status as MarketDataSyncStepStatus,
    message: typeof step.message === "string" ? step.message : undefined,
    completedAt: typeof step.completedAt === "string" ? step.completedAt : undefined,
  };
}

function sanitizeMarket(value: unknown): Market | null {
  return value === "US" || value === "HK" || value === "CN" ? value : null;
}

function sanitizeSyncState(value: unknown): MarketDataSyncState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const state = value as Partial<MarketDataSyncState>;
  const provider = sanitizeMarketDataProviderId(state.provider);
  const fallbackProvider = sanitizeMarketDataProviderId(state.fallbackProvider);
  const markets = Array.isArray(state.markets) ? state.markets.map(sanitizeMarket).filter((market): market is Market => market !== null) : [];
  const steps = Array.isArray(state.steps)
    ? state.steps.map(sanitizeSyncStep).filter((step): step is MarketDataSyncStep => step !== null)
    : [];

  if (
    state.version !== 1 ||
    !provider ||
    typeof state.status !== "string" ||
    typeof state.appKeyPreview !== "string" ||
    typeof state.startedAt !== "string" ||
    typeof state.updatedAt !== "string" ||
    typeof state.watchlistCount !== "number" ||
    typeof state.quoteSnapshotCount !== "number" ||
    markets.length === 0 ||
    steps.length === 0
  ) {
    return null;
  }

  return {
    version: 1,
    provider,
    fallbackProvider: fallbackProvider ?? undefined,
    status: ["idle", "running", "completed", "failed"].includes(state.status) ? (state.status as MarketDataSyncStatus) : "idle",
    markets,
    appKeyPreview: state.appKeyPreview,
    accountId: typeof state.accountId === "string" ? state.accountId : undefined,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    watchlistCount: state.watchlistCount,
    quoteSnapshotCount: state.quoteSnapshotCount,
    historicalBarCount: typeof state.historicalBarCount === "number" ? state.historicalBarCount : 0,
    steps,
  };
}

function sanitizeWatchlist(value: unknown): MarketWatchlistItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const watchlist = value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Partial<MarketWatchlistItem>;
    const market = sanitizeMarket(candidate.market);
    if (!market || typeof candidate.symbol !== "string" || typeof candidate.name !== "string") {
      return [];
    }

    return [
      {
        symbol: candidate.symbol,
        name: candidate.name,
        market,
        source: candidate.source === "user" ? "user" as const : "preset" as const,
      },
    ];
  });

  return watchlist;
}

export function readMarketWatchlist(database: LocalDatabase = appLocalDatabase): MarketWatchlistItem[] {
  return database.readDocument(WATCHLIST_COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: [...presetWatchlist],
    sanitize: sanitizeWatchlist,
  });
}

export function writeMarketWatchlist(watchlist: readonly MarketWatchlistItem[], database: LocalDatabase = appLocalDatabase) {
  const sanitized = sanitizeWatchlist(watchlist) ?? [];
  if (sanitized.length === 0) {
    return readMarketWatchlist(database);
  }
  const unique = sanitized.filter((item, index, items) => items.findIndex((candidate) => candidate.market === item.market && candidate.symbol === item.symbol) === index);
  writeWatchlist(database, unique);
  return unique;
}

function sanitizeQuoteSnapshot(value: unknown): MarketQuoteSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const snapshot = value as Partial<MarketQuoteSnapshot>;
  const market = sanitizeMarket(snapshot.market);
  const provider = sanitizeMarketDataProviderId(snapshot.provider);

  if (
    !market ||
    !provider ||
    typeof snapshot.symbol !== "string" ||
    typeof snapshot.lastPrice !== "number" ||
    typeof snapshot.previousClose !== "number" ||
    typeof snapshot.changePercent !== "number" ||
    typeof snapshot.volume !== "number" ||
    typeof snapshot.quoteTime !== "string" ||
    typeof snapshot.receivedAt !== "string"
  ) {
    return null;
  }

  return {
    symbol: snapshot.symbol,
    market,
    lastPrice: snapshot.lastPrice,
    previousClose: snapshot.previousClose,
    openPrice: typeof snapshot.openPrice === "number" && Number.isFinite(snapshot.openPrice) ? snapshot.openPrice : undefined,
    highPrice: typeof snapshot.highPrice === "number" && Number.isFinite(snapshot.highPrice) ? snapshot.highPrice : undefined,
    lowPrice: typeof snapshot.lowPrice === "number" && Number.isFinite(snapshot.lowPrice) ? snapshot.lowPrice : undefined,
    changePercent: snapshot.changePercent,
    volume: snapshot.volume,
    amount: typeof snapshot.amount === "number" && Number.isFinite(snapshot.amount) ? snapshot.amount : undefined,
    quoteTime: snapshot.quoteTime,
    receivedAt: snapshot.receivedAt,
    provider,
  };
}

function sanitizeQuoteSnapshots(value: unknown): MarketQuoteSnapshot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map(sanitizeQuoteSnapshot).filter((snapshot): snapshot is MarketQuoteSnapshot => snapshot !== null);
}

export function readMarketDataSyncState(database: LocalDatabase = appLocalDatabase): MarketDataSyncState | null {
  return database.readDocument(SYNC_STATE_COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: null,
    sanitize: sanitizeSyncState,
  });
}

export function readMarketWatchlistCache(database: LocalDatabase = appLocalDatabase): MarketWatchlistItem[] {
  return database.readDocument(WATCHLIST_COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: [],
    sanitize: sanitizeWatchlist,
  });
}

export function readMarketQuoteSnapshotCache(database: LocalDatabase = appLocalDatabase): MarketQuoteSnapshot[] {
  return database.readDocument(QUOTE_SNAPSHOT_COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: [],
    sanitize: sanitizeQuoteSnapshots,
  });
}

export async function runInitialMarketDataSync(
  binding: MarketDataProviderBinding,
  options: RunInitialMarketDataSyncOptions = {},
): Promise<MarketDataSyncState> {
  const database = options.database ?? appLocalDatabase;
  const provider = options.provider ?? "alphafeed";
  const now = options.now ?? (() => new Date());
  const delayMs = options.delayMs ?? 220;
  const watchlist = createWatchlist(binding.markets);
  let quoteSnapshots: MarketQuoteSnapshot[] = [];
  let historicalBars: MarketDataBar[] = [];
  const startedAt = now().toISOString();
  let state: MarketDataSyncState = {
    version: 1,
    provider,
    fallbackProvider: options.fallbackProvider,
    status: "running",
    markets: binding.markets,
    appKeyPreview: binding.keyPreview,
    accountId: binding.accountId,
    startedAt,
    updatedAt: startedAt,
    watchlistCount: watchlist.length,
    quoteSnapshotCount: 0,
    historicalBarCount: 0,
    steps: createPendingSteps(),
  };

  const publish = (nextState: MarketDataSyncState) => {
    state = nextState;
    writeSyncState(database, state);
    options.onUpdate?.(state);
  };

  publish(state);

  for (const step of initialMarketDataSyncSteps) {
    publish({
      ...state,
      updatedAt: now().toISOString(),
      steps: state.steps.map((item) => (item.id === step.id ? { ...item, status: "running" } : item)),
    });

    await wait(delayMs);

    try {
      if (step.id === "watchlist-cache") {
        writeWatchlist(database, watchlist);
      }

      if (step.id === "quote-snapshot" && options.fetchQuoteSnapshot) {
        quoteSnapshots = await options.fetchQuoteSnapshot(watchlist);
        writeQuoteSnapshots(database, quoteSnapshots);
      }

      if (step.id === "historical-candles" && options.fetchHistoricalBars) {
        historicalBars = await options.fetchHistoricalBars(watchlist);
        writeHistoricalBars(database, historicalBars);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "行情同步失败";
      publish({
        ...state,
        status: "failed",
        updatedAt: now().toISOString(),
        steps: state.steps.map((item) =>
          item.id === step.id
            ? {
                ...item,
                status: "failed",
                message,
                completedAt: now().toISOString(),
              }
            : item,
        ),
        quoteSnapshotCount: quoteSnapshots.length,
        historicalBarCount: historicalBars.length,
      });
      throw error;
    }

    publish({
      ...state,
      updatedAt: now().toISOString(),
      steps: state.steps.map((item) =>
        item.id === step.id
          ? {
              ...item,
              status: "completed",
              message:
                step.id === "quote-snapshot"
                  ? `${quoteSnapshots.length} 个报价快照`
                  : step.id === "historical-candles"
                    ? `${historicalBars.length} 根 K 线`
                    : item.message,
              completedAt: now().toISOString(),
            }
          : item,
      ),
      quoteSnapshotCount: quoteSnapshots.length,
      historicalBarCount: historicalBars.length,
    });
  }

  publish({
    ...state,
    status: "completed",
    updatedAt: now().toISOString(),
  });

  return state;
}
