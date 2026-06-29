import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { preflightPluginManifest } from "../src/index.ts";

describe("preflightPluginManifest", () => {
  it("returns a manifest summary for a valid plugin manifest", async () => {
    const result = await preflightPluginManifest({
      manifestText: JSON.stringify({
        id: "com.quant.strategy.demo",
        name: "Demo Strategy",
        version: "1.0.0",
        type: "strategy",
        main: "dist/index.js",
        permissions: ["market-data:read", "strategy:run"],
        capabilities: ["strategy"],
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.manifest.id, "com.quant.strategy.demo");
    assert.deepEqual(result.summary.capabilities, ["strategy"]);
    assert.deepEqual(result.summary.permissions, ["market-data:read", "strategy:run"]);
    assert.equal(result.summary.requiresPermissionApproval, true);
  });

  it("does not throw when the manifest text is invalid JSON", async () => {
    const result = await preflightPluginManifest({ manifestText: "{ bad json" });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "INVALID_JSON");
  });

  it("returns a validation error for unknown permissions", async () => {
    const result = await preflightPluginManifest({
      manifestText: JSON.stringify({
        id: "com.quant.strategy.unsafe",
        name: "Unsafe Strategy",
        version: "1.0.0",
        type: "strategy",
        main: "dist/index.js",
        permissions: ["system:admin"],
        capabilities: ["strategy"],
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "INVALID_MANIFEST");
    assert.match(result.error.message, /未知插件权限/);
  });
});
