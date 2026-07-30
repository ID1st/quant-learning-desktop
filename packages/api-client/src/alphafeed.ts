import type { Market, Timeframe } from "@quant/shared";
import { isLoopbackHostname, isTrustedServiceHostname } from "./urlSecurity.ts";

export const ALPHAFEED_DEFAULT_API_URL = "https://api.alphafeed.org";

export interface AlphaFeedApiCredentials {
  apiUrl: string;
  apiKey: string;
}

export interface NormalizedAlphaFeedApiCredentials extends AlphaFeedApiCredentials {
  apiUrl: string;
  apiKey: string;
}

export interface AlphaFeedQuoteSnapshot {
  symbol: string;
  market: Market;
  lastPrice: number;
  previousClose: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  changePercent: number;
  volume: number;
  amount: number;
  quoteTime: string;
  receivedAt: string;
  provider: "alphafeed";
  name?: string;
}

export interface AlphaFeedQuoteRequestItem {
  symbol: string;
  market: Market;
}

export interface AlphaFeedVerificationSummary {
  apiUrl: string;
  apiKeyPreview: string;
  markets: Market[];
  verifiedAt: string;
  authMode: "api-key";
}

export interface AlphaFeedQuoteOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
}

export type AlphaFeedAdjustType =
  "none" | "forward" | "backward" | "forward_additive" | "backward_additive";

export interface AlphaFeedBarRequest {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  count?: number;
  startTime?: number;
  endTime?: number;
  adjust?: AlphaFeedAdjustType;
}

export interface AlphaFeedMarketDataBar {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  provider: "alphafeed";
}

export type AlphaFeedHistoricalPagingCapability = "unknown" | "supported" | "unsupported";

const alphaFeedHistoricalPagingCapabilityByUrl = new Map<
  string,
  AlphaFeedHistoricalPagingCapability
>();

export function getAlphaFeedHistoricalPagingCapability(
  input: AlphaFeedApiCredentials,
): AlphaFeedHistoricalPagingCapability {
  const credentials = normalizeAlphaFeedApiCredentials(input);
  return alphaFeedHistoricalPagingCapabilityByUrl.get(credentials.apiUrl) ?? "unknown";
}

interface AlphaFeedQuoteResponse {
  data: AlphaFeedQuotePayload[];
}

interface AlphaFeedQuotePayload {
  symbol: string;
  region: Market;
  last_price: number;
  prev_close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  timestamp: number;
  ext?: {
    name?: string;
    change_pct?: number;
  };
}

interface AlphaFeedKlineResponse {
  data: AlphaFeedCompactKlineData;
}

interface AlphaFeedCompactKlineData {
  timestamp: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  amount: number[];
}

function ensureHttpUrl(apiUrl: string) {
  let url: URL;

  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error("请输入有效的 AlphaFeed API URL。");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("AlphaFeed API URL 需要以 http 或 https 开头。");
  }

  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new Error("AlphaFeed API 远程地址必须使用 https。");
  }

  if (!isTrustedServiceHostname(url.hostname, ["api.alphafeed.org"])) {
    throw new Error("AlphaFeed API 仅支持官方服务地址或本机开发地址。");
  }

  return url.toString().replace(/\/$/, "");
}

function ensureApiKey(apiKey: string) {
  const normalized = apiKey.trim();
  if (normalized.length < 8) {
    throw new Error("AlphaFeed API Key 至少需要 8 位。");
  }

  return normalized;
}

function isMarket(value: unknown): value is Market {
  return value === "CN" || value === "US" || value === "HK";
}

function ensureNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`AlphaFeed 响应字段无效：${field}`);
  }

  return value;
}

function ensureString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`AlphaFeed 响应字段无效：${field}`);
  }

  return value.trim();
}

function createErrorMessage(status: number, body: string) {
  if (status === 401) {
    return "AlphaFeed API Key 无效或缺失。";
  }

  if (status === 403) {
    return "当前 AlphaFeed 套餐无此功能或市场权限。";
  }

  if (status === 429) {
    return "AlphaFeed 请求频率超限，请稍后重试。";
  }

  return `AlphaFeed 请求失败：HTTP ${status}${body ? ` ${body.slice(0, 180)}` : ""}`;
}

function mapTimeframeToAlphaFeedPeriod(timeframe: Timeframe) {
  if (timeframe === "realtime") {
    throw new Error("AlphaFeed realtime 为本地轮询派生分时周期，不能作为 K 线周期请求。");
  }

  return timeframe === "1h" ? "60m" : timeframe;
}

