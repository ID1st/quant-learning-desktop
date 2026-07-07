import type { Market, Timeframe } from "@quant/shared";

export type GatewayMarketDataProviderId = "stock-sdk" | "alphafeed-rest" | "alphafeed-websocket" | "longbridge";

export type MarketDataProviderHealthStatus =
  | "unconfigured"
  | "healthy"
  | "degraded"
  | "unavailable"
  | "unauthorized"
  | "rateLimited"
  | "delayed";

export type MarketDataProviderDelayLevel = "realtime" | "delayed" | "unknown";

export interface MarketDataProviderRateLimit {
  readonly requests: number;
  readonly intervalMs: number;
  readonly scope: "global" | "symbol" | "market";
}

export interface MarketDataProviderCapability {
  readonly realtimeQuote: boolean;
  readonly historicalBars: boolean;
  readonly intradayBars: boolean;
  readonly websocket: boolean;
  readonly batchQuote: boolean;
  readonly markets: readonly Market[];
  readonly timeframes: readonly Timeframe[];
  readonly rateLimit?: MarketDataProviderRateLimit;
  readonly delayLevel: MarketDataProviderDelayLevel;
}

export type MarketDataProviderCapabilityKey =
  | "realtimeQuote"
  | "historicalBars"
  | "intradayBars"
  | "websocket"
  | "batchQuote";

export interface MarketDataProviderHealthView {
  readonly provider: GatewayMarketDataProviderId;
  readonly status: MarketDataProviderHealthStatus;
  readonly message: string;
  readonly checkedAt: string;
  readonly latencyMs?: number;
  readonly nextRetryAt?: string;
  readonly capability: MarketDataProviderCapability;
}

export interface MarketDataProviderRequestItem {
  readonly market: Market;
  readonly symbol: string;
  readonly name?: string;
}

export interface MarketDataBarRequest {
  readonly market: Market;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly count?: number;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly adjust?: "none" | "forward" | "backward";
}

export interface GatewayMarketQuoteSnapshot {
  readonly provider: GatewayMarketDataProviderId;
  readonly market: Market;
  readonly symbol: string;
  readonly name?: string;
  readonly price: number;
  readonly change?: number;
  readonly changePercent?: number;
  readonly timestamp: number;
  readonly volume?: number;
  readonly delayLevel?: MarketDataProviderDelayLevel;
}

export interface GatewayMarketDataBar {
  readonly provider: GatewayMarketDataProviderId;
  readonly market: Market;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly delayLevel?: MarketDataProviderDelayLevel;
}

export interface MarketDataProvider {
  readonly id: GatewayMarketDataProviderId;
  readonly displayName: string;
  readonly capability: MarketDataProviderCapability;
  getHealth(): Promise<MarketDataProviderHealthView>;
}

export interface RealtimeQuoteProvider extends MarketDataProvider {
  fetchQuoteSnapshot(items: readonly MarketDataProviderRequestItem[]): Promise<readonly GatewayMarketQuoteSnapshot[]>;
}

export interface HistoricalBarProvider extends MarketDataProvider {
  fetchHistoricalBars(request: MarketDataBarRequest): Promise<readonly GatewayMarketDataBar[]>;
}

export interface IntradayBarProvider extends MarketDataProvider {
  fetchIntradayBars(request: MarketDataBarRequest): Promise<readonly GatewayMarketDataBar[]>;
}

export interface StreamingQuoteProvider extends MarketDataProvider {
  connectStream(items: readonly MarketDataProviderRequestItem[]): Promise<void>;
  readStreamSnapshot(): Promise<readonly GatewayMarketQuoteSnapshot[]>;
  disconnectStream(): Promise<void>;
}

export type GatewayMarketDataProvider =
  | RealtimeQuoteProvider
  | HistoricalBarProvider
  | IntradayBarProvider
  | StreamingQuoteProvider;

export interface MarketDataProviderRegistry {
  register(provider: GatewayMarketDataProvider): void;
  get(providerId: GatewayMarketDataProviderId): GatewayMarketDataProvider | undefined;
  list(): readonly GatewayMarketDataProvider[];
  listByCapability(capability: MarketDataProviderCapabilityKey): readonly GatewayMarketDataProvider[];
}

export interface MarketDataGatewayError {
  readonly code: "NO_CAPABLE_PROVIDER" | "PROVIDER_UNAVAILABLE";
  readonly message: string;
  readonly provider?: GatewayMarketDataProviderId;
  readonly cause?: unknown;
}

export type MarketDataGatewayResult<T> =
  | {
      readonly ok: true;
      readonly provider: GatewayMarketDataProviderId;
      readonly data: T;
      readonly health: MarketDataProviderHealthView;
      readonly triedProviders: readonly GatewayMarketDataProviderId[];
    }
  | {
      readonly ok: false;
      readonly error: MarketDataGatewayError;
      readonly health: readonly MarketDataProviderHealthView[];
      readonly triedProviders: readonly GatewayMarketDataProviderId[];
    };

export interface MarketDataGateway {
  fetchQuoteSnapshot(
    items: readonly MarketDataProviderRequestItem[],
  ): Promise<MarketDataGatewayResult<readonly GatewayMarketQuoteSnapshot[]>>;
  fetchHistoricalBars(request: MarketDataBarRequest): Promise<MarketDataGatewayResult<readonly GatewayMarketDataBar[]>>;
  fetchIntradayBars(request: MarketDataBarRequest): Promise<MarketDataGatewayResult<readonly GatewayMarketDataBar[]>>;
}

