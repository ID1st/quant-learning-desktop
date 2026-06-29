import assert from "node:assert/strict";
import test from "node:test";
import { createPineTranslationPlan, createUserStrategyDraftDefinition, preflightPineStrategySource } from "../src/index.ts";

test("Pine preflight summarizes a valid indicator script", () => {
  const result = preflightPineStrategySource({
    fileName: "demo.pine",
    sourceText: `//@version=5
indicator("Demo", overlay=true)
length = input.int(20, "Length")
plot(close)
alertcondition(close > open, "Up")
`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.version, "5");
  assert.equal(result.summary.declaration, "indicator");
  assert.equal(result.summary.title, "Demo");
  assert.equal(result.summary.overlay, true);
  assert.equal(result.summary.inputCount, 1);
  assert.equal(result.summary.plotCount, 1);
  assert.equal(result.summary.alertCount, 1);
  assert.equal(result.summary.canCreateDraft, true);
  assert.equal(result.summary.translationPlan.status, "ready");
  assert.deepEqual(result.summary.inputs, [{ key: "length", type: "int", label: "Length" }]);
});

test("Pine preflight rejects empty source", () => {
  const result = preflightPineStrategySource({ fileName: "empty.pine", sourceText: " " });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "EMPTY_SOURCE");
});

test("Pine preflight reports unsupported order calls as warnings", () => {
  const result = preflightPineStrategySource({
    fileName: "orders.pine",
    sourceText: `//@version=5
strategy("Order Demo")
strategy.entry("L", strategy.long)
plot(close)
`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.declaration, "strategy");
  assert.equal(result.summary.canCreateDraft, false);
  assert.equal(result.summary.translationPlan.status, "manual-review");
  assert.equal(result.summary.warnings.some((warning) => warning.includes("strategy.entry")), true);
});

test("Pine preflight marks library scripts as unsupported", () => {
  const result = preflightPineStrategySource({
    fileName: "helpers.pine",
    sourceText: `//@version=5
library("Helpers")
export double(x) => x * 2
`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.declaration, "library");
  assert.equal(result.summary.canCreateDraft, false);
  assert.equal(result.summary.translationPlan.status, "unsupported");
});

test("Pine translation plan creates a supported subset IR", () => {
  const result = createPineTranslationPlan({
    fileName: "demo.pine",
    sourceText: `//@version=5
indicator("Demo", overlay=true)
length = input.int(20, "Length")
enabled = input.bool(true, "Enabled")
plot(close)
plotshape(close > open)
alertcondition(close > open, "Up")
`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.status, "ready");
  assert.equal(result.plan.ir.declaration.title, "Demo");
  assert.equal(result.plan.ir.inputs.length, 2);
  assert.deepEqual(
    result.plan.ir.visuals.map((visual) => visual.kind),
    ["plot", "plotshape"],
  );
  assert.equal(result.plan.ir.alerts.length, 1);
  assert.equal(result.plan.ir.unsupportedCalls.length, 0);
});

test("Pine translation plan requires manual review for strategy order calls", () => {
  const result = createPineTranslationPlan({
    fileName: "orders.pine",
    sourceText: `//@version=5
strategy("Order Demo")
strategy.entry("L", strategy.long)
plot(close)
`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.status, "manual-review");
  assert.deepEqual(result.plan.ir.unsupportedCalls, ["strategy.entry"]);
});

test("User strategy draft definition maps a ready Pine plan without becoming runnable", () => {
  const result = createUserStrategyDraftDefinition({
    fileName: "demo.pine",
    sourceText: `//@version=5
indicator("Demo", overlay=true)
length = input.int(20, "Length")
enabled = input.bool(true, "Enabled")
plot(close)
alertcondition(close > open, "Up")
`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.draft.key, "user-demo");
  assert.equal(result.draft.name, "Demo");
  assert.equal(result.draft.sourceType, "user");
  assert.equal(result.draft.runnable, false);
  assert.equal(result.draft.translation.status, "ready");
  assert.deepEqual(
    result.draft.parameterSchema.map((parameter) => [parameter.key, parameter.type, parameter.defaultValue]),
    [
      ["length", "number", 20],
      ["enabled", "boolean", true],
    ],
  );
});

test("User strategy draft definition preserves manual review status", () => {
  const result = createUserStrategyDraftDefinition({
    fileName: "orders.pine",
    sourceText: `//@version=5
strategy("Order Demo")
strategy.entry("L", strategy.long)
plot(close)
`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.draft.runnable, false);
  assert.equal(result.draft.translation.status, "manual-review");
  assert.deepEqual(result.draft.translation.ir.unsupportedCalls, ["strategy.entry"]);
});
