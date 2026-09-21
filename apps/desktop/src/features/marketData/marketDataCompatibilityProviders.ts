import type { Market, Timeframe } from "@quant/shared";
import type { MarketQuoteSnapshot } from "./marketDataSyncService.ts";
import type {
  GatewayMarketDataBar,
  GatewayMarketQuoteSnapshot,
  HistoricalBarProvider,
  IntradayBarProvider,
  MarketDataBarRequest,
  MarketDataProvider,
  MarketDataProviderCapability,
  MarketDataProviderDelayLevel,
  MarketDataProviderHealthStatus,
  MarketDataProviderHealthView,
  MarketDataProviderRequestItem,
  RealtimeQuoteProvider,
  StreamingQuoteProvider,
} from "./marketDataProviderGateway.ts";

type LegacyProviderHealthStatus =
  | "ok"
  | "auth_failed"
  | "permission_denied"
  | "rate_limited"
  | "network_error"
  | "invalid_response"
  | "error";

interface LegacyProviderHealth {
  readonly status: LegacyProviderHealthStatus;
  readonly message: string;
  readonly checkedAt: string;
  readonly latencyMs: number;
  readonly nextRetryAt?: string;
}

interface LegacyMarketDataBar {
  readonly symbol: string;
  readonly market: Market;
  readonly timeframe: Timeframe;
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly amount?: number;
}

type LegacyQuoteResult =
  | {
      readonly ok: true;
      readonly snapshots: readonly MarketQuoteSnapshot[];
      readonly health?: LegacyProviderHealth;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly message: string;
        readonly health?: LegacyProviderHealth;
      };
    };

type LegacyBarsResult =
  | {
      readonly ok: true;
      readonly bars: readonly LegacyMarketDataBar[];
      readonly health?: LegacyProviderHealth;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly message: string;
        readonly health?: LegacyProviderHealth;
      };
    };

type LegacyStreamState = "idle" | "connecting" | "connected" | "fallback";

type LegacyStreamControlResult = {
  readonly ok: true;
  readonly health: LegacyProviderHealth;
  readonly state: LegacyStreamState;
};

type LegacyStreamSnapshotResult = {
  readonly ok: true;
  readonly snapshots: readonly MarketQuoteSnapshot[];
  readonly health: LegacyProviderHealth;
  readonly state: LegacyStreamState;
};

export interface AlphaFeedRestGatewayProviderOperations {
  fetchQuoteSnapshot(items: readonly MarketDataProviderRequestItem[]): Promise<LegacyQuoteResult>;
  fetchHistoricalBars(request: MarketDataBarRequest): Promise<LegacyBarsResult>;
  fetchIntradayBars(request: MarketDataBarRequest): Promise<LegacyBarsResult>;
}

export interface AlphaFeedWebSocketGatewayProviderOperations {
  connectStream(
    items: readonly MarketDataProviderRequestItem[],
  ): Promise<LegacyStreamControlResult>;
  readStreamSnapshot(): Promise<LegacyStreamSnapshotResult>;
  disconnectStream(): Promise<LegacyStreamControlResult>;
}

export interface LongBridgeGatewayProviderOperations {
  fetchQuoteSnapshot(items: readonly MarketDataProviderRequestItem[]): Promise<LegacyQuoteResult>;
  fetchHistoricalBars(request: MarketDataBarRequest): Promise<LegacyBarsResult>;
}

const allMarkets: readonly Market[] = ["US", "HK", "CN"];
const quoteAndBarTimeframes: readonly Timeframe[] = [
  "realtime",
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "1d",
  "1w",
];

const alphaFeedRestCapability: MarketDataProviderCapability = {
  realtimeQuote: true,
  historicalBars: true,
  intradayBars: true,
  websocket: false,
  batchQuote: true,
  markets: allMarkets,
  timeframes: quoteAndBarTimeframes,
  rateLimit: {
    requests: 1,
    intervalMs: 10_000,
    scope: "global",
  },
  delayLevel: "realtime",
};

const alphaFeedWebSocketCapability: MarketDataProviderCapability = {
  realtimeQuote: true,
  historicalBars: false,
  intradayBars: false,
  websocket: true,
  batchQuote: false,
  markets: allMarkets,
  timeframes: ["realtime"],
  delayLevel: "realtime",
};

