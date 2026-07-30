import type { Bar } from "./index.ts";

/**
 * Deterministic OHLC fixture for SMC visual regression.
 * It deliberately alternates expanding swing highs/lows and ends with an
 * unfilled bullish FVG so one frame can exercise both bullish and bearish
 * BOS/CHoCH, equal levels, order blocks, FVG and premium/discount zones.
 */
export function createSmcVisualFixture(): Bar[] {
  const anchors = [100, 112, 104, 112.08, 92, 108, 88, 120, 96, 124, 90, 124.08, 88.5];
  const segmentLength = 20;
  const bars: Bar[] = [];
  const start = Date.UTC(2025, 0, 2, 14, 30);
  bars.push({
    timestamp: start,
    open: anchors[0] - 0.2,
    high: anchors[0] + 0.55,
    low: anchors[0] - 0.55,
    close: anchors[0],
    volume: 10_000,
  });

  for (let segment = 0; segment < anchors.length - 1; segment += 1) {
    const from = anchors[segment];
    const to = anchors[segment + 1];
    for (let offset = 1; offset <= segmentLength; offset += 1) {
      const index = bars.length;
      const progress = offset / segmentLength;
      const close =
        from +
        (to - from) * progress +
        (offset === segmentLength ? 0 : Math.sin(offset / 2) * 0.18);
      const open = bars[index - 1].close;
      const endpointHighWick = offset === segmentLength && to > from ? 0.9 : 0.55;
      const endpointLowWick = offset === segmentLength && to < from ? 0.9 : 0.55;
      bars.push({
        timestamp: start + index * 60_000,
        open,
        high: Math.max(open, close) + endpointHighWick,
        low: Math.min(open, close) - endpointLowWick,
        close,
        volume: 10_000 + (index % 13) * 350,
      });
    }
  }

  const last = bars.at(-1)!;
  bars.push({
    timestamp: last.timestamp + 60_000,
    open: last.close,
    high: last.high,
    low: last.low,
    close: last.close,
    volume: 12_000,
  });
  bars.push({
    timestamp: last.timestamp + 120_000,
    open: last.close,
    high: last.close + 3.7,
    low: last.close - 0.2,
    close: last.close + 3.5,
    volume: 18_000,
  });
  bars.push({
    timestamp: last.timestamp + 180_000,
    open: last.close + 3.9,
    high: last.close + 4.5,
    low: last.close + 3.8,
    close: last.close + 4.3,
    volume: 20_000,
  });

  return bars;
}
