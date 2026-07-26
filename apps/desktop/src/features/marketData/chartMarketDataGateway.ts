import type { Market, Timeframe } from "@quant/shared";
import type { AlphaFeedMarketDataBar } from "@quant/api-client";
import type { MarketDataIpcHistoricalCompletion } from "../../electron/marketDataIpcContract.ts";
import {
  readAlphaFeedStreamBinding,
  readSavedAlphaFeedCredentials,
  readSavedAlphaFeedStreamCredentials,
  readSavedLongPortCredentials,
  type AlphaFeedStreamBinding,
} from "../api/apiConfigService.ts";
import {
  createAlphaFeedRestGatewayProvider,
  createAlphaFeedWebSocketGatewayProvider,
  createLongBridgeGatewayProvider,
} from "./marketDataCompatibilityProviders.ts";
import { createStockSdkGatewayProvider, type StockSdkGatewayProviderOperations } from "./stockSdkGatewayProvider.ts";
import { createStockSdkGatewayProviderOperations } from "./stockSdkProviderOperations.ts";
import { createYahooFinanceIntradayProvider } from "./yahooFinanceIntradayProvider.ts";
import type { MarketDataBar } from "./marketBarCacheService.ts";
import { isMarketDataBarQualityValid } from "./marketDataQuality.ts";
import type { MarketQuoteSnapshot, MarketWatchlistItem } from "./marketDataSyncService.ts";
import {
  createMarketDataGateway,
  createMarketDataProviderRegistry,
  type GatewayMarketDataBar,
  type GatewayMarketDataProvider,
  type HistoricalBarProvider,
  type IntradayBarProvider,
  type GatewayMarketDataProviderId,
  type GatewayMarketQuoteSnapshot,
  type MarketDataGateway,
  type MarketDataProviderHealthView,
  type MarketDataProviderRequestItem,
  type MarketInstrument,
  type StreamingQuoteProvider,
} from "./marketDataProviderGateway.ts";

interface ChartMarketDataGatewayConfig {
  readonly bridge?: QuantDesktopBridge;
  readonly alphaFeedCredentials?: { readonly apiUrl: string; readonly apiKey: string } | null;
  readonly alphaFeedStreamCredentials?: { readonly wsUrl: string; readonly apiKey: string } | null;
  readonly alphaFeedStreamBinding?: AlphaFeedStreamBinding | null;
  readonly longPortCredentials?: {
    readonly apiUrl: string;
    readonly appKey: string;
    readonly appSecret: string;
    readonly accessToken: string;
  } | null;
  readonly enableStockSdkPrimary?: boolean;
  readonly stockSdkOperations?: StockSdkGatewayProviderOperations;
  readonly yahooFinanceProvider?: HistoricalBarProvider & IntradayBarProvider;
}

export interface ChartMarketDataGateways {
  readonly historicalBars: MarketDataGateway;
  readonly intradayBars: MarketDataGateway;
  readonly quoteSnapshots: MarketDataGateway;
  readonly instrumentSearch: MarketDataGateway;
  connectQuoteStream(items: readonly MarketWatchlistItem[]): Promise<MarketDataProviderHealthView | null>;
  readQuoteStreamSnapshot(items: readonly MarketWatchlistItem[]): Promise<{
    readonly ok: true;
    readonly snapshots: readonly MarketQuoteSnapshot[];
    readonly health: MarketDataProviderHealthView;
  } | {
    readonly ok: false;
    readonly health: readonly MarketDataProviderHealthView[];
  }>;
  disconnectQuoteStream(): Promise<void>;
}

export type ChartQuoteSnapshotBatchResult =
  | {
      readonly ok: true;
      readonly data: readonly GatewayMarketQuoteSnapshot[];
      readonly health: MarketDataProviderHealthView;
      readonly triedProviders: readonly GatewayMarketDataProviderId[];
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly message: string;
      };
      readonly health: readonly MarketDataProviderHealthView[];
      readonly triedProviders: readonly GatewayMarketDataProviderId[];
    };

