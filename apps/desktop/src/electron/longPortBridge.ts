import { Config, QuoteContext } from "longbridge";
import type { Timeframe } from "@quant/shared";
import {
  normalizeLongPortApiCredentials,
  verifyLongPortApiCredentials,
  type LongPortApiCredentials,
  type LongPortBarRequest,
  type LongPortMarketDataBar,
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

export type LongPortBridgeBarsResult =
  | {
      ok: true;
      bars: LongPortMarketDataBar[];
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

interface LongPortCandlestickLike {
  close: { toString(): string };
  open: { toString(): string };
  low: { toString(): string };
  high: { toString(): string };
  turnover: { toString(): string };
  volume: number;
  timestamp: Date;
}

type LongPortCandlestickPeriod = Parameters<QuoteContext["candlesticks"]>[1];
type LongPortAdjustType = Parameters<QuoteContext["candlesticks"]>[3];
type LongPortTradeSessions = Parameters<QuoteContext["candlesticks"]>[4];

const longPortPeriod = {
  min1: 1,
  min5: 4,
  min15: 6,
  min30: 8,
  min60: 10,
  day: 14,
  week: 15,
} as const;
const longPortNoAdjust = 0 as LongPortAdjustType;
const longPortAllTradeSessions = 1 as LongPortTradeSessions;

function redactSecrets(message: string, credentials: LongPortApiCredentials) {
  return [credentials.appKey, credentials.appSecret, credentials.accessToken].reduce((currentMessage, secret) => {
    const normalized = secret.trim();
    return normalized ? currentMessage.replaceAll(normalized, "********") : currentMessage;
  }, message);
}

function toSafeLongPortError(error: unknown, credentials: LongPortApiCredentials, action = "验证") {
  if (error instanceof Error && error.message.trim()) {
    return `长桥 API ${action}失败：${redactSecrets(error.message, credentials)}`;
  }

  return `长桥 API ${action}失败，请检查 App Key、App Secret、Access Token 和网络连接。`;
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

function mapTimeframeToLongPortPeriod(timeframe: Timeframe) {
  if (timeframe === "realtime" || timeframe === "1m") {
    return longPortPeriod.min1 as LongPortCandlestickPeriod;
  }

  if (timeframe === "5m") {
    return longPortPeriod.min5 as LongPortCandlestickPeriod;
  }

  if (timeframe === "15m") {
    return longPortPeriod.min15 as LongPortCandlestickPeriod;
  }

  if (timeframe === "30m") {
    return longPortPeriod.min30 as LongPortCandlestickPeriod;
  }

  if (timeframe === "1h") {
    return longPortPeriod.min60 as LongPortCandlestickPeriod;
  }

  if (timeframe === "1w") {
    return longPortPeriod.week as LongPortCandlestickPeriod;
  }

  return longPortPeriod.day as LongPortCandlestickPeriod;
}

function getDefaultLongPortBarCount(timeframe: Timeframe) {
  if (timeframe === "realtime" || timeframe === "1m") {
    return 2_000;
  }

  if (timeframe === "1w") {
    return 260;
  }

  return 600;
}

export function mapLongPortCandlesticksToBars(
  candlesticks: LongPortCandlestickLike[],
  request: LongPortBarRequest,
): LongPortMarketDataBar[] {
  const timeframe = request.timeframe === "1m" ? "realtime" : request.timeframe;
  const startTime = typeof request.startTime === "number" ? request.startTime : Number.NEGATIVE_INFINITY;
  const endTime = typeof request.endTime === "number" ? request.endTime : Number.POSITIVE_INFINITY;

  return candlesticks
    .map<LongPortMarketDataBar>((candlestick) => ({
      symbol: request.symbol,
      market: request.market,
      timeframe,
      timestamp: candlestick.timestamp.getTime(),
      open: decimalToNumber(candlestick.open),
      high: decimalToNumber(candlestick.high),
      low: decimalToNumber(candlestick.low),
      close: decimalToNumber(candlestick.close),
      volume: candlestick.volume,
      amount: decimalToNumber(candlestick.turnover),
      provider: "longport",
    }))
    .filter((bar) => bar.timestamp >= startTime && bar.timestamp <= endTime)
    .sort((left, right) => left.timestamp - right.timestamp);
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
        message: toSafeLongPortError(error, credentials, "验证"),
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
        message: toSafeLongPortError(error, credentials, "行情快照请求"),
      },
    };
  }
}

export async function fetchLongPortHistoricalBarsWithSdk(
  credentials: LongPortApiCredentials,
  request: LongPortBarRequest,
): Promise<LongPortBridgeBarsResult> {
  try {
    const symbol = request.symbol.trim();

    if (!symbol) {
      throw new Error("长桥 K 线标的代码不能为空。");
    }

    const quoteContext = createLongPortQuoteContext(credentials);
    const count = Math.max(1, Math.min(10_000, Math.round(request.count ?? getDefaultLongPortBarCount(request.timeframe))));
    const candlesticks = await quoteContext.candlesticks(
      symbol,
      mapTimeframeToLongPortPeriod(request.timeframe),
      count,
      longPortNoAdjust,
      longPortAllTradeSessions,
    );

    return {
      ok: true,
      bars: mapLongPortCandlesticksToBars(candlesticks, { ...request, symbol }),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: toSafeLongPortError(error, credentials, "历史 K 线请求"),
      },
    };
  }
}
