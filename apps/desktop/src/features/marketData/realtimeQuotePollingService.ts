import type { MarketQuoteSnapshot, MarketWatchlistItem } from "./marketDataSyncService.ts";

export const realtimeQuoteBatchSize = 30;
export const defaultRealtimePollIntervalMs = 10_000;
export const realtimePollIntervalOptionsMs = [10_000, 30_000, 60_000, 120_000] as const;

export function sanitizeRealtimePollIntervalMs(value: unknown) {
  return typeof value === "number" && realtimePollIntervalOptionsMs.includes(value as (typeof realtimePollIntervalOptionsMs)[number])
    ? value
    : defaultRealtimePollIntervalMs;
}

function getWatchlistKey(item: Pick<MarketWatchlistItem, "market" | "symbol">) {
  return `${item.market}:${item.symbol.trim()}`;
}

export function dedupeWatchlistItems(items: MarketWatchlistItem[]) {
  const seen = new Set<string>();
  const deduped: MarketWatchlistItem[] = [];

  for (const item of items) {
    const key = getWatchlistKey(item);
    if (!item.symbol.trim() || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function createQuotePollingBatches(items: MarketWatchlistItem[], batchSize = realtimeQuoteBatchSize) {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const deduped = dedupeWatchlistItems(items);
  const batches: MarketWatchlistItem[][] = [];

  for (let index = 0; index < deduped.length; index += safeBatchSize) {
    batches.push(deduped.slice(index, index + safeBatchSize));
  }

  return batches;
}

export function getQuoteSnapshotKey(snapshot: Pick<MarketQuoteSnapshot, "market" | "symbol">) {
  return `${snapshot.market}:${snapshot.symbol}`;
}

export function mergeQuoteSnapshots(current: Record<string, MarketQuoteSnapshot>, snapshots: MarketQuoteSnapshot[]) {
  return snapshots.reduce<Record<string, MarketQuoteSnapshot>>(
    (next, snapshot) => {
      next[getQuoteSnapshotKey(snapshot)] = snapshot;
      return next;
    },
    { ...current },
  );
}
