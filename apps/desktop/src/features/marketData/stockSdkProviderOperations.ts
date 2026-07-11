import type {
  StockSdkBarRequest,
  StockSdkGatewayProviderOperations,
  StockSdkQuoteRequest,
  StockSdkRawRecord,
} from "./stockSdkGatewayProvider.ts";

interface StockSdkClient {
  search(keyword: string): Promise<readonly unknown[]>;
  readonly quotes: {
    cn(codes: string[]): Promise<readonly unknown[]>;
    hk(codes: string[]): Promise<readonly unknown[]>;
    us(codes: string[]): Promise<readonly unknown[]>;
    timeline?(code: string): Promise<unknown>;
  };
  readonly kline: {
    cn(symbol: string, options: Record<string, unknown>): Promise<readonly unknown[]>;
    cnMinute(symbol: string, options: Record<string, unknown>): Promise<readonly unknown[]>;
    hk(symbol: string, options: Record<string, unknown>): Promise<readonly unknown[]>;
    hkMinute(symbol: string, options: Record<string, unknown>): Promise<readonly unknown[]>;
    us(symbol: string, options: Record<string, unknown>): Promise<readonly unknown[]>;
    usMinute(symbol: string, options: Record<string, unknown>): Promise<readonly unknown[]>;
  };
}

export function createStockSdkGatewayProviderOperations(initialSdk?: StockSdkClient): StockSdkGatewayProviderOperations {
  let sdkPromise: Promise<StockSdkClient> | null = initialSdk ? Promise.resolve(initialSdk) : null;
  let klineUnavailableUntil = 0;
  let klineFailureMessage = "";
  const getSdk = () => {
    sdkPromise ??= createStockSdkClient();
    return sdkPromise;
  };
  const runKlineRequest = async <T>(label: string, request: () => Promise<T>) => {
    const remainingMs = klineUnavailableUntil - Date.now();
    if (remainingMs > 0) {
      throw new Error(
        `Stock SDK K-line source is temporarily unavailable; retry in ${Math.ceil(remainingMs / 1_000)}s. ${klineFailureMessage}`,
      );
    }

    try {
      return await withRequestTimeout(request(), label, 3_500);
    } catch (error) {
      if (isNetworkFailure(error)) {
        klineUnavailableUntil = Date.now() + 60_000;
        klineFailureMessage = error instanceof Error ? error.message : String(error);
      }
      throw error;
    }
  };

  return {
    async fetchQuoteSnapshot(requests) {
      const sdk = await getSdk();
      const records: StockSdkRawRecord[] = [];

      for (const market of ["CN", "HK", "US"] as const) {
        const group = requests.filter((request) => request.market === market);
        if (group.length === 0) {
          continue;
        }

        const providerSymbols = group.map((request) => request.providerSymbol);
        const result =
          market === "CN"
            ? await withRequestTimeout(sdk.quotes.cn(providerSymbols), "Stock SDK CN quote")
            : market === "HK"
              ? await withRequestTimeout(sdk.quotes.hk(providerSymbols), "Stock SDK HK quote")
              : await withRequestTimeout(sdk.quotes.us(providerSymbols), "Stock SDK US quote");

        records.push(...toRawRecords(result).map((record, index) => attachProviderSymbol(record, group, index)));
      }

      return records;
    },
    async fetchHistoricalBars(request) {
      const sdk = await getSdk();
      const options = {
        period: request.period as "daily" | "weekly",
        adjust: "" as const,
        ...toHistoryRangeOptions(request),
      };

      if (request.market === "CN") {
        return toRawRecords(await runKlineRequest("Stock SDK CN history", () => sdk.kline.cn(request.providerSymbol, options)));
      }

      if (request.market === "HK") {
        return toRawRecords(await runKlineRequest("Stock SDK HK history", () => sdk.kline.hk(request.providerSymbol, options)));
      }

      return toRawRecords(await runKlineRequest("Stock SDK US history", () => sdk.kline.us(request.providerSymbol, options)));
    },
    async fetchIntradayBars(request) {
      const sdk = await getSdk();
      const options = {
        period: request.period as "1" | "5" | "15" | "30" | "60",
        adjust: "" as const,
        ndays: 5,
      };
      const canUseTimeline = canUseTencentTimeline(request, sdk);

      if (canUseTimeline) {
        try {
          return await fetchTencentTimelineBars(sdk, request);
        } catch {
          // The minute K-line endpoint remains a secondary path when Tencent
          // cannot serve the current-session timeline for a symbol.
        }
      }

      try {
        if (request.market === "CN") {
          return toRawRecords(await runKlineRequest("Stock SDK CN intraday", () => sdk.kline.cnMinute(request.providerSymbol, options)));
        }

        if (request.market === "HK") {
          return toRawRecords(await runKlineRequest("Stock SDK HK intraday", () => sdk.kline.hkMinute(request.providerSymbol, options)));
        }

        return toRawRecords(await runKlineRequest("Stock SDK US intraday", () => sdk.kline.usMinute(request.providerSymbol, options)));
      } catch (error) {
        if (!canUseTimeline || !isNetworkFailure(error)) {
          throw error;
        }

        return fetchTencentTimelineBars(sdk, request);
      }
    },
    async searchInstruments(query) {
      const sdk = await getSdk();
      return toRawRecords(await sdk.search(query));
    },
  };
}

