import type { Market, Timeframe } from "@quant/shared";
import { getIntradayHistoryWindow } from "./intradayHistoryService.ts";

export type MarketDataRuntimeEventKind =
  | "cache-hit"
  | "cache-stale"
  | "sync-started"
  | "sync-completed"
  | "fallback"
  | "rate-limited"
  | "delayed-gap"
  | "market-closed"
  | "cache-retained"
  | "data-invalid"
  | "error";

export interface MarketDataRuntimeEvent {
  readonly kind: MarketDataRuntimeEventKind;
  readonly timestamp: string;
  readonly message: string;
  readonly detail?: string;
}

export interface MarketCacheFreshness {
  readonly state: "fresh" | "stale" | "missing";
  readonly ageMs?: number;
  readonly maxAgeMs: number;
}

const maximumCacheAgeMs: Record<Timeframe, number> = {
  realtime: 45_000,
  "1m": 45_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "1d": 10 * 60_000,
  "1w": 6 * 60 * 60_000,
};

const runtimeEventLabels: Record<MarketDataRuntimeEventKind, string> = {
  "cache-hit": "缓存命中",
  "cache-stale": "缓存过期",
  "sync-started": "开始同步",
  "sync-completed": "同步完成",
  fallback: "数据源降级",
  "rate-limited": "请求受限",
  "delayed-gap": "数据缺口",
  "market-closed": "市场收盘",
  "cache-retained": "保留缓存",
  "data-invalid": "行情数据异常",
  error: "同步失败",
};

export function formatMarketDataRuntimeEventKind(kind: MarketDataRuntimeEventKind) {
  return runtimeEventLabels[kind];
}

export function evaluateMarketCacheFreshness(
  timeframe: Timeframe,
  updatedAt: string | undefined,
  now = Date.now(),
): MarketCacheFreshness {
  const maxAgeMs = maximumCacheAgeMs[timeframe];
  const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  if (!Number.isFinite(updatedAtMs)) return { state: "missing", maxAgeMs };
  const ageMs = Math.max(0, now - updatedAtMs);
  return { state: ageMs <= maxAgeMs ? "fresh" : "stale", ageMs, maxAgeMs };
}

export function getMarketRuntimeSessionStatus(market: Market, now = Date.now()) {
  const window = getIntradayHistoryWindow(market, now);
  return {
    isOpen: window.isMarketOpen,
    shouldPollRealtime: window.isMarketOpen,
    lastSessionEnd: window.endTime,
  };
}

export function appendMarketDataRuntimeEvent(
  timeline: readonly MarketDataRuntimeEvent[],
  event: MarketDataRuntimeEvent,
  maximumEntries = 24,
): MarketDataRuntimeEvent[] {
  const eventTime = Date.parse(event.timestamp);
  const hasRecentDuplicate = timeline.some((entry) => {
    if (entry.kind !== event.kind || entry.message !== event.message) return false;
    const entryTime = Date.parse(entry.timestamp);
    return (
      Number.isFinite(eventTime) &&
      Number.isFinite(entryTime) &&
      Math.abs(eventTime - entryTime) <= 5_000
    );
  });
  if (hasRecentDuplicate) return [...timeline];
  return [event, ...timeline].slice(0, Math.max(1, maximumEntries));
}
