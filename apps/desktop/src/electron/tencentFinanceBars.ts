import type { Market } from "@quant/shared";
import type {
  StockSdkBarRequest,
  StockSdkRawRecord,
} from "../features/marketData/stockSdkGatewayProvider.ts";

export interface TencentFinanceBarsOperations {
  fetchHistoricalBars(request: StockSdkBarRequest): Promise<readonly StockSdkRawRecord[]>;
  fetchIntradayBars(request: StockSdkBarRequest): Promise<readonly StockSdkRawRecord[]>;
}

export interface TencentFinanceBarsOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxConcurrency?: number;
}

interface TencentPayload {
  readonly code?: number;
  readonly msg?: string;
  readonly data?: Record<string, unknown>;
}

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

class TencentFinanceRequestError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "TencentFinanceRequestError";
    this.retryable = retryable;
  }
}

class TencentFinanceNoDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TencentFinanceNoDataError";
  }
}

const historyEndpoint = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
const minuteEndpoint = "https://web.ifzq.gtimg.cn/appstock/app/minute/query";
const minuteKlineEndpoint = "https://ifzq.gtimg.cn/appstock/app/kline/mkline";
const defaultHistoryCount = 240;
const maximumHistoryCount = 1_000;
const requestHeaders = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://finance.qq.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

export function createTencentFinanceBarsOperations(
  options: TencentFinanceBarsOptions = {},
): TencentFinanceBarsOperations {
  const fetchImpl = options.fetchImpl ?? fetch;
  const request = createTencentRequestClient(
    fetchImpl,
    options.timeoutMs ?? 8_000,
    options.maxConcurrency ?? 2,
  );
  const usExchangeByTicker = new Map<string, TencentUsExchange>();

  return {
    async fetchHistoricalBars(barRequest) {
      const candidates = getHistorySymbolCandidates(barRequest, usExchangeByTicker);
      let lastError: unknown;
      let bestBars: readonly StockSdkRawRecord[] | undefined;
      let bestSymbol: string | undefined;

      for (const symbol of candidates) {
        try {
          const payload = await request(getHistoryUrl(symbol, barRequest));
          const bars = mapHistoryBars(payload, barRequest, symbol);

          if (bars.length === 0) {
            throw new TencentFinanceNoDataError(
              `Tencent Finance returned no usable historical data for ${barRequest.symbol}.`,
            );
          }

          if (isBetterHistoricalCandidate(bars, bestBars, barRequest)) {
            bestBars = bars;
            bestSymbol = symbol;
          }

          if (
            barRequest.market !== "US" ||
            (hasSufficientHistoricalBars(bars, barRequest) &&
              isContinuousHistoricalSeries(bars, barRequest))
          ) {
            if (barRequest.market === "US") {
              usExchangeByTicker.set(getUsTicker(barRequest), getTencentUsExchange(symbol));
            }
            return bars;
          }
        } catch (error) {
          lastError = error;
          if (barRequest.market !== "US" || !(error instanceof TencentFinanceNoDataError)) {
            break;
          }
        }
      }

      if (bestBars && bestSymbol) {
        usExchangeByTicker.set(getUsTicker(barRequest), getTencentUsExchange(bestSymbol));
        return bestBars;
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(`Tencent Finance returned no usable historical data for ${barRequest.symbol}.`);
    },
    async fetchIntradayBars(barRequest) {
      if (barRequest.market === "CN") {
        const payload = await request(getCnMinuteKlineUrl(toTencentSymbol(barRequest), barRequest));
        const bars = mapCnMinuteKlineBars(payload, barRequest, toTencentSymbol(barRequest));
        if (bars.length === 0) {
          throw new Error(
            `Tencent Finance returned no usable intraday data for ${barRequest.symbol}.`,
          );
        }
        return bars;
      }

      const candidates = getIntradaySymbolCandidates(barRequest, usExchangeByTicker);
      let lastError: unknown;

      for (const symbol of candidates) {
        try {
          const payload = await request(getMinuteUrl(symbol));
          const minuteBars = mapMinuteBars(payload, barRequest, symbol);
          const bars =
            barRequest.period === "1"
              ? minuteBars
              : aggregateMinuteBars(minuteBars, Number(barRequest.period));

          if (
            bars.length === 0 ||
            (barRequest.market === "US" &&
              (minuteBars.length < 2 || !hasMinuteDate(payload, symbol)))
          ) {
            throw new TencentFinanceNoDataError(
              `Tencent Finance returned no usable intraday data for ${barRequest.symbol}.`,
            );
          }

          if (barRequest.market === "US") {
            usExchangeByTicker.set(getUsTicker(barRequest), getTencentUsExchange(symbol));
          }

          return bars;
        } catch (error) {
          lastError = error;
          if (barRequest.market !== "US" || !(error instanceof TencentFinanceNoDataError)) {
            break;
          }
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(`Tencent Finance returned no usable intraday data for ${barRequest.symbol}.`);
    },
  };
}

function createTencentRequestClient(
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxConcurrency: number,
) {
  const scheduler = createRequestScheduler(Math.min(2, Math.max(1, Math.floor(maxConcurrency))));

  return (url: URL) =>
    scheduler.run(url.toString(), async () => {
      let lastError: unknown;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const response = await fetchImpl(url, {
              method: "GET",
              headers: requestHeaders,
              signal: controller.signal,
            });
            const body = await response.text();

            if (!response.ok) {
              throw new TencentFinanceRequestError(
                `Tencent Finance request failed with HTTP ${response.status}.`,
                response.status >= 500,
              );
            }

            if (body.length > 2_000_000) {
              throw new TencentFinanceRequestError(
                "Tencent Finance response exceeded the safe size limit.",
                false,
              );
            }

            const payload = parsePayload(body);
            if (payload.code !== undefined && payload.code !== 0) {
              throw new TencentFinanceRequestError(
                `Tencent Finance rejected the request: ${payload.msg ?? "unknown error"}.`,
                false,
              );
            }
            return payload;
          } finally {
            clearTimeout(timeout);
          }
        } catch (error) {
          lastError = error;
          if (attempt === 0 && isRetryableRequestFailure(error)) {
            await delay(250);
            continue;
          }
          break;
        }
      }

      throw normalizeRequestError(lastError);
    });
}

