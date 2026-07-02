import type { Market } from "@quant/shared";
import type { MarketQuoteSnapshot, MarketWatchlistItem } from "../features/marketData/marketDataSyncService.ts";
import type { AlphaFeedProviderHealth, AlphaFeedProviderHealthStatus } from "./alphaFeedBridge.ts";
import type { AlphaFeedStreamCredentials } from "./secureCredentialStore.ts";

export type AlphaFeedStreamMode = "watchlist" | "all-symbols";
export type AlphaFeedStreamConnectionState = "idle" | "connecting" | "connected" | "fallback";

export interface AlphaFeedStreamConnectRequest {
  credentials: AlphaFeedStreamCredentials;
  mode: AlphaFeedStreamMode;
  watchlist: MarketWatchlistItem[];
}

export interface AlphaFeedStreamSnapshotResult {
  ok: true;
  snapshots: MarketQuoteSnapshot[];
  health: AlphaFeedProviderHealth;
  state: AlphaFeedStreamConnectionState;
}

export interface AlphaFeedStreamControlResult {
  ok: true;
  health: AlphaFeedProviderHealth;
  state: AlphaFeedStreamConnectionState;
}

export interface AlphaFeedStreamSubscribePayload {
  op: "subscribe";
  channel: "quotes";
  auth: {
    apiKey: string;
  };
  symbols?: string[];
  universes?: Array<"US" | "HK" | "CN">;
}

export interface AlphaFeedWebSocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string; wasClean?: boolean }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type AlphaFeedWebSocketFactory = (url: string) => AlphaFeedWebSocketLike;

