import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMarketDataRuntimeEvent,
  evaluateMarketCacheFreshness,
  getMarketRuntimeSessionStatus,
} from "../src/features/marketData/marketDataRuntimeStatus.ts";

test("market cache freshness distinguishes fresh stale and missing entries", () => {
  const now = Date.UTC(2026, 6, 13, 4, 0, 0);
  assert.equal(evaluateMarketCacheFreshness("1d", "2026-07-13T03:55:00.000Z", now).state, "fresh");
  assert.equal(evaluateMarketCacheFreshness("1d", "2026-07-13T03:30:00.000Z", now).state, "stale");
  assert.equal(evaluateMarketCacheFreshness("1w", undefined, now).state, "missing");
});

test("market runtime session marks closed sessions without scheduling live refresh", () => {
  const saturdayBeijing = Date.UTC(2026, 6, 11, 4, 0, 0);
  const status = getMarketRuntimeSessionStatus("CN", saturdayBeijing);
  assert.equal(status.isOpen, false);
  assert.equal(status.shouldPollRealtime, false);
});

test("runtime events dedupe immediate repeats and retain the latest entries", () => {
  const first = {
    kind: "cache-hit" as const,
    timestamp: "2026-07-13T04:00:00.000Z",
    message: "命中日线缓存",
  };
  const timeline = appendMarketDataRuntimeEvent([], first, 2);
  assert.equal(appendMarketDataRuntimeEvent(timeline, first, 2).length, 1);
  const next = appendMarketDataRuntimeEvent(
    timeline,
    { kind: "fallback" as const, timestamp: "2026-07-13T04:01:00.000Z", message: "已降级" },
    2,
  );
  assert.deepEqual(
    next.map((entry) => entry.kind),
    ["fallback", "cache-hit"],
  );
  const interleaved = appendMarketDataRuntimeEvent(
    next,
    { kind: "cache-hit", timestamp: "2026-07-13T04:00:03.000Z", message: "命中日线缓存" },
    3,
  );
  assert.equal(interleaved.length, 2);
});