export type ChartBarsBatchResult =
  | {
      readonly ok: true;
      readonly data: readonly GatewayMarketDataBar[];
      readonly health: MarketDataProviderHealthView;
      readonly triedProviders: readonly GatewayMarketDataProviderId[];
      readonly historicalCompletion?: MarketDataIpcHistoricalCompletion;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly message: string;
      };
      readonly health: readonly MarketDataProviderHealthView[];
      readonly triedProviders: readonly GatewayMarketDataProviderId[];
    };

export interface ChartMarketDataAccess {
  readonly hasQuoteSource: boolean;
  readonly hasHistoricalSource: boolean;
  readonly hasIntradaySource: boolean;
  readonly hasStreamSource: boolean;
  searchInstruments(query: string, markets?: readonly Market[]): Promise<
    | { readonly ok: true; readonly data: readonly MarketInstrument[] }
    | { readonly ok: false; readonly error: { readonly message: string } }
  >;
  fetchQuoteSnapshotBatch(batch: readonly MarketWatchlistItem[]): Promise<ChartQuoteSnapshotBatchResult>;
  fetchBars(options: {
    readonly capability: "historicalBars" | "intradayBars";
    readonly request: {
      readonly symbol: string;
      readonly market: Market;
      readonly timeframe: Timeframe;
      readonly count?: number;
      readonly startTime?: number;
      readonly endTime?: number;
    };
    readonly mlptHistory?: {
      readonly targetBars: number;
      readonly confirmedThroughTimestamp: number;
      readonly knownTimestamps: readonly number[];
    };
  }): Promise<ChartBarsBatchResult>;
  connectQuoteStream(items: readonly MarketWatchlistItem[], mode?: "watchlist" | "all-symbols"): Promise<MarketDataProviderHealthView | null>;
  readQuoteStreamSnapshot(items: readonly MarketWatchlistItem[]): Promise<
    | {
        readonly ok: true;
        readonly snapshots: readonly MarketQuoteSnapshot[];
        readonly health: MarketDataProviderHealthView;
      }
    | {
        readonly ok: false;
        readonly health: readonly MarketDataProviderHealthView[];
      }
  >;
  disconnectQuoteStream(): Promise<void>;
}

interface ChartMarketDataAccessConfig {
  readonly bridge?: QuantDesktopBridge;
  readonly enableStockSdkPrimary: boolean;
}

const inFlightChartBarRequests = new Map<string, Promise<ChartBarsBatchResult>>();

export async function createChartMarketDataAccess(config: ChartMarketDataAccessConfig): Promise<ChartMarketDataAccess> {
  const providerNeutralBridge = config.bridge?.marketData;

  if (providerNeutralBridge) {
    return createProviderNeutralChartMarketDataAccess(providerNeutralBridge, config.enableStockSdkPrimary);
  }

  const [alphaFeedCredentials, alphaFeedStreamCredentials, longPortCredentials] = await Promise.all([
    readSavedAlphaFeedCredentials(),
    readSavedAlphaFeedStreamCredentials(),
    readSavedLongPortCredentials(),
  ]);
  const alphaFeedStreamBinding = readAlphaFeedStreamBinding();
  const gateways = createChartMarketDataGateways({
    bridge: config.bridge,
    alphaFeedCredentials,
    alphaFeedStreamCredentials,
    alphaFeedStreamBinding,
    longPortCredentials,
    enableStockSdkPrimary: config.enableStockSdkPrimary,
  });

  return createLegacyChartMarketDataAccess(gateways, {
    hasQuoteSource: config.enableStockSdkPrimary || Boolean(alphaFeedCredentials) || Boolean(longPortCredentials),
    hasHistoricalSource: config.enableStockSdkPrimary || Boolean(longPortCredentials) || Boolean(alphaFeedCredentials),
    hasIntradaySource: config.enableStockSdkPrimary || Boolean(alphaFeedCredentials) || Boolean(longPortCredentials),
    hasStreamSource: Boolean(alphaFeedStreamCredentials && alphaFeedStreamBinding),
  });
}

