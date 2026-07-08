import {
  fetchAlphaFeedHistoricalBarsWithRest,
  fetchAlphaFeedIntradayBarsWithRest,
  fetchAlphaFeedQuoteSnapshotsWithRest,
} from "./alphaFeedBridge.ts";
import { fetchLongPortHistoricalBarsWithSdk, fetchLongPortQuoteSnapshotsWithSdk } from "./longPortBridge.ts";
import {
  createMarketDataIpcShellHandlers,
  marketDataIpcDefaultProviderPriority,
  type MarketDataIpcError,
  type MarketDataIpcHandlers,
} from "./marketDataIpcContract.ts";
import type { SecureCredentialStore } from "./secureCredentialStore.ts";
import {
  createAlphaFeedRestGatewayProvider,
  createLongBridgeGatewayProvider,
} from "../features/marketData/marketDataCompatibilityProviders.ts";
import {
  createMarketDataGateway,
  createMarketDataProviderRegistry,
  type GatewayMarketDataProvider,
  type GatewayMarketDataProviderId,
  type MarketDataGatewayError,
  type MarketDataGatewayResult,
  type MarketDataProviderHealthView,
  type MarketDataProviderRequestItem,
} from "../features/marketData/marketDataProviderGateway.ts";
import {
  createStockSdkGatewayProvider,
  type StockSdkGatewayProviderOperations,
} from "../features/marketData/stockSdkGatewayProvider.ts";
import { createStockSdkGatewayProviderOperations } from "../features/marketData/stockSdkProviderOperations.ts";

export interface MarketDataIpcHandlerDependencies {
  readonly credentialStore?: SecureCredentialStore;
  readonly stockSdkOperations?: StockSdkGatewayProviderOperations;
}

export function createMarketDataIpcHandlers(dependencies: MarketDataIpcHandlerDependencies = {}): MarketDataIpcHandlers {
  const shell = createMarketDataIpcShellHandlers();
  const credentialStore = dependencies.credentialStore;

  if (!credentialStore) {
    return shell;
  }

  return {
    ...shell,
    async fetchQuoteSnapshot(request) {
      const providers = createMarketDataProviders(request.providerPolicy?.stockSdkPrimaryEnabled ?? true, {
        credentialStore,
        stockSdkOperations: dependencies.stockSdkOperations,
      });
      const priority = createQuoteSnapshotPriority(request.providerPolicy?.stockSdkPrimaryEnabled ?? true);
      const gateway = createMarketDataGateway(createMarketDataProviderRegistry(providers), priority);
      const result = await gateway.fetchQuoteSnapshot(request.items);

      return toIpcGatewayResult(result);
    },
    async fetchHistoricalBars(request) {
      const providers = createMarketDataProviders(request.providerPolicy?.stockSdkPrimaryEnabled ?? true, {
        credentialStore,
        stockSdkOperations: dependencies.stockSdkOperations,
      });
      const gateway = createMarketDataGateway(
        createMarketDataProviderRegistry(providers),
        createHistoricalBarsPriority(request.providerPolicy?.stockSdkPrimaryEnabled ?? true),
      );
      const result = await gateway.fetchHistoricalBars(request.request);

      return toIpcGatewayResult(result);
    },
    async fetchIntradayBars(request) {
      const providers = createMarketDataProviders(request.providerPolicy?.stockSdkPrimaryEnabled ?? true, {
        credentialStore,
        stockSdkOperations: dependencies.stockSdkOperations,
      });
      const gateway = createMarketDataGateway(
        createMarketDataProviderRegistry(providers),
        createIntradayBarsPriority(request.providerPolicy?.stockSdkPrimaryEnabled ?? true),
      );
      const result = await gateway.fetchIntradayBars(request.request);

      return toIpcGatewayResult(result);
    },
  };
}

