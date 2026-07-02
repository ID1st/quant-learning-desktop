import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAlphaFeedStreamSession,
  createAlphaFeedStreamSubscribePayload,
  parseAlphaFeedStreamMessage,
  type AlphaFeedWebSocketLike,
} from "../src/electron/alphaFeedStreamBridge.ts";
import type { MarketWatchlistItem } from "../src/features/marketData/marketDataSyncService.ts";

const watchlist: MarketWatchlistItem[] = [
  { symbol: "AAPL.US", name: "Apple Inc.", market: "US", source: "preset" },
  { symbol: "9988.HK", name: "Alibaba", market: "HK", source: "preset" },
];

class FakeWebSocket implements AlphaFeedWebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string; wasClean?: boolean }) => void) | null = null;
  sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}

test("AlphaFeed stream subscription targets watchlist symbols by default", () => {
  assert.deepEqual(
    createAlphaFeedStreamSubscribePayload({
      credentials: { wsUrl: "wss://api.tickflow.org/v1/ws/stream", apiKey: "stream-key" },
      mode: "watchlist",
      watchlist,
    }),
    {
      op: "subscribe",
      channel: "quotes",
      auth: { apiKey: "stream-key" },
      symbols: ["AAPL.US", "9988.HK"],
    },
  );
});

test("AlphaFeed stream subscription can request member all-symbol stream", () => {
  assert.deepEqual(
    createAlphaFeedStreamSubscribePayload({
      credentials: { wsUrl: "wss://api.tickflow.org/v1/ws/stream", apiKey: "stream-key" },
      mode: "all-symbols",
      watchlist,
    }),
    {
      op: "subscribe",
      channel: "quotes",
      auth: { apiKey: "stream-key" },
      universes: ["US", "HK", "CN"],
    },
  );
});

test("AlphaFeed stream parser maps quote payloads into market snapshots", () => {
  const parsed = parseAlphaFeedStreamMessage(
    JSON.stringify({
      type: "quote",
      data: {
        symbol: "AAPL.US",
        region: "US",
        last_price: 219.48,
        prev_close: 217.24,
        open: 218,
        high: 220,
        low: 216.5,
        volume: 1200,
        timestamp: 1_788_200_000,
      },
    }),
    watchlist,
  );

  assert.equal(parsed.kind, "snapshots");
  if (parsed.kind !== "snapshots") {
    return;
  }
  assert.equal(parsed.snapshots.length, 1);
  assert.equal(parsed.snapshots[0]?.symbol, "AAPL.US");
  assert.equal(parsed.snapshots[0]?.market, "US");
  assert.equal(parsed.snapshots[0]?.lastPrice, 219.48);
  assert.equal(parsed.snapshots[0]?.provider, "alphafeed");
});

test("AlphaFeed stream session stores snapshots and exposes permission fallback", async () => {
  let socket: FakeWebSocket | null = null;
  const session = createAlphaFeedStreamSession({
    createWebSocket: () => {
      socket = new FakeWebSocket();
      return socket;
    },
    setTimeout: (handler) => {
      handler();
      return 1;
    },
    clearTimeout: () => undefined,
    reconnectDelayMs: 1,
    maxReconnectAttempts: 0,
  });

  const connected = await session.connect({
    credentials: { wsUrl: "wss://api.tickflow.org/v1/ws/stream", apiKey: "stream-key" },
    mode: "watchlist",
    watchlist,
  });
  assert.equal(connected.state, "connecting");
  assert.ok(socket);

  socket?.open();
  assert.equal(socket?.sent.length, 1);
  socket?.emit({
    data: [
      {
        symbol: "AAPL.US",
        market: "US",
        lastPrice: 220,
        previousClose: 218,
        volume: 10,
      },
    ],
  });

  const snapshotResult = await session.readSnapshot();
  assert.equal(snapshotResult.state, "connected");
  assert.equal(snapshotResult.snapshots.length, 1);
  assert.equal(snapshotResult.snapshots[0]?.lastPrice, 220);

  socket?.emit({ error: { code: 403, message: "permission denied" } });
  const fallbackResult = await session.readSnapshot();
  assert.equal(fallbackResult.state, "fallback");
  assert.equal(fallbackResult.health.status, "permission_denied");
});
