import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTION_AUTH_BASE_URL, resolveAuthBaseUrl } from "../src/electron/authRuntimeConfig.ts";

test("packaged desktop uses the production authentication endpoint by default", () => {
  assert.equal(PRODUCTION_AUTH_BASE_URL, "https://auth.fnndp.xyz");
  assert.equal(resolveAuthBaseUrl("", true), PRODUCTION_AUTH_BASE_URL);
});

test("development keeps the loopback authentication endpoint", () => {
  assert.equal(resolveAuthBaseUrl("", false), "http://127.0.0.1:8787");
});

test("an explicitly injected endpoint takes precedence", () => {
  assert.equal(
    resolveAuthBaseUrl(" https://auth.staging.example.com/ ", true),
    "https://auth.staging.example.com/",
  );
});