function createRequestScheduler(maxConcurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];
  const inFlight = new Map<string, Promise<unknown>>();

  const startNext = () => {
    while (activeCount < maxConcurrency && queue.length > 0) {
      activeCount += 1;
      queue.shift()?.();
    }
  };

  return {
    run<T>(key: string, operation: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key) as Promise<T> | undefined;
      if (existing) {
        return existing;
      }

      const promise = new Promise<T>((resolve, reject) => {
        queue.push(() => {
          operation()
            .then(resolve, reject)
            .finally(() => {
              activeCount -= 1;
              inFlight.delete(key);
              startNext();
            });
        });
        startNext();
      });

      inFlight.set(key, promise);
      return promise;
    },
  };
}

function parsePayload(body: string): TencentPayload {
  try {
    const payload = JSON.parse(body) as unknown;
    if (!isRecord(payload)) {
      throw new Error("not an object");
    }
    return payload as TencentPayload;
  } catch {
    throw new TencentFinanceRequestError(
      "Tencent Finance returned an invalid JSON response.",
      false,
    );
  }
}

function isRetryableRequestFailure(error: unknown) {
  if (error instanceof TencentFinanceRequestError) {
    return error.retryable;
  }
  return true;
}

function normalizeRequestError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }
  return new Error("Tencent Finance request failed.");
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function getHistoryUrl(symbol: string, request: StockSdkBarRequest) {
  const period = request.period === "weekly" ? "week" : "day";
  const adjustment =
    request.adjust === "forward" ? "qfq" : request.adjust === "backward" ? "hfq" : "";
  const count = getBarCount(request.count);
  const url = new URL(historyEndpoint);
  url.searchParams.set("param", `${symbol},${period},,,${count},${adjustment}`);
  return url;
}

function getMinuteUrl(symbol: string) {
  const url = new URL(minuteEndpoint);
  url.searchParams.set("code", symbol);
  return url;
}

function getCnMinuteKlineUrl(symbol: string, request: StockSdkBarRequest) {
  const url = new URL(minuteKlineEndpoint);
  url.searchParams.set("param", `${symbol},m${request.period},,${getBarCount(request.count)}`);
  return url;
}

function getBarCount(count: number | undefined) {
  if (!Number.isFinite(count)) {
    return defaultHistoryCount;
  }
  return Math.min(maximumHistoryCount, Math.max(2, Math.floor(count ?? defaultHistoryCount)));
}

