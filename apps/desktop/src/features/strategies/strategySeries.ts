import type { Bar } from "@quant/strategy-engine";
import type { Timeframe } from "@quant/shared";

const aggregationMinutes: Partial<Record<Timeframe, number>> = {
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
};

export function aggregateBarsToTimeframe(bars: readonly Bar[], timeframe: "5m" | "15m" | "30m" | "1h"): Bar[] {
  const minutes = aggregationMinutes[timeframe] ?? 1;
  const interval = minutes * 60_000;
  const buckets = new Map<number, { bar: Bar; count: number }>();

  [...bars]
    .sort((left, right) => left.timestamp - right.timestamp)
    .forEach((bar) => {
      const timestamp = Math.floor(bar.timestamp / interval) * interval;
      const existing = buckets.get(timestamp);
      if (!existing) {
        buckets.set(timestamp, { bar: { ...bar, timestamp }, count: 1 });
        return;
      }
      existing.bar.high = Math.max(existing.bar.high, bar.high);
      existing.bar.low = Math.min(existing.bar.low, bar.low);
      existing.bar.close = bar.close;
      existing.bar.volume += bar.volume;
      existing.count += 1;
    });

  return [...buckets.values()]
    .filter((bucket) => bucket.count >= minutes)
    .map((bucket) => bucket.bar);
}

export function createStrategySeriesByTimeframe(input: {
  primaryBars: readonly Bar[];
  primaryTimeframe: Timeframe;
  dailyBars?: readonly Bar[];
  weeklyBars?: readonly Bar[];
}): Partial<Record<Timeframe, readonly Bar[]>> {
  const result: Partial<Record<Timeframe, readonly Bar[]>> = {
    [input.primaryTimeframe]: input.primaryBars,
  };

  if (input.primaryTimeframe === "realtime" || input.primaryTimeframe === "1m") {
    result["1m"] = input.primaryBars;
    result["5m"] = aggregateBarsToTimeframe(input.primaryBars, "5m");
    result["15m"] = aggregateBarsToTimeframe(input.primaryBars, "15m");
    result["30m"] = aggregateBarsToTimeframe(input.primaryBars, "30m");
    result["1h"] = aggregateBarsToTimeframe(input.primaryBars, "1h");
  }
  if (input.dailyBars) {
    result["1d"] = input.dailyBars;
  }
  if (input.weeklyBars) {
    result["1w"] = input.weeklyBars;
  }

  return result;
}
