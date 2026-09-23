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

test("batch retries preserve their idempotency key and JSON content type", async () => {
  const requests: Headers[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    requests.push(new Headers(init?.headers));
    return requests.length === 1
      ? Response.json({ error: { message: "Unavailable" } }, { status: 503 })
      : Response.json({ data: { batch: {}, codes: [] } });
  };
  try {
    const input = { claimDays: 7, entries: [{ durationDays: 7 as const, count: 1 }] };
    const key = crypto.randomUUID();
    await assert.rejects(adminApi.createBatch(input, key), /Unavailable/);
    await adminApi.createBatch(input, key);
    assert.equal(requests[0].get("idempotency-key"), key);
    assert.equal(requests[1].get("idempotency-key"), key);
    assert.equal(requests[1].get("content-type"), "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
