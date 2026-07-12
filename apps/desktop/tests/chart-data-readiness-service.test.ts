import test from "node:test";
import assert from "node:assert/strict";

import {
  createChartLoadState,
  getMinimumRenderableBarCount,
  hasRenderableChartData,
} from "../src/features/marketData/chartDataReadinessService.ts";

test("chart readiness keeps intraday protection without hiding valid short historical series", () => {
  assert.equal(getMinimumRenderableBarCount("realtime"), 30);
  assert.equal(getMinimumRenderableBarCount("1d"), 2);
  assert.equal(getMinimumRenderableBarCount("1w"), 2);
  assert.equal(hasRenderableChartData("1d", 1), false);
  assert.equal(hasRenderableChartData("1d", 2), true);
  assert.equal(hasRenderableChartData("1w", 19), true);
  assert.equal(hasRenderableChartData("realtime", 19), false);
});

test("chart readiness creates a Chinese loading message for the current stage", () => {
  const state = createChartLoadState("history", "AAPL", "realtime", 4);

  assert.equal(state.stage, "history");
  assert.equal(state.cachedBarCount, 4);
  assert.match(state.message, /正在同步 AAPL 分时数据/);
});
