import assert from "node:assert/strict";
import test from "node:test";

import {
  createDiagnosticsIpcHandlers,
  diagnosticsIpcChannels,
} from "../src/electron/diagnosticsIpcContract.ts";

test("diagnostic IPC exposes one read-only export operation with no renderer path input", async () => {
  let exportCount = 0;
  const handlers = createDiagnosticsIpcHandlers({
    async exportPackage() {
      exportCount += 1;
      return {
        ok: true,
        data: {
          fileName: "quant-learning-diagnostics.tar.gz",
          includedMinidumps: 1,
          excludedMinidumps: 0,
        },
      };
    },
  });

  assert.deepEqual(Object.values(diagnosticsIpcChannels), ["diagnostics:export"]);
  assert.deepEqual(await handlers.exportPackage(), {
    ok: true,
    data: {
      fileName: "quant-learning-diagnostics.tar.gz",
      includedMinidumps: 1,
      excludedMinidumps: 0,
    },
  });
  assert.equal(exportCount, 1);
  assert.equal(handlers.exportPackage.length, 0);
});
