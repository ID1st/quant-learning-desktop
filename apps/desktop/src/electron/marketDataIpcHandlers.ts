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
import {
  fetchLongPortHistoricalBarsWithSdk,
  fetchLongPortQuoteSnapshotsWithSdk,
} from "./longPortBridge.ts";
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
  type GatewayMarketDataBar,
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
import {
  createStockSdkGatewayProviderOperations,
  type StockSdkTencentBarsOperations,
} from "../features/marketData/stockSdkProviderOperations.ts";
import { createYahooFinanceIntradayProvider } from "../features/marketData/yahooFinanceIntradayProvider.ts";
import { createTencentFinanceBarsOperations } from "./tencentFinanceBars.ts";
import {
  fetchMlptHistoricalBackfill,
  type MlptHistoricalBackfillSource,
} from "../features/marketData/mlptHistoricalBackfillService.ts";
import type { MarketDataIpcBarRequest } from "./marketDataIpcContract.ts";

export interface MarketDataIpcHandlerDependencies {
  readonly credentialStore?: SecureCredentialStore;
  readonly stockSdkOperations?: StockSdkGatewayProviderOperations;
  readonly tencentFinanceBars?: StockSdkTencentBarsOperations;
  readonly yahooFinanceProvider?: IntradayBarProvider;
  readonly streamSession?: AlphaFeedStreamSession;
  readonly mlptHistoricalSources?: readonly MlptHistoricalBackfillSource[];
}

