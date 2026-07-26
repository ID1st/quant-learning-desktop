import assert from "node:assert/strict";
import test from "node:test";
import {
  createStrategyQuickMenuItems,
  toggleStrategyFromQuickMenu,
} from "../src/features/chartWorkspace/strategyQuickMenu.ts";

test("strategy quick menu lists every runtime strategy in registry order", () => {
  const items = createStrategyQuickMenuItems(
    [
      { key: "preset", name: "Preset", sourceType: "preset", parameterSchema: [{ key: "length" }] },
      { key: "user", name: "User", sourceType: "user", parameterSchema: [] },
      { key: "plugin", name: "Plugin", sourceType: "plugin", parameterSchema: [{ key: "color" }] },
    ],
    {
      preset: { enabled: true },
      user: { enabled: false },
      plugin: { enabled: true },
    },
  );

  assert.deepEqual(items, [
    { key: "preset", name: "Preset", sourceType: "preset", enabled: true, hasParameters: true },
    { key: "user", name: "User", sourceType: "user", enabled: false, hasParameters: false },
    { key: "plugin", name: "Plugin", sourceType: "plugin", enabled: true, hasParameters: true },
  ]);
});

test("strategy quick menu enables a strategy together with its chart layer", () => {
  assert.deepEqual(
    toggleStrategyFromQuickMenu({
      enabled: false,
      showLayer: false,
      parameters: { length: 20 },
    }),
    {
      enabled: true,
      showLayer: true,
      parameters: { length: 20 },
    },
  );
});

test("strategy quick menu disables a strategy without discarding layer preference", () => {
  assert.deepEqual(
    toggleStrategyFromQuickMenu({
      enabled: true,
      showLayer: true,
      parameters: { length: 20 },
    }),
    {
      enabled: false,
      showLayer: true,
      parameters: { length: 20 },
    },
  );
});
