import type { Market, Timeframe } from "@quant/shared";
import type { AlphaFeedMarketDataBar } from "@quant/api-client";
import type { AlphaFeedStreamBinding } from "../api/apiConfigService.ts";
import {
  createAlphaFeedRestGatewayProvider,
  createAlphaFeedWebSocketGatewayProvider,
  createLongBridgeGatewayProvider,
} from "./marketDataCompatibilityProviders.ts";
import { createStockSdkGatewayProvider, type StockSdkGatewayProviderOperations } from "./stockSdkGatewayProvider.ts";
import { createStockSdkGatewayProviderOperations } from "./stockSdkProviderOperations.ts";
import type { MarketDataBar } from "./marketBarCacheService.ts";
import type { MarketQuoteSnapshot, MarketWatchlistItem } from "./marketDataSyncService.ts";
import {
  createMarketDataGateway,
  createMarketDataProviderRegistry,
  type GatewayMarketDataBar,
  type GatewayMarketDataProvider,
  type GatewayMarketDataProviderId,
  type GatewayMarketQuoteSnapshot,
  type MarketDataGateway,
  type MarketDataProviderHealthView,
  type MarketDataProviderRequestItem,
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
}

export interface ChartMarketDataGateways {
  readonly historicalBars: MarketDataGateway;
  readonly intradayBars: MarketDataGateway;
  readonly quoteSnapshots: MarketDataGateway;
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

  const registry = createMarketDataProviderRegistry(providers);
  const historicalPriority: readonly GatewayMarketDataProviderId[] = config.enableStockSdkPrimary
    ? ["stock-sdk", "longbridge", "alphafeed-rest"]
    : ["longbridge", "alphafeed-rest"];
  const intradayPriority: readonly GatewayMarketDataProviderId[] = config.enableStockSdkPrimary
    ? ["stock-sdk", "alphafeed-rest", "longbridge"]
    : ["alphafeed-rest", "longbridge"];
  const quotePriority: readonly GatewayMarketDataProviderId[] = config.enableStockSdkPrimary
    ? ["stock-sdk", "alphafeed-rest", "longbridge"]
    : ["alphafeed-rest", "longbridge"];

  return {
    historicalBars: createMarketDataGateway(registry, historicalPriority),
    intradayBars: createMarketDataGateway(registry, intradayPriority),
    quoteSnapshots: createMarketDataGateway(registry, quotePriority),
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
  }));
}

export function gatewayBarsToAlphaFeedMarketDataBars(bars: readonly GatewayMarketDataBar[]): AlphaFeedMarketDataBar[] {
  return bars.map((bar) => ({
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
