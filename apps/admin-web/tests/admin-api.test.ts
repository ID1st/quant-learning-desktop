import assert from "node:assert/strict";
import test from "node:test";

import { adminApi } from "../src/api.ts";

test("administrator login sends the server contract emailCode field", async () => {
  const originalFetch = globalThis.fetch;
  let observedBody = "";
  globalThis.fetch = async (_input, init) => {
    observedBody = String(init?.body);
    return Response.json({ data: { admin: { email: "admin@example.com" } } });
  };

  try {
    await adminApi.login("admin@example.com", "123456");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(JSON.parse(observedBody), {
    email: "admin@example.com",
    emailCode: "123456",
  });
});
