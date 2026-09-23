import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createPackagedRendererSmokeScript } from "../src/electron/packagedRendererSmoke.ts";

async function inspect(phase: string | null, control = true, guard = false) {
  return runInNewContext(createPackagedRendererSmokeScript(0), {
    Date,
    setTimeout: (callback: () => void) => callback(),
    document: {
      title: "Desktop",
      getElementById: () => ({
        innerText: "正在验证本机授权",
        querySelector: () => (control ? {} : null),
      }),
      querySelector: (selector: string) =>
        selector === "[data-renderer-startup-guard]"
          ? guard
            ? {}
            : null
          : phase
            ? { getAttribute: () => phase }
            : null,
    },
  });
}

test("packaged startup rejects bootstrap text, missing IPC state and service errors", async () => {
  for (const phase of [null, "BOOTSTRAPPING", "SERVICE_UNAVAILABLE"]) {
    assert.equal((await inspect(phase)).ok, false);
  }
});

test("packaged startup requires an interactive login or workspace without the startup guard", async () => {
  assert.equal((await inspect("SIGNED_OUT")).ok, true);
  assert.equal((await inspect("AUTHENTICATED_OFFLINE")).ok, true);
  assert.equal((await inspect("SIGNED_OUT", false)).ok, false);
  assert.equal((await inspect("SIGNED_OUT", true, true)).ok, false);
});
