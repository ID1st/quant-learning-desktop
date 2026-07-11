import type {
  GatewayMarketDataBar,
  GatewayMarketDataProviderId,
  GatewayMarketQuoteSnapshot,
  MarketDataBarRequest,
  MarketDataProviderCapability,
  MarketDataProviderCapabilityKey,
  MarketDataProviderHealthView,
  MarketDataProviderRequestItem,
  MarketInstrument,
} from "../features/marketData/marketDataProviderGateway.ts";

export type MarketDataIpcRequestSource = "chart" | "sync" | "strategy" | "diagnostics";

export type MarketDataIpcErrorCode =
  | "NO_CAPABLE_PROVIDER"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_UNCONFIGURED"
  | "PROVIDER_UNAUTHORIZED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_DELAYED"
  | "INVALID_REQUEST"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export type MarketDataIpcStreamState = "idle" | "connecting" | "connected" | "fallback" | "disconnected" | "error";

export interface MarketDataIpcRequestContext {
  readonly source: MarketDataIpcRequestSource;
  readonly requestId?: string;
  readonly requestedAt?: string;
}

export interface MarketDataIpcProviderFallback {
  readonly activeProvider?: GatewayMarketDataProviderId;
  readonly fallbackFrom?: GatewayMarketDataProviderId;
  readonly triedProviders: readonly GatewayMarketDataProviderId[];
}

export interface MarketDataIpcError {
  readonly code: MarketDataIpcErrorCode;
  readonly message: string;
  readonly provider?: GatewayMarketDataProviderId;
  readonly retryAfterMs?: number;
  readonly fallback: MarketDataIpcProviderFallback;
  readonly health: readonly MarketDataProviderHealthView[];
}

export interface MarketDataIpcSuccessMeta {
  readonly provider: GatewayMarketDataProviderId;
  readonly health: MarketDataProviderHealthView;
  readonly fallback: MarketDataIpcProviderFallback;
  readonly servedAt: string;
}

export type MarketDataIpcResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly meta: MarketDataIpcSuccessMeta;
    }
  | {
      readonly ok: false;
      readonly error: MarketDataIpcError;
    };

export interface MarketDataIpcProviderStatus {
  readonly priority: readonly GatewayMarketDataProviderId[];
  readonly providers: readonly MarketDataProviderHealthView[];
  readonly capabilities: readonly MarketDataProviderCapability[];
  readonly checkedAt: string;
}

export interface MarketDataIpcQuoteSnapshotRequest {
  readonly context: MarketDataIpcRequestContext;
  readonly items: readonly MarketDataProviderRequestItem[];
  readonly providerPolicy?: {
    readonly stockSdkPrimaryEnabled?: boolean;
  };
}

export interface MarketDataIpcBarRequest {
  readonly context: MarketDataIpcRequestContext;
  readonly request: MarketDataBarRequest;
  readonly capability: Extract<MarketDataProviderCapabilityKey, "historicalBars" | "intradayBars">;
  readonly providerPolicy?: {
    readonly stockSdkPrimaryEnabled?: boolean;
  };
}

export interface MarketDataIpcStreamConnectRequest {
  readonly context: MarketDataIpcRequestContext;
  readonly items: readonly MarketDataProviderRequestItem[];
  readonly providerPolicy?: {
    readonly alphaFeedStreamMode?: "watchlist" | "all-symbols";
  };
}

export interface MarketDataIpcStreamReadRequest {
  readonly context: MarketDataIpcRequestContext;
  readonly items: readonly MarketDataProviderRequestItem[];
}

export interface MarketDataIpcInstrumentSearchRequest {
  readonly context: MarketDataIpcRequestContext;
  readonly query: string;
  readonly markets?: readonly ("US" | "HK" | "CN")[];
  readonly providerPolicy?: {
    readonly stockSdkPrimaryEnabled?: boolean;
  };
}

export interface MarketDataIpcStreamControlMeta extends MarketDataIpcSuccessMeta {
  readonly state: MarketDataIpcStreamState;
}

export type MarketDataIpcProviderStatusResult =
  | {
      readonly ok: true;
      readonly data: MarketDataIpcProviderStatus;
    }
  | {
      readonly ok: false;
      readonly error: MarketDataIpcError;
    };
