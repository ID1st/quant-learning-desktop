import { Config, QuoteContext } from "longbridge";
import {
  normalizeLongPortApiCredentials,
  verifyLongPortApiCredentials,
  type LongPortApiCredentials,
  type LongPortVerificationSummary,
} from "../../../../packages/api-client/src/longport.ts";
import type { MarketQuoteSnapshot, MarketWatchlistItem } from "../features/marketData/marketDataSyncService.ts";

export type LongPortBridgeVerificationResult =
  | {
      ok: true;
      summary: LongPortVerificationSummary;
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

export type LongPortBridgeQuoteSnapshotResult =
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

function redactSecrets(message: string, credentials: LongPortApiCredentials) {
  return [credentials.appKey, credentials.appSecret, credentials.accessToken].reduce((currentMessage, secret) => {
    const normalized = secret.trim();
    return normalized ? currentMessage.replaceAll(normalized, "********") : currentMessage;
  }, message);
}

function toSafeLongPortError(error: unknown, credentials: LongPortApiCredentials) {
  if (error instanceof Error && error.message.trim()) {
    return `长桥 API 验证失败：${redactSecrets(error.message, credentials)}`;
  }

  return "长桥 API 验证失败，请检查 App Key、App Secret、Access Token 和网络连接。";
}

function createLongPortQuoteContext(credentials: LongPortApiCredentials) {
  const normalizedCredentials = normalizeLongPortApiCredentials(credentials);
  const config = Config.fromApikey(normalizedCredentials.appKey, normalizedCredentials.appSecret, normalizedCredentials.accessToken, {
    httpUrl: normalizedCredentials.apiUrl,
    language: 0,
  });

  return QuoteContext.new(config);
}

function decimalToNumber(value: { toString(): string }) {
  const numericValue = Number(value.toString());
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function getMarketBySymbol(symbol: string, watchlist: MarketWatchlistItem[]) {
  return watchlist.find((item) => item.symbol === symbol)?.market ?? "US";
}

export async function verifyLongPortCredentialsWithSdk(
  credentials: LongPortApiCredentials,
): Promise<LongPortBridgeVerificationResult> {
  try {
    const summary = await verifyLongPortApiCredentials(credentials, {
      probe: async (normalizedCredentials) => {
        const quoteContext = createLongPortQuoteContext(normalizedCredentials);
        const memberId = await quoteContext.memberId();

        return {
          accountId: String(memberId),
          markets: ["US", "HK", "CN"],
        };
      },
    });

    return {
      ok: true,
      summary,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: toSafeLongPortError(error, credentials),
      },
    };
  }
}

export async function fetchLongPortQuoteSnapshotsWithSdk(
  credentials: LongPortApiCredentials,
  watchlist: MarketWatchlistItem[],
): Promise<LongPortBridgeQuoteSnapshotResult> {
  try {
    const quoteContext = createLongPortQuoteContext(credentials);
    const symbols = watchlist.map((item) => item.symbol);
    const quotes = symbols.length > 0 ? await quoteContext.quote(symbols) : [];
    const receivedAt = new Date().toISOString();
    const snapshots = quotes.map<MarketQuoteSnapshot>((quote) => {
      const lastPrice = decimalToNumber(quote.lastDone);
      const previousClose = decimalToNumber(quote.prevClose);
      const changePercent = previousClose === 0 ? 0 : ((lastPrice - previousClose) / previousClose) * 100;

      return {
        symbol: quote.symbol,
        market: getMarketBySymbol(quote.symbol, watchlist),
        lastPrice,
        previousClose,
        changePercent,
        volume: quote.volume,
        quoteTime: quote.timestamp.toISOString(),
        receivedAt,
        provider: "longport",
      };
    });

    return {
      ok: true,
      snapshots,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: toSafeLongPortError(error, credentials),
      },
    };
  }
}