export interface AlphaFeedStreamSessionDependencies {
  createWebSocket?: AlphaFeedWebSocketFactory;
  now?: () => number;
  setTimeout?: (handler: () => void, timeoutMs: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

export interface AlphaFeedStreamSession {
  connect(request: AlphaFeedStreamConnectRequest): Promise<AlphaFeedStreamControlResult>;
  readSnapshot(): Promise<AlphaFeedStreamSnapshotResult>;
  disconnect(): Promise<AlphaFeedStreamControlResult>;
}

interface AlphaFeedStreamSessionState {
  request: AlphaFeedStreamConnectRequest | null;
  socket: AlphaFeedWebSocketLike | null;
  reconnectTimer: unknown;
  reconnectAttempts: number;
  snapshotsByKey: Record<string, MarketQuoteSnapshot>;
  state: AlphaFeedStreamConnectionState;
  health: AlphaFeedProviderHealth;
  manualClose: boolean;
}

const websocketOpenState = 1;

function createHealth(status: AlphaFeedProviderHealthStatus, message: string, startedAt: number): AlphaFeedProviderHealth {
  return {
    status,
    message,
    checkedAt: new Date().toISOString(),
    latencyMs: Math.max(0, Math.round(Date.now() - startedAt)),
  };
}

function getWebSocketFactory(createWebSocket?: AlphaFeedWebSocketFactory): AlphaFeedWebSocketFactory | null {
  if (createWebSocket) {
    return createWebSocket;
  }

  if (typeof WebSocket === "undefined") {
    return null;
  }

  return (url) => new WebSocket(url) as AlphaFeedWebSocketLike;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function normalizeMarket(value: unknown): Market | null {
  const market = typeof value === "string" ? value.trim().toUpperCase() : "";
  return market === "US" || market === "HK" || market === "CN" ? market : null;
}

function toNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function getPayloadRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getArrayPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const record = getPayloadRecord(value);
  if (!record) {
    return [];
  }

  if (Array.isArray(record.data)) {
    return record.data;
  }

  if (Array.isArray(record.quotes)) {
    return record.quotes;
  }

  if (record.data && typeof record.data === "object") {
    return [record.data];
  }

  return [record];
}

function readField(record: Record<string, unknown>, names: string[]) {
  return names.map((name) => record[name]).find((value) => value !== undefined && value !== null);
}

function parseStreamQuote(value: unknown, watchlistBySymbol: Map<string, MarketWatchlistItem>): MarketQuoteSnapshot | null {
  const record = getPayloadRecord(value);
  if (!record) {
    return null;
  }

  const symbol = normalizeSymbol(String(readField(record, ["symbol", "ticker", "code"]) ?? ""));
  const watchlistItem = watchlistBySymbol.get(symbol);
  const market = normalizeMarket(readField(record, ["market", "region", "exchange"])) ?? watchlistItem?.market ?? null;
  const lastPrice = toNumber(readField(record, ["lastPrice", "last_price", "price", "last"]));
  const previousClose = toNumber(readField(record, ["previousClose", "prev_close", "preClose", "pre_close"]));

  if (!symbol || !market || lastPrice === null || previousClose === null) {
    return null;
  }

  const openPrice = toNumber(readField(record, ["openPrice", "open"]));
  const highPrice = toNumber(readField(record, ["highPrice", "high"]));
  const lowPrice = toNumber(readField(record, ["lowPrice", "low"]));
  const volume = toNumber(readField(record, ["volume", "vol"])) ?? 0;
  const amount = toNumber(readField(record, ["amount", "turnover"]));
  const explicitChangePercent = toNumber(readField(record, ["changePercent", "change_percent", "pct_chg", "changeRate"]));
  const timestamp = readField(record, ["quoteTime", "timestamp", "time", "ts"]);
  const quoteTime =
    typeof timestamp === "string"
      ? new Date(timestamp).toISOString()
      : typeof timestamp === "number"
        ? new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000).toISOString()
        : new Date().toISOString();

  return {
    symbol,
    market,
    lastPrice,
    previousClose,
    openPrice: openPrice ?? undefined,
    highPrice: highPrice ?? undefined,
    lowPrice: lowPrice ?? undefined,
    changePercent: explicitChangePercent ?? ((lastPrice - previousClose) / previousClose) * 100,
    volume,
    amount: amount ?? undefined,
    quoteTime,
    receivedAt: new Date().toISOString(),
    provider: "alphafeed",
  };
}

export function createAlphaFeedStreamSubscribePayload(request: AlphaFeedStreamConnectRequest): AlphaFeedStreamSubscribePayload {
  if (request.mode === "all-symbols") {
    return {
      op: "subscribe",
      channel: "quotes",
      auth: { apiKey: request.credentials.apiKey },
      universes: ["US", "HK", "CN"],
    };
  }

  return {
    op: "subscribe",
    channel: "quotes",
    auth: { apiKey: request.credentials.apiKey },
    symbols: [...new Set(request.watchlist.map((item) => normalizeSymbol(item.symbol)).filter(Boolean))],
  };
}

export function parseAlphaFeedStreamMessage(data: unknown, watchlist: MarketWatchlistItem[]) {
  const payload = typeof data === "string" ? JSON.parse(data) : data;
  const record = getPayloadRecord(payload);
  const messageText = JSON.stringify(payload).toLowerCase();

  if (
    messageText.includes("401") ||
    messageText.includes("unauthorized") ||
    messageText.includes("invalid key") ||
    messageText.includes("invalid api")
  ) {
    return { kind: "error" as const, status: "auth_failed" as const, message: "AlphaFeed WebSocket 认证失败，已切换 REST fallback" };
  }

  if (messageText.includes("403") || messageText.includes("forbidden") || messageText.includes("permission")) {
    return { kind: "error" as const, status: "permission_denied" as const, message: "AlphaFeed WebSocket 无权限，已切换 REST fallback" };
  }

  if (record?.type === "pong" || record?.event === "pong") {
    return { kind: "heartbeat" as const };
  }

  const watchlistBySymbol = new Map(watchlist.map((item) => [normalizeSymbol(item.symbol), item]));
  const snapshots = getArrayPayload(payload)
    .map((item) => parseStreamQuote(item, watchlistBySymbol))
    .filter((item): item is MarketQuoteSnapshot => Boolean(item));

  return { kind: "snapshots" as const, snapshots };
}

function classifyCloseEvent(event: { code?: number; reason?: string }) {
  const reason = (event.reason ?? "").toLowerCase();

  if (event.code === 1008 || event.code === 4001 || reason.includes("unauthorized") || reason.includes("invalid key")) {
    return { status: "auth_failed" as const, message: "AlphaFeed WebSocket 认证失败，已切换 REST fallback" };
  }

  if (event.code === 4003 || reason.includes("forbidden") || reason.includes("permission")) {
    return { status: "permission_denied" as const, message: "AlphaFeed WebSocket 无权限，已切换 REST fallback" };
  }

  return { status: "network_error" as const, message: "AlphaFeed WebSocket 连接中断，已切换 REST fallback" };
}

export function createAlphaFeedStreamSession(dependencies: AlphaFeedStreamSessionDependencies = {}): AlphaFeedStreamSession {
  const setTimer = dependencies.setTimeout ?? ((handler, timeoutMs) => setTimeout(handler, timeoutMs));
  const clearTimer = dependencies.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const reconnectDelayMs = dependencies.reconnectDelayMs ?? 3_000;
  const maxReconnectAttempts = dependencies.maxReconnectAttempts ?? 3;
  const state: AlphaFeedStreamSessionState = {
    request: null,
    socket: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
    snapshotsByKey: {},
    state: "idle",
    health: createHealth("error", "AlphaFeed WebSocket 未连接", Date.now()),
    manualClose: false,
  };

  const clearReconnect = () => {
    if (state.reconnectTimer) {
      clearTimer(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  };

  const connectSocket = (request: AlphaFeedStreamConnectRequest) => {
    const startedAt = dependencies.now?.() ?? Date.now();
    const createWebSocket = getWebSocketFactory(dependencies.createWebSocket);

    clearReconnect();
    state.request = request;

    if (!createWebSocket) {
      state.state = "fallback";
      state.health = createHealth("network_error", "当前运行环境缺少 WebSocket，已切换 REST fallback", startedAt);
      return;
    }

    state.manualClose = false;
    state.state = "connecting";
    state.health = createHealth("network_error", "AlphaFeed WebSocket 正在连接", startedAt);

    const socket = createWebSocket(request.credentials.wsUrl);
    state.socket = socket;

    socket.onopen = () => {
      if (state.socket !== socket) {
        return;
      }

      state.reconnectAttempts = 0;
      state.state = "connected";
      state.health = createHealth("ok", "AlphaFeed WebSocket 已连接", startedAt);
      socket.send(JSON.stringify(createAlphaFeedStreamSubscribePayload(request)));
    };

    socket.onmessage = (event) => {
      if (state.socket !== socket) {
        return;
      }

      try {
        const parsed = parseAlphaFeedStreamMessage(event.data, request.watchlist);

        if (parsed.kind === "error") {
          state.state = "fallback";
          state.health = createHealth(parsed.status, parsed.message, startedAt);
          socket.close();
          return;
        }

        if (parsed.kind === "snapshots" && parsed.snapshots.length > 0) {
          for (const snapshot of parsed.snapshots) {
            state.snapshotsByKey[`${snapshot.market}:${snapshot.symbol}`] = snapshot;
          }
          state.state = "connected";
          state.health = createHealth("ok", `AlphaFeed WebSocket 更新 ${parsed.snapshots.length} 只`, startedAt);
        }
      } catch {
        state.state = "fallback";
        state.health = createHealth("invalid_response", "AlphaFeed WebSocket 响应无法解析，已切换 REST fallback", startedAt);
      }
    };

    socket.onerror = () => {
      if (state.socket === socket) {
        state.state = "fallback";
        state.health = createHealth("network_error", "AlphaFeed WebSocket 网络错误，已切换 REST fallback", startedAt);
      }
    };

    socket.onclose = (event) => {
      if (state.socket !== socket) {
        return;
      }

      state.socket = null;

      if (state.manualClose) {
        state.state = "idle";
        state.health = createHealth("ok", "AlphaFeed WebSocket 已断开", startedAt);
        return;
      }

      if (state.state === "fallback" && (state.health.status === "auth_failed" || state.health.status === "permission_denied")) {
        return;
      }

      const classified = classifyCloseEvent(event);
      state.state = "fallback";
      state.health = createHealth(classified.status, classified.message, startedAt);

      if (classified.status === "network_error" && state.reconnectAttempts < maxReconnectAttempts && state.request) {
        state.reconnectAttempts += 1;
        state.reconnectTimer = setTimer(() => {
          state.reconnectTimer = null;
          if (state.request) {
            connectSocket(state.request);
          }
        }, reconnectDelayMs);
      }
    };
  };

  return {
    async connect(request) {
      const sameUrl = state.request?.credentials.wsUrl === request.credentials.wsUrl;
      const sameMode = state.request?.mode === request.mode;
      const sameWatchlist = JSON.stringify(state.request?.watchlist.map((item) => item.symbol)) === JSON.stringify(request.watchlist.map((item) => item.symbol));

      const hasStableSameRequest =
        sameUrl &&
        sameMode &&
        sameWatchlist &&
        (state.state === "connecting" ||
          state.socket?.readyState === websocketOpenState ||
          state.health.status === "auth_failed" ||
          state.health.status === "permission_denied");

      if (hasStableSameRequest) {
        return { ok: true, health: state.health, state: state.state };
      }

      if (state.socket) {
        state.manualClose = true;
        state.socket.close(1000, "reconnect");
      }

      state.snapshotsByKey = {};
      state.reconnectAttempts = 0;
      connectSocket(request);
      return { ok: true, health: state.health, state: state.state };
    },
    async readSnapshot() {
      return {
        ok: true,
        snapshots: Object.values(state.snapshotsByKey),
        health: state.health,
        state: state.state,
      };
    },
    async disconnect() {
      clearReconnect();
      state.manualClose = true;
      state.socket?.close(1000, "disconnect");
      state.socket = null;
      state.request = null;
      state.state = "idle";
      state.health = createHealth("ok", "AlphaFeed WebSocket 已断开", Date.now());
      return { ok: true, health: state.health, state: state.state };
    },
  };
}
