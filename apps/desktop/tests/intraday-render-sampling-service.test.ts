import assert from "node:assert/strict";
import test from "node:test";
import { sampleIntradayBarsForRendering } from "../src/features/marketData/intradayRenderSamplingService.ts";

test("intraday render sampling preserves the original endpoints and bucket extremes", () => {
  const bars = Array.from({ length: 20 }, (_, index) => ({ symbol: "AAPL.US", market: "US" as const, timeframe: "realtime" as const, timestamp: index, open: 100, high: index === 7 ? 180 : 101, low: index === 12 ? 20 : 99, close: 100, volume: 1, provider: "stock-sdk" as const }));
  const sampled = sampleIntradayBarsForRendering(bars, 4);
  assert.equal(sampled[0]?.timestamp, 0);
  assert.equal(sampled.at(-1)?.timestamp, 19);
  assert.equal(sampled.some((bar) => bar.timestamp === 7), true);
  assert.equal(sampled.some((bar) => bar.timestamp === 12), true);
});
