import type { MarketDataBar } from "./marketBarCacheService.ts";

export function sampleIntradayBarsForRendering(bars: readonly MarketDataBar[], maxPoints = 1_200): MarketDataBar[] {
  if (bars.length <= maxPoints) return [...bars];

  const bucketSize = Math.ceil(bars.length / maxPoints);
  const sampled: MarketDataBar[] = [];
  for (let start = 0; start < bars.length; start += bucketSize) {
    const bucket = bars.slice(start, Math.min(bars.length, start + bucketSize));
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    if (!first || !last) continue;
    const high = bucket.reduce((current, bar) => bar.high > current.high ? bar : current, first);
    const low = bucket.reduce((current, bar) => bar.low < current.low ? bar : current, first);
    for (const bar of [first, low, high, last]) {
      if (!sampled.some((item) => item.timestamp === bar.timestamp)) sampled.push(bar);
    }
  }
  return sampled.sort((left, right) => left.timestamp - right.timestamp);
}
