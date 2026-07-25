import assert from "node:assert/strict";
import test from "node:test";
import { strategyLearningEntries } from "../src/features/learning/strategyLearningContent.ts";

test("strategy learning content covers the built-in strategies and indicators", () => {
  assert.deepEqual(strategyLearningEntries.map((entry) => entry.id), [
    "utorb",
    "trend-targets",
    "smart-money-concepts",
    "machine-learning-price-targets",
    "sma",
    "ema",
    "boll",
  ]);
  assert.ok(strategyLearningEntries.every((entry) => entry.sections.length >= 3 && entry.risks.length > 0));
});

test("ML price target learning entry explains RBF training, warmup, and indicator boundary", () => {
  const entry = strategyLearningEntries.find((item) => item.id === "machine-learning-price-targets");

  assert.ok(entry);
  assert.equal(entry.category, "strategy");
  assert.deepEqual(entry.timeframes, ["实时 1 分钟"]);
  assert.ok(entry.sections.some((section) => section.content.includes("RBF") && section.content.includes("8")));
  assert.ok(entry.parameters.some((parameter) => parameter.description.includes("1,000")));
  assert.ok(entry.chartOutputs.includes("右上角指标统计表"));
  assert.ok(entry.risks.some((risk) => risk.includes("不生成订单") && risk.includes("PnL")));
  assert.equal(entry.source?.license, "未声明软件许可证");
});

test("SMC learning entry explains its structure layers, warmup, and indicator boundary", () => {
  const entry = strategyLearningEntries.find((item) => item.id === "smart-money-concepts");

  assert.ok(entry);
  assert.equal(entry.category, "strategy");
  assert.equal(entry.placement, "主图叠加");
  assert.deepEqual(entry.workspaceAction, { label: "在超级图表中配置", route: "chart" });
  assert.equal(entry.source?.license, "CC BY-NC-SA 4.0");
  assert.ok(entry.sections.some((section) => section.content.includes("BOS") && section.content.includes("CHoCH")));
  assert.ok(entry.parameters.some((parameter) => parameter.description.includes("200 根")));
  assert.ok(entry.chartOutputs.includes("内部 / 摆动 BOS 与 CHoCH"));
  assert.ok(entry.risks.some((risk) => risk.includes("不生成交易") && risk.includes("PnL")));
});