type TencentUsExchange = "OQ" | "N" | "AM";

const tencentUsExchanges: readonly TencentUsExchange[] = ["OQ", "N", "AM"];

function getHistorySymbolCandidates(
  request: StockSdkBarRequest,
  usExchangeByTicker: ReadonlyMap<string, TencentUsExchange>,
) {
  return request.market === "US"
    ? getUsSymbolCandidates(request, usExchangeByTicker)
    : [toTencentSymbol(request)];
}

function getIntradaySymbolCandidates(
  request: StockSdkBarRequest,
  usExchangeByTicker: ReadonlyMap<string, TencentUsExchange>,
) {
  return request.market === "US"
    ? getUsSymbolCandidates(request, usExchangeByTicker)
    : [toTencentSymbol(request)];
}

function getUsSymbolCandidates(
  request: StockSdkBarRequest,
  usExchangeByTicker: ReadonlyMap<string, TencentUsExchange>,
) {
  const ticker = getUsTicker(request);
  const cachedExchange = usExchangeByTicker.get(ticker);
  const exchanges = cachedExchange
    ? [cachedExchange, ...tencentUsExchanges.filter((exchange) => exchange !== cachedExchange)]
    : tencentUsExchanges;
  return exchanges.map((exchange) => `us${ticker}.${exchange}`);
}

function getTencentUsExchange(symbol: string): TencentUsExchange {
  const exchange = symbol.split(".").at(-1)?.toUpperCase();
  return exchange === "N" || exchange === "AM" ? exchange : "OQ";
}

function hasSufficientHistoricalBars(
  bars: readonly StockSdkRawRecord[],
  request: StockSdkBarRequest,
) {
  const requestedCount = getBarCount(request.count);
  const minimumUsefulCount = request.period === "weekly" ? 26 : 60;
  return bars.length >= Math.min(requestedCount, minimumUsefulCount);
}

function isBetterHistoricalCandidate(
  candidate: readonly StockSdkRawRecord[],
  current: readonly StockSdkRawRecord[] | undefined,
  request: StockSdkBarRequest,
) {
  if (!current) {
    return true;
  }

  const candidateIsContinuous = isContinuousHistoricalSeries(candidate, request);
  const currentIsContinuous = isContinuousHistoricalSeries(current, request);
  return candidateIsContinuous !== currentIsContinuous
    ? candidateIsContinuous
    : candidate.length > current.length;
}

function isContinuousHistoricalSeries(
  bars: readonly StockSdkRawRecord[],
  request: StockSdkBarRequest,
) {
  if (bars.length < 2) {
    return true;
  }

  const timestamps = bars
    .map((bar) => toNonNegativeNumber(bar.timestamp))
    .filter((timestamp): timestamp is number => timestamp !== undefined)
    .sort((left, right) => left - right);
  if (timestamps.length !== bars.length) {
    return false;
  }

  const maximumGapMs = (request.period === "weekly" ? 28 : 21) * 24 * 60 * 60 * 1_000;
  return timestamps.every(
    (timestamp, index) => index === 0 || timestamp - timestamps[index - 1]! <= maximumGapMs,
  );
}

function getUsTicker(request: StockSdkBarRequest) {
  return sanitizeSymbol(request.symbol.replace(/\.US$/iu, "").replace(/^105\./u, ""));
}

function toTencentSymbol(request: StockSdkBarRequest) {
  const clean = sanitizeSymbol(request.providerSymbol);

  if (request.market === "HK") {
    return `hk${clean.replace(/^hk/iu, "").padStart(5, "0")}`;
  }

  if (request.market === "US") {
    return `us${getUsTicker(request)}.OQ`;
  }

  const symbol = request.symbol.trim().toUpperCase();
  const code = clean.replace(/^(sh|sz)/iu, "");
  const exchange =
    symbol.endsWith(".SZ") ||
    symbol.startsWith("SZ") ||
    code.startsWith("0") ||
    code.startsWith("3")
      ? "sz"
      : "sh";
  return `${exchange}${code}`;
}

function sanitizeSymbol(value: string) {
  const result = value.trim().replace(/[^A-Za-z0-9._-]/gu, "");
  if (!result) {
    throw new Error("Tencent Finance requires a valid market symbol.");
  }
  return result;
}

