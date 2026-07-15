import assert from "node:assert/strict";
import test from "node:test";
import {
  createPineTranslationPlan,
  createRunnableUserStrategyDefinition,
  createUserStrategyDraftDefinition,
  preflightPineStrategySource,
  runRegisteredStrategy,
  StrategyRegistry,
  type Bar,
} from "../src/index.ts";

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

test("Runnable user strategy definition supports a minimal SMA alert subset", () => {
  const draftResult = createUserStrategyDraftDefinition({
    fileName: "sma-alert.pine",
    sourceText: `//@version=5
indicator("SMA Alert", overlay=true)
length = input.int(3, "Length")
basis = ta.sma(close, length)
plot(basis)
alertcondition(close > basis, "Close Above SMA")
`,
  });

  assert.equal(draftResult.ok, true);

  const runnableResult = createRunnableUserStrategyDefinition(draftResult.draft);
  assert.equal(runnableResult.ok, true);
  assert.equal(runnableResult.strategy.sourceType, "user");
  assert.equal(runnableResult.strategy.key, "user-sma-alert");

  const registry = new StrategyRegistry();
  registry.register(runnableResult.strategy);

  const bars: Bar[] = [
    { timestamp: 1, open: 10, high: 10, low: 10, close: 10, volume: 100 },
    { timestamp: 2, open: 11, high: 11, low: 11, close: 11, volume: 100 },
    { timestamp: 3, open: 12, high: 12, low: 12, close: 12, volume: 100 },
    { timestamp: 4, open: 14, high: 14, low: 14, close: 14, volume: 100 },
    { timestamp: 5, open: 13, high: 13, low: 13, close: 13, volume: 100 },
  ];
  const runResult = runRegisteredStrategy(registry, {
    strategyKey: "user-sma-alert",
    symbol: "AAPL",
    market: "US",
    timeframe: "15m",
    bars,
    runMode: "backtest",
    enabled: true,
  });

  assert.equal(runResult.output.render.strategyId, "user-sma-alert");
  assert.equal(runResult.output.render.elements.some((element) => element.kind === "trend-line"), true);
  assert.equal(runResult.output.signals.some((signal) => signal.label === "Close Above SMA"), true);
  assert.equal(runResult.output.metrics.signalCount, runResult.output.signals.length);
});

test("Runnable user strategy definition rejects drafts outside the ready subset", () => {
  const draftResult = createUserStrategyDraftDefinition({
    fileName: "orders.pine",
    sourceText: `//@version=5
strategy("Order Demo")
strategy.entry("L", strategy.long)
plot(close)
`,
  });

  assert.equal(draftResult.ok, true);

  const runnableResult = createRunnableUserStrategyDefinition(draftResult.draft);
  assert.equal(runnableResult.ok, false);
  assert.equal(runnableResult.error.code, "DRAFT_NOT_READY");
});

test("Pine translation blocks an unsupported reassignment instead of silently running stale logic", () => {
  const draftResult = createUserStrategyDraftDefinition({
    fileName: "unsupported-reassignment.pine",
    sourceText: `//@version=5
indicator("Unsupported reassignment", overlay=true)
ma = ta.sma(close, 2)
ma := request.security(syminfo.tickerid, "D", close)
plot(ma)
`,
  });

  assert.equal(draftResult.ok, true);
  assert.equal(draftResult.draft.translation.status, "manual-review");
  assert.ok(draftResult.draft.translation.ir.unsupportedCalls.some((item) => item.includes("request.security")));

  const runnableResult = createRunnableUserStrategyDefinition(draftResult.draft);
  assert.equal(runnableResult.ok, false);
  assert.equal(runnableResult.error.code, "DRAFT_NOT_READY");
});
