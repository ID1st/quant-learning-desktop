import type { Market, Timeframe } from "@quant/shared";
import type { GatewayMarketDataProviderId } from "./marketDataProviderIds.ts";

export type { GatewayMarketDataProviderId } from "./marketDataProviderIds.ts";

export type MarketDataProviderHealthStatus =
  | "unconfigured"
  | "healthy"
  | "degraded"
  | "unavailable"
  | "unauthorized"
  | "rateLimited"
  | "delayed";

export type MarketDataProviderDelayLevel = "realtime" | "delayed" | "unknown";

export type MarketDataUpstream = "tencent" | "eastmoney" | "alphafeed" | "longbridge" | "yahoo-finance";

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
  readonly instrumentSearch?: boolean;
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
  | "batchQuote"
  | "instrumentSearch";

export interface MarketDataProviderHealthView {
  readonly provider: GatewayMarketDataProviderId;
  readonly status: MarketDataProviderHealthStatus;
  readonly message: string;
  readonly checkedAt: string;
  readonly latencyMs?: number;
  readonly nextRetryAt?: string;
  readonly upstream?: MarketDataUpstream;
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
  readonly previousClose?: number;
  readonly openPrice?: number;
  readonly highPrice?: number;
  readonly lowPrice?: number;
  readonly change?: number;
  readonly changePercent?: number;
  readonly timestamp: number;
  readonly volume?: number;
  readonly amount?: number;
  readonly receivedAt?: string;
  readonly delayLevel?: MarketDataProviderDelayLevel;
  readonly upstream?: MarketDataUpstream;
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
  readonly amount?: number;
  readonly delayLevel?: MarketDataProviderDelayLevel;
  readonly upstream?: MarketDataUpstream;
}

