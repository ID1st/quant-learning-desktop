import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCandleTimeLabel } from "../src/chartPrimitives.ts";

test("chart time labels use the supplied display formatter when a timestamp is available", () => {
  const candle = {
    time: "2026-01-15 23:30",
    timestamp: Date.UTC(2026, 0, 15, 15, 30),
    open: 1,
    high: 2,
    low: 1,
    close: 2,
    volume: 10,
  };

  assert.equal(
    resolveCandleTimeLabel(candle, "15m", (value) => `formatted:${value.timestamp}`),
    `formatted:${candle.timestamp}`,
  );
});

test("chart time labels retain the adapter label without a timestamp or formatter", () => {
  const candle = { time: "2026-01-15", open: 1, high: 2, low: 1, close: 2, volume: 10 };

  assert.equal(resolveCandleTimeLabel(candle, "1d"), "2026-01-15");
  assert.equal(
    resolveCandleTimeLabel(candle, "1d", () => "unused"),
    "2026-01-15",
  );
});
