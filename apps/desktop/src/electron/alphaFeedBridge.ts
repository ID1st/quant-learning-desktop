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

export type AlphaFeedBridgeVerificationResult =
  | {
      ok: true;
      summary: AlphaFeedVerificationSummary;
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

export type AlphaFeedBridgeQuoteSnapshotResult =
  | {
      ok: true;
      snapshots: MarketQuoteSnapshot[];
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

export type AlphaFeedBridgeBarsResult =
  | {
      ok: true;
      bars: AlphaFeedMarketDataBar[];
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

function redactSecret(message: string, credentials: AlphaFeedApiCredentials) {
  const normalized = credentials.apiKey.trim();
  return normalized ? message.replaceAll(normalized, "********") : message;
}

function toSafeAlphaFeedError(error: unknown, credentials: AlphaFeedApiCredentials) {
  if (error instanceof Error && error.message.trim()) {
    return `AlphaFeed API 验证失败：${redactSecret(error.message, credentials)}`;
  }

  return "AlphaFeed API 验证失败，请检查 API Key、套餐权限和网络连接。";
}

export async function verifyAlphaFeedCredentialsWithRest(
  credentials: AlphaFeedApiCredentials,
): Promise<AlphaFeedBridgeVerificationResult> {
  try {
    const summary = await verifyAlphaFeedApiCredentials({
      ...credentials,
      apiUrl: credentials.apiUrl,
    });

    return {
      ok: true,
      summary,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: toSafeAlphaFeedError(error, credentials),
      },
    };
  }
}

export async function fetchAlphaFeedQuoteSnapshotsWithRest(
  credentials: AlphaFeedApiCredentials,
  watchlist: MarketWatchlistItem[],
): Promise<AlphaFeedBridgeQuoteSnapshotResult> {
  try {
    const normalizedCredentials = normalizeAlphaFeedApiCredentials(credentials);
    const snapshots = await fetchAlphaFeedQuoteSnapshots(normalizedCredentials, watchlist);

    return {
      ok: true,
      snapshots,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: toSafeAlphaFeedError(error, credentials),
      },
    };
  }
}

export async function fetchAlphaFeedHistoricalBarsWithRest(
  credentials: AlphaFeedApiCredentials,
  request: AlphaFeedBarRequest,
): Promise<AlphaFeedBridgeBarsResult> {
  try {
    const normalizedCredentials = normalizeAlphaFeedApiCredentials(credentials);
    const bars = await fetchAlphaFeedHistoricalBars(normalizedCredentials, request);

    return {
      ok: true,
      bars,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: toSafeAlphaFeedError(error, credentials),
      },
    };
  }
}

export async function fetchAlphaFeedIntradayBarsWithRest(
  credentials: AlphaFeedApiCredentials,
  request: AlphaFeedBarRequest,
): Promise<AlphaFeedBridgeBarsResult> {
  try {
    const normalizedCredentials = normalizeAlphaFeedApiCredentials(credentials);
    const bars = await fetchAlphaFeedIntradayBars(normalizedCredentials, request);

    return {
      ok: true,
      bars,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: toSafeAlphaFeedError(error, credentials),
      },
    };
  }
}
