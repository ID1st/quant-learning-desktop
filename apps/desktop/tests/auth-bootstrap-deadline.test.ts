import assert from "node:assert/strict";
import test from "node:test";

import { runAuthBootstrapWithDeadline } from "../src/features/auth/authBootstrapDeadline.ts";

test("auth bootstrap rejection leaves the loading screen", async () => {
  const result = await runAuthBootstrapWithDeadline(async () => {
    throw new Error("keychain session cannot be decrypted");
  });

  assert.deepEqual(result, { ok: false, reason: "rejected" });
});

test("auth bootstrap timeout leaves the loading screen", async () => {
  const result = await runAuthBootstrapWithDeadline(() => new Promise<never>(() => undefined), 5);

  assert.deepEqual(result, { ok: false, reason: "timeout" });
});
