import type { Market, Timeframe } from "@quant/shared";
import type {
  GatewayMarketDataBar,
  GatewayMarketQuoteSnapshot,
  HistoricalBarProvider,
  InstrumentSearchProvider,
  MarketInstrument,
  IntradayBarProvider,
  MarketDataBarRequest,
  MarketDataProviderCapability,
  MarketDataProviderDelayLevel,
  MarketDataProviderHealthStatus,
  MarketDataProviderHealthView,
  MarketDataProviderRequestItem,
  RealtimeQuoteProvider,
} from "./marketDataProviderGateway.ts";

export type StockSdkHistoryPeriod = "daily" | "weekly";
export type StockSdkMinutePeriod = "1" | "5" | "15" | "30" | "60";

export interface StockSdkQuoteRequest {
  readonly market: Market;
  readonly symbol: string;
  readonly providerSymbol: string;
}

export interface StockSdkBarRequest extends StockSdkQuoteRequest {
  readonly timeframe: Timeframe;
  readonly period: StockSdkHistoryPeriod | StockSdkMinutePeriod;
  readonly count?: number;
  readonly startTime?: number;
  readonly endTime?: number;
}

export type StockSdkRawRecord = Readonly<Record<string, unknown>>;

export interface StockSdkGatewayProviderOperations {
  fetchQuoteSnapshot(requests: readonly StockSdkQuoteRequest[]): Promise<readonly StockSdkRawRecord[]>;
  fetchHistoricalBars(request: StockSdkBarRequest): Promise<readonly StockSdkRawRecord[]>;
  fetchIntradayBars(request: StockSdkBarRequest): Promise<readonly StockSdkRawRecord[]>;
  searchInstruments?(query: string): Promise<readonly StockSdkRawRecord[]>;
}

export interface StockSdkGatewayProviderOptions {
  readonly enabled?: boolean;
  readonly delayLevel?: MarketDataProviderDelayLevel;
}

const stockSdkCapability: MarketDataProviderCapability = {
  realtimeQuote: true,
  historicalBars: true,
  intradayBars: true,
  websocket: false,
  batchQuote: true,
  instrumentSearch: true,
  markets: ["US", "HK", "CN"],
  timeframes: ["realtime", "1m", "5m", "15m", "30m", "1h", "1d", "1w"],
  rateLimit: {
    requests: 3,
    intervalMs: 1_000,
    scope: "global",
  },
  delayLevel: "unknown",
};

const minutePeriodByTimeframe = new Map<Timeframe, StockSdkMinutePeriod>([
  ["1m", "1"],
  ["5m", "5"],
  ["15m", "15"],
  ["30m", "30"],
  ["1h", "60"],
]);

export function createStockSdkGatewayProvider(
  operations: StockSdkGatewayProviderOperations,
  options: StockSdkGatewayProviderOptions = {},
): RealtimeQuoteProvider & HistoricalBarProvider & IntradayBarProvider & InstrumentSearchProvider {
  const delayLevel = options.delayLevel ?? "unknown";
  const capability = { ...stockSdkCapability, delayLevel };
  const health = createStockSdkHealthStore(capability, options.enabled === true ? "healthy" : "unconfigured");

  return {
    id: "stock-sdk",
    displayName: "Stock SDK",
    capability,
    getHealth: health.read,
    async fetchQuoteSnapshot(items) {
      assertProviderEnabled(options);
      const requests = items.map((item) => toStockSdkQuoteRequest(item));
      const startedAt = Date.now();
      try {
        const records = await operations.fetchQuoteSnapshot(requests);
        health.markHealthy(Date.now() - startedAt);
        return mapStockSdkQuoteSnapshots(records, requests, delayLevel);
      } catch (error) {
        health.markFailed(toErrorMessage(error));
        throw error;
      }
    },
    async fetchHistoricalBars(request) {
      assertProviderEnabled(options);
      const stockSdkRequest = toStockSdkBarRequest(request, "historical");
      const startedAt = Date.now();
      try {
        const records = await operations.fetchHistoricalBars(stockSdkRequest);
        health.markHealthy(Date.now() - startedAt);
        return mapStockSdkBars(records, stockSdkRequest, delayLevel);
      } catch (error) {
        health.markFailed(toErrorMessage(error));
        throw error;
      }
    },
    async fetchIntradayBars(request) {
      assertProviderEnabled(options);
      const stockSdkRequest = toStockSdkBarRequest(request, "intraday");
      const startedAt = Date.now();
      try {
        const records = await operations.fetchIntradayBars(stockSdkRequest);
        health.markHealthy(Date.now() - startedAt);
        return mapStockSdkBars(records, stockSdkRequest, delayLevel);
      } catch (error) {
        health.markFailed(toErrorMessage(error));
        throw error;
      }
    },
    async searchInstruments(query, markets) {
      assertProviderEnabled(options);
      const keyword = query.trim();
      if (!keyword) {
        return [];
      }

      const startedAt = Date.now();
      try {
        if (!operations.searchInstruments) {
          throw new Error("Stock SDK search is not available in this runtime.");
        }
        const records = await operations.searchInstruments(keyword);
        const instruments = records
          .map((record) => toMarketInstrument(record))
          .filter((instrument): instrument is MarketInstrument => instrument !== null)
          .filter((instrument) => !markets || markets.includes(instrument.market));
        health.markHealthy(Date.now() - startedAt);
        return instruments;
      } catch (error) {
        health.markFailed(toErrorMessage(error));
        throw error;
      }
    },
  };
}

