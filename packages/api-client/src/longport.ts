import type { Market, Timeframe } from "@quant/shared";

export const LONGPORT_DEFAULT_HTTP_URL = "https://openapi.longbridge.com";

export interface LongPortApiCredentials {
  apiUrl: string;
  appKey: string;
  appSecret: string;
  accessToken: string;
}

export interface NormalizedLongPortApiCredentials extends LongPortApiCredentials {
  apiUrl: string;
  appKey: string;
  appSecret: string;
  accessToken: string;
}

export interface LongPortVerificationProbeResult {
  markets?: Market[];
  accountId?: string;
}

export interface LongPortVerificationSummary {
  apiUrl: string;
  appKeyPreview: string;
  accessTokenPreview: string;
  markets: Market[];
  verifiedAt: string;
  accountId?: string;
  authMode: "legacy-api-key";
}

export interface LongPortBarRequest {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  count?: number;
  startTime?: number;
  endTime?: number;
}

export interface LongPortMarketDataBar {
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
  provider: "longport";
}

export interface LongPortVerificationOptions {
  probe: (credentials: NormalizedLongPortApiCredentials) => Promise<LongPortVerificationProbeResult | void>;
  now?: () => Date;
}

function ensureHttpUrl(apiUrl: string) {
  let url: URL;

  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error("请输入有效的长桥 API URL。");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("长桥 API URL 需要以 http 或 https 开头。");
  }

  return url.toString().replace(/\/$/, "");
}

function ensureCredential(name: string, value: string) {
  const normalized = value.trim();
  if (normalized.length < 8) {
    throw new Error(`${name} 至少需要 8 位。`);
  }

  return normalized;
}

export function createLongPortSecretPreview(value: string) {
  const normalized = value.trim();
  if (normalized.length <= 8) {
    return "********";
  }

  return `${normalized.slice(0, 4)}****${normalized.slice(-4)}`;
}

export function normalizeLongPortApiCredentials(input: LongPortApiCredentials): NormalizedLongPortApiCredentials {
  return {
    apiUrl: ensureHttpUrl(input.apiUrl.trim() || LONGPORT_DEFAULT_HTTP_URL),
    appKey: ensureCredential("App Key", input.appKey),
    appSecret: ensureCredential("App Secret", input.appSecret),
    accessToken: ensureCredential("Access Token", input.accessToken),
  };
}

export async function verifyLongPortApiCredentials(
  input: LongPortApiCredentials,
  options: LongPortVerificationOptions,
): Promise<LongPortVerificationSummary> {
  const credentials = normalizeLongPortApiCredentials(input);
  const probeResult = await options.probe(credentials);
  const now = options.now ?? (() => new Date());

  return {
    apiUrl: credentials.apiUrl,
    appKeyPreview: createLongPortSecretPreview(credentials.appKey),
    accessTokenPreview: createLongPortSecretPreview(credentials.accessToken),
    markets: probeResult?.markets?.length ? probeResult.markets : ["US", "HK", "CN"],
    verifiedAt: now().toISOString(),
    accountId: probeResult?.accountId,
    authMode: "legacy-api-key",
  };
}
