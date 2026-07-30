import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  fetchAlphaFeedQuoteSnapshotsWithRest,
  verifyAlphaFeedCredentialsWithRest,
} from "../src/electron/alphaFeedBridge.ts";

const originalFetch = globalThis.fetch;

function createJsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("AlphaFeed bridge returns latency health on successful verification", async () => {
  globalThis.fetch = async () =>
    createJsonResponse({
      data: [
        {
          symbol: "600519.SH",
          region: "CN",
          last_price: 1468.1,
          prev_close: 1460.21,
          open: 1461,
          high: 1472,
          low: 1455,
          volume: 1000,
          amount: 1468100,
          timestamp: 1782864000000,
        },
      ],
    });

  const result = await verifyAlphaFeedCredentialsWithRest({
    apiUrl: "https://api.alphafeed.org",
    apiKey: "alpha-key-1234",
  });

  assert.equal(result.ok, true);
  assert.equal(result.health.status, "ok");
  assert.equal(typeof result.health.latencyMs, "number");
  assert.match(result.health.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("AlphaFeed bridge classifies rate limits and exposes retry hints", async () => {
  globalThis.fetch = async () =>
    createJsonResponse({ message: "too many requests" }, { status: 429 });

  const result = await fetchAlphaFeedQuoteSnapshotsWithRest(
    {
      apiUrl: "https://api.alphafeed.org",
      apiKey: "alpha-key-1234",
    },
    [{ symbol: "AAPL.US", name: "Apple Inc.", market: "US", source: "preset" }],
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.health.status, "rate_limited");
  assert.match(result.error.health.nextRetryAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
});

test("AlphaFeed bridge classifies network failures and redacts the API key", async () => {
  globalThis.fetch = async () => {
    throw new Error("fetch failed for alpha-key-1234");
  };

  const result = await fetchAlphaFeedQuoteSnapshotsWithRest(
    {
      apiUrl: "https://api.alphafeed.org",
      apiKey: "alpha-key-1234",
    },
    [{ symbol: "AAPL.US", name: "Apple Inc.", market: "US", source: "preset" }],
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.health.status, "network_error");
  assert.equal(result.error.message.includes("alpha-key-1234"), false);
  assert.equal(result.error.message.includes("********"), true);
});
