import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  assertAlphaFeedCredentials,
  assertMarketDataBarRequest,
  assertMarketDataItems,
  assertPluginStrategyInput,
  assertTrustedIpcSender,
  createDesktopRendererSecurityPolicy,
  isTrustedRendererUrl,
} from "../src/electron/electronSecurity.ts";

const rendererEntry = "D:\\quant-app\\renderer\\index.html";
const policy = createDesktopRendererSecurityPolicy({
  rendererEntry,
  rendererDevServerUrl: "http://127.0.0.1:5173",
});

test("desktop navigation policy only trusts the packaged entry or configured dev origin", () => {
  assert.equal(isTrustedRendererUrl(`${pathToFileURL(rendererEntry).href}#/chart`, policy), true);
  assert.equal(isTrustedRendererUrl("file:///D:/quant-app/renderer/evil.html", policy), false);
  assert.equal(isTrustedRendererUrl("http://127.0.0.1:5173/chart", policy), true);
  assert.equal(isTrustedRendererUrl("http://127.0.0.1:5173.evil.example/chart", policy), false);
  assert.equal(isTrustedRendererUrl("https://example.com", policy), false);
});

test("IPC sender policy rejects an external frame even when it can name a valid channel", () => {
  assert.doesNotThrow(() => assertTrustedIpcSender({ senderFrame: { url: pathToFileURL(rendererEntry).href } }, policy));
  assert.throws(
    () => assertTrustedIpcSender({ senderFrame: { url: "https://attacker.example" } }, policy),
    /untrusted renderer/i,
  );
});

test("IPC payload guards enforce collection, bar and strategy bounds", () => {
  const item = { market: "US", symbol: "AAPL.US" };
  assert.doesNotThrow(() => assertMarketDataItems([item]));
  assert.throws(() => assertMarketDataItems(Array.from({ length: 201 }, () => item)), /items/i);
  assert.throws(
    () => assertMarketDataBarRequest({ market: "US", symbol: "AAPL.US", timeframe: "1d", count: 100_000 }),
    /count/i,
  );
  assert.throws(
    () => assertPluginStrategyInput({
      symbol: "AAPL.US",
      market: "US",
      timeframe: "1d",
      bars: Array.from({ length: 5_001 }, (_, timestamp) => ({ timestamp, open: 1, high: 1, low: 1, close: 1, volume: 1 })),
      parameters: {},
      runMode: "backtest",
    }),
    /bars/i,
  );
});

test("IPC credential guard rejects malformed and oversized secrets", () => {
  assert.doesNotThrow(() => assertAlphaFeedCredentials({ apiUrl: "https://api.alphafeed.org", apiKey: "valid-key" }));
  assert.throws(() => assertAlphaFeedCredentials({ apiUrl: "javascript:alert(1)", apiKey: "valid-key" }), /apiUrl/i);
  assert.throws(
    () => assertAlphaFeedCredentials({ apiUrl: "https://api.alphafeed.org", apiKey: "x".repeat(8_193) }),
    /apiKey/i,
  );
});