export type MarketDataIpcQuoteSnapshotResult = MarketDataIpcResult<readonly GatewayMarketQuoteSnapshot[]>;
export type MarketDataIpcBarsResult = MarketDataIpcResult<readonly GatewayMarketDataBar[]>;
export type MarketDataIpcInstrumentSearchResult = MarketDataIpcResult<readonly MarketInstrument[]>;
export type MarketDataIpcStreamConnectResult = MarketDataIpcResult<{ readonly state: MarketDataIpcStreamState }>;
export type MarketDataIpcStreamSnapshotResult = MarketDataIpcResult<{
  readonly snapshots: readonly GatewayMarketQuoteSnapshot[];
  readonly state: MarketDataIpcStreamState;
}>;
export type MarketDataIpcStreamDisconnectResult = MarketDataIpcResult<{ readonly state: MarketDataIpcStreamState }>;

export interface MarketDataIpcBridge {
  getProviderStatus(context: MarketDataIpcRequestContext): Promise<MarketDataIpcProviderStatusResult>;
  fetchQuoteSnapshot(request: MarketDataIpcQuoteSnapshotRequest): Promise<MarketDataIpcQuoteSnapshotResult>;
  fetchHistoricalBars(request: Omit<MarketDataIpcBarRequest, "capability">): Promise<MarketDataIpcBarsResult>;
  fetchIntradayBars(request: Omit<MarketDataIpcBarRequest, "capability">): Promise<MarketDataIpcBarsResult>;
  searchInstruments(request: MarketDataIpcInstrumentSearchRequest): Promise<MarketDataIpcInstrumentSearchResult>;
  connectQuoteStream(request: MarketDataIpcStreamConnectRequest): Promise<MarketDataIpcStreamConnectResult>;
  readQuoteStreamSnapshot(request: MarketDataIpcStreamReadRequest): Promise<MarketDataIpcStreamSnapshotResult>;
  disconnectQuoteStream(context: MarketDataIpcRequestContext): Promise<MarketDataIpcStreamDisconnectResult>;
}

export type MarketDataIpcHandlers = MarketDataIpcBridge;

export const marketDataIpcDefaultProviderPriority = [
  "stock-sdk",
  "alphafeed-rest",
  "alphafeed-websocket",
  "longbridge",
  "yahoo-finance",
] as const satisfies readonly GatewayMarketDataProviderId[];

export const marketDataIpcChannels = {
  getProviderStatus: "marketData:getProviderStatus",
  fetchQuoteSnapshot: "marketData:fetchQuoteSnapshot",
  fetchHistoricalBars: "marketData:fetchHistoricalBars",
  fetchIntradayBars: "marketData:fetchIntradayBars",
  searchInstruments: "marketData:searchInstruments",
  connectQuoteStream: "marketData:connectQuoteStream",
  readQuoteStreamSnapshot: "marketData:readQuoteStreamSnapshot",
  disconnectQuoteStream: "marketData:disconnectQuoteStream",
} as const;

export function createMarketDataIpcShellHandlers(): MarketDataIpcHandlers {
  return {
    async getProviderStatus() {
      return {
        ok: true,
        data: {
          priority: marketDataIpcDefaultProviderPriority,
          providers: [],
          capabilities: [],
          checkedAt: new Date().toISOString(),
        },
      };
    },
    async fetchQuoteSnapshot() {
      return createUnavailableResult("Provider-neutral market data quote IPC is registered but not wired yet.");
    },
    async fetchHistoricalBars() {
      return createUnavailableResult("Provider-neutral market data historical bars IPC is registered but not wired yet.");
    },
    async fetchIntradayBars() {
      return createUnavailableResult("Provider-neutral market data intraday bars IPC is registered but not wired yet.");
    },
    async searchInstruments() {
      return createUnavailableResult("Provider-neutral market data instrument search IPC is registered but not wired yet.");
    },
    async connectQuoteStream() {
      return createUnavailableResult("Provider-neutral market data stream IPC is registered but not wired yet.");
    },
    async readQuoteStreamSnapshot() {
      return createUnavailableResult("Provider-neutral market data stream IPC is registered but not wired yet.");
    },
    async disconnectQuoteStream() {
      return createUnavailableResult("Provider-neutral market data stream IPC is registered but not wired yet.");
    },
  };
}

function createUnavailableResult<T>(message: string): MarketDataIpcResult<T> {
  return {
    ok: false,
    error: {
      code: "PROVIDER_UNAVAILABLE",
      message,
      fallback: {
        triedProviders: [],
      },
      health: [],
    },
  };
}
