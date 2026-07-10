import test from "node:test";
import assert from "node:assert/strict";

import {
  createChartLoadState,
  getMinimumRenderableBarCount,
  hasRenderableChartData,
} from "../src/features/marketData/chartDataReadinessService.ts";

test("chart readiness withholds sparse bars from the chart canvas", () => {
  assert.equal(getMinimumRenderableBarCount("realtime"), 30);
  assert.equal(getMinimumRenderableBarCount("1d"), 20);
  assert.equal(getMinimumRenderableBarCount("1w"), 12);
  assert.equal(hasRenderableChartData("1d", 1), false);
  assert.equal(hasRenderableChartData("1d", 20), true);
});

test("chart readiness creates a Chinese loading message for the current stage", () => {
  const state = createChartLoadState("history", "AAPL", "realtime", 4);

  assert.equal(state.stage, "history");
  assert.equal(state.cachedBarCount, 4);
  assert.match(state.message, /正在同步 AAPL 分时数据/);
});
