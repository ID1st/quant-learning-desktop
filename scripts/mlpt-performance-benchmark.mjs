import { performance } from "node:perf_hooks";

import {
  createPresetStrategyRegistry,
  runRegisteredStrategy,
} from "../packages/strategy-engine/src/index.ts";

const registry = createPresetStrategyRegistry();
const start = Date.UTC(2024, 0, 1);
const bars = Array.from({ length: 5_000 }, (_, index) => {
  const close = 100 + index * 0.004 + Math.sin(index / 8) * 5 + Math.sin(index / 37) * 2;
  return {
    timestamp: start + index * 60_000,
    open: close - Math.sin(index / 3) * 0.5,
    high: close + 1 + (index % 5) * 0.03,
    low: close - 1 - (index % 7) * 0.02,
    close,
    volume: 1_000 + (index % 100) * 10,
  };
});
const durations = [];
let output;

for (let iteration = 0; iteration < 6; iteration += 1) {
  const startedAt = performance.now();
  output = runRegisteredStrategy(registry, {
    strategyKey: "machine-learning-price-targets",
    symbol: "AAPL.US",
    market: "US",
    timeframe: "realtime",
    bars,
    runMode: "realtime",
    enabled: true,
  }).output;
  durations.push(performance.now() - startedAt);
}

console.log(JSON.stringify({
  durationsMs: durations.map((duration) => Number(duration.toFixed(2))),
  warmMedianMs: Number(
    durations
      .slice(1)
      .sort((left, right) => left - right)[Math.floor((durations.length - 1) / 2)]
      .toFixed(2),
  ),
  elements: output.render.elements.length,
  trainingSamples: output.metrics.trainingSampleCount,
}));
