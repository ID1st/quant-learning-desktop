import type {
  StockSdkBarRequest,
  StockSdkGatewayProviderOperations,
  StockSdkQuoteRequest,
  StockSdkRawRecord,
} from "./stockSdkGatewayProvider.ts";

interface StockSdkClient {
  readonly quotes: {
    cn(codes: string[]): Promise<readonly unknown[]>;
    hk(codes: string[]): Promise<readonly unknown[]>;
    us(codes: string[]): Promise<readonly unknown[]>;
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
  const getSdk = () => {
    sdkPromise ??= createStockSdkClient();
    return sdkPromise;
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
            ? await sdk.quotes.cn(providerSymbols)
            : market === "HK"
              ? await sdk.quotes.hk(providerSymbols)
              : await sdk.quotes.us(providerSymbols);

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
        return toRawRecords(await sdk.kline.cn(request.providerSymbol, options));
      }

      if (request.market === "HK") {
        return toRawRecords(await sdk.kline.hk(request.providerSymbol, options));
      }

      return toRawRecords(await sdk.kline.us(request.providerSymbol, options));
    },
    async fetchIntradayBars(request) {
      const sdk = await getSdk();
      const options = {
        period: request.period as "1" | "5" | "15" | "30" | "60",
        adjust: "" as const,
        ndays: 5,
      };

      if (request.market === "CN") {
        return toRawRecords(await sdk.kline.cnMinute(request.providerSymbol, options));
      }

      if (request.market === "HK") {
        return toRawRecords(await sdk.kline.hkMinute(request.providerSymbol, options));
      }

      return toRawRecords(await sdk.kline.usMinute(request.providerSymbol, options));
    },
  };
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
  return symbol.trim().toUpperCase().replace(/^HK/u, "").replace(/\.HK$|\.US$|\.SH$|\.SZ$/u, "");
}

function toHistoryRangeOptions(request: StockSdkBarRequest) {
  return {
    startDate: request.startTime ? formatDate(request.startTime) : undefined,
    endDate: request.endTime ? formatDate(request.endTime) : undefined,
  };
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
