import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/app/App.tsx", import.meta.url),
  "utf8",
);

test("auth bridge subscription is recreated by every React effect setup", () => {
  assert.equal(appSource.includes("bootstrapped.current"), false);
  assert.match(appSource, /const unsubscribe = bridge\.subscribe/);
  assert.match(appSource, /let cancelled = false/);
  assert.match(appSource, /cancelled = true/);
});
