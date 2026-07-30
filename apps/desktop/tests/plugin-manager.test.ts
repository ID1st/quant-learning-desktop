import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPluginManager } from "../src/electron/pluginManager.ts";

async function createPluginDirectory(
  root: string,
  manifest: Record<string, unknown>,
  source = "export function activate() {}",
) {
  const directory = join(root, "source-plugin");
  await mkdir(join(directory, "dist"), { recursive: true });
  await writeFile(join(directory, "plugin.json"), JSON.stringify(manifest), "utf8");
  await writeFile(join(directory, "dist", "index.js"), source, "utf8");
  return directory;
}

const manifest = {
  id: "com.quant.strategy.sample",
  name: "Sample Strategy",
  version: "1.0.0",
  type: "strategy",
  main: "dist/index.js",
  engine: { app: ">=0.1.0", pluginApi: ">=0.1.0" },
  permissions: ["market-data:read", "strategy:run", "chart:overlay"],
  capabilities: ["strategy"],
};

test("plugin manager installs, persists, disables, enables, and uninstalls a trusted local plugin", async () => {
  const root = await mkdtemp(join(tmpdir(), "quant-plugin-manager-"));

  try {
    const source = await createPluginDirectory(root, manifest);
    const manager = createPluginManager({ pluginsDirectory: join(root, "installed") });
    const installed = await manager.installFromDirectory(source);

    assert.equal(installed.status, "enabled");
    assert.equal(manager.list().length, 1);
    assert.equal((await manager.readEnabledRuntimeModules())[0]?.plugin.manifest.id, manifest.id);

    const disabled = await manager.setEnabled(manifest.id, false);
    assert.equal(disabled.status, "disabled");
    assert.equal((await manager.readEnabledRuntimeModules()).length, 0);

    const reloaded = createPluginManager({ pluginsDirectory: join(root, "installed") });
    assert.equal(reloaded.list()[0]?.status, "disabled");

    const enabled = await reloaded.setEnabled(manifest.id, true);
    assert.equal(enabled.status, "enabled");
    await reloaded.uninstall(manifest.id);
    assert.deepEqual(reloaded.list(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin manager rejects entries that escape the selected package directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "quant-plugin-manager-"));

  try {
    const source = await createPluginDirectory(root, {
      ...manifest,
      id: "com.quant.strategy.escape",
      main: "../outside.js",
    });
    const manager = createPluginManager({ pluginsDirectory: join(root, "installed") });

    await assert.rejects(() => manager.installFromDirectory(source), /entry path/i);
    assert.deepEqual(manager.list(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin manager rejects unsupported engine ranges and isolates imported runtime modules", async () => {
  const root = await mkdtemp(join(tmpdir(), "quant-plugin-manager-"));

  try {
    const manager = createPluginManager({ pluginsDirectory: join(root, "installed") });
    const incompatible = await createPluginDirectory(root, {
      ...manifest,
      id: "com.quant.strategy.future",
      engine: { app: ">=9.0.0", pluginApi: ">=0.1.0" },
    });
    await assert.rejects(() => manager.installFromDirectory(incompatible), /requires app version/i);

    const compatible = await createPluginDirectory(
      root,
      { ...manifest, id: "com.quant.strategy.imported" },
      'import value from "other"; export function activate() {}',
    );
    await manager.installFromDirectory(compatible);
    assert.deepEqual(await manager.readEnabledRuntimeModules(), []);
    assert.equal(manager.list()[0]?.status, "degraded");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin manager rejects an invalid plugin version", async () => {
  const root = await mkdtemp(join(tmpdir(), "quant-plugin-manager-"));

  try {
    const source = await createPluginDirectory(root, {
      ...manifest,
      id: "com.quant.strategy.invalid-version",
      version: "latest",
    });
    const manager = createPluginManager({ pluginsDirectory: join(root, "installed") });

    await assert.rejects(() => manager.installFromDirectory(source), /version range is invalid/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin manager degrades a failing runtime and disables it after repeated failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "quant-plugin-manager-"));

  try {
    const source = await createPluginDirectory(root, manifest);
    const manager = createPluginManager({ pluginsDirectory: join(root, "installed") });
    await manager.installFromDirectory(source);

    assert.equal(
      (await manager.recordRuntimeFailure(manifest.id, "activation failed")).status,
      "degraded",
    );
    assert.equal(
      (await manager.recordRuntimeFailure(manifest.id, "activation failed")).status,
      "degraded",
    );
    const disabled = await manager.recordRuntimeFailure(manifest.id, "activation failed");

    assert.equal(disabled.status, "disabled");
    assert.equal(disabled.failureCount, 3);
    assert.equal((await manager.readEnabledRuntimeModules()).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
