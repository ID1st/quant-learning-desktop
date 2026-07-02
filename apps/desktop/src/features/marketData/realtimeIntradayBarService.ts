import type { Market } from "@quant/shared";
import type { MarketQuoteSnapshot } from "./marketDataSyncService.ts";
import type { MarketDataBar, MarketBarCacheKey } from "./marketBarCacheService.ts";

const minuteMs = 60_000;

function getTimestamp(snapshot: MarketQuoteSnapshot) {
  const receivedAt = Date.parse(snapshot.receivedAt);
  const quoteTime = Date.parse(snapshot.quoteTime);
  return Number.isFinite(receivedAt) ? receivedAt : Number.isFinite(quoteTime) ? quoteTime : Date.now();
}

function getMarketDateKey(timestamp: number, market: Market) {
  const timeZone = market === "US" ? "America/New_York" : market === "HK" ? "Asia/Hong_Kong" : "Asia/Shanghai";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isMatchingRealtimeBar(bar: MarketDataBar, key: MarketBarCacheKey) {
  return bar.symbol === key.symbol && bar.market === key.market && bar.timeframe === key.timeframe;
}

export function retainRecentRealtimeSessions(bars: MarketDataBar[], market: Market, sessionCount = 2) {
  const sorted = [...bars].sort((left, right) => left.timestamp - right.timestamp);
  const sessionKeys = Array.from(new Set(sorted.map((bar) => getMarketDateKey(bar.timestamp, market))));
  const retainedKeys = new Set(sessionKeys.slice(Math.max(0, sessionKeys.length - Math.max(1, sessionCount))));

  return sorted.filter((bar) => retainedKeys.has(getMarketDateKey(bar.timestamp, market)));
}

export function mergeRealtimeSnapshotPointBars(
  currentBars: MarketDataBar[],
  key: MarketBarCacheKey,
  snapshot: MarketQuoteSnapshot,
): MarketDataBar[] {
  const timestamp = getTimestamp(snapshot);
  const price = snapshot.lastPrice;
  const pointBar: MarketDataBar = {
    symbol: key.symbol,
    market: key.market,
    timeframe: key.timeframe,
    timestamp,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: snapshot.volume,
    amount: snapshot.amount,
    provider: snapshot.provider,
  };

  return retainRecentRealtimeSessions(
    [
      ...currentBars.filter((bar) => isMatchingRealtimeBar(bar, key) && bar.timestamp !== timestamp),
      pointBar,
    ],
    key.market,
  );
}

export function aggregateRealtimePointBarsToMinuteCandles(bars: MarketDataBar[]): MarketDataBar[] {
  const buckets = new Map<number, MarketDataBar[]>();

  for (const bar of [...bars].sort((left, right) => left.timestamp - right.timestamp)) {
    const bucketTimestamp = Math.floor(bar.timestamp / minuteMs) * minuteMs;
    buckets.set(bucketTimestamp, [...(buckets.get(bucketTimestamp) ?? []), bar]);
  }

  return Array.from(buckets.entries()).map(([timestamp, bucketBars]) => {
    const first = bucketBars[0];
    const last = bucketBars[bucketBars.length - 1];

    return {
      symbol: first.symbol,
      market: first.market,
      timeframe: first.timeframe,
      timestamp,
      open: first.open,
      high: Math.max(...bucketBars.map((bar) => bar.high)),
      low: Math.min(...bucketBars.map((bar) => bar.low)),
      close: last.close,
      volume: last.volume,
      amount: last.amount,
      provider: last.provider,
    };
  });
}