export interface MarketInstrument {
  readonly provider: GatewayMarketDataProviderId;
  readonly market: Market;
  readonly symbol: string;
  readonly name: string;
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

export interface InstrumentSearchProvider extends MarketDataProvider {
  searchInstruments(query: string, markets?: readonly Market[]): Promise<readonly MarketInstrument[]>;
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
  | StreamingQuoteProvider
  | InstrumentSearchProvider;

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
  searchInstruments(query: string, markets?: readonly Market[]): Promise<MarketDataGatewayResult<readonly MarketInstrument[]>>;
}

export interface MarketDataGatewayOptions {
  readonly requestTimeoutMs?: number;
  readonly healthTimeoutMs?: number;
}

const usableHealthStatuses = new Set<MarketDataProviderHealthStatus>(["healthy", "degraded", "delayed"]);
const defaultRequestTimeoutMs = 10_000;
const defaultHealthTimeoutMs = 3_000;

class MarketDataProviderTimeoutError extends Error {}

function resolveTimeout(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new MarketDataProviderTimeoutError(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function createUnavailableHealth(
  provider: GatewayMarketDataProvider,
  message: string,
): MarketDataProviderHealthView {
  return {
    provider: provider.id,
    status: "unavailable",
    message,
    checkedAt: new Date().toISOString(),
    capability: provider.capability,
  };
}

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
    "yahoo-finance",
    "alphafeed-rest",
    "alphafeed-websocket",
    "longbridge",
  ],
  options: MarketDataGatewayOptions = {},
): MarketDataGateway {
  const requestTimeoutMs = resolveTimeout(options.requestTimeoutMs, defaultRequestTimeoutMs);
  const healthTimeoutMs = resolveTimeout(options.healthTimeoutMs, defaultHealthTimeoutMs);
  const orderProviders = (providers: readonly GatewayMarketDataProvider[]) =>
    [...providers].sort((left, right) => getPriority(priority, left.id) - getPriority(priority, right.id));

  const runWithFallback = async <Data>(
    capability: MarketDataProviderCapabilityKey,
    operation: (provider: GatewayMarketDataProvider) => Promise<Data>,
    isUsableData: (data: Data) => boolean = () => true,
    isCompatible: (provider: GatewayMarketDataProvider) => boolean = () => true,
  ): Promise<MarketDataGatewayResult<Data>> => {
    const candidates = orderProviders(registry.listByCapability(capability).filter(isCompatible));
    const triedProviders: GatewayMarketDataProviderId[] = [];
    const healthViews: MarketDataProviderHealthView[] = [];
    let lastError: MarketDataGatewayError | undefined;

    for (const provider of candidates) {
      triedProviders.push(provider.id);
      let health: MarketDataProviderHealthView;
      try {
        health = await withTimeout(
          provider.getHealth(),
          healthTimeoutMs,
          `${provider.displayName} health check timed out after ${healthTimeoutMs} ms`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : `${provider.displayName} health check failed`;
        health = createUnavailableHealth(provider, message);
        healthViews.push(health);
        lastError = {
          code: "PROVIDER_UNAVAILABLE",
          message,
          provider: provider.id,
          cause: error,
        };
        continue;
      }
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
        const data = await withTimeout(
          operation(provider),
          requestTimeoutMs,
          `${provider.displayName} ${capability} request timed out after ${requestTimeoutMs} ms`,
        );
        const latestHealth = await withTimeout(
          provider.getHealth(),
          healthTimeoutMs,
          `${provider.displayName} health check timed out after ${healthTimeoutMs} ms`,
        ).catch(() => health);
        healthViews[healthViews.length - 1] = latestHealth;

        if (!isUsableData(data)) {
          lastError = {
            code: "PROVIDER_UNAVAILABLE",
            message: `${provider.displayName} returned no usable data`,
            provider: provider.id,
          };
          continue;
        }

        return {
          ok: true,
          provider: provider.id,
          data,
          health: latestHealth,
          triedProviders,
        };
      } catch (error) {
        const latestHealth = await withTimeout(
          provider.getHealth(),
          healthTimeoutMs,
          `${provider.displayName} health check timed out after ${healthTimeoutMs} ms`,
        ).catch(() => health);
        healthViews[healthViews.length - 1] = latestHealth;
        const timeoutMessage = error instanceof MarketDataProviderTimeoutError ? error.message : null;
        lastError = {
          code: "PROVIDER_UNAVAILABLE",
          // Health stores the provider-specific, sanitized failure reason. Keep it
          // through the neutral gateway so the renderer can explain a fallback.
          message: timeoutMessage ?? (latestHealth.message || `${provider.displayName} request failed`),
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
      }, undefined, (provider) =>
        items.every(
          (item) =>
            provider.capability.markets.includes(item.market) &&
            provider.capability.timeframes.includes("realtime"),
        ),
      ),
    fetchHistoricalBars: (request) =>
      runWithFallback<readonly GatewayMarketDataBar[]>("historicalBars", (provider) => {
        if (!hasHistoricalBarProvider(provider)) {
          throw new Error(`Provider ${provider.id} does not implement fetchHistoricalBars.`);
        }
        return provider.fetchHistoricalBars(request);
      }, hasBars, (provider) =>
        provider.capability.markets.includes(request.market) &&
        provider.capability.timeframes.includes(request.timeframe),
      ),
    fetchIntradayBars: (request) =>
      runWithFallback<readonly GatewayMarketDataBar[]>("intradayBars", (provider) => {
        if (!hasIntradayBarProvider(provider)) {
          throw new Error(`Provider ${provider.id} does not implement fetchIntradayBars.`);
        }
        return provider.fetchIntradayBars(request);
      }, hasBars, (provider) =>
        provider.capability.markets.includes(request.market) &&
        provider.capability.timeframes.includes(request.timeframe),
      ),
    searchInstruments: (query, markets) =>
      runWithFallback<readonly MarketInstrument[]>(
        "instrumentSearch",
        (provider) => {
          if (!hasInstrumentSearchProvider(provider)) {
            throw new Error(`Provider ${provider.id} does not implement searchInstruments.`);
          }

          return provider.searchInstruments(query, markets);
        },
        (instruments) => instruments.length > 0,
      ),
  };
}

function hasBars(bars: readonly GatewayMarketDataBar[]) {
  return bars.length > 0;
}

function getPriority(priority: readonly GatewayMarketDataProviderId[], providerId: GatewayMarketDataProviderId) {
  const index = priority.indexOf(providerId);

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function hasRealtimeQuoteProvider(provider: GatewayMarketDataProvider): provider is RealtimeQuoteProvider {
  return typeof (provider as RealtimeQuoteProvider).fetchQuoteSnapshot === "function";
}

function hasInstrumentSearchProvider(provider: GatewayMarketDataProvider): provider is InstrumentSearchProvider {
  return typeof (provider as InstrumentSearchProvider).searchInstruments === "function";
}

function hasHistoricalBarProvider(provider: GatewayMarketDataProvider): provider is HistoricalBarProvider {
  return typeof (provider as HistoricalBarProvider).fetchHistoricalBars === "function";
}

function hasIntradayBarProvider(provider: GatewayMarketDataProvider): provider is IntradayBarProvider {
  return typeof (provider as IntradayBarProvider).fetchIntradayBars === "function";
}