export function createChartMarketDataGateways(config: ChartMarketDataGatewayConfig): ChartMarketDataGateways {
  const providers: GatewayMarketDataProvider[] = [];
  let streamProvider: StreamingQuoteProvider | null = null;
  const alphaFeedBridge = config.bridge?.alphaFeed;
  const longPortBridge = config.bridge?.longPort;

  if (config.enableStockSdkPrimary) {
    providers.push(
      createStockSdkGatewayProvider(config.stockSdkOperations ?? createStockSdkGatewayProviderOperations(), {
        enabled: true,
        delayLevel: "unknown",
      }),
    );
  }

  if (alphaFeedBridge && config.alphaFeedCredentials) {
    providers.push(
      createAlphaFeedRestGatewayProvider({
        fetchQuoteSnapshot: (items) => alphaFeedBridge.fetchQuoteSnapshot(config.alphaFeedCredentials!, toWatchlistItems(items)),
        fetchHistoricalBars: (request) => alphaFeedBridge.fetchHistoricalBars(config.alphaFeedCredentials!, toBridgeBarRequest(request)),
        fetchIntradayBars: (request) => alphaFeedBridge.fetchIntradayBars(config.alphaFeedCredentials!, toBridgeBarRequest(request)),
      }),
    );
  }

  if (
    alphaFeedBridge &&
    config.alphaFeedStreamCredentials &&
    config.alphaFeedStreamBinding
  ) {
    streamProvider = createAlphaFeedWebSocketGatewayProvider({
      connectStream: (items) =>
        alphaFeedBridge.connectStream({
          credentials: config.alphaFeedStreamCredentials!,
          mode: config.alphaFeedStreamBinding!.mode,
          watchlist: toWatchlistItems(items),
        }),
      readStreamSnapshot: () => alphaFeedBridge.readStreamSnapshot(),
      disconnectStream: () => alphaFeedBridge.disconnectStream(),
    });
    providers.push(streamProvider);
  }

  if (longPortBridge && config.longPortCredentials) {
    providers.push(
      createLongBridgeGatewayProvider({
        fetchQuoteSnapshot: (items) => longPortBridge.fetchQuoteSnapshot(config.longPortCredentials!, toWatchlistItems(items)),
        fetchHistoricalBars: (request) => longPortBridge.fetchHistoricalBars(config.longPortCredentials!, toBridgeBarRequest(request)),
      }),
    );
  }

  providers.push(config.yahooFinanceProvider ?? createYahooFinanceIntradayProvider({ baseUrl: getYahooFinanceBrowserProxyUrl() }));

  const registry = createMarketDataProviderRegistry(providers);
  const historicalPriority: readonly GatewayMarketDataProviderId[] = config.enableStockSdkPrimary
    ? ["stock-sdk", "alphafeed-rest", "longbridge", "yahoo-finance"]
    : ["alphafeed-rest", "longbridge", "yahoo-finance"];
  const intradayPriority: readonly GatewayMarketDataProviderId[] = config.enableStockSdkPrimary
    ? ["stock-sdk", "alphafeed-rest", "longbridge", "yahoo-finance"]
    : ["alphafeed-rest", "longbridge", "yahoo-finance"];
  const quotePriority: readonly GatewayMarketDataProviderId[] = config.enableStockSdkPrimary
    ? ["stock-sdk", "alphafeed-rest", "longbridge"]
    : ["alphafeed-rest", "longbridge"];

  return {
    historicalBars: createMarketDataGateway(registry, historicalPriority),
    intradayBars: createMarketDataGateway(registry, intradayPriority),
    quoteSnapshots: createMarketDataGateway(registry, quotePriority),
    instrumentSearch: createMarketDataGateway(registry, ["stock-sdk"]),
    async connectQuoteStream(items) {
      if (!streamProvider) {
        return null;
      }

      await streamProvider.connectStream(toProviderItems(items));
      return streamProvider.getHealth();
    },
    async readQuoteStreamSnapshot(items) {
      const gateway = createMarketDataGateway(registry, ["alphafeed-websocket"]);
      const result = await gateway.fetchQuoteSnapshot(toProviderItems(items));

      if (!result.ok) {
        return { ok: false, health: result.health };
      }

      return {
        ok: true,
        snapshots: gatewayQuoteSnapshotsToMarketQuoteSnapshots(result.data),
        health: result.health,
      };
    },
    async disconnectQuoteStream() {
      await streamProvider?.disconnectStream();
    },
  };
}

function getYahooFinanceBrowserProxyUrl() {
  if (typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
    return "/market-data-proxy/yahoo-finance";
  }

  return undefined;
}