const longBridgeCapability: MarketDataProviderCapability = {
  realtimeQuote: true,
  historicalBars: true,
  intradayBars: true,
  websocket: false,
  batchQuote: true,
  markets: allMarkets,
  timeframes: quoteAndBarTimeframes,
  delayLevel: "delayed",
};

export function createAlphaFeedRestGatewayProvider(
  operations: AlphaFeedRestGatewayProviderOperations,
): RealtimeQuoteProvider & HistoricalBarProvider & IntradayBarProvider {
  const health = createCompatibilityHealthStore(
    "alphafeed-rest",
    "AlphaFeed REST",
    alphaFeedRestCapability,
    "healthy",
  );

  return {
    id: "alphafeed-rest",
    displayName: "AlphaFeed REST",
    capability: alphaFeedRestCapability,
    getHealth: health.read,
    async fetchQuoteSnapshot(items) {
      const result = await operations.fetchQuoteSnapshot(items);
      return mapQuoteResult(result, "alphafeed-rest", health);
    },
    async fetchHistoricalBars(request) {
      const result = await operations.fetchHistoricalBars(request);
      return mapBarsResult(result, "alphafeed-rest", health);
    },
    async fetchIntradayBars(request) {
      const result = await operations.fetchIntradayBars(request);
      return mapBarsResult(result, "alphafeed-rest", health);
    },
  };
}

export function createAlphaFeedWebSocketGatewayProvider(
  operations: AlphaFeedWebSocketGatewayProviderOperations,
): RealtimeQuoteProvider & StreamingQuoteProvider {
  const health = createCompatibilityHealthStore(
    "alphafeed-websocket",
    "AlphaFeed WebSocket",
    alphaFeedWebSocketCapability,
    "unconfigured",
  );

  return {
    id: "alphafeed-websocket",
    displayName: "AlphaFeed WebSocket",
    capability: alphaFeedWebSocketCapability,
    getHealth: health.read,
    async fetchQuoteSnapshot() {
      const result = await operations.readStreamSnapshot();
      health.update(
        mapLegacyHealth(
          result.health,
          "alphafeed-websocket",
          alphaFeedWebSocketCapability,
          result.state,
        ),
      );
      return result.snapshots.map((snapshot) => mapQuoteSnapshot(snapshot, "alphafeed-websocket"));
    },
    async connectStream(items) {
      const result = await operations.connectStream(items);
      health.update(
        mapLegacyHealth(
          result.health,
          "alphafeed-websocket",
          alphaFeedWebSocketCapability,
          result.state,
        ),
      );
    },
    async readStreamSnapshot() {
      const result = await operations.readStreamSnapshot();
      health.update(
        mapLegacyHealth(
          result.health,
          "alphafeed-websocket",
          alphaFeedWebSocketCapability,
          result.state,
        ),
      );
      return result.snapshots.map((snapshot) => mapQuoteSnapshot(snapshot, "alphafeed-websocket"));
    },
    async disconnectStream() {
      const result = await operations.disconnectStream();
      health.update(
        mapLegacyHealth(
          result.health,
          "alphafeed-websocket",
          alphaFeedWebSocketCapability,
          result.state,
        ),
      );
    },
  };
}

export function createLongBridgeGatewayProvider(
  operations: LongBridgeGatewayProviderOperations,
): RealtimeQuoteProvider & HistoricalBarProvider & IntradayBarProvider {
  const health = createCompatibilityHealthStore(
    "longbridge",
    "LongBridge",
    longBridgeCapability,
    "delayed",
  );

  return {
    id: "longbridge",
    displayName: "LongBridge",
    capability: longBridgeCapability,
    getHealth: health.read,
    async fetchQuoteSnapshot(items) {
      const result = await operations.fetchQuoteSnapshot(items);
      return mapQuoteResult(result, "longbridge", health, "delayed");
    },
    async fetchHistoricalBars(request) {
      const result = await operations.fetchHistoricalBars(request);
      return mapBarsResult(result, "longbridge", health, "delayed");
    },
    async fetchIntradayBars(request) {
      const result = await operations.fetchHistoricalBars(request);
      return mapBarsResult(result, "longbridge", health, "delayed");
    },
  };
}

