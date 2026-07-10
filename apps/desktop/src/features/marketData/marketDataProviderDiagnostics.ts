import type {
  GatewayMarketDataProviderId,
  MarketDataProviderCapabilityKey,
  MarketDataProviderHealthStatus,
  MarketDataProviderHealthView,
} from "./marketDataProviderGateway.ts";

export interface MarketDataProviderDiagnosticSummary {
  readonly providerLabel: string;
  readonly statusLabel: string;
  readonly message: string;
  readonly fallbackLabel?: string;
}

const providerLabels: Record<GatewayMarketDataProviderId, string> = {
  "stock-sdk": "Stock SDK",
  "alphafeed-rest": "AlphaFeed REST",
  "alphafeed-websocket": "AlphaFeed WebSocket",
  longbridge: "长桥",
  "yahoo-finance": "Yahoo Finance 应急源",
};

const statusLabels: Record<MarketDataProviderHealthStatus, string> = {
  unconfigured: "未配置",
  healthy: "可用",
  degraded: "降级可用",
  unavailable: "不可用",
  unauthorized: "权限不足",
  rateLimited: "请求受限",
  delayed: "延迟行情",
};

const capabilityLabels: Record<MarketDataProviderCapabilityKey, string> = {
  realtimeQuote: "实时快照",
  historicalBars: "历史 K 线",
  intradayBars: "分时数据",
  websocket: "流式行情",
  batchQuote: "批量快照",
  instrumentSearch: "证券搜索",
};

export function formatMarketDataProviderLabel(providerId: GatewayMarketDataProviderId) {
  return providerLabels[providerId];
}

export function formatMarketDataProviderStatus(status: MarketDataProviderHealthStatus) {
  return statusLabels[status];
}

export function formatMarketDataCapability(capability: MarketDataProviderCapabilityKey) {
  return capabilityLabels[capability];
}

export function summarizeMarketDataProviderHealth(
  health: MarketDataProviderHealthView,
  options: {
    readonly capability?: MarketDataProviderCapabilityKey;
    readonly triedProviders?: readonly GatewayMarketDataProviderId[];
    readonly fallbackFrom?: GatewayMarketDataProviderId;
    readonly message?: string;
  } = {},
): MarketDataProviderDiagnosticSummary {
  const providerLabel = formatMarketDataProviderLabel(health.provider);
  const statusLabel = formatMarketDataProviderStatus(health.status);
  const fallbackLabel = formatFallbackLabel(health.provider, options.triedProviders, options.fallbackFrom);
  const capabilityLabel = options.capability ? formatMarketDataCapability(options.capability) : null;
  const prefix = capabilityLabel ? `${capabilityLabel}：` : "";
  const detail = options.message ?? health.message;

  return {
    providerLabel,
    statusLabel,
    fallbackLabel,
    message: [prefix ? `${prefix}${providerLabel}` : providerLabel, statusLabel, fallbackLabel, detail].filter(Boolean).join(" · "),
  };
}

export function formatFallbackLabel(
  activeProvider: GatewayMarketDataProviderId,
  triedProviders: readonly GatewayMarketDataProviderId[] | undefined,
  explicitFallbackFrom?: GatewayMarketDataProviderId,
) {
  const fallbackFrom = explicitFallbackFrom ?? triedProviders?.find((provider) => provider !== activeProvider);

  if (!fallbackFrom) {
    return undefined;
  }

  return `已从 ${formatMarketDataProviderLabel(fallbackFrom)} 降级`;
}
