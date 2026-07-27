import assert from "node:assert/strict";
import test from "node:test";
import {
  builtInChartIndicatorDefinitions,
  createChartIndicatorEvaluations,
  createChartIndicatorRegistry,
  defaultChartIndicatorSettings,
  getIndicatorInstance,
  resolveIndicatorConvention,
  sanitizeChartIndicatorSettings,
  setIndicatorEnabled,
  updateIndicatorInstance,
} from "../src/features/chartIndicators/chartIndicators.ts";

test("new users start with every indicator disabled", () => {
  assert.equal(
    builtInChartIndicatorDefinitions.every((definition) =>
      getIndicatorInstance(defaultChartIndicatorSettings, definition.id, definition).enabled === false),
    true,
  );
});

test("the registry contains all main and secondary indicators in menu order", () => {
  assert.deepEqual(
    builtInChartIndicatorDefinitions.map((definition) => [definition.id, definition.placement]),
    [
      ["ma", "overlay"],
      ["boll", "overlay"],
      ["ema", "overlay"],
      ["bbi", "overlay"],
      ["ene", "overlay"],
      ["sar", "overlay"],
      ["mavol", "pane"],
      ["macd", "pane"],
      ["vol", "pane"],
      ["kdj", "pane"],
      ["rsi", "pane"],
      ["wr", "pane"],
      ["cci", "pane"],
    ],
  );
});

test("main indicators support multi-select while secondary indicators are mutually exclusive", () => {
  let settings = setIndicatorEnabled(defaultChartIndicatorSettings, "ma", true);
  settings = setIndicatorEnabled(settings, "boll", true);
  settings = setIndicatorEnabled(settings, "macd", true);
  settings = setIndicatorEnabled(settings, "rsi", true);

  assert.equal(getIndicatorInstance(settings, "ma").enabled, true);
  assert.equal(getIndicatorInstance(settings, "boll").enabled, true);
  assert.equal(getIndicatorInstance(settings, "macd").enabled, false);
  assert.equal(getIndicatorInstance(settings, "rsi").enabled, true);
});

test("Auto convention resolves CN to A-share and HK/US to cross-market", () => {
  assert.equal(resolveIndicatorConvention("auto", "CN"), "a-share");
  assert.equal(resolveIndicatorConvention("auto", "HK"), "cross-market");
  assert.equal(resolveIndicatorConvention("auto", "US"), "cross-market");
  assert.equal(resolveIndicatorConvention("a-share", "US"), "a-share");
});

test("indicator evaluations honor enabled and visible lifecycle states", () => {
  const candles = Array.from({ length: 24 }, (_, index) => ({ time: String(index), timestamp: index, open: 100 + index, high: 101 + index, low: 99 + index, close: 100 + index, volume: 1 }));
  const settings = updateIndicatorInstance(setIndicatorEnabled(defaultChartIndicatorSettings, "boll", true), "boll", (current) => ({ ...current, visible: false }), builtInChartIndicatorDefinitions[1]);
  const evaluations = createChartIndicatorEvaluations(candles, settings, "cross-market");
  assert.equal(evaluations.length, 1);
  assert.equal(evaluations[0]?.placement, "overlay");
  assert.equal(evaluations[0]?.visible, false);
});

test("indicator registry exposes a plugin-safe registration boundary", () => {
  const registry = createChartIndicatorRegistry();
  registry.register({ id: "plugin-test", name: "插件测试指标", parameters: [{ key: "window", label: "周期", type: "number", defaultValue: 20 }], evaluate: () => null });
  assert.equal(registry.get("plugin-test")?.parameters[0]?.key, "window");
  assert.throws(() => registry.register({ id: "plugin-test", name: "重复", parameters: [], evaluate: () => null }), /重复指标注册/);
});

test("legacy plugins without placement remain compatible as overlays and failures stay isolated", () => {
  const candles = [{ time: "1", timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 1 }];
  const definitions = [
    {
      id: "com.quant.indicator.sample:line",
      name: "Plugin Line",
      parameters: [{ key: "window", label: "窗口", type: "number", defaultValue: 8 }],
      evaluate: (_items, parameters) => ({ id: "plugin-line", name: String(parameters.window), source: "indicator", enabled: true, visible: true, zIndex: 30, elements: [] }),
    },
    { id: "com.quant.indicator.sample:broken", name: "Broken", parameters: [], evaluate: () => { throw new Error("broken"); } },
  ];
  const pluginSettings = updateIndicatorInstance(defaultChartIndicatorSettings, "com.quant.indicator.sample:line", (current) => ({
    ...current,
    enabled: true,
    parametersByConvention: {
      "a-share": { window: 13 },
      "cross-market": { window: 13 },
    },
  }), definitions[0]);
  const evaluations = createChartIndicatorEvaluations(candles, pluginSettings, "cross-market", definitions);

  assert.deepEqual(evaluations.map((evaluation) => evaluation.placement), ["overlay"]);
  assert.equal(evaluations[0]?.placement === "overlay" ? evaluations[0].layer.name : "", "13");
});

test("plugin panes participate in secondary exclusivity and keep persisted settings", () => {
  const pluginPane = {
    id: "com.quant.indicator.sample:pane",
    name: "Plugin Pane",
    placement: "pane" as const,
    parameters: [{ key: "period", label: "周期", type: "number" as const, defaultValue: 8 }],
    evaluate: () => null,
  };
  const definitions = [...builtInChartIndicatorDefinitions, pluginPane];
  let settings = setIndicatorEnabled(defaultChartIndicatorSettings, "vol", true, definitions);
  settings = setIndicatorEnabled(settings, pluginPane.id, true, definitions);
  settings = updateIndicatorInstance(settings, pluginPane.id, (current) => ({
    ...current,
    parametersByConvention: {
      "a-share": { period: 13 },
      "cross-market": { period: 21 },
    },
  }), pluginPane);

  const restored = sanitizeChartIndicatorSettings(settings);
  assert.equal(getIndicatorInstance(restored, "vol").enabled, false);
  assert.equal(getIndicatorInstance(restored, pluginPane.id, pluginPane).enabled, true);
  assert.equal(getIndicatorInstance(restored, pluginPane.id, pluginPane).parametersByConvention["a-share"].period, 13);
  assert.equal(getIndicatorInstance(restored, pluginPane.id, pluginPane).parametersByConvention["cross-market"].period, 21);
});