function toMarketInstrument(record: StockSdkRawRecord): MarketInstrument | null {
  const rawCode = readOptionalString(record, ["code", "symbol", "securityCode"]);
  const name = readOptionalString(record, ["name", "securityName", "displayName"]);
  const rawMarket = readOptionalString(record, ["market", "exchange", "marketCode"]);
  if (!rawCode || !name) {
    return null;
  }

  const market = normalizeSearchMarket(rawMarket, rawCode);
  if (!market) {
    return null;
  }

  return { provider: "stock-sdk", market, symbol: normalizeSearchSymbol(rawCode, market), name };
}

function normalizeSearchMarket(rawMarket: string | undefined, code: string): Market | null {
  const candidate = `${rawMarket ?? ""} ${code}`.toLowerCase();
  if (candidate.includes("us") || /^\d+\.[a-z]/i.test(code)) {
    return "US";
  }
  if (candidate.includes("hk")) {
    return "HK";
  }
  return /^(sh|sz)?\d{6}$/i.test(code) ? "CN" : null;
}

function normalizeSearchSymbol(code: string, market: Market) {
  const normalized = code.trim().toUpperCase();
  if (market === "US") {
    const ticker = normalized
      .replace(/^105\./u, "")
      .replace(/^US/u, "")
      .replace(/\.(US|OQ|N|A|P)$/u, "");
    return `${ticker}.US`;
  }
  if (market === "HK") {
    return normalized.replace(/^HK/u, "").replace(/\.HK$/u, "").padStart(5, "0") + ".HK";
  }
  const digits = normalized.replace(/^(SH|SZ)/u, "").replace(/\.(SH|SZ)$/u, "");
  const exchange = normalized.startsWith("SZ") || normalized.endsWith(".SZ") || digits.startsWith("0") || digits.startsWith("3") ? ".SZ" : ".SH";
  return `${digits}${exchange}`;
}

export function toStockSdkQuoteRequest(item: MarketDataProviderRequestItem): StockSdkQuoteRequest {
  return {
    market: item.market,
    symbol: item.symbol,
    providerSymbol: normalizeStockSdkSymbol(item.symbol, item.market, "quote"),
  };
}

export function toStockSdkBarRequest(
  request: MarketDataBarRequest,
  kind: "historical" | "intraday",
): StockSdkBarRequest {
  return {
    market: request.market,
    symbol: request.symbol,
    providerSymbol: normalizeStockSdkSymbol(request.symbol, request.market, kind),
    timeframe: request.timeframe,
    period: kind === "historical" ? toStockSdkHistoryPeriod(request.timeframe) : toStockSdkMinutePeriod(request.timeframe),
    count: request.count,
    startTime: request.startTime,
    endTime: request.endTime,
  };
}

export function normalizeStockSdkSymbol(
  symbol: string,
  market: Market,
  usage: "quote" | "historical" | "intraday",
): string {
  const clean = symbol.trim().toUpperCase();

  if (market === "CN") {
    const code = clean.replace(/\.(SH|SZ|CN)$/u, "").replace(/^(SH|SZ)/u, "");
    const exchange = clean.endsWith(".SZ") || clean.startsWith("SZ") || code.startsWith("0") || code.startsWith("3") ? "sz" : "sh";
    return usage === "quote" ? `${exchange}${code}` : code;
  }

  if (market === "HK") {
    const code = clean.replace(/\.HK$/u, "").replace(/^HK/u, "");
    return code.padStart(5, "0");
  }

  const code = clean.replace(/\.US$/u, "").replace(/^US[:.-]/u, "");
  if (usage === "quote" || code.includes(".")) {
    return code;
  }

  return `105.${code}`;
}

