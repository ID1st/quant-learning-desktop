import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAlphaFeedStreamForm } from "../src/features/api/apiConfigService.ts";

test("AlphaFeed WebSocket rejects remote plaintext transport", () => {
  assert.throws(
    () => normalizeAlphaFeedStreamForm({ wsUrl: "ws://stream.example.com", apiKey: "stream-key-123", mode: "watchlist" }),
    /远程地址必须使用 wss/,
  );
});

test("AlphaFeed WebSocket rejects hosts outside the official allowlist", () => {
  assert.throws(
    () => normalizeAlphaFeedStreamForm({ wsUrl: "wss://example.invalid/stream", apiKey: "stream-key-123", mode: "watchlist" }),
    /官方服务地址或本机开发地址/u,
  );
});

test("AlphaFeed WebSocket permits loopback plaintext transport for development", () => {
  const form = normalizeAlphaFeedStreamForm({
    wsUrl: "ws://127.0.0.1:8789/stream",
    apiKey: "stream-key-123",
    mode: "watchlist",
  });

  assert.equal(form.wsUrl, "ws://127.0.0.1:8789/stream");
});