export function createMarketDataIpcHandlers(
  dependencies: MarketDataIpcHandlerDependencies = {},
): MarketDataIpcHandlers {
  const shell = createMarketDataIpcShellHandlers();
  const credentialStore = dependencies.credentialStore;
  const streamSession = dependencies.streamSession ?? createAlphaFeedStreamSession();
  const stockSdkOperations =
    dependencies.stockSdkOperations ??
    createStockSdkGatewayProviderOperations(undefined, {
      tencentBars: dependencies.tencentFinanceBars ?? createTencentFinanceBarsOperations(),
    });

  if (!credentialStore && !dependencies.mlptHistoricalSources) {
    return shell;
  }

  if (!credentialStore) {
    return {
      ...shell,
      async fetchIntradayBars(request) {
        return request.providerPolicy?.mlptHistory
          ? fetchMlptHistoricalBars(request, dependencies.mlptHistoricalSources ?? [])
          : shell.fetchIntradayBars(request);
      },
    };
  }

  return {
    ...shell,
    async getProviderStatus() {
      const providers = createMarketDataProviders(true, {
        credentialStore,
        stockSdkOperations,
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
      const providers = createMarketDataProviders(
        request.providerPolicy?.stockSdkPrimaryEnabled ?? true,
        {
          credentialStore,
          stockSdkOperations,
          yahooFinanceProvider: dependencies.yahooFinanceProvider,
        },
      );
      const priority = createQuoteSnapshotPriority(
        request.providerPolicy?.stockSdkPrimaryEnabled ?? true,
      );
      const gateway = createMarketDataGateway(
        createMarketDataProviderRegistry(providers),
        priority,
      );
      const result = await gateway.fetchQuoteSnapshot(request.items);

      return toIpcGatewayResult(result);
    },
    async fetchHistoricalBars(request) {
      const providers = createMarketDataProviders(
        request.providerPolicy?.stockSdkPrimaryEnabled ?? true,
        {
          credentialStore,
          stockSdkOperations,
          yahooFinanceProvider: dependencies.yahooFinanceProvider,
        },
      );
      const gateway = createMarketDataGateway(
        createMarketDataProviderRegistry(providers),
        createHistoricalBarsPriority(request.providerPolicy?.stockSdkPrimaryEnabled ?? true),
      );
      const result = await gateway.fetchHistoricalBars(request.request);

      return toIpcGatewayResult(result);
    },
    async fetchIntradayBars(request) {
      const providers = createMarketDataProviders(
        request.providerPolicy?.stockSdkPrimaryEnabled ?? true,
        {
          credentialStore,
          stockSdkOperations,
          yahooFinanceProvider: dependencies.yahooFinanceProvider,
        },
      );
      if (request.providerPolicy?.mlptHistory) {
        return fetchMlptHistoricalBars(
          request,
          dependencies.mlptHistoricalSources ?? createMlptHistoricalSources(providers),
        );
      }
      const gateway = createMarketDataGateway(
        createMarketDataProviderRegistry(providers),
        createIntradayBarsPriority(request.providerPolicy?.stockSdkPrimaryEnabled ?? true),
      );
      const result = await gateway.fetchIntradayBars(request.request);

      return toIpcGatewayResult(result);
    },
    async searchInstruments(request) {
      const searchProvider = createStockSdkGatewayProvider(stockSdkOperations, {
        enabled: true,
        delayLevel: "unknown",
      });
      const gateway = createMarketDataGateway(createMarketDataProviderRegistry([searchProvider]), [
        "stock-sdk",
      ]);
      const searchResult = await gateway.searchInstruments(request.query, request.markets);
      if (searchResult.ok) {
        return toIpcGatewayResult(searchResult);
      }

      const exactSymbol = toExactSearchCandidate(request.query, request.markets);
      if (!exactSymbol) {
        return toIpcGatewayResult(searchResult);
      }

      // Name/pinyin search is an optional upstream capability. A code lookup is
      // deterministic, so validate it through the normal quote gateway instead
      // of making the user wait for the name-search endpoint to recover.
      // Use a separate provider instance: a failed optional search has already
      // marked the search provider unhealthy and must not suppress quote lookup.
      const quoteProviders = createMarketDataProviders(
        request.providerPolicy?.stockSdkPrimaryEnabled ?? true,
        {
          credentialStore,
          stockSdkOperations,
          yahooFinanceProvider: dependencies.yahooFinanceProvider,
        },
      );
      const quoteGateway = createMarketDataGateway(
        createMarketDataProviderRegistry(quoteProviders),
        createQuoteSnapshotPriority(request.providerPolicy?.stockSdkPrimaryEnabled ?? true),
      );
      const quoteResult = await quoteGateway.fetchQuoteSnapshot([exactSymbol]);
      if (!quoteResult.ok) {
        return toIpcGatewayResult(searchResult);
      }
      const quote = quoteResult.data[0];
      if (!quote) {
        return toIpcGatewayResult(searchResult);
      }
      return {
        ok: true,
        data: [
          {
            provider: quoteResult.provider,
            market: exactSymbol.market,
            symbol: exactSymbol.symbol,
            name: quote.name ?? exactSymbol.name ?? exactSymbol.symbol,
          },
        ],
        meta: {
          provider: quoteResult.provider,
          health: quoteResult.health,
          servedAt: new Date().toISOString(),
          fallback: {
            activeProvider: quoteResult.provider,
            fallbackFrom: quoteResult.triedProviders.find(
              (provider) => provider !== quoteResult.provider,
            ),
            triedProviders: quoteResult.triedProviders,
          },
        },
      } as const;
    },
    async connectQuoteStream(request) {
      const credentials = credentialStore.readAlphaFeedStreamCredentials();

      if (!credentials) {
        return createProviderUnavailableResult(
          "AlphaFeed WebSocket credentials are not configured.",
        );
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

function createMlptHistoricalSources(
  providers: readonly GatewayMarketDataProvider[],
): readonly MlptHistoricalBackfillSource[] {
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  return (["stock-sdk", "longbridge", "alphafeed-rest"] as const).flatMap((providerId) => {
    const provider = providerById.get(providerId);
    if (!provider || typeof (provider as IntradayBarProvider).fetchIntradayBars !== "function")
      return [];
    const intradayProvider = provider as IntradayBarProvider;
    return [
      {
        provider: providerId,
        fetchBars: (request: Parameters<IntradayBarProvider["fetchIntradayBars"]>[0]) =>
          intradayProvider.fetchIntradayBars(request),
        getHealth: () => provider.getHealth(),
      },
    ];
  });
}

async function fetchMlptHistoricalBars(
  request: Omit<MarketDataIpcBarRequest, "capability">,
  sources: readonly MlptHistoricalBackfillSource[],
) {
  const completion = request.providerPolicy?.mlptHistory;
  if (!completion) {
    throw new Error("MLPT historical completion policy is required.");
  }
  const result = await fetchMlptHistoricalBackfill({
    request: request.request,
    targetBars: completion.targetBars,
    confirmedThroughTimestamp: completion.confirmedThroughTimestamp,
    knownTimestamps: completion.knownTimestamps,
    sources,
  });
  const activeProvider = result.contributions[0]?.provider ?? result.triedProviders[0];
  if (!activeProvider || result.bars.length === 0) {
    return createProviderUnavailableResult<readonly GatewayMarketDataBar[]>(
      "MLPT historical supplement did not return usable data.",
    );
  }
  const activeSource = sources.find((source) => source.provider === activeProvider);
  const health =
    (await activeSource?.getHealth?.().catch(() => undefined)) ??
    createMlptHistoricalHealth(activeProvider, result.coverage.targetSatisfied);

  return {
    ok: true,
    data: result.bars,
    meta: {
      provider: activeProvider,
      health,
      servedAt: new Date().toISOString(),
      fallback: {
        activeProvider,
        fallbackFrom: result.triedProviders.find((provider) => provider !== activeProvider),
        triedProviders: result.triedProviders,
      },
      historicalCompletion: {
        purpose: "mlpt",
        targetBars: result.coverage.targetBars,
        confirmedBars: result.coverage.confirmedBars,
        targetSatisfied: result.coverage.targetSatisfied,
        contributions: result.contributions,
        failures: result.failures,
        stopReason: result.stopReason,
      },
    },
  } as const;
}

function createMlptHistoricalHealth(
  provider: MlptHistoricalBackfillSource["provider"],
  targetSatisfied: boolean,
): MarketDataProviderHealthView {
  return {
    provider,
    status: targetSatisfied ? "healthy" : "degraded",
    message: targetSatisfied
      ? "MLPT historical coverage target reached."
      : "MLPT historical sources returned partial coverage.",
    checkedAt: new Date().toISOString(),
    capability: {
      realtimeQuote: provider !== "stock-sdk",
      historicalBars: true,
      intradayBars: true,
      websocket: false,
      batchQuote: true,
      markets: ["US", "HK", "CN"],
      timeframes: ["realtime", "1m"],
      delayLevel: provider === "longbridge" ? "delayed" : "unknown",
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
      createStockSdkGatewayProvider(
        dependencies.stockSdkOperations ?? createStockSdkGatewayProviderOperations(),
        {
          enabled: true,
          delayLevel: "unknown",
        },
      ),
    );
  }

  const alphaFeedCredentials = dependencies.credentialStore.readAlphaFeedCredentials();
  if (alphaFeedCredentials) {
    providers.push(
      createAlphaFeedRestGatewayProvider({
        fetchQuoteSnapshot: (items) =>
          fetchAlphaFeedQuoteSnapshotsWithRest(alphaFeedCredentials, toWatchlistItems(items)),
        fetchHistoricalBars: (barRequest) =>
          fetchAlphaFeedHistoricalBarsWithRest(alphaFeedCredentials, barRequest),
        fetchIntradayBars: (barRequest) =>
          fetchAlphaFeedIntradayBarsWithRest(alphaFeedCredentials, barRequest),
      }),
    );
  }

  const longPortCredentials = dependencies.credentialStore.readLongPortCredentials();
  if (longPortCredentials) {
    providers.push(
      createLongBridgeGatewayProvider({
        fetchQuoteSnapshot: (items) =>
          fetchLongPortQuoteSnapshotsWithSdk(longPortCredentials, toWatchlistItems(items)),
        fetchHistoricalBars: (barRequest) =>
          fetchLongPortHistoricalBarsWithSdk(longPortCredentials, barRequest),
      }),
    );
  }

  providers.push(dependencies.yahooFinanceProvider ?? createYahooFinanceIntradayProvider());

  return providers;
}

function createQuoteSnapshotPriority(
  stockSdkPrimaryEnabled: boolean,
): readonly GatewayMarketDataProviderId[] {
  return stockSdkPrimaryEnabled
    ? marketDataIpcDefaultProviderPriority
    : ["alphafeed-rest", "longbridge"];
}

function createHistoricalBarsPriority(
  stockSdkPrimaryEnabled: boolean,
): readonly GatewayMarketDataProviderId[] {
  return stockSdkPrimaryEnabled
    ? ["stock-sdk", "alphafeed-rest", "longbridge", "yahoo-finance"]
    : ["alphafeed-rest", "longbridge", "yahoo-finance"];
}

function createIntradayBarsPriority(
  stockSdkPrimaryEnabled: boolean,
): readonly GatewayMarketDataProviderId[] {
  return stockSdkPrimaryEnabled
    ? ["stock-sdk", "alphafeed-rest", "longbridge", "yahoo-finance"]
    : ["alphafeed-rest", "longbridge", "yahoo-finance"];
}

function toExactSearchCandidate(
  query: string,
  markets?: readonly ("US" | "HK" | "CN")[],
): MarketDataProviderRequestItem | null {
  const input = query.trim();
  if (!input || (input !== input.toUpperCase() && input !== input.toLowerCase())) {
    return null;
  }

  const value = input.toUpperCase();
  const allowedMarkets = markets ?? ["US", "HK", "CN"];

  if (allowedMarkets.includes("CN") && /^\d{6}(?:\.(?:SH|SZ))?$/u.test(value)) {
    const code = value.replace(/\.(?:SH|SZ)$/u, "");
    const exchange =
      value.endsWith(".SZ") || code.startsWith("0") || code.startsWith("3") ? "SZ" : "SH";
    return { market: "CN", symbol: `${code}.${exchange}`, name: code };
  }

  if (allowedMarkets.includes("HK") && /^\d{5}(?:\.HK)?$/u.test(value)) {
    const code = value.replace(/\.HK$/u, "");
    return { market: "HK", symbol: `${code}.HK`, name: code };
  }

  if (allowedMarkets.includes("US") && /^[A-Z][A-Z0-9.-]{0,11}(?:\.US)?$/u.test(value)) {
    const symbol = value.endsWith(".US") ? value : `${value}.US`;
    return { market: "US", symbol, name: symbol.replace(/\.US$/u, "") };
  }

  return null;
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
  const providerHealth = error.provider
    ? health.find((item) => item.provider === error.provider)
    : undefined;
  return {
    code: mapGatewayErrorCode(error, providerHealth),
    message: providerHealth?.message ?? error.message,
    provider: error.provider,
    retryAfterMs: providerHealth?.nextRetryAt
      ? Math.max(0, new Date(providerHealth.nextRetryAt).getTime() - Date.now())
      : undefined,
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

function mapStreamHealthStatus(
  status: AlphaFeedProviderHealth["status"],
  state: AlphaFeedStreamConnectionState,
): MarketDataProviderHealthView["status"] {
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

function mapGatewayErrorCode(
  error: MarketDataGatewayError,
  health?: MarketDataProviderHealthView,
): MarketDataIpcError["code"] {
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
