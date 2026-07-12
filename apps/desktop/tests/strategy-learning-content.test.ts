import assert from "node:assert/strict";
import test from "node:test";
import { strategyLearningEntries } from "../src/features/learning/strategyLearningContent.ts";

test("strategy learning content covers the built-in strategies and indicators", () => {
  assert.deepEqual(strategyLearningEntries.map((entry) => entry.id), ["utorb", "trend-targets", "sma", "ema", "boll"]);
  assert.ok(strategyLearningEntries.every((entry) => entry.sections.length >= 3 && entry.risks.length > 0));
});