function createMarketDataProviders(
  stockSdkPrimaryEnabled: boolean,
  dependencies: {
    readonly credentialStore: SecureCredentialStore;
    readonly stockSdkOperations?: StockSdkGatewayProviderOperations;
  },
) {
  const providers: GatewayMarketDataProvider[] = [];

  if (stockSdkPrimaryEnabled) {
    providers.push(
      createStockSdkGatewayProvider(dependencies.stockSdkOperations ?? createStockSdkGatewayProviderOperations(), {
        enabled: true,
        delayLevel: "unknown",
      }),
    );
  }

  const alphaFeedCredentials = dependencies.credentialStore.readAlphaFeedCredentials();
  if (alphaFeedCredentials) {
    providers.push(
      createAlphaFeedRestGatewayProvider({
        fetchQuoteSnapshot: (items) => fetchAlphaFeedQuoteSnapshotsWithRest(alphaFeedCredentials, toWatchlistItems(items)),
        fetchHistoricalBars: (barRequest) => fetchAlphaFeedHistoricalBarsWithRest(alphaFeedCredentials, barRequest),
        fetchIntradayBars: (barRequest) => fetchAlphaFeedIntradayBarsWithRest(alphaFeedCredentials, barRequest),
      }),
    );
  }

  const longPortCredentials = dependencies.credentialStore.readLongPortCredentials();
  if (longPortCredentials) {
    providers.push(
      createLongBridgeGatewayProvider({
        fetchQuoteSnapshot: (items) => fetchLongPortQuoteSnapshotsWithSdk(longPortCredentials, toWatchlistItems(items)),
        fetchHistoricalBars: (barRequest) => fetchLongPortHistoricalBarsWithSdk(longPortCredentials, barRequest),
      }),
    );
  }

  return providers;
}

function createQuoteSnapshotPriority(stockSdkPrimaryEnabled: boolean): readonly GatewayMarketDataProviderId[] {
  return stockSdkPrimaryEnabled ? marketDataIpcDefaultProviderPriority : ["alphafeed-rest", "longbridge"];
}

function createHistoricalBarsPriority(stockSdkPrimaryEnabled: boolean): readonly GatewayMarketDataProviderId[] {
  return stockSdkPrimaryEnabled ? ["stock-sdk", "longbridge", "alphafeed-rest"] : ["longbridge", "alphafeed-rest"];
}

function createIntradayBarsPriority(stockSdkPrimaryEnabled: boolean): readonly GatewayMarketDataProviderId[] {
  return stockSdkPrimaryEnabled ? ["stock-sdk", "alphafeed-rest", "longbridge"] : ["alphafeed-rest", "longbridge"];
}

function toIpcGatewayResult<Data>(result: MarketDataGatewayResult<Data>) {
  if (result.ok) {
    return {
      ok: true,
      data: result.data,
      meta: {
        provider: result.provider,
        health: result.health,
        servedAt: new Date().toISOString(),
        fallback: {
          activeProvider: result.provider,
          fallbackFrom: result.triedProviders.find((provider) => provider !== result.provider),
          triedProviders: result.triedProviders,
        },
      },
    } as const;
  }

  return {
    ok: false,
    error: toIpcGatewayError(result.error, result.health, result.triedProviders),
  } as const;
}

function toIpcGatewayError(
  error: MarketDataGatewayError,
  health: readonly MarketDataProviderHealthView[],
  triedProviders: readonly GatewayMarketDataProviderId[],
): MarketDataIpcError {
  const providerHealth = error.provider ? health.find((item) => item.provider === error.provider) : undefined;
  return {
    code: mapGatewayErrorCode(error, providerHealth),
    message: error.message,
    provider: error.provider,
    retryAfterMs: providerHealth?.nextRetryAt ? Math.max(0, new Date(providerHealth.nextRetryAt).getTime() - Date.now()) : undefined,
    fallback: {
      activeProvider: error.provider,
      triedProviders,
    },
    health,
  };
}

function mapGatewayErrorCode(error: MarketDataGatewayError, health?: MarketDataProviderHealthView): MarketDataIpcError["code"] {
  if (error.code === "NO_CAPABLE_PROVIDER") {
    return "NO_CAPABLE_PROVIDER";
  }

  if (health?.status === "unconfigured") {
    return "PROVIDER_UNCONFIGURED";
  }

  if (health?.status === "unauthorized") {
    return "PROVIDER_UNAUTHORIZED";
  }

  if (health?.status === "rateLimited") {
    return "PROVIDER_RATE_LIMITED";
  }

  if (health?.status === "delayed") {
    return "PROVIDER_DELAYED";
  }

  return "PROVIDER_UNAVAILABLE";
}

function toWatchlistItems(items: readonly MarketDataProviderRequestItem[]) {
  return items.map((item) => ({
    symbol: item.symbol,
    name: item.name ?? item.symbol,
    market: item.market,
    source: "preset" as const,
  }));
}
