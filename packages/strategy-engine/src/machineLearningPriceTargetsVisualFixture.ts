import type { Bar } from "./contracts.ts";

export function createMachineLearningPriceTargetsVisualFixture(count = 1_800): Bar[] {
  let close = 100_400;

  return Array.from({ length: count }, (_, index) => {
    const phase = Math.floor(index / 90) % 2 === 0 ? 1 : -1;
    const acceleration = index % 90 > 68 ? 1.9 : 1;
    const spread = 28 + (index % 17) * 1.4 + Math.abs(Math.sin(index / 11)) * 18;
    close = Math.max(70_000, close + phase * 18 * acceleration + Math.sin(index / 7) * 6);

    return {
      timestamp: Date.UTC(2026, 6, 20, 0, 0) + index * 60_000,
      open: close - phase * 8,
      high: close + spread,
      low: close - spread,
      close,
      volume: 900 + (index % 47) * 28 + (index % 90 > 68 ? 1_800 : 0),
    };
  });
}
