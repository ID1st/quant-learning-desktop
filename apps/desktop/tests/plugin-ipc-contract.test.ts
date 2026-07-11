import assert from "node:assert/strict";
import test from "node:test";
import type { PluginManager } from "../src/electron/pluginManager.ts";
import { createPluginIpcHandlers, pluginIpcChannels } from "../src/electron/pluginIpcContract.ts";

const record = {
  manifest: {
    id: "com.quant.strategy.sample",
    name: "Sample Strategy",
    version: "1.0.0",
    type: "strategy" as const,
    kind: "strategy" as const,
    main: "dist/index.js",
    entry: "dist/index.js",
    engine: {},
    permissions: ["market-data:read", "strategy:run"] as const,
    capabilities: ["strategy"] as const,
  },
  status: "enabled" as const,
  installedAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  failureCount: 0,
};

test("plugin IPC channels expose a narrow plugin-management boundary", () => {
  assert.deepEqual(pluginIpcChannels, {
    list: "plugins:list",
    installLocal: "plugins:installLocal",
    setEnabled: "plugins:setEnabled",
    reportRuntimeFailure: "plugins:reportRuntimeFailure",
    uninstall: "plugins:uninstall",
    readEnabledRuntimeModules: "plugins:readEnabledRuntimeModules",
  });
});

test("plugin IPC handlers only delegate to the main-process plugin manager", async () => {
  const calls: string[] = [];
  const manager: PluginManager = {
    list: () => [record],
    installFromDirectory: async (directory) => {
      calls.push(`install:${directory}`);
      return record;
    },
    setEnabled: async (id, enabled) => {
      calls.push(`enabled:${id}:${enabled}`);
      return { ...record, status: enabled ? "enabled" : "disabled" };
    },
    recordRuntimeFailure: async (id, message) => {
      calls.push(`failure:${id}:${message}`);
      return { ...record, status: "degraded", failureCount: 1, lastError: message };
    },
    uninstall: async (id) => {
      calls.push(`uninstall:${id}`);
    },
    readEnabledRuntimeModules: async () => {
      calls.push("runtime");
      return [{ plugin: record, source: "export function activate() {}" }];
    },
  };
  const handlers = createPluginIpcHandlers(manager);

  assert.deepEqual(await handlers.list(), { ok: true, data: [record] });
  assert.deepEqual(await handlers.installFromDirectory("C:/plugins/sample"), { ok: true, data: record });
  assert.equal((await handlers.setEnabled(record.manifest.id, false)).ok, true);
  assert.equal((await handlers.reportRuntimeFailure(record.manifest.id, "activation failed")).ok, true);
  assert.deepEqual(await handlers.uninstall(record.manifest.id), { ok: true, data: null });
  assert.equal((await handlers.readEnabledRuntimeModules()).ok, true);
  assert.deepEqual(calls, [
    "install:C:/plugins/sample",
    `enabled:${record.manifest.id}:false`,
    `failure:${record.manifest.id}:activation failed`,
    `uninstall:${record.manifest.id}`,
    "runtime",
  ]);
});
