import type { Market } from "@quant/shared";
import type { MarketQuoteSnapshot } from "./marketDataSyncService.ts";
import type { MarketDataBar, MarketBarCacheKey } from "./marketBarCacheService.ts";
import { isHistoricalMarketDataProviderId, isLiveMarketDataProviderId } from "./marketDataProviderIds.ts";

const minuteMs = 60_000;

function getTimestamp(snapshot: MarketQuoteSnapshot) {
  const quoteTime = Date.parse(snapshot.quoteTime);
  const receivedAt = Date.parse(snapshot.receivedAt);
  return Number.isFinite(quoteTime) ? quoteTime : Number.isFinite(receivedAt) ? receivedAt : Date.now();
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

export function retainRecentRealtimeSessions(bars: MarketDataBar[], market: Market, sessionCount = 5) {
  const sorted = [...bars].sort((left, right) => left.timestamp - right.timestamp);
  const sessionKeys = Array.from(new Set(sorted.map((bar) => getMarketDateKey(bar.timestamp, market))));
  const retainedKeys = new Set(sessionKeys.slice(Math.max(0, sessionKeys.length - Math.max(1, sessionCount))));

  return sorted.filter((bar) => retainedKeys.has(getMarketDateKey(bar.timestamp, market)));
}

export function mergeRealtimeSnapshotMinuteBar(
  currentBars: MarketDataBar[],
  key: MarketBarCacheKey,
  snapshot: MarketQuoteSnapshot,
): MarketDataBar[] {
  const timestamp = Math.floor(getTimestamp(snapshot) / minuteMs) * minuteMs;
  const price = snapshot.lastPrice;
  const existingBar = currentBars.find((bar) => isMatchingRealtimeBar(bar, key) && bar.timestamp === timestamp);
  const minuteBar: MarketDataBar = {
    symbol: key.symbol,
    market: key.market,
    timeframe: key.timeframe,
    timestamp,
    open: existingBar?.open ?? price,
    high: Math.max(existingBar?.high ?? price, price),
    low: Math.min(existingBar?.low ?? price, price),
    close: price,
    volume: snapshot.volume,
    amount: snapshot.amount,
    provider: snapshot.provider,
  };

  return retainRecentRealtimeSessions(
    [
      ...currentBars.filter((bar) => isMatchingRealtimeBar(bar, key) && bar.timestamp !== timestamp),
      minuteBar,
    ],
    key.market,
  );
}

export function mergeHistoricalRealtimeBarsWithLiveBars(
  historicalBars: MarketDataBar[],
  currentBars: MarketDataBar[],
  key: MarketBarCacheKey,
): MarketDataBar[] {
  const matchingHistory = historicalBars.filter((bar) => isMatchingRealtimeBar(bar, key));
  const earliestHistoricalTimestamp = matchingHistory.reduce((earliest, bar) => Math.min(earliest, bar.timestamp), Number.POSITIVE_INFINITY);
  const latestHistoricalTimestamp = matchingHistory.reduce((latest, bar) => Math.max(latest, bar.timestamp), Number.NEGATIVE_INFINITY);
  const retainedPreviousSessionBars = currentBars.filter(
    (bar) => isMatchingRealtimeBar(bar, key) && bar.timestamp < earliestHistoricalTimestamp,
  );
  const retainedLiveBars = currentBars.filter(
    (bar) => isMatchingRealtimeBar(bar, key) && isLiveMarketDataProviderId(bar.provider) && bar.timestamp > latestHistoricalTimestamp,
  );

  return retainRecentRealtimeSessions([...retainedPreviousSessionBars, ...matchingHistory, ...retainedLiveBars], key.market);
}

export function analyzeRealtimeHistoryGap(
  bars: MarketDataBar[],
  key: MarketBarCacheKey,
  now = Date.now(),
  warningThresholdMs = 5 * minuteMs,
) {
  const matchingBars = bars.filter((bar) => isMatchingRealtimeBar(bar, key));
  const latestHistoricalTimestamp = matchingBars
    .filter((bar) => isHistoricalMarketDataProviderId(bar.provider))
    .reduce((latest, bar) => Math.max(latest, bar.timestamp), Number.NEGATIVE_INFINITY);
  const latestLiveTimestamp = matchingBars
    .filter((bar) => isLiveMarketDataProviderId(bar.provider))
    .reduce((latest, bar) => Math.max(latest, bar.timestamp), Number.NEGATIVE_INFINITY);
  const comparisonTimestamp = Number.isFinite(latestLiveTimestamp) ? latestLiveTimestamp : now;
  const gapMs = Number.isFinite(latestHistoricalTimestamp) ? Math.max(0, comparisonTimestamp - latestHistoricalTimestamp) : 0;

  return {
    latestHistoricalTimestamp: Number.isFinite(latestHistoricalTimestamp) ? latestHistoricalTimestamp : null,
    latestLiveTimestamp: Number.isFinite(latestLiveTimestamp) ? latestLiveTimestamp : null,
    gapMs,
    hasGap: gapMs > warningThresholdMs,
    isBridgedByLiveData: Number.isFinite(latestLiveTimestamp) && latestLiveTimestamp > latestHistoricalTimestamp,
  };
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