function mapHistoryBars(
  payload: TencentPayload,
  request: StockSdkBarRequest,
  symbol: string,
): readonly StockSdkRawRecord[] {
  const record = getDataRecord(payload, symbol);
  const suffix = request.period === "weekly" ? "week" : "day";
  const preferredKey =
    request.adjust === "forward"
      ? `qfq${suffix}`
      : request.adjust === "backward"
        ? `hfq${suffix}`
        : suffix;
  const rows = getArray(record?.[preferredKey]);

  return rows
    .map((row) => mapHistoryRow(row, request.market))
    .filter((bar): bar is StockSdkRawRecord => bar !== null);
}

function mapHistoryRow(row: unknown, market: Market): StockSdkRawRecord | null {
  if (!Array.isArray(row) || row.length < 6) {
    return null;
  }

  const date = typeof row[0] === "string" ? row[0] : "";
  const open = toPositiveNumber(row[1]);
  const close = toPositiveNumber(row[2]);
  const high = toPositiveNumber(row[3]);
  const low = toPositiveNumber(row[4]);
  const volume = toNonNegativeNumber(row[5]);

  if (
    !date ||
    open === undefined ||
    close === undefined ||
    high === undefined ||
    low === undefined ||
    volume === undefined
  ) {
    return null;
  }

  return {
    timestamp: toMarketTimestamp(date, "1200", market),
    open,
    high,
    low,
    close,
    volume: market === "CN" ? volume * 100 : volume,
    upstream: "tencent",
  };
}

function mapMinuteBars(
  payload: TencentPayload,
  request: StockSdkBarRequest,
  symbol: string,
): readonly StockSdkRawRecord[] {
  const record = getDataRecord(payload, symbol);
  const data = isRecord(record?.data) ? record.data : undefined;
  const date = typeof data?.date === "string" ? data.date : "";
  const rows = getArray(data?.data);

  if (!date) {
    return [];
  }

  let previousVolume = 0;
  let previousAmount = 0;
  const bars: StockSdkRawRecord[] = [];

  for (const row of rows) {
    const values = typeof row === "string" ? row.trim().split(/\s+/u) : [];
    const time = values[0] ?? "";
    const price = toPositiveNumber(values[1]);
    const cumulativeVolume = toNonNegativeNumber(values[2]);
    const cumulativeAmount = toNonNegativeNumber(values[3]);

    if (!/^\d{4}$/u.test(time) || price === undefined || cumulativeVolume === undefined) {
      continue;
    }

    const volumeMultiplier = request.market === "CN" ? 100 : 1;
    const volume = Math.max(0, cumulativeVolume - previousVolume) * volumeMultiplier;
    const amount =
      cumulativeAmount === undefined ? undefined : Math.max(0, cumulativeAmount - previousAmount);
    bars.push({
      timestamp: toMarketTimestamp(date, time, request.market),
      open: price,
      high: price,
      low: price,
      close: price,
      volume,
      amount,
      upstream: "tencent",
    });
    previousVolume = cumulativeVolume;
    previousAmount = cumulativeAmount ?? previousAmount;
  }

  return bars;
}

function hasMinuteDate(payload: TencentPayload, symbol: string) {
  const record = getDataRecord(payload, symbol);
  const data = isRecord(record?.data) ? record.data : undefined;
  return typeof data?.date === "string" && data.date.trim() !== "";
}

function mapCnMinuteKlineBars(
  payload: TencentPayload,
  request: StockSdkBarRequest,
  symbol: string,
): readonly StockSdkRawRecord[] {
  const record = getDataRecord(payload, symbol);
  const rows = getArray(record?.[`m${request.period}`]);

  return rows
    .map<StockSdkRawRecord | null>((row): StockSdkRawRecord | null => {
      if (!Array.isArray(row) || row.length < 6 || typeof row[0] !== "string") {
        return null;
      }

      const timestamp = toMinuteKlineTimestamp(row[0], request.market);
      const open = toPositiveNumber(row[1]);
      const close = toPositiveNumber(row[2]);
      const high = toPositiveNumber(row[3]);
      const low = toPositiveNumber(row[4]);
      const volume = toNonNegativeNumber(row[5]);

      if (
        timestamp === undefined ||
        open === undefined ||
        close === undefined ||
        high === undefined ||
        low === undefined ||
        volume === undefined
      ) {
        return null;
      }

      return {
        timestamp,
        open,
        high,
        low,
        close,
        volume: volume * 100,
        upstream: "tencent",
      };
    })
    .filter((bar): bar is StockSdkRawRecord => bar !== null);
}