function createProviderNeutralChartMarketDataAccess(
  bridge: QuantDesktopMarketDataBridge,
  stockSdkPrimaryEnabled: boolean,
): ChartMarketDataAccess {
  return {
    hasQuoteSource: true,
    hasHistoricalSource: true,
    hasIntradaySource: true,
    hasStreamSource: true,
    async searchInstruments(query, markets) {
      const result = await bridge.searchInstruments({
        context: { source: "chart" },
        query,
        markets,
        providerPolicy: { stockSdkPrimaryEnabled },
      });
      return result.ok ? { ok: true, data: result.data } : { ok: false, error: { message: result.error.message } };
    },
    async fetchQuoteSnapshotBatch(batch) {
      const result = await bridge.fetchQuoteSnapshot({
        context: { source: "chart" },
        items: batch,
        providerPolicy: {
          stockSdkPrimaryEnabled,
        },
      });

      return toChartQuoteSnapshotBatchResult(result);
    },
    async fetchBars(options) {
      const requestKey = JSON.stringify([
        "desktop",
        options.capability,
        options.request,
        options.mlptHistory,
        stockSdkPrimaryEnabled,
      ]);
      const existing = inFlightChartBarRequests.get(requestKey);
      if (existing) return existing;
      const request = {
        context: { source: "chart" as const },
        request: options.request,
        providerPolicy: {
          stockSdkPrimaryEnabled,
          ...(options.mlptHistory ? { mlptHistory: options.mlptHistory } : {}),
        },
      };
      const pending = (options.capability === "intradayBars"
        ? bridge.fetchIntradayBars(request)
        : bridge.fetchHistoricalBars(request))
        .then(toChartBarsBatchResult)
        .finally(() => inFlightChartBarRequests.delete(requestKey));
      inFlightChartBarRequests.set(requestKey, pending);
      return pending;
    },
    async connectQuoteStream(items, mode = "watchlist") {
      const result = await bridge.connectQuoteStream({
        context: { source: "chart" },
        items,
        providerPolicy: {
          alphaFeedStreamMode: mode,
        },
      });

      return result.ok ? result.meta.health : result.error.health[0] ?? null;
    },
    async readQuoteStreamSnapshot(items) {
      const result = await bridge.readQuoteStreamSnapshot({
        context: { source: "chart" },
        items,
      });

      if (!result.ok) {
        return { ok: false, health: result.error.health };
      }

      return {
        ok: true,
        snapshots: gatewayQuoteSnapshotsToMarketQuoteSnapshots(result.data.snapshots),
        health: result.meta.health,
      };
    },
    async disconnectQuoteStream() {
      await bridge.disconnectQuoteStream({ source: "chart" });
    },
  };
}

function createLegacyChartMarketDataAccess(
  gateways: ChartMarketDataGateways,
  availability: Pick<ChartMarketDataAccess, "hasQuoteSource" | "hasHistoricalSource" | "hasIntradaySource" | "hasStreamSource">,
): ChartMarketDataAccess {
  return {
    async searchInstruments(query, markets) {
      const result = await gateways.instrumentSearch.searchInstruments(query, markets);
      return result.ok ? { ok: true, data: result.data } : { ok: false, error: { message: result.error.message } };
    },
    ...availability,
    fetchQuoteSnapshotBatch: (batch) => gateways.quoteSnapshots.fetchQuoteSnapshot(batch),
    fetchBars: (options) => dedupeLegacyChartBars(gateways, options),
    connectQuoteStream: (items) => gateways.connectQuoteStream(items),
    readQuoteStreamSnapshot: (items) => gateways.readQuoteStreamSnapshot(items),
    disconnectQuoteStream: () => gateways.disconnectQuoteStream(),
  };
}

function dedupeLegacyChartBars(
  gateways: ChartMarketDataGateways,
  options: Parameters<ChartMarketDataAccess["fetchBars"]>[0],
) {
  const requestKey = JSON.stringify(["legacy", options.capability, options.request]);
  const existing = inFlightChartBarRequests.get(requestKey);
  if (existing) return existing;
  const pending = (options.capability === "intradayBars"
    ? gateways.intradayBars.fetchIntradayBars(options.request)
    : gateways.historicalBars.fetchHistoricalBars(options.request))
    .finally(() => inFlightChartBarRequests.delete(requestKey));
  inFlightChartBarRequests.set(requestKey, pending);
  return pending;
}