function parseQuotePayload(value: unknown): AlphaFeedQuotePayload {
  if (!value || typeof value !== "object") {
    throw new Error("AlphaFeed 响应字段无效：data[]");
  }

  const quote = value as Partial<AlphaFeedQuotePayload>;
  const region = quote.region;
  if (!isMarket(region)) {
    throw new Error("AlphaFeed 响应字段无效：region");
  }

  return {
    symbol: ensureString(quote.symbol, "symbol"),
    region,
    last_price: ensureNumber(quote.last_price, "last_price"),
    prev_close: ensureNumber(quote.prev_close, "prev_close"),
    open: ensureNumber(quote.open, "open"),
    high: ensureNumber(quote.high, "high"),
    low: ensureNumber(quote.low, "low"),
    volume: ensureNumber(quote.volume, "volume"),
    amount: ensureNumber(quote.amount, "amount"),
    timestamp: ensureNumber(quote.timestamp, "timestamp"),
    ext: quote.ext,
  };
}

function parseQuoteResponse(value: unknown): AlphaFeedQuoteResponse {
  if (!value || typeof value !== "object" || !Array.isArray((value as { data?: unknown }).data)) {
    throw new Error("AlphaFeed 实时行情响应结构无效。");
  }

  return {
    data: (value as { data: unknown[] }).data.map(parseQuotePayload),
  };
}

function parseNumberArray(value: unknown, field: string) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new Error(`AlphaFeed K 线响应字段无效：${field}`);
  }

  return value;
}

function parseOptionalAmountArray(value: unknown, expectedLength: number) {
  if (value === undefined || value === null) {
    return Array.from({ length: expectedLength }, () => 0);
  }

  return parseNumberArray(value, "amount");
}

function parseKlineResponse(value: unknown): AlphaFeedKlineResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !value ||
    typeof (value as { data?: unknown }).data !== "object"
  ) {
    throw new Error("AlphaFeed K 线响应结构无效。");
  }

  const data = (value as { data: Record<string, unknown> }).data;
  const parsed: AlphaFeedCompactKlineData = {
    timestamp: parseNumberArray(data.timestamp, "timestamp"),
    open: parseNumberArray(data.open, "open"),
    high: parseNumberArray(data.high, "high"),
    low: parseNumberArray(data.low, "low"),
    close: parseNumberArray(data.close, "close"),
    volume: parseNumberArray(data.volume, "volume"),
    amount: [],
  };
  const expectedLength = parsed.timestamp.length;
  parsed.amount = parseOptionalAmountArray(data.amount, expectedLength);

  if (
    [parsed.open, parsed.high, parsed.low, parsed.close, parsed.volume, parsed.amount].some(
      (column) => column.length !== expectedLength,
    )
  ) {
    throw new Error("AlphaFeed K 线列式数据长度不一致。");
  }

  return {
    data: parsed,
  };
}

function mapQuoteToSnapshot(
  quote: AlphaFeedQuotePayload,
  receivedAt: string,
): AlphaFeedQuoteSnapshot {
  const changePercent =
    typeof quote.ext?.change_pct === "number" && Number.isFinite(quote.ext.change_pct)
      ? quote.ext.change_pct * 100
      : quote.prev_close === 0
        ? 0
        : ((quote.last_price - quote.prev_close) / quote.prev_close) * 100;

  return {
    symbol: quote.symbol,
    market: quote.region,
    lastPrice: quote.last_price,
    previousClose: quote.prev_close,
    openPrice: quote.open,
    highPrice: quote.high,
    lowPrice: quote.low,
    changePercent,
    volume: quote.volume,
    amount: quote.amount,
    quoteTime: new Date(quote.timestamp).toISOString(),
    receivedAt,
    provider: "alphafeed",
    name: typeof quote.ext?.name === "string" ? quote.ext.name : undefined,
  };
}

export function createAlphaFeedSecretPreview(value: string) {
  const normalized = value.trim();
  if (normalized.length <= 8) {
    return "********";
  }

  return `${normalized.slice(0, 4)}****${normalized.slice(-4)}`;
}

export function normalizeAlphaFeedApiCredentials(
  input: AlphaFeedApiCredentials,
): NormalizedAlphaFeedApiCredentials {
  return {
    apiUrl: ensureHttpUrl(input.apiUrl.trim() || ALPHAFEED_DEFAULT_API_URL),
    apiKey: ensureApiKey(input.apiKey),
  };
}