function createStockSdkHealthStore(
  capability: MarketDataProviderCapability,
  initialStatus: MarketDataProviderHealthStatus,
) {
  let current: MarketDataProviderHealthView = {
    provider: "stock-sdk",
    status: initialStatus,
    message:
      initialStatus === "healthy"
        ? "Stock SDK 已启用，可处理行情网关请求。"
        : "Stock SDK 已安装但尚未启用。",
    checkedAt: new Date(0).toISOString(),
    capability,
  };

  return {
    read: async () => current,
    markHealthy: (latencyMs: number) => {
      current = {
        provider: "stock-sdk",
        status: capability.delayLevel === "delayed" ? "delayed" : "healthy",
        message: "Stock SDK 请求成功。",
        checkedAt: new Date().toISOString(),
        latencyMs,
        capability,
      };
    },
    markFailed: (message: string) => {
      current = {
        provider: "stock-sdk",
        status: classifyStockSdkFailure(message),
        message: formatStockSdkFailure(message),
        checkedAt: new Date().toISOString(),
        capability,
      };
    },
  };
}

function assertProviderEnabled(options: StockSdkGatewayProviderOptions) {
  if (options.enabled !== true) {
    throw new Error("Stock SDK provider is not enabled.");
  }
}

function mapStockSdkQuoteSnapshots(
  records: readonly StockSdkRawRecord[],
  requests: readonly StockSdkQuoteRequest[],
  delayLevel: MarketDataProviderDelayLevel,
): readonly GatewayMarketQuoteSnapshot[] {
  return requests.map((request, index) =>
    mapStockSdkQuoteSnapshot(findQuoteRecordForRequest(records, request, index), request, delayLevel),
  );
}

function findQuoteRecordForRequest(
  records: readonly StockSdkRawRecord[],
  request: StockSdkQuoteRequest,
  _fallbackIndex: number,
): StockSdkRawRecord | undefined {
  const requestKeys = new Set([
    normalizeComparableSymbol(request.providerSymbol),
    normalizeComparableSymbol(request.symbol),
  ]);

  return records.find((record) => {
    const recordSymbol = readOptionalString(record, ["providerSymbol", "symbol", "code", "secid", "securityCode"]);
    return recordSymbol ? requestKeys.has(normalizeComparableSymbol(recordSymbol)) : false;
  });
}

function mapStockSdkQuoteSnapshot(
  record: StockSdkRawRecord | undefined,
  request: StockSdkQuoteRequest,
  delayLevel: MarketDataProviderDelayLevel,
): GatewayMarketQuoteSnapshot {
  if (!record) {
    throw new Error(`Stock SDK returned no quote for ${request.symbol}.`);
  }

  const price = readFiniteNumber(record, ["price", "lastPrice", "current", "close", "latestPrice"]);
  const previousClose = readOptionalFiniteNumber(record, ["previousClose", "prevClose", "preClose", "lastClose"]);
  const timestamp = readTimestamp(record, ["timestamp", "quoteTime", "datetime", "dateTime", "time", "date"]);

  return {
    provider: "stock-sdk",
    market: request.market,
    symbol: request.symbol,
    name: readOptionalString(record, ["name", "stockName", "securityName"]),
    price,
    previousClose,
    openPrice: readOptionalFiniteNumber(record, ["openPrice", "open"]),
    highPrice: readOptionalFiniteNumber(record, ["highPrice", "high"]),
    lowPrice: readOptionalFiniteNumber(record, ["lowPrice", "low"]),
    change: readOptionalFiniteNumber(record, ["change", "chg"]),
    changePercent: readOptionalFiniteNumber(record, ["changePercent", "pctChg", "pct", "changeRate"]),
    timestamp,
    volume: readOptionalFiniteNumber(record, ["volume", "vol"]),
    amount: readOptionalFiniteNumber(record, ["amount", "turnover"]),
    receivedAt: new Date().toISOString(),
    delayLevel,
  };
}

