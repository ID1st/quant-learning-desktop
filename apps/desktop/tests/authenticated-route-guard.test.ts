import assert from "node:assert/strict";
import test from "node:test";

import { resolveRequiredAppRoute } from "../src/app/authenticatedRouteGuard.ts";

test("unauthenticated users are returned to login", () => {
  assert.equal(resolveRequiredAppRoute(false, "chart"), "login");
  assert.equal(resolveRequiredAppRoute(false, "login"), null);
});

test("authenticated users enter the super chart by default", () => {
  assert.equal(resolveRequiredAppRoute(true, "login"), "chart");
});

test("authenticated users can freely leave API configuration", () => {
  assert.equal(resolveRequiredAppRoute(true, "apiConfig"), null);
  assert.equal(resolveRequiredAppRoute(true, "strategies"), null);
  assert.equal(resolveRequiredAppRoute(true, "learning"), null);
  assert.equal(resolveRequiredAppRoute(true, "settings"), null);
  assert.equal(resolveRequiredAppRoute(true, "chart"), null);
});
