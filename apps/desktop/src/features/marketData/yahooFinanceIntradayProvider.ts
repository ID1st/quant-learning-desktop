import type {
  GatewayMarketDataBar,
  IntradayBarProvider,
  MarketDataBarRequest,
  MarketDataProviderCapability,
  MarketDataProviderHealthStatus,
  MarketDataProviderHealthView,
} from "./marketDataProviderGateway.ts";

interface YahooFinanceQuotePayload {
  readonly open?: readonly (number | null)[];
  readonly high?: readonly (number | null)[];
  readonly low?: readonly (number | null)[];
  readonly close?: readonly (number | null)[];
  readonly volume?: readonly (number | null)[];
}

interface YahooFinanceChartPayload {
  readonly chart?: {
    readonly result?: readonly {
      readonly timestamp?: readonly number[];
      readonly indicators?: { readonly quote?: readonly YahooFinanceQuotePayload[] };
    }[];
  };
}

export interface YahooFinanceIntradayProviderOptions {
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
}

const capability: MarketDataProviderCapability = {
  realtimeQuote: false,
  historicalBars: false,
  intradayBars: true,
  websocket: false,
  batchQuote: false,
  markets: ["US"],
  timeframes: ["realtime", "1m"],
  rateLimit: { requests: 1, intervalMs: 1_000, scope: "symbol" },
  delayLevel: "unknown",
};

export function createYahooFinanceIntradayProvider(
  options: YahooFinanceIntradayProviderOptions = {},
): IntradayBarProvider {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let health: MarketDataProviderHealthView = createHealth("healthy", "Yahoo Finance 应急分时源就绪");

  return {
    id: "yahoo-finance",
    displayName: "Yahoo Finance 应急分时源",
    capability,
    getHealth: async () => health,
    async fetchIntradayBars(request) {
      assertSupportedRequest(request);
      const startedAt = Date.now();

      try {
        const response = await fetchImpl(createRequestUrl(request.symbol, options.baseUrl), { headers: { Accept: "application/json" } });
        if (!response.ok) {
          throw new Error(`Yahoo Finance 返回 HTTP ${response.status}`);
        }

        const bars = mapYahooFinanceBars((await response.json()) as YahooFinanceChartPayload, request);
        if (bars.length === 0) {
          throw new Error("Yahoo Finance 未返回可用美股分时数据");
        }

        health = createHealth("healthy", `Yahoo Finance 已返回 ${bars.length} 个美股分时点`, Date.now() - startedAt);
        return bars;
      } catch (error) {
        const message = error instanceof Error && error.message.trim() ? error.message : "未知网络错误";
        health = createHealth(classifyFailure(message), `Yahoo Finance 分时请求失败：${message}`);
        throw error;
      }
    },
  };
}

function assertSupportedRequest(request: MarketDataBarRequest) {
  if (request.market !== "US" || (request.timeframe !== "1m" && request.timeframe !== "realtime")) {
    throw new Error("Yahoo Finance 应急源仅支持美股 1 分钟分时数据。");
  }
}

function createRequestUrl(symbol: string, baseUrl = "https://query1.finance.yahoo.com") {
  const ticker = symbol.trim().toUpperCase().replace(/\.US$/u, "");
  if (!ticker) {
    throw new Error("美股代码不能为空。");
  }

  const params = new URLSearchParams({ interval: "1m", range: "5d", includePrePost: "false", events: "history" });
  return `${baseUrl.replace(/\/$/u, "")}/v8/finance/chart/${encodeURIComponent(ticker)}?${params.toString()}`;
}

function mapYahooFinanceBars(payload: YahooFinanceChartPayload, request: MarketDataBarRequest): GatewayMarketDataBar[] {
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const startTime = request.startTime ?? Number.NEGATIVE_INFINITY;
  const endTime = request.endTime ?? Number.POSITIVE_INFINITY;

  return (result?.timestamp ?? []).flatMap((seconds, index) => {
    const timestamp = seconds * 1_000;
    const open = quote?.open?.[index];
    const high = quote?.high?.[index];
    const low = quote?.low?.[index];
    const close = quote?.close?.[index];
    const volume = quote?.volume?.[index] ?? 0;

    if (
      !Number.isFinite(timestamp) || !isFiniteNumber(open) || !isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close) ||
      !Number.isFinite(volume) || timestamp < startTime || timestamp > endTime || high < low || high < open || high < close ||
      low > open || low > close
    ) {
      return [];
    }

    return [{ provider: "yahoo-finance" as const, market: "US" as const, symbol: request.symbol, timeframe: request.timeframe, timestamp, open, high, low, close, volume, delayLevel: "unknown" as const }];
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function createHealth(status: MarketDataProviderHealthStatus, message: string, latencyMs?: number): MarketDataProviderHealthView {
  return { provider: "yahoo-finance", status, message, checkedAt: new Date().toISOString(), latencyMs, capability };
}

function classifyFailure(message: string): MarketDataProviderHealthStatus {
  const normalized = message.toLowerCase();
  if (normalized.includes("401") || normalized.includes("403")) return "unauthorized";
  if (normalized.includes("429") || normalized.includes("rate")) return "rateLimited";
  return "unavailable";
}
