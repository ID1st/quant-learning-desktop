import type { Market, Timeframe } from "@quant/shared";

export interface ChartWarmupSymbol {
  readonly market: Market;
  readonly symbol: string;
}

export interface ChartWarmupTask extends ChartWarmupSymbol {
  readonly timeframe: Timeframe;
  readonly priority: "active" | "background";
}

const warmupTimeframes: readonly Timeframe[] = ["1d", "1w", "realtime"];
const cacheMaxAgeMs: Record<Timeframe, number> = {
  realtime: 45_000,
  "1m": 45_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "1d": 10 * 60_000,
  "1w": 6 * 60 * 60_000,
};

export function hasSufficientHistoricalChartCache(timeframe: Timeframe, barCount: number) {
  if (timeframe === "1d") {
    return barCount >= 60;
  }

  if (timeframe === "1w") {
    return barCount >= 26;
  }

  return true;
}

export function createChartWatchlistWarmupPlan(
  watchlist: readonly ChartWarmupSymbol[],
  activeSymbol: ChartWarmupSymbol,
): ChartWarmupTask[] {
  const activeKey = getSymbolKey(activeSymbol);
  const unique = Array.from(new Map(watchlist.map((item) => [getSymbolKey(item), item])).values());

  return unique
    .sort((left, right) => Number(getSymbolKey(right) === activeKey) - Number(getSymbolKey(left) === activeKey))
    .flatMap((item) =>
      warmupTimeframes.map((timeframe) => ({
        ...item,
        timeframe,
        priority: getSymbolKey(item) === activeKey ? ("active" as const) : ("background" as const),
      })),
    );
}

export function isChartWarmupCacheFresh(timeframe: Timeframe, updatedAt: string | undefined, now = Date.now()) {
  if (!updatedAt) return false;
  const updatedAtMs = Date.parse(updatedAt);
  return Number.isFinite(updatedAtMs) && now - updatedAtMs <= cacheMaxAgeMs[timeframe];
}

function getSymbolKey(item: ChartWarmupSymbol) {
  return `${item.market}:${item.symbol}`;
}
