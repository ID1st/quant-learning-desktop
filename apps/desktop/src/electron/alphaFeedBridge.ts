import {
  fetchAlphaFeedHistoricalBars,
  fetchAlphaFeedIntradayBars,
  fetchAlphaFeedQuoteSnapshots,
  normalizeAlphaFeedApiCredentials,
  verifyAlphaFeedApiCredentials,
  type AlphaFeedApiCredentials,
  type AlphaFeedBarRequest,
  type AlphaFeedMarketDataBar,
  type AlphaFeedVerificationSummary,
} from "../../../../packages/api-client/src/alphafeed.ts";
import type { MarketQuoteSnapshot, MarketWatchlistItem } from "../features/marketData/marketDataSyncService.ts";

export type AlphaFeedProviderHealthStatus =
  | "ok"
  | "auth_failed"
  | "permission_denied"
  | "rate_limited"
  | "network_error"
  | "invalid_response"
  | "error";

export interface AlphaFeedProviderHealth {
  status: AlphaFeedProviderHealthStatus;
  message: string;
  checkedAt: string;
  latencyMs: number;
  nextRetryAt?: string;
}

export type AlphaFeedBridgeVerificationResult =
  | {
      ok: true;
      summary: AlphaFeedVerificationSummary;
      health: AlphaFeedProviderHealth;
    }
  | {
      ok: false;
      error: {
        message: string;
        health: AlphaFeedProviderHealth;
      };
    };

export type AlphaFeedBridgeQuoteSnapshotResult =
  | {
      ok: true;
      snapshots: MarketQuoteSnapshot[];
      health: AlphaFeedProviderHealth;
    }
  | {
      ok: false;
      error: {
        message: string;
        health: AlphaFeedProviderHealth;
      };
    };

export type AlphaFeedBridgeBarsResult =
  | {
      ok: true;
      bars: AlphaFeedMarketDataBar[];
      health: AlphaFeedProviderHealth;
    }
  | {
      ok: false;
      error: {
        message: string;
        health: AlphaFeedProviderHealth;
      };
    };

function redactSecret(message: string, credentials: AlphaFeedApiCredentials) {
  const normalized = credentials.apiKey.trim();
  return normalized ? message.replaceAll(normalized, "********") : message;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim() ? error.message : "未知错误";
}

function classifyAlphaFeedError(message: string): AlphaFeedProviderHealthStatus {
  const normalized = message.toLowerCase();

  if (message.includes("401") || message.includes("Key 无效") || normalized.includes("unauthorized")) {
    return "auth_failed";
  }

  if (message.includes("403") || message.includes("权限") || normalized.includes("forbidden")) {
    return "permission_denied";
  }

  if (message.includes("429") || message.includes("频率") || normalized.includes("rate limit")) {
    return "rate_limited";
  }

  if (
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("econn") ||
    normalized.includes("etimedout") ||
    normalized.includes("enotfound")
  ) {
    return "network_error";
  }

  if (message.includes("响应") || normalized.includes("json")) {
    return "invalid_response";
  }

  return "error";
}

function createHealth(status: AlphaFeedProviderHealthStatus, message: string, startedAt: number): AlphaFeedProviderHealth {
  const latencyMs = Math.max(0, Math.round(Date.now() - startedAt));
  const health: AlphaFeedProviderHealth = {
    status,
    message,
    checkedAt: new Date().toISOString(),
    latencyMs,
  };

  if (status === "rate_limited") {
    health.nextRetryAt = new Date(Date.now() + 120_000).toISOString();
  }

  return health;
}

function toSafeAlphaFeedError(error: unknown, credentials: AlphaFeedApiCredentials, action = "请求") {
  return `AlphaFeed API ${action}失败：${redactSecret(getErrorMessage(error), credentials)}`;
}

function createErrorHealth(error: unknown, credentials: AlphaFeedApiCredentials, action: string, startedAt: number) {
  const safeMessage = toSafeAlphaFeedError(error, credentials, action);
  return createHealth(classifyAlphaFeedError(getErrorMessage(error)), safeMessage, startedAt);
}

export async function verifyAlphaFeedCredentialsWithRest(
  credentials: AlphaFeedApiCredentials,
): Promise<AlphaFeedBridgeVerificationResult> {
  const startedAt = Date.now();

  try {
    const summary = await verifyAlphaFeedApiCredentials({
      ...credentials,
      apiUrl: credentials.apiUrl,
    });

    return {
      ok: true,
      summary,
      health: createHealth("ok", "AlphaFeed 验证成功", startedAt),
    };
  } catch (error) {
    const health = createErrorHealth(error, credentials, "验证", startedAt);

    return {
      ok: false,
      error: {
        message: health.message,
        health,
      },
    };
  }
}

export async function fetchAlphaFeedQuoteSnapshotsWithRest(
  credentials: AlphaFeedApiCredentials,
  watchlist: MarketWatchlistItem[],
): Promise<AlphaFeedBridgeQuoteSnapshotResult> {
  const startedAt = Date.now();

  try {
    const normalizedCredentials = normalizeAlphaFeedApiCredentials(credentials);
    const snapshots = await fetchAlphaFeedQuoteSnapshots(normalizedCredentials, watchlist);

    return {
      ok: true,
      snapshots,
      health: createHealth("ok", `AlphaFeed 行情快照成功：${snapshots.length} 条`, startedAt),
    };
  } catch (error) {
    const health = createErrorHealth(error, credentials, "行情快照请求", startedAt);

    return {
      ok: false,
      error: {
        message: health.message,
        health,
      },
    };
  }
}

export async function fetchAlphaFeedHistoricalBarsWithRest(
  credentials: AlphaFeedApiCredentials,
  request: AlphaFeedBarRequest,
): Promise<AlphaFeedBridgeBarsResult> {
  const startedAt = Date.now();

  try {
    const normalizedCredentials = normalizeAlphaFeedApiCredentials(credentials);
    const bars = await fetchAlphaFeedHistoricalBars(normalizedCredentials, request);

    return {
      ok: true,
      bars,
      health: createHealth("ok", `AlphaFeed 历史 K 线成功：${bars.length} 条`, startedAt),
    };
  } catch (error) {
    const health = createErrorHealth(error, credentials, "历史 K 线请求", startedAt);

    return {
      ok: false,
      error: {
        message: health.message,
        health,
      },
    };
  }
}

export async function fetchAlphaFeedIntradayBarsWithRest(
  credentials: AlphaFeedApiCredentials,
  request: AlphaFeedBarRequest,
): Promise<AlphaFeedBridgeBarsResult> {
  const startedAt = Date.now();

  try {
    const normalizedCredentials = normalizeAlphaFeedApiCredentials(credentials);
    const bars = await fetchAlphaFeedIntradayBars(normalizedCredentials, request);

    return {
      ok: true,
      bars,
      health: createHealth("ok", `AlphaFeed 分钟 K 线成功：${bars.length} 条`, startedAt),
    };
  } catch (error) {
    const health = createErrorHealth(error, credentials, "分钟 K 线请求", startedAt);

    return {
      ok: false,
      error: {
        message: health.message,
        health,
      },
    };
  }
}