function createCompatibilityHealthStore(
  provider: MarketDataProvider["id"],
  displayName: string,
  capability: MarketDataProviderCapability,
  initialStatus: MarketDataProviderHealthStatus,
) {
  let current: MarketDataProviderHealthView = {
    provider,
    status: initialStatus,
    message: `${displayName} compatibility provider is registered.`,
    checkedAt: new Date(0).toISOString(),
    capability,
  };

  return {
    capability,
    read: async () => current,
    update: (next: MarketDataProviderHealthView) => {
      current = next;
    },
  };
}

function mapQuoteResult(
  result: LegacyQuoteResult,
  provider: GatewayMarketQuoteSnapshot["provider"],
  health: ReturnType<typeof createCompatibilityHealthStore>,
  delayLevel: MarketDataProviderDelayLevel = "realtime",
) {
  if (!result.ok) {
    updateFailedResultHealth(
      result.error.message,
      result.error.health,
      provider,
      health,
      delayLevel,
    );
    throw new Error(result.error.message);
  }

  if (result.health) {
    health.update(
      mapLegacyHealth(result.health, provider, healthCapability(health), undefined, delayLevel),
    );
  }

  return result.snapshots.map((snapshot) => mapQuoteSnapshot(snapshot, provider, delayLevel));
}

function mapBarsResult(
  result: LegacyBarsResult,
  provider: GatewayMarketDataBar["provider"],
  health: ReturnType<typeof createCompatibilityHealthStore>,
  delayLevel: MarketDataProviderDelayLevel = "realtime",
) {
  if (!result.ok) {
    updateFailedResultHealth(
      result.error.message,
      result.error.health,
      provider,
      health,
      delayLevel,
    );
    throw new Error(result.error.message);
  }

  if (result.health) {
    health.update(
      mapLegacyHealth(result.health, provider, healthCapability(health), undefined, delayLevel),
    );
  }

  return result.bars.map((bar) => mapMarketDataBar(bar, provider, delayLevel));
}

function updateFailedResultHealth(
  message: string,
  legacyHealth: LegacyProviderHealth | undefined,
  provider: MarketDataProvider["id"],
  health: ReturnType<typeof createCompatibilityHealthStore>,
  delayLevel: MarketDataProviderDelayLevel,
) {
  health.update(
    legacyHealth
      ? mapLegacyHealth(legacyHealth, provider, healthCapability(health), undefined, delayLevel)
      : {
          provider,
          status: "unavailable",
          message,
          checkedAt: new Date().toISOString(),
          capability: healthCapability(health),
        },
  );
}

function healthCapability(health: ReturnType<typeof createCompatibilityHealthStore>) {
  return health.capability;
}

function mapLegacyHealth(
  health: LegacyProviderHealth,
  provider: MarketDataProvider["id"],
  capability: MarketDataProviderCapability,
  streamState?: LegacyStreamState,
  delayLevel: MarketDataProviderDelayLevel = "realtime",
): MarketDataProviderHealthView {
  return {
    provider,
    status: mapLegacyHealthStatus(health.status, streamState, delayLevel),
    message: health.message,
    checkedAt: health.checkedAt,
    latencyMs: health.latencyMs,
    nextRetryAt: health.nextRetryAt,
    capability,
  };
}

function mapLegacyHealthStatus(
  status: LegacyProviderHealthStatus,
  streamState?: LegacyStreamState,
  delayLevel: MarketDataProviderDelayLevel = "realtime",
): MarketDataProviderHealthStatus {
  if (status === "ok" && streamState === "fallback") {
    return "degraded";
  }

  if (status === "ok") {
    return delayLevel === "delayed" ? "delayed" : "healthy";
  }

  if (status === "auth_failed" || status === "permission_denied") {
    return "unauthorized";
  }

  if (status === "rate_limited") {
    return "rateLimited";
  }

  return "unavailable";
}

function mapQuoteSnapshot(
  snapshot: MarketQuoteSnapshot,
  provider: GatewayMarketQuoteSnapshot["provider"],
  delayLevel: MarketDataProviderDelayLevel = "realtime",
): GatewayMarketQuoteSnapshot {
  return {
    provider,
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
    delayLevel,
  };
}

function mapMarketDataBar(
  bar: LegacyMarketDataBar,
  provider: GatewayMarketDataBar["provider"],
  delayLevel: MarketDataProviderDelayLevel = "realtime",
): GatewayMarketDataBar {
  return {
    provider,
    market: bar.market,
    symbol: bar.symbol,
    timeframe: bar.timeframe,
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    amount: bar.amount,
    delayLevel,
  };
}