export async function fetchAlphaFeedQuoteSnapshots(
  input: AlphaFeedApiCredentials,
  items: AlphaFeedQuoteRequestItem[],
  options: AlphaFeedQuoteOptions = {},
): Promise<AlphaFeedQuoteSnapshot[]> {
  const credentials = normalizeAlphaFeedApiCredentials(input);
  const fetcher = options.fetcher ?? fetch;
  const symbols = Array.from(new Set(items.map((item) => item.symbol.trim()).filter(Boolean)));

  if (symbols.length === 0) {
    return [];
  }

  const url = new URL(`${credentials.apiUrl}/v1/quotes`);
  url.searchParams.set("symbols", symbols.join(","));

  const response = await fetcher(url, {
    headers: {
      "X-API-Key": credentials.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(createErrorMessage(response.status, await response.text().catch(() => "")));
  }

  const payload = parseQuoteResponse(await response.json());
  const receivedAt = (options.now ?? (() => new Date()))().toISOString();
  return payload.data.map((quote) => mapQuoteToSnapshot(quote, receivedAt));
}

async function fetchAlphaFeedBars(
  input: AlphaFeedApiCredentials,
  request: AlphaFeedBarRequest,
  endpoint: "/v1/klines" | "/v1/klines/intraday",
  options: AlphaFeedQuoteOptions = {},
): Promise<AlphaFeedMarketDataBar[]> {
  const credentials = normalizeAlphaFeedApiCredentials(input);
  const symbol = request.symbol.trim();

  if (!symbol) {
    throw new Error("AlphaFeed K 线标的代码不能为空。");
  }

  const url = new URL(`${credentials.apiUrl}${endpoint}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("period", mapTimeframeToAlphaFeedPeriod(request.timeframe));

  if (typeof request.count === "number") {
    url.searchParams.set("count", String(Math.max(1, Math.min(10000, Math.round(request.count)))));
  }

  if (endpoint === "/v1/klines") {
    if (typeof request.startTime === "number") {
      url.searchParams.set("start_time", String(request.startTime));
    }

    if (typeof request.endTime === "number") {
      url.searchParams.set("end_time", String(request.endTime));
    }

    if (request.adjust) {
      url.searchParams.set("adjust", request.adjust);
    }
  }

  const response = await (options.fetcher ?? fetch)(url, {
    headers: {
      "X-API-Key": credentials.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(createErrorMessage(response.status, await response.text().catch(() => "")));
  }

  const payload = parseKlineResponse(await response.json());
  const bars = payload.data.timestamp.map<AlphaFeedMarketDataBar>((timestamp, index) => ({
    symbol,
    market: request.market,
    timeframe: request.timeframe,
    timestamp,
    open: payload.data.open[index],
    high: payload.data.high[index],
    low: payload.data.low[index],
    close: payload.data.close[index],
    volume: payload.data.volume[index],
    amount: payload.data.amount[index],
    provider: "alphafeed",
  }));
  if (
    endpoint === "/v1/klines" &&
    typeof request.startTime === "number" &&
    typeof request.endTime === "number" &&
    bars.length > 0
  ) {
    const isSorted = bars.every(
      (bar, index) => index === 0 || bar.timestamp >= (bars[index - 1]?.timestamp ?? bar.timestamp),
    );
    const isBounded = bars.every(
      (bar) => bar.timestamp >= request.startTime! && bar.timestamp <= request.endTime!,
    );
    alphaFeedHistoricalPagingCapabilityByUrl.set(
      credentials.apiUrl,
      isSorted && isBounded ? "supported" : "unsupported",
    );
  }

  return bars
    .filter(
      (bar) =>
        (request.startTime === undefined || bar.timestamp >= request.startTime) &&
        (request.endTime === undefined || bar.timestamp <= request.endTime),
    )
    .sort((left, right) => left.timestamp - right.timestamp);
}

export function fetchAlphaFeedHistoricalBars(
  input: AlphaFeedApiCredentials,
  request: AlphaFeedBarRequest,
  options: AlphaFeedQuoteOptions = {},
): Promise<AlphaFeedMarketDataBar[]> {
  return fetchAlphaFeedBars(input, request, "/v1/klines", options);
}

export function fetchAlphaFeedIntradayBars(
  input: AlphaFeedApiCredentials,
  request: AlphaFeedBarRequest,
  options: AlphaFeedQuoteOptions = {},
): Promise<AlphaFeedMarketDataBar[]> {
  return fetchAlphaFeedBars(input, request, "/v1/klines", options);
}

export async function verifyAlphaFeedApiCredentials(
  input: AlphaFeedApiCredentials,
  options: AlphaFeedQuoteOptions = {},
): Promise<AlphaFeedVerificationSummary> {
  const credentials = normalizeAlphaFeedApiCredentials(input);
  await fetchAlphaFeedQuoteSnapshots(credentials, [{ symbol: "600519.SH", market: "CN" }], options);

  return {
    apiUrl: credentials.apiUrl,
    apiKeyPreview: createAlphaFeedSecretPreview(credentials.apiKey),
    markets: ["CN", "US", "HK"],
    verifiedAt: (options.now ?? (() => new Date()))().toISOString(),
    authMode: "api-key",
  };
}
