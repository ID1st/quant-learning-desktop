import assert from "node:assert/strict";
import test from "node:test";
import { preflightPineStrategySource } from "../src/index.ts";

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
  assert.equal(result.summary.inputCount, 1);
  assert.equal(result.summary.plotCount, 1);
  assert.equal(result.summary.alertCount, 1);
  assert.equal(result.summary.canCreateDraft, true);
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
  assert.equal(result.summary.warnings.some((warning) => warning.includes("strategy.entry")), true);
});
