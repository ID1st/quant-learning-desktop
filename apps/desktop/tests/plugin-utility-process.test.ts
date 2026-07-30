import assert from "node:assert/strict";
import test from "node:test";
import { createPluginUtilityRuntime } from "../src/electron/pluginUtilityProcess.ts";
import type { PluginRuntimeHostResponse } from "../src/electron/pluginRuntimeProtocol.ts";

const pluginId = "com.quant.strategy.sma-crossover";

test("utility runtime fails closed without evaluating plugin source", async () => {
  const responses: PluginRuntimeHostResponse[] = [];
  const runtime = createPluginUtilityRuntime((response) => responses.push(response));
  delete (globalThis as { pluginSourceExecuted?: boolean }).pluginSourceExecuted;

  await runtime({
    id: "refresh",
    type: "refresh",
    modules: [
      {
        plugin: { manifest: { id: pluginId } },
        source: "globalThis.pluginSourceExecuted = true; export function activate() {}",
      } as never,
    ],
  });

  const result = responses.pop();
  assert.equal(result?.ok, false);
  assert.match(
    result && !result.ok ? result.message : "",
    /disabled until a no-Node sandbox is available/i,
  );
  assert.equal((globalThis as { pluginSourceExecuted?: boolean }).pluginSourceExecuted, undefined);
});
