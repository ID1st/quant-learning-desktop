import {
  createAlphaFeedStreamSession,
  type AlphaFeedStreamConnectionState,
  type AlphaFeedStreamSession,
} from "./alphaFeedStreamBridge.ts";
import type { AlphaFeedProviderHealth } from "./alphaFeedBridge.ts";
import type { MarketQuoteSnapshot } from "../features/marketData/marketDataSyncService.ts";
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
  type MarketDataIpcResult,
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
  type IntradayBarProvider,
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
import { createYahooFinanceIntradayProvider } from "../features/marketData/yahooFinanceIntradayProvider.ts";

export interface MarketDataIpcHandlerDependencies {
  readonly credentialStore?: SecureCredentialStore;
  readonly stockSdkOperations?: StockSdkGatewayProviderOperations;
  readonly yahooFinanceProvider?: IntradayBarProvider;
  readonly streamSession?: AlphaFeedStreamSession;
}

export function createMarketDataIpcHandlers(dependencies: MarketDataIpcHandlerDependencies = {}): MarketDataIpcHandlers {
  const shell = createMarketDataIpcShellHandlers();
  const credentialStore = dependencies.credentialStore;
  const streamSession = dependencies.streamSession ?? createAlphaFeedStreamSession();

  if (!credentialStore) {
    return shell;
  }

  return {
    ...shell,
    async getProviderStatus() {
      const providers = createMarketDataProviders(true, {
        credentialStore,
        stockSdkOperations: dependencies.stockSdkOperations,
        yahooFinanceProvider: dependencies.yahooFinanceProvider,
      });
      const health = await Promise.all(providers.map((provider) => provider.getHealth()));

      return {
        ok: true,
        data: {
          priority: marketDataIpcDefaultProviderPriority,
          providers: health,
          capabilities: providers.map((provider) => provider.capability),
          checkedAt: new Date().toISOString(),
        },
      };
    },
    async fetchQuoteSnapshot(request) {
      const providers = createMarketDataProviders(request.providerPolicy?.stockSdkPrimaryEnabled ?? true, {
        credentialStore,
        stockSdkOperations: dependencies.stockSdkOperations,
        yahooFinanceProvider: dependencies.yahooFinanceProvider,
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
        yahooFinanceProvider: dependencies.yahooFinanceProvider,
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
        yahooFinanceProvider: dependencies.yahooFinanceProvider,
      });
      const gateway = createMarketDataGateway(
        createMarketDataProviderRegistry(providers),
        createIntradayBarsPriority(request.providerPolicy?.stockSdkPrimaryEnabled ?? true),
      );
      const result = await gateway.fetchIntradayBars(request.request);

      return toIpcGatewayResult(result);
    },
    async searchInstruments(request) {
      const providers = createMarketDataProviders(request.providerPolicy?.stockSdkPrimaryEnabled ?? true, {
        credentialStore,
        stockSdkOperations: dependencies.stockSdkOperations,
        yahooFinanceProvider: dependencies.yahooFinanceProvider,
      });
      const gateway = createMarketDataGateway(createMarketDataProviderRegistry(providers), ["stock-sdk"]);
      return toIpcGatewayResult(await gateway.searchInstruments(request.query, request.markets));
    },
    async connectQuoteStream(request) {
      const credentials = credentialStore.readAlphaFeedStreamCredentials();

      if (!credentials) {
        return createProviderUnavailableResult("AlphaFeed WebSocket credentials are not configured.");
      }

      const result = await streamSession.connect({
        credentials,
        mode: request.providerPolicy?.alphaFeedStreamMode ?? "watchlist",
        watchlist: toWatchlistItems(request.items),
      });

      return toIpcStreamResult(result.state, result.health);
    },
    async readQuoteStreamSnapshot() {
      const result = await streamSession.readSnapshot();

      return {
        ok: true,
        data: {
          snapshots: result.snapshots.map(mapStreamQuoteSnapshot),
          state: mapStreamState(result.state),
        },
        meta: createStreamMeta(result.health, result.state),
      };
    },
    async disconnectQuoteStream() {
      const result = await streamSession.disconnect();

      return toIpcStreamResult(result.state, result.health);
    },
  };
}

