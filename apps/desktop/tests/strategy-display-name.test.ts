import assert from "node:assert/strict";
import test from "node:test";
import { getStrategyDisplayName } from "../src/features/strategies/strategyDisplayName.ts";

const cases = [
  ["utorb", "UTORB [LuxAlgo]", "开盘区间观察", "Opening Range Monitor"],
  ["trend-targets", "Trend Targets [LuxAlgo]", "趋势路径参考", "Trend Path Reference"],
  [
    "smart-money-concepts",
    "Smart Money Concepts [LuxAlgo]",
    "市场结构图谱",
    "Market Structure Map",
  ],
  [
    "machine-learning-price-targets",
    "Machine Learning Price Target Prediction Signals [AlgoAlpha]",
    "数据驱动走势研究",
    "Data-Driven Movement Study",
  ],
] as const;

test("built-in strategy names resolve from stable keys in both languages", () => {
  for (const [key, fallback, zhName, enName] of cases) {
    assert.equal(getStrategyDisplayName({ key, name: fallback }, "zh-CN"), zhName);
    assert.equal(getStrategyDisplayName({ key, name: fallback }, "en-US"), enName);
  }
});

test("unknown and plugin strategies retain their original display name", () => {
  assert.equal(
    getStrategyDisplayName({ key: "example-plugin", name: "Example Strategy" }, "en-US"),
    "Example Strategy",
  );
});

test("display names avoid return, profit, prediction and trading-signal claims", () => {
  const prohibited = /收益|利润|预测|买卖信号|稳赚|profit|return|prediction|trading signal/iu;
  for (const [key, fallback] of cases) {
    assert.doesNotMatch(getStrategyDisplayName({ key, name: fallback }, "zh-CN"), prohibited);
    assert.doesNotMatch(getStrategyDisplayName({ key, name: fallback }, "en-US"), prohibited);
  }
});
