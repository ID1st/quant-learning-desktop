import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryStorageDriver,
  LocalDatabase,
} from "../src/features/persistence/localDatabase.ts";
import {
  builtInChartIndicatorDefinitions,
  getIndicatorInstance,
  setIndicatorEnabled,
  updateIndicatorInstance,
} from "../src/features/chartIndicators/chartIndicators.ts";
import {
  createChartStudySettingsStore,
  type ChartStudyStrategyDefinition,
} from "../src/features/chartWorkspace/chartStudySettingsStore.ts";

const strategies: readonly ChartStudyStrategyDefinition[] = [
  {
    key: "utorb",
    parameterSchema: [
      { key: "openingRangeMinutes", defaultValue: 30 },
      { key: "showTargets", defaultValue: true },
    ],
  },
  {
    key: "trend-targets",
    parameterSchema: [{ key: "length", defaultValue: 12 }],
  },
];

test("chart study settings migrate legacy workspace strategy and indicator preferences", () => {
  const driver = createMemoryStorageDriver({
    "quant-learning.chart-workspace-preferences": JSON.stringify({
      version: 5,
      showVolume: true,
      strategies: {
        utorb: {
          enabled: false,
          showLayer: false,
          parameters: { openingRangeMinutes: 45, showTargets: false },
        },
      },
      indicators: {
        movingAverage: { available: true, enabled: false, visible: true, window: 21 },
        bollingerBands: {
          available: true,
          enabled: true,
          visible: false,
          window: 18,
          multiplier: 2.5,
        },
      },
    }),
  });
  const database = new LocalDatabase(driver);
  const store = createChartStudySettingsStore({ database, legacyStorage: driver });

  store.getState().initializeStrategies(strategies);

  assert.deepEqual(store.getState().strategies.utorb, {
    enabled: false,
    showLayer: false,
    parameters: { openingRangeMinutes: 45, showTargets: false },
  });
  const ma = getIndicatorInstance(
    store.getState().indicators,
    "ma",
    builtInChartIndicatorDefinitions[0],
  );
  assert.deepEqual(
    [
      ma.parametersByConvention["a-share"].period1,
      ma.parametersByConvention["a-share"].period2,
      ma.parametersByConvention["a-share"].period3,
      ma.parametersByConvention["a-share"].period4,
    ],
    [21, 10, 20, 60],
  );
  assert.equal(getIndicatorInstance(store.getState().indicators, "vol").enabled, true);
  assert.equal(
    getIndicatorInstance(store.getState().indicators, "boll", builtInChartIndicatorDefinitions[1])
      .enabled,
    true,
  );
  assert.equal(
    getIndicatorInstance(store.getState().indicators, "boll", builtInChartIndicatorDefinitions[1])
      .visible,
    false,
  );
  assert.deepEqual(
    getIndicatorInstance(store.getState().indicators, "boll", builtInChartIndicatorDefinitions[1])
      .parametersByConvention["a-share"],
    getIndicatorInstance(store.getState().indicators, "boll", builtInChartIndicatorDefinitions[1])
      .parametersByConvention["cross-market"],
  );
});

test("chart study settings persist strategy and indicator updates for both workspaces", () => {
  const driver = createMemoryStorageDriver();
  const database = new LocalDatabase(driver);
  const store = createChartStudySettingsStore({ database, legacyStorage: driver });

  store.getState().initializeStrategies(strategies);
  store.getState().updateStrategy("utorb", (current) => ({
    ...current,
    enabled: false,
    parameters: { ...current.parameters, openingRangeMinutes: 20 },
  }));
  store.getState().updateIndicators((current) =>
    updateIndicatorInstance(
      setIndicatorEnabled(current, "ma", true),
      "ma",
      (item) => ({
        ...item,
        parametersByConvention: {
          ...item.parametersByConvention,
          "a-share": { ...item.parametersByConvention["a-share"], period1: 50 },
        },
      }),
      builtInChartIndicatorDefinitions[0],
    ),
  );

  const reloaded = createChartStudySettingsStore({ database, legacyStorage: driver });
  reloaded.getState().initializeStrategies(strategies);

  assert.equal(reloaded.getState().strategies.utorb?.enabled, false);
  assert.equal(reloaded.getState().strategies.utorb?.parameters.openingRangeMinutes, 20);
  assert.equal(
    getIndicatorInstance(reloaded.getState().indicators, "ma", builtInChartIndicatorDefinitions[0])
      .enabled,
    true,
  );
  assert.equal(
    getIndicatorInstance(reloaded.getState().indicators, "ma", builtInChartIndicatorDefinitions[0])
      .parametersByConvention["a-share"].period1,
    50,
  );
});

test("secondary indicator exclusivity and convention-specific parameters survive reload", () => {
  const driver = createMemoryStorageDriver();
  const database = new LocalDatabase(driver);
  const store = createChartStudySettingsStore({ database, legacyStorage: driver });

  store.getState().updateIndicators((current) => {
    const withMacd = setIndicatorEnabled(current, "macd", true);
    const withRsi = setIndicatorEnabled(withMacd, "rsi", true);
    return {
      ...withRsi,
      conventionMode: "cross-market",
      instances: {
        ...withRsi.instances,
        rsi: {
          ...withRsi.instances.rsi!,
          parametersByConvention: {
            ...withRsi.instances.rsi!.parametersByConvention,
            "cross-market": {
              ...withRsi.instances.rsi!.parametersByConvention["cross-market"],
              period1: 16,
            },
          },
        },
      },
    };
  });

  const reloaded = createChartStudySettingsStore({ database, legacyStorage: driver });
  assert.equal(reloaded.getState().indicators.conventionMode, "cross-market");
  assert.equal(getIndicatorInstance(reloaded.getState().indicators, "macd").enabled, false);
  assert.equal(getIndicatorInstance(reloaded.getState().indicators, "rsi").enabled, true);
  assert.equal(
    getIndicatorInstance(reloaded.getState().indicators, "rsi").parametersByConvention[
      "cross-market"
    ].period1,
    16,
  );
  assert.equal(
    getIndicatorInstance(reloaded.getState().indicators, "rsi").parametersByConvention["a-share"]
      .period1,
    6,
  );
});
