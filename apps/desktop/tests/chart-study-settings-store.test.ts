import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryStorageDriver, LocalDatabase } from "../src/features/persistence/localDatabase.ts";
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
      strategies: {
        utorb: { enabled: false, showLayer: false, parameters: { openingRangeMinutes: 45, showTargets: false } },
      },
      indicators: {
        movingAverage: { available: true, enabled: false, visible: true, window: 21 },
        bollingerBands: { available: true, enabled: true, visible: false, window: 18, multiplier: 2.5 },
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
  assert.equal(store.getState().indicators.movingAverage.window, 21);
  assert.equal(store.getState().indicators.bollingerBands.enabled, true);
  assert.equal(store.getState().indicators.bollingerBands.visible, false);
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
  store.getState().updateIndicators((current) => ({
    ...current,
    movingAverage: { ...current.movingAverage, enabled: false, window: 50 },
  }));

  const reloaded = createChartStudySettingsStore({ database, legacyStorage: driver });
  reloaded.getState().initializeStrategies(strategies);

  assert.equal(reloaded.getState().strategies.utorb?.enabled, false);
  assert.equal(reloaded.getState().strategies.utorb?.parameters.openingRangeMinutes, 20);
  assert.equal(reloaded.getState().indicators.movingAverage.enabled, false);
  assert.equal(reloaded.getState().indicators.movingAverage.window, 50);
});
