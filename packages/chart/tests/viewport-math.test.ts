import assert from "node:assert/strict";
import test from "node:test";
import { clampChartVisibleRange, getScaledPriceRange, panChartVisibleRange, zoomChartVisibleRange } from "../src/viewportMath.ts";

test("chart visible range clamps into available candles", () => {
  assert.deepEqual(clampChartVisibleRange({ start: -10, end: 8 }, 100), { start: 0, end: 18 });
  assert.deepEqual(clampChartVisibleRange({ start: 96, end: 140 }, 100), { start: 56, end: 100 });
});

test("chart zoom keeps the cursor anchor near the same candle", () => {
  const zoomedIn = zoomChartVisibleRange({ start: 20, end: 80 }, 100, 0.5, 0.5);
  assert.deepEqual(zoomedIn, { start: 35, end: 65 });

  const zoomedOut = zoomChartVisibleRange(zoomedIn, 100, 0.5, 2);
  assert.deepEqual(zoomedOut, { start: 20, end: 80 });
});

test("chart pan keeps the current window size and stops at edges", () => {
  assert.deepEqual(panChartVisibleRange({ start: 20, end: 50 }, 100, 10), { start: 30, end: 60 });
  assert.deepEqual(panChartVisibleRange({ start: 20, end: 50 }, 100, -50), { start: 0, end: 30 });
  assert.deepEqual(panChartVisibleRange({ start: 80, end: 100 }, 100, 25), { start: 80, end: 100 });
});

test("scaled price range keeps price center and changes vertical density", () => {
  assert.deepEqual(getScaledPriceRange(100, 120, 1), { min: 100, max: 120 });
  assert.deepEqual(getScaledPriceRange(100, 120, 0.5), { min: 105, max: 115 });
  assert.deepEqual(getScaledPriceRange(100, 120, 2), { min: 90, max: 130 });
});
