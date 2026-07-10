import type {
  GatewayMarketDataBar,
  HistoricalBarProvider,
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
  readonly retryDelayMs?: number;
}

const capability: MarketDataProviderCapability = {
  realtimeQuote: false,
  historicalBars: true,
  intradayBars: true,
  websocket: false,
  batchQuote: false,
  markets: ["US"],
  timeframes: ["realtime", "1m", "1d", "1w"],
  rateLimit: { requests: 1, intervalMs: 1_000, scope: "symbol" },
  delayLevel: "unknown",
};

export function createYahooFinanceIntradayProvider(
  options: YahooFinanceIntradayProviderOptions = {},
): HistoricalBarProvider & IntradayBarProvider {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let health: MarketDataProviderHealthView = createHealth("healthy", "Yahoo Finance 美股备用源就绪。");

  return {
    id: "yahoo-finance",
    displayName: "Yahoo Finance 美股备用源",
    capability,
    getHealth: async () => health,
    fetchHistoricalBars: (request) => fetchBars(request, "historical"),
    fetchIntradayBars: (request) => fetchBars(request, "intraday"),
  };

  async function fetchBars(request: MarketDataBarRequest, kind: "historical" | "intraday") {
    assertSupportedRequest(request);
    const startedAt = Date.now();

    try {
      const response = await fetchWithRetry(fetchImpl, createRequestUrl(request, options.baseUrl), options.retryDelayMs ?? 250);
      if (!response.ok) {
        throw new Error(`Yahoo Finance 返回 HTTP ${response.status}`);
      }

      const bars = mapYahooFinanceBars((await response.json()) as YahooFinanceChartPayload, request);
      if (bars.length === 0) {
        throw new Error(`Yahoo Finance 未返回可用美股${kind === "intraday" ? "分时" : "历史 K 线"}数据。`);
      }

      health = createHealth("healthy", `Yahoo Finance 已返回 ${bars.length} 条美股${kind === "intraday" ? "分时" : "历史 K 线"}。`, Date.now() - startedAt);
      return bars;
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message : "未知网络错误";
      health = createHealth(classifyFailure(message), `Yahoo Finance 美股${kind === "intraday" ? "分时" : "历史 K 线"}请求失败：${message}`);
      throw error;
    }
  }
}

function assertSupportedRequest(request: MarketDataBarRequest) {
  if (request.market !== "US" || !["1m", "realtime", "1d", "1w"].includes(request.timeframe)) {
    throw new Error("Yahoo Finance 备用源仅支持美股 realtime、1m、1d 和 1w 数据。");
  }
}

function createRequestUrl(request: MarketDataBarRequest, baseUrl = "https://query1.finance.yahoo.com") {
  const ticker = request.symbol.trim().toUpperCase().replace(/\.US$/u, "");
  if (!ticker) {
    throw new Error("美股代码不能为空。");
  }

  const [interval, range] =
    request.timeframe === "1w" ? ["1wk", "10y"] : request.timeframe === "1d" ? ["1d", "5y"] : ["1m", "5d"];
  const params = new URLSearchParams({ interval, range, includePrePost: "false", events: "history" });
  return `${baseUrl.replace(/\/$/u, "")}/v8/finance/chart/${encodeURIComponent(ticker)}?${params.toString()}`;
}

async function fetchWithRetry(fetchImpl: typeof fetch, url: string, retryDelayMs: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
      if (response.status < 500 || attempt === 1) return response;
      lastError = new Error(`Yahoo Finance 返回 HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 1 || !isTransientNetworkFailure(error)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("Yahoo Finance 网络请求失败。");
}

function isTransientNetworkFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("fetch failed") || message.includes("socket") || message.includes("network") || message.includes("timeout");
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