function aggregateMinuteBars(
  bars: readonly StockSdkRawRecord[],
  minutes: number,
): readonly StockSdkRawRecord[] {
  const intervalMs = minutes * 60_000;
  const buckets = new Map<number, StockSdkRawRecord[]>();

  for (const bar of bars) {
    const timestamp = toNonNegativeNumber(bar.timestamp);
    if (timestamp === undefined) {
      continue;
    }
    const bucket = Math.floor(timestamp / intervalMs) * intervalMs;
    const entries = buckets.get(bucket) ?? [];
    entries.push(bar);
    buckets.set(bucket, entries);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .flatMap(([timestamp, entries]) => {
      const first = entries[0];
      const last = entries[entries.length - 1];
      if (!first || !last) {
        return [];
      }

      const open = toPositiveNumber(first.open);
      const close = toPositiveNumber(last.close);
      const highs = entries
        .map((entry) => toPositiveNumber(entry.high))
        .filter((value): value is number => value !== undefined);
      const lows = entries
        .map((entry) => toPositiveNumber(entry.low))
        .filter((value): value is number => value !== undefined);
      if (open === undefined || close === undefined || highs.length === 0 || lows.length === 0) {
        return [];
      }

      return [
        {
          timestamp,
          open,
          high: Math.max(...highs),
          low: Math.min(...lows),
          close,
          volume: entries.reduce(
            (total, entry) => total + (toNonNegativeNumber(entry.volume) ?? 0),
            0,
          ),
          amount: entries.reduce(
            (total, entry) => total + (toNonNegativeNumber(entry.amount) ?? 0),
            0,
          ),
          upstream: "tencent",
        } satisfies StockSdkRawRecord,
      ];
    });
}

function getDataRecord(
  payload: TencentPayload | Record<string, unknown> | unknown,
  symbol: string,
) {
  const root =
    isRecord(payload) && isRecord(payload.data)
      ? payload.data
      : isRecord(payload)
        ? payload
        : undefined;
  if (!root) {
    return undefined;
  }

  const exact = root[symbol];
  if (isRecord(exact)) {
    return exact;
  }

  const entry = Object.entries(root).find(([key]) => key.toUpperCase() === symbol.toUpperCase());
  return entry && isRecord(entry[1]) ? entry[1] : undefined;
}

function getArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function toMinuteKlineTimestamp(value: string, market: Market) {
  const digits = value.replace(/\D/gu, "");
  if (digits.length < 12) {
    return undefined;
  }
  return toMarketTimestamp(digits.slice(0, 8), digits.slice(8, 12), market);
}

function toMarketTimestamp(date: string, time: string, market: Market) {
  const parts = toDateParts(date);
  const timeDigits = time.replace(/\D/gu, "").padStart(4, "0");
  if (!parts || !/^\d{4}$/u.test(timeDigits)) {
    throw new Error("Tencent Finance returned an invalid market timestamp.");
  }

  const hour = Number(timeDigits.slice(0, 2));
  const minute = Number(timeDigits.slice(2, 4));
  if (hour > 23 || minute > 59) {
    throw new Error("Tencent Finance returned an invalid market timestamp.");
  }
  const timeZone =
    market === "US" ? "America/New_York" : market === "HK" ? "Asia/Hong_Kong" : "Asia/Shanghai";
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute);
  const firstPass = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return utcGuess - getTimeZoneOffsetMs(new Date(firstPass), timeZone);
}

function toDateParts(value: string): DateParts | undefined {
  const digits = value.replace(/\D/gu, "");
  if (digits.length < 8) {
    return undefined;
  }
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const probe = new Date(Date.UTC(year, month - 1, day));
  return Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= 1900 &&
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
    ? { year, month, day }
    : undefined;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const zonedAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return zonedAsUtc - date.getTime();
}

function toPositiveNumber(value: unknown) {
  const number = toFiniteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function toNonNegativeNumber(value: unknown) {
  const number = toFiniteNumber(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function toFiniteNumber(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