function withRequestTimeout<T>(request: Promise<T>, label: string, timeoutMs = 8_000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
  });

  return Promise.race([
    request,
    timeout,
  ]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

function toRawRecords(records: readonly unknown[]): readonly StockSdkRawRecord[] {
  return records.map((record) => record as StockSdkRawRecord);
}

async function createStockSdkClient(): Promise<StockSdkClient> {
  const { StockSDK } = await import("stock-sdk");
  return new StockSDK({
    retry: { maxRetries: 1, baseDelay: 500 },
    providerPolicies: {
      eastmoney: { timeout: 12_000, rateLimit: { requestsPerSecond: 2, maxBurst: 2 } },
      tencent: { timeout: 12_000, rateLimit: { requestsPerSecond: 2, maxBurst: 2 } },
    },
  }) as StockSdkClient;
}

function attachProviderSymbol(record: StockSdkRawRecord, requests: readonly StockSdkQuoteRequest[], index: number): StockSdkRawRecord {
  const recordCode = String(record.code ?? record.symbol ?? record.secid ?? "").toUpperCase();
  const match =
    requests.find((request) => sameSymbol(recordCode, request.providerSymbol)) ??
    requests.find((request) => sameSymbol(recordCode, request.symbol)) ??
    requests[index];

  return {
    ...record,
    providerSymbol: match?.providerSymbol ?? recordCode,
  };
}

function sameSymbol(left: string, right: string) {
  return normalizeComparableSymbol(left) === normalizeComparableSymbol(right);
}

function normalizeComparableSymbol(symbol: string) {
  return symbol
    .trim()
    .toUpperCase()
    .replace(/^HK/u, "")
    .replace(/\.(HK|US|SH|SZ|OQ|N)$/u, "");
}

function canUseTencentTimeline(
  request: StockSdkBarRequest,
  sdk: StockSdkClient,
): sdk is StockSdkClient & { readonly quotes: StockSdkClient["quotes"] & { timeline(code: string): Promise<unknown> } } {
  return (
    request.period === "1" &&
    (request.market === "CN" || request.market === "HK") &&
    typeof sdk.quotes.timeline === "function"
  );
}

async function fetchTencentTimelineBars(
  sdk: StockSdkClient & { readonly quotes: StockSdkClient["quotes"] & { timeline(code: string): Promise<unknown> } },
  request: StockSdkBarRequest,
) {
  const timeline = await withRequestTimeout(
    sdk.quotes.timeline(toTencentTimelineSymbol(request)),
    `Stock SDK ${request.market} Tencent timeline`,
  );
  return mapTencentTimelineToBars(timeline);
}

function isNetworkFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
}

function toTencentTimelineSymbol(request: StockSdkBarRequest) {
  if (request.market === "HK") {
    return `hk${request.providerSymbol.replace(/^HK/u, "")}`;
  }

  const symbol = request.symbol.trim().toUpperCase();
  const code = request.providerSymbol.replace(/^(SH|SZ)/iu, "");
  const exchange = symbol.endsWith(".SZ") || symbol.startsWith("SZ") || code.startsWith("0") || code.startsWith("3") ? "sz" : "sh";
  return `${exchange}${code}`;
}

function mapTencentTimelineToBars(timeline: unknown): readonly StockSdkRawRecord[] {
  if (!isRecord(timeline) || !Array.isArray(timeline.data)) {
    throw new Error("Stock SDK Tencent timeline returned no usable intraday data.");
  }

  let previousVolume = 0;
  let previousAmount = 0;
  const bars: StockSdkRawRecord[] = [];

  for (const point of timeline.data) {
    if (!isRecord(point)) {
      continue;
    }

    const timestamp = readFiniteNumber(point.timestamp);
    const price = readFiniteNumber(point.price);
    if (timestamp === undefined || price === undefined || price <= 0) {
      continue;
    }

    const cumulativeVolume = readFiniteNumber(point.volume) ?? previousVolume;
    const cumulativeAmount = readFiniteNumber(point.amount) ?? previousAmount;
    bars.push({
      timestamp,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: Math.max(0, cumulativeVolume - previousVolume),
      amount: Math.max(0, cumulativeAmount - previousAmount),
    });
    previousVolume = cumulativeVolume;
    previousAmount = cumulativeAmount;
  }

  if (bars.length === 0) {
    throw new Error("Stock SDK Tencent timeline returned no usable intraday data.");
  }

  return bars;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readFiniteNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toHistoryRangeOptions(request: StockSdkBarRequest) {
  const endTime = request.endTime ?? Date.now();
  const startTime = request.startTime ?? estimateHistoryStartTime(request, endTime);

  return {
    startDate: startTime ? formatDate(startTime) : undefined,
    endDate: request.startTime || request.endTime || request.count ? formatDate(endTime) : undefined,
  };
}

function estimateHistoryStartTime(request: StockSdkBarRequest, endTime: number) {
  if (!request.count || request.count < 1) {
    return undefined;
  }

  // Upstream history endpoints do not accept a bar count. Use a conservative
  // calendar-day window so the SDK does not fetch an unbounded listing history.
  const calendarDaysPerBar = request.period === "weekly" ? 8 : 2;
  return endTime - Math.ceil(request.count) * calendarDaysPerBar * 24 * 60 * 60 * 1_000;
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
