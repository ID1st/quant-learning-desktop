import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PluginLoader, validatePluginManifest } from "../src/index.ts";

describe("validatePluginManifest", () => {
  it("normalizes a valid manifest into a stable plugin contract", () => {
    const manifest = validatePluginManifest({
      id: "com.quant.strategy.demo",
      name: "Demo Strategy",
      version: "1.0.0",
      type: "strategy",
      main: "dist/index.js",
      engine: {
        app: ">=0.1.0",
        pluginApi: ">=0.1.0",
      },
      permissions: ["market-data:read", "strategy:run"],
      capabilities: ["strategy"],
    });

    assert.equal(manifest.id, "com.quant.strategy.demo");
    assert.equal(manifest.main, "dist/index.js");
    assert.deepEqual(manifest.capabilities, ["strategy"]);
  });

  it("rejects unknown permissions before the plugin can be registered", () => {
    assert.throws(
      () =>
        validatePluginManifest({
          id: "com.quant.strategy.unsafe",
          name: "Unsafe Strategy",
          version: "1.0.0",
          type: "strategy",
          main: "dist/index.js",
          permissions: ["system:admin"],
          capabilities: ["strategy"],
        }),
      /未知插件权限/,
    );
  });
});

describe("PluginLoader", () => {
  it("registers plugins by capability without executing plugin code", () => {
    const loader = new PluginLoader();
    const plugin = loader.register(
      validatePluginManifest({
        id: "com.quant.strategy.demo",
        name: "Demo Strategy",
        version: "1.0.0",
        type: "strategy",
        main: "dist/index.js",
        permissions: ["market-data:read", "strategy:run"],
        capabilities: ["strategy"],
      }),
    );

    assert.equal(plugin.status, "registered");
    assert.equal(loader.get("com.quant.strategy.demo"), plugin);
    assert.deepEqual(
      loader.listByCapability("strategy").map((item) => item.manifest.id),
      ["com.quant.strategy.demo"],
    );
  });

  it("blocks duplicate plugin ids to keep capability ownership deterministic", () => {
    const loader = new PluginLoader();
    const manifest = validatePluginManifest({
      id: "com.quant.strategy.demo",
      name: "Demo Strategy",
      version: "1.0.0",
      type: "strategy",
      main: "dist/index.js",
      permissions: ["market-data:read"],
      capabilities: ["strategy"],
    });

    loader.register(manifest);

    assert.throws(() => loader.register(manifest), /插件已注册/);
  });
});