function createMarketDataProviders(
  stockSdkPrimaryEnabled: boolean,
  dependencies: {
    readonly credentialStore: SecureCredentialStore;
    readonly stockSdkOperations?: StockSdkGatewayProviderOperations;
    readonly yahooFinanceProvider?: IntradayBarProvider;
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

  providers.push(dependencies.yahooFinanceProvider ?? createYahooFinanceIntradayProvider());

  return providers;
}

function createQuoteSnapshotPriority(stockSdkPrimaryEnabled: boolean): readonly GatewayMarketDataProviderId[] {
  return stockSdkPrimaryEnabled ? marketDataIpcDefaultProviderPriority : ["alphafeed-rest", "longbridge"];
}

function createHistoricalBarsPriority(stockSdkPrimaryEnabled: boolean): readonly GatewayMarketDataProviderId[] {
  return stockSdkPrimaryEnabled
    ? ["stock-sdk", "yahoo-finance", "alphafeed-rest", "longbridge"]
    : ["yahoo-finance", "alphafeed-rest", "longbridge"];
}

function createIntradayBarsPriority(stockSdkPrimaryEnabled: boolean): readonly GatewayMarketDataProviderId[] {
  return stockSdkPrimaryEnabled
    ? ["stock-sdk", "yahoo-finance", "alphafeed-rest", "longbridge"]
    : ["yahoo-finance", "alphafeed-rest", "longbridge"];
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
    message: providerHealth?.message ?? error.message,
    provider: error.provider,
    retryAfterMs: providerHealth?.nextRetryAt ? Math.max(0, new Date(providerHealth.nextRetryAt).getTime() - Date.now()) : undefined,
    fallback: {
      activeProvider: error.provider,
      triedProviders,
    },
    health,
  };
}

function createProviderUnavailableResult<Data>(message: string): MarketDataIpcResult<Data> {
  return {
    ok: false,
    error: {
      code: "PROVIDER_UNCONFIGURED",
      message,
      fallback: {
        triedProviders: ["alphafeed-websocket"] as const,
      },
      health: [],
    },
  };
}

function toIpcStreamResult(state: AlphaFeedStreamConnectionState, health: AlphaFeedProviderHealth) {
  return {
    ok: true,
    data: {
      state: mapStreamState(state),
    },
    meta: createStreamMeta(health, state),
  } as const;
}

function createStreamMeta(health: AlphaFeedProviderHealth, state: AlphaFeedStreamConnectionState) {
  const mappedHealth: MarketDataProviderHealthView = {
    provider: "alphafeed-websocket",
    status: mapStreamHealthStatus(health.status, state),
    message: health.message,
    checkedAt: health.checkedAt,
    latencyMs: health.latencyMs,
    nextRetryAt: health.nextRetryAt,
    capability: {
      realtimeQuote: true,
      historicalBars: false,
      intradayBars: false,
      websocket: true,
      batchQuote: false,
      markets: ["US", "HK", "CN"],
      timeframes: ["realtime"],
      delayLevel: "realtime",
    },
  };

  return {
    provider: "alphafeed-websocket" as const,
    health: mappedHealth,
    servedAt: new Date().toISOString(),
    fallback: {
      activeProvider: "alphafeed-websocket" as const,
      triedProviders: ["alphafeed-websocket"] as const,
    },
  };
}

function mapStreamState(state: AlphaFeedStreamConnectionState) {
  if (state === "idle") {
    return "idle" as const;
  }

  if (state === "connecting") {
    return "connecting" as const;
  }

  if (state === "connected") {
    return "connected" as const;
  }

  return "fallback" as const;
}

function mapStreamHealthStatus(status: AlphaFeedProviderHealth["status"], state: AlphaFeedStreamConnectionState): MarketDataProviderHealthView["status"] {
  if (status === "ok" && state === "fallback") {
    return "degraded";
  }

  if (status === "ok") {
    return "healthy";
  }

  if (status === "auth_failed" || status === "permission_denied") {
    return "unauthorized";
  }

  if (status === "rate_limited") {
    return "rateLimited";
  }

  return "unavailable";
}

function mapStreamQuoteSnapshot(snapshot: MarketQuoteSnapshot) {
  return {
    provider: "alphafeed-websocket" as const,
    market: snapshot.market,
    symbol: snapshot.symbol,
    price: snapshot.lastPrice,
    previousClose: snapshot.previousClose,
    openPrice: snapshot.openPrice,
    highPrice: snapshot.highPrice,
    lowPrice: snapshot.lowPrice,
    change: snapshot.lastPrice - snapshot.previousClose,
    changePercent: snapshot.changePercent,
    timestamp: new Date(snapshot.quoteTime).getTime(),
    volume: snapshot.volume,
    amount: snapshot.amount,
    receivedAt: snapshot.receivedAt,
    delayLevel: "realtime" as const,
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