const usableHealthStatuses = new Set<MarketDataProviderHealthStatus>(["healthy", "degraded", "delayed"]);

class InMemoryMarketDataProviderRegistry implements MarketDataProviderRegistry {
  private readonly providers = new Map<GatewayMarketDataProviderId, GatewayMarketDataProvider>();

  constructor(providers: readonly GatewayMarketDataProvider[]) {
    providers.forEach((provider) => this.register(provider));
  }

  register(provider: GatewayMarketDataProvider) {
    if (this.providers.has(provider.id)) {
      throw new Error(`Market data provider "${provider.id}" is already registered.`);
    }

    this.providers.set(provider.id, provider);
  }

  get(providerId: GatewayMarketDataProviderId) {
    return this.providers.get(providerId);
  }

  list() {
    return Array.from(this.providers.values());
  }

  listByCapability(capability: MarketDataProviderCapabilityKey) {
    return this.list().filter((provider) => provider.capability[capability]);
  }
}

export function createMarketDataProviderRegistry(
  providers: readonly GatewayMarketDataProvider[] = [],
): MarketDataProviderRegistry {
  return new InMemoryMarketDataProviderRegistry(providers);
}

export function createMarketDataGateway(
  registry: MarketDataProviderRegistry,
  priority: readonly GatewayMarketDataProviderId[] = [
    "stock-sdk",
    "alphafeed-rest",
    "alphafeed-websocket",
    "longbridge",
  ],
): MarketDataGateway {
  const orderProviders = (providers: readonly GatewayMarketDataProvider[]) =>
    [...providers].sort((left, right) => getPriority(priority, left.id) - getPriority(priority, right.id));

  const runWithFallback = async <Data>(
    capability: MarketDataProviderCapabilityKey,
    operation: (provider: GatewayMarketDataProvider) => Promise<Data>,
  ): Promise<MarketDataGatewayResult<Data>> => {
    const candidates = orderProviders(registry.listByCapability(capability));
    const triedProviders: GatewayMarketDataProviderId[] = [];
    const healthViews: MarketDataProviderHealthView[] = [];
    let lastError: MarketDataGatewayError | undefined;

    for (const provider of candidates) {
      triedProviders.push(provider.id);
      const health = await provider.getHealth();
      healthViews.push(health);

      if (!usableHealthStatuses.has(health.status)) {
        lastError = {
          code: "PROVIDER_UNAVAILABLE",
          message: `${provider.displayName} is not usable: ${health.status}`,
          provider: provider.id,
        };
        continue;
      }

      try {
        const data = await operation(provider);

        return {
          ok: true,
          provider: provider.id,
          data,
          health,
          triedProviders,
        };
      } catch (error) {
        lastError = {
          code: "PROVIDER_UNAVAILABLE",
          message: `${provider.displayName} request failed`,
          provider: provider.id,
          cause: error,
        };
      }
    }

    return {
      ok: false,
      error:
        lastError ??
        ({
          code: "NO_CAPABLE_PROVIDER",
          message: `No provider supports ${capability}`,
        } satisfies MarketDataGatewayError),
      health: healthViews,
      triedProviders,
    };
  };

  return {
    fetchQuoteSnapshot: (items) =>
      runWithFallback<readonly GatewayMarketQuoteSnapshot[]>("realtimeQuote", (provider) => {
        if (!hasRealtimeQuoteProvider(provider)) {
          throw new Error(`Provider ${provider.id} does not implement fetchQuoteSnapshot.`);
        }

        return provider.fetchQuoteSnapshot(items);
      }),
    fetchHistoricalBars: (request) =>
      runWithFallback<readonly GatewayMarketDataBar[]>("historicalBars", (provider) => {
        if (!hasHistoricalBarProvider(provider)) {
          throw new Error(`Provider ${provider.id} does not implement fetchHistoricalBars.`);
        }

        return provider.fetchHistoricalBars(request);
      }),
    fetchIntradayBars: (request) =>
      runWithFallback<readonly GatewayMarketDataBar[]>("intradayBars", (provider) => {
        if (!hasIntradayBarProvider(provider)) {
          throw new Error(`Provider ${provider.id} does not implement fetchIntradayBars.`);
        }

        return provider.fetchIntradayBars(request);
      }),
  };
}

function getPriority(priority: readonly GatewayMarketDataProviderId[], providerId: GatewayMarketDataProviderId) {
  const index = priority.indexOf(providerId);

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function hasRealtimeQuoteProvider(provider: GatewayMarketDataProvider): provider is RealtimeQuoteProvider {
  return typeof (provider as RealtimeQuoteProvider).fetchQuoteSnapshot === "function";
}

function hasHistoricalBarProvider(provider: GatewayMarketDataProvider): provider is HistoricalBarProvider {
  return typeof (provider as HistoricalBarProvider).fetchHistoricalBars === "function";
}

function hasIntradayBarProvider(provider: GatewayMarketDataProvider): provider is IntradayBarProvider {
  return typeof (provider as IntradayBarProvider).fetchIntradayBars === "function";
}
