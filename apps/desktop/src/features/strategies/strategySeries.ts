import type { Bar } from "@quant/strategy-engine";
import type { Market, Timeframe } from "@quant/shared";
import { getSessionSegments, resolveTradingSessionAt } from "../marketData/marketCalendar.ts";

const aggregationMinutes: Partial<Record<Timeframe, number>> = {
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
};

export interface AggregateBarsInput {
  bars: readonly Bar[];
  market: Market;
  timeframe: "5m" | "15m" | "30m" | "1h";
  asOfTimestamp: number;
}

export function aggregateBarsToTimeframe(input: AggregateBarsInput): Bar[] {
  const minutes = aggregationMinutes[input.timeframe] ?? 1;
  const interval = minutes * 60_000;
  const buckets = new Map<
    string,
    {
      bar: Bar;
      count: number;
      expectedCount: number;
      endTime: number;
    }
  >();
  let cachedSegments: ReturnType<typeof getSessionSegments> | null = null;

  [...input.bars]
    .sort((left, right) => left.timestamp - right.timestamp)
    .forEach((bar) => {
      if (
        !cachedSegments ||
        bar.timestamp < cachedSegments[0]!.startTime ||
        bar.timestamp >= cachedSegments.at(-1)!.endTime
      ) {
        const resolution = resolveTradingSessionAt(input.market, bar.timestamp);
        cachedSegments =
          resolution.ok && resolution.session ? getSessionSegments(resolution.session) : null;
      }
      const segmentIndex =
        cachedSegments?.findIndex(
          (candidate) => bar.timestamp >= candidate.startTime && bar.timestamp < candidate.endTime,
        ) ?? -1;
      const segment = segmentIndex >= 0 ? cachedSegments?.[segmentIndex] : null;
      if (!segment) {
        return;
      }
      const bucketStart =
        segment.startTime + Math.floor((bar.timestamp - segment.startTime) / interval) * interval;
      const bucketEnd = Math.min(bucketStart + interval, segment.endTime);
      const key = `${segmentIndex}:${bucketStart}`;
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          bar: { ...bar, timestamp: bucketStart },
          count: 1,
          expectedCount: Math.ceil((bucketEnd - bucketStart) / 60_000),
          endTime: bucketEnd,
        });
        return;
      }
      existing.bar.high = Math.max(existing.bar.high, bar.high);
      existing.bar.low = Math.min(existing.bar.low, bar.low);
      existing.bar.close = bar.close;
      existing.bar.volume += bar.volume;
      existing.count += 1;
    });

  return [...buckets.values()]
    .filter(
      (bucket) => bucket.count >= bucket.expectedCount && input.asOfTimestamp >= bucket.endTime,
    )
    .map((bucket) => bucket.bar);
}

export function createStrategySeriesByTimeframe(input: {
  primaryBars: readonly Bar[];
  primaryTimeframe: Timeframe;
  market: Market;
  asOfTimestamp: number;
  dailyBars?: readonly Bar[];
  weeklyBars?: readonly Bar[];
}): Partial<Record<Timeframe, readonly Bar[]>> {
  const result: Partial<Record<Timeframe, readonly Bar[]>> = {
    [input.primaryTimeframe]: input.primaryBars,
  };

  if (input.primaryTimeframe === "realtime" || input.primaryTimeframe === "1m") {
    result["1m"] = input.primaryBars;
    result["5m"] = aggregateBarsToTimeframe({
      ...input,
      bars: input.primaryBars,
      timeframe: "5m",
    });
    result["15m"] = aggregateBarsToTimeframe({
      ...input,
      bars: input.primaryBars,
      timeframe: "15m",
    });
    result["30m"] = aggregateBarsToTimeframe({
      ...input,
      bars: input.primaryBars,
      timeframe: "30m",
    });
    result["1h"] = aggregateBarsToTimeframe({
      ...input,
      bars: input.primaryBars,
      timeframe: "1h",
    });
  }
  if (input.dailyBars) {
    result["1d"] = input.dailyBars;
  }
  if (input.weeklyBars) {
    result["1w"] = input.weeklyBars;
  }
  return result;
}