function toChartQuoteSnapshotBatchResult(result: QuantDesktopMarketDataResult<readonly GatewayMarketQuoteSnapshot[]>): ChartQuoteSnapshotBatchResult {
  if (!result.ok) {
    return {
      ok: false,
      error: {
        message: result.error.message,
      },
      health: result.error.health,
      triedProviders: result.error.fallback.triedProviders,
    };
  }

  return {
    ok: true,
    data: result.data,
    health: result.meta.health,
    triedProviders: result.meta.fallback.triedProviders,
  };
}

function toChartBarsBatchResult(result: QuantDesktopMarketDataResult<readonly GatewayMarketDataBar[]>): ChartBarsBatchResult {
  if (!result.ok) {
    return {
      ok: false,
      error: {
        message: result.error.message,
      },
      health: result.error.health,
      triedProviders: result.error.fallback.triedProviders,
    };
  }

  return {
    ok: true,
    data: result.data,
    health: result.meta.health,
    triedProviders: result.meta.fallback.triedProviders,
    historicalCompletion: result.meta.historicalCompletion,
  };
}

export function gatewayQuoteSnapshotsToMarketQuoteSnapshots(
  snapshots: readonly GatewayMarketQuoteSnapshot[],
): MarketQuoteSnapshot[] {
  return snapshots.map((snapshot) => {
    const quoteTime = Number.isFinite(snapshot.timestamp) ? new Date(snapshot.timestamp).toISOString() : new Date().toISOString();
    const previousClose =
      typeof snapshot.previousClose === "number"
        ? snapshot.previousClose
        : typeof snapshot.change === "number"
        ? snapshot.price - snapshot.change
        : snapshot.price;

    return {
      symbol: snapshot.symbol,
      name: snapshot.name,
      market: snapshot.market,
      lastPrice: snapshot.price,
      previousClose,
      openPrice: snapshot.openPrice,
      highPrice: snapshot.highPrice,
      lowPrice: snapshot.lowPrice,
      changePercent: snapshot.changePercent ?? 0,
      volume: snapshot.volume ?? 0,
      amount: snapshot.amount,
      quoteTime,
      receivedAt: snapshot.receivedAt ?? quoteTime,
      provider: snapshot.provider,
    };
  });
}

export function gatewayBarsToMarketDataBars(
  bars: readonly GatewayMarketDataBar[],
  timeframeOverride?: Timeframe,
): MarketDataBar[] {
  return bars.map((bar) => ({
    symbol: bar.symbol,
    market: bar.market,
    timeframe: timeframeOverride ?? bar.timeframe,
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    amount: bar.amount,
    provider: bar.provider,
    upstream: bar.upstream,
  })).filter(isMarketDataBarQualityValid);
}

export function gatewayBarsToAlphaFeedMarketDataBars(bars: readonly GatewayMarketDataBar[]): AlphaFeedMarketDataBar[] {
  return bars.filter(isMarketDataBarQualityValid).map((bar) => ({
    symbol: bar.symbol,
    market: bar.market,
    timeframe: bar.timeframe,
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    amount: bar.amount ?? 0,
    provider: "alphafeed",
  }));
}

function toProviderItems(items: readonly MarketDataProviderRequestItem[]): MarketDataProviderRequestItem[] {
  return items.map((item) => ({ market: item.market, symbol: item.symbol, name: item.name }));
}

function toWatchlistItems(items: readonly MarketDataProviderRequestItem[]): MarketWatchlistItem[] {
  return items.map((item) => ({
    symbol: item.symbol,
    name: item.name ?? item.symbol,
    market: item.market,
    source: "preset",
  }));
}

function toBridgeBarRequest(request: {
  readonly market: Market;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly count?: number;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly adjust?: "none" | "forward" | "backward";
}) {
  return {
    symbol: request.symbol,
    market: request.market,
    timeframe: request.timeframe,
    count: request.count,
    startTime: request.startTime,
    endTime: request.endTime,
    adjust: request.adjust,
  };
}