function mapStockSdkBars(
  records: readonly StockSdkRawRecord[],
  request: StockSdkBarRequest,
  delayLevel: MarketDataProviderDelayLevel,
): readonly GatewayMarketDataBar[] {
  let previousClose: number | undefined;

  return records.map((record) => {
    const close = readFiniteNumber(record, ["close", "closingPrice", "price"]);
    const high = readFiniteNumber(record, ["high", "highestPrice"]);
    const low = readFiniteNumber(record, ["low", "lowestPrice"]);
    const repairedOpen = repairOpenPrice(readFiniteNumber(record, ["open", "openingPrice"], true), close, previousClose, high, low);
    const repairedExtremes = repairMinorOhlcPrecisionMismatch(repairedOpen, high, low, close);
    const bar: GatewayMarketDataBar = {
      provider: "stock-sdk",
      market: request.market,
      symbol: request.symbol,
      timeframe: request.timeframe,
      timestamp: readTimestamp(record, ["timestamp", "datetime", "dateTime", "time", "date"]),
      open: repairedOpen,
      high: repairedExtremes.high,
      low: repairedExtremes.low,
      close,
      volume: readOptionalFiniteNumber(record, ["volume", "vol"]) ?? 0,
      amount: readOptionalFiniteNumber(record, ["amount", "turnover"]),
      delayLevel,
    };

    validateBar(bar);
    previousClose = bar.close;
    return bar;
  });
}

function repairOpenPrice(open: number, close: number, previousClose: number | undefined, high: number, low: number) {
  if (open > 0) {
    return open;
  }

  return previousClose && previousClose >= low && previousClose <= high ? previousClose : close;
}

function repairMinorOhlcPrecisionMismatch(open: number, high: number, low: number, close: number) {
  const repairedHigh = Math.max(high, open, close);
  const repairedLow = Math.min(low, open, close);
  const correction = Math.max(Math.abs(repairedHigh - high), Math.abs(repairedLow - low));
  const referencePrice = Math.max(Math.abs(open), Math.abs(high), Math.abs(low), Math.abs(close));
  const tolerance = Math.max(0.02, referencePrice * 0.00005);

  if (correction > tolerance) {
    return { high, low };
  }

  return { high: repairedHigh, low: repairedLow };
}

function validateBar(bar: GatewayMarketDataBar) {
  const values = [bar.open, bar.high, bar.low, bar.close, bar.volume, bar.timestamp];
  if (!values.every((value) => Number.isFinite(value))) {
    throw new Error(`Stock SDK returned invalid bar for ${bar.symbol}.`);
  }

  if (bar.high < bar.low || bar.high < bar.close || bar.high < bar.open || bar.low > bar.close || bar.low > bar.open) {
    throw new Error(`Stock SDK returned inconsistent OHLC for ${bar.symbol}.`);
  }
}

function toStockSdkHistoryPeriod(timeframe: Timeframe): StockSdkHistoryPeriod {
  if (timeframe === "1w") {
    return "weekly";
  }

  if (timeframe === "1d") {
    return "daily";
  }

  throw new Error(`Stock SDK historical bars do not support ${timeframe}.`);
}

function toStockSdkMinutePeriod(timeframe: Timeframe): StockSdkMinutePeriod {
  const period = minutePeriodByTimeframe.get(timeframe);
  if (!period) {
    throw new Error(`Stock SDK intraday bars do not support ${timeframe}.`);
  }

  return period;
}

function readTimestamp(record: StockSdkRawRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    const timestamp = parseTimestamp(value);
    if (timestamp !== null) {
      return timestamp;
    }
  }

  throw new Error("Stock SDK record has no valid timestamp.");
}

function parseTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const normalized = (value.includes("T") ? value : value.replace(" ", "T")).replaceAll("/", "-");
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function readFiniteNumber(record: StockSdkRawRecord, keys: readonly string[], allowZero = false) {
  const value = readOptionalFiniteNumber(record, keys);
  if (value === undefined || (!allowZero && value <= 0)) {
    throw new Error(`Stock SDK record has no valid numeric value for ${keys.join("/")}.`);
  }

  return value;
}

function readOptionalFiniteNumber(record: StockSdkRawRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    const numberValue =
      typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  return undefined;
}

function readOptionalString(record: StockSdkRawRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return undefined;
}

function normalizeComparableSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/^HK/u, "").replace(/\.HK$|\.US$|\.SH$|\.SZ$/u, "");
}

function classifyStockSdkFailure(message: string): MarketDataProviderHealthStatus {
  const lower = message.toLowerCase();
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("permission")) {
    return "unauthorized";
  }

  if (lower.includes("429") || lower.includes("rate")) {
    return "rateLimited";
  }

  return "unavailable";
}

function formatStockSdkFailure(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("permission")) {
    return "Stock SDK 请求权限不足。";
  }

  if (lower.includes("429") || lower.includes("rate")) {
    return "Stock SDK 请求受限，稍后将自动重试。";
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("und_err_socket") ||
    lower.includes("socket") ||
    lower.includes("network") ||
    lower.includes("timeout")
  ) {
    return "Stock SDK 网络请求失败，已尝试备用数据源。";
  }

  return `Stock SDK 请求失败：${message}`;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
