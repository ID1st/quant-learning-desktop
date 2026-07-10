/// <reference types="vite/client" />

interface QuantDesktopLocalDatabaseBridge {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type QuantDesktopMarket = "US" | "HK" | "CN";
type QuantDesktopTimeframe = "realtime" | "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
type QuantDesktopGatewayProviderId = "stock-sdk" | "alphafeed-rest" | "alphafeed-websocket" | "longbridge" | "yahoo-finance";
type QuantDesktopMarketDataRequestSource = "chart" | "sync" | "strategy" | "diagnostics";
type QuantDesktopMarketDataHealthStatus =
  | "unconfigured"
  | "healthy"
  | "degraded"
  | "unavailable"
  | "unauthorized"
  | "rateLimited"
  | "delayed";
type QuantDesktopMarketDataDelayLevel = "realtime" | "delayed" | "unknown";
type QuantDesktopMarketDataStreamState = "idle" | "connecting" | "connected" | "fallback" | "disconnected" | "error";
type QuantDesktopMarketDataErrorCode =
  | "NO_CAPABLE_PROVIDER"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_UNCONFIGURED"
  | "PROVIDER_UNAUTHORIZED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_DELAYED"
  | "INVALID_REQUEST"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

interface QuantDesktopMarketDataRequestContext {
  readonly source: QuantDesktopMarketDataRequestSource;
  readonly requestId?: string;
  readonly requestedAt?: string;
}

interface QuantDesktopMarketDataRequestItem {
  readonly market: QuantDesktopMarket;
  readonly symbol: string;
  readonly name?: string;
}

interface QuantDesktopMarketDataBarRequest {
  readonly market: QuantDesktopMarket;
  readonly symbol: string;
  readonly timeframe: QuantDesktopTimeframe;
  readonly count?: number;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly adjust?: "none" | "forward" | "backward";
}

interface QuantDesktopMarketDataCapability {
  readonly realtimeQuote: boolean;
  readonly historicalBars: boolean;
  readonly intradayBars: boolean;
  readonly websocket: boolean;
  readonly batchQuote: boolean;
  readonly markets: readonly QuantDesktopMarket[];
  readonly timeframes: readonly QuantDesktopTimeframe[];
  readonly rateLimit?: {
    readonly requests: number;
    readonly intervalMs: number;
    readonly scope: "global" | "symbol" | "market";
  };
  readonly delayLevel: QuantDesktopMarketDataDelayLevel;
}

interface QuantDesktopMarketDataHealthView {
  readonly provider: QuantDesktopGatewayProviderId;
  readonly status: QuantDesktopMarketDataHealthStatus;
  readonly message: string;
  readonly checkedAt: string;
  readonly latencyMs?: number;
  readonly nextRetryAt?: string;
  readonly capability: QuantDesktopMarketDataCapability;
}

interface QuantDesktopMarketQuoteSnapshot {
  readonly provider: QuantDesktopGatewayProviderId;
  readonly market: QuantDesktopMarket;
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
  readonly delayLevel?: QuantDesktopMarketDataDelayLevel;
}

interface QuantDesktopMarketDataBar {
  readonly provider: QuantDesktopGatewayProviderId;
  readonly market: QuantDesktopMarket;
  readonly symbol: string;
  readonly timeframe: QuantDesktopTimeframe;
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly amount?: number;
  readonly delayLevel?: QuantDesktopMarketDataDelayLevel;
}

interface QuantDesktopMarketDataProviderFallback {
  readonly activeProvider?: QuantDesktopGatewayProviderId;
  readonly fallbackFrom?: QuantDesktopGatewayProviderId;
  readonly triedProviders: readonly QuantDesktopGatewayProviderId[];
}

interface QuantDesktopMarketDataError {
  readonly code: QuantDesktopMarketDataErrorCode;
  readonly message: string;
  readonly provider?: QuantDesktopGatewayProviderId;
  readonly retryAfterMs?: number;
  readonly fallback: QuantDesktopMarketDataProviderFallback;
  readonly health: readonly QuantDesktopMarketDataHealthView[];
}

interface QuantDesktopMarketDataSuccessMeta {
  readonly provider: QuantDesktopGatewayProviderId;
  readonly health: QuantDesktopMarketDataHealthView;
  readonly fallback: QuantDesktopMarketDataProviderFallback;
  readonly servedAt: string;
}

type QuantDesktopMarketDataResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly meta: QuantDesktopMarketDataSuccessMeta;
    }
  | {
      readonly ok: false;
      readonly error: QuantDesktopMarketDataError;
    };

type QuantDesktopMarketDataProviderStatusResult =
  | {
      readonly ok: true;
      readonly data: {
        readonly priority: readonly QuantDesktopGatewayProviderId[];
        readonly providers: readonly QuantDesktopMarketDataHealthView[];
        readonly capabilities: readonly QuantDesktopMarketDataCapability[];
        readonly checkedAt: string;
      };
    }
  | {
      readonly ok: false;
      readonly error: QuantDesktopMarketDataError;
    };

interface QuantDesktopMarketDataBridge {
  getProviderStatus(context: QuantDesktopMarketDataRequestContext): Promise<QuantDesktopMarketDataProviderStatusResult>;
  fetchQuoteSnapshot(request: {
    readonly context: QuantDesktopMarketDataRequestContext;
    readonly items: readonly QuantDesktopMarketDataRequestItem[];
    readonly providerPolicy?: {
      readonly stockSdkPrimaryEnabled?: boolean;
    };
  }): Promise<QuantDesktopMarketDataResult<readonly QuantDesktopMarketQuoteSnapshot[]>>;
  fetchHistoricalBars(request: {
    readonly context: QuantDesktopMarketDataRequestContext;
    readonly request: QuantDesktopMarketDataBarRequest;
    readonly providerPolicy?: {
      readonly stockSdkPrimaryEnabled?: boolean;
    };
  }): Promise<QuantDesktopMarketDataResult<readonly QuantDesktopMarketDataBar[]>>;
  fetchIntradayBars(request: {
    readonly context: QuantDesktopMarketDataRequestContext;
    readonly request: QuantDesktopMarketDataBarRequest;
    readonly providerPolicy?: {
      readonly stockSdkPrimaryEnabled?: boolean;
    };
  }): Promise<QuantDesktopMarketDataResult<readonly QuantDesktopMarketDataBar[]>>;
  connectQuoteStream(request: {
    readonly context: QuantDesktopMarketDataRequestContext;
    readonly items: readonly QuantDesktopMarketDataRequestItem[];
    readonly providerPolicy?: {
      readonly alphaFeedStreamMode?: "watchlist" | "all-symbols";
    };
  }): Promise<QuantDesktopMarketDataResult<{ readonly state: QuantDesktopMarketDataStreamState }>>;
  readQuoteStreamSnapshot(request: {
    readonly context: QuantDesktopMarketDataRequestContext;
    readonly items: readonly QuantDesktopMarketDataRequestItem[];
  }): Promise<
    QuantDesktopMarketDataResult<{
      readonly snapshots: readonly QuantDesktopMarketQuoteSnapshot[];
      readonly state: QuantDesktopMarketDataStreamState;
    }>
  >;
  disconnectQuoteStream(
    context: QuantDesktopMarketDataRequestContext,
  ): Promise<QuantDesktopMarketDataResult<{ readonly state: QuantDesktopMarketDataStreamState }>>;
}

interface QuantDesktopBridge {
  readonly platform: "desktop";
  readonly version: string;
  readonly localDatabase?: QuantDesktopLocalDatabaseBridge;
  readonly secureCredentials?: {
    saveAlphaFeed(credentials: { apiUrl: string; apiKey: string }): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    readAlphaFeed(): Promise<{ ok: true; credentials: { apiUrl: string; apiKey: string } | null } | { ok: false; error: { message: string } }>;
    clearAlphaFeed(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    saveAlphaFeedStream(credentials: {
      wsUrl: string;
      apiKey: string;
    }): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    readAlphaFeedStream(): Promise<
      | {
          ok: true;
          credentials: {
            wsUrl: string;
            apiKey: string;
          } | null;
        }
      | { ok: false; error: { message: string } }
    >;
    clearAlphaFeedStream(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    saveLongPort(credentials: {
      apiUrl: string;
      appKey: string;
      appSecret: string;
      accessToken: string;
    }): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    readLongPort(): Promise<
      | {
          ok: true;
          credentials: {
            apiUrl: string;
            appKey: string;
            appSecret: string;
            accessToken: string;
          } | null;
        }
      | { ok: false; error: { message: string } }
    >;
    clearLongPort(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
  };
  readonly marketData?: QuantDesktopMarketDataBridge;
  readonly alphaFeed?: {
    verifyCredentials(credentials: {
      apiUrl: string;
      apiKey: string;
    }): Promise<
      | {
          ok: true;
          summary: {
            apiUrl: string;
            apiKeyPreview: string;
            markets: Array<"US" | "HK" | "CN">;
            verifiedAt: string;
            authMode: "api-key";
          };
          health: AlphaFeedProviderHealth;
        }
      | {
          ok: false;
          error: {
            message: string;
            health: AlphaFeedProviderHealth;
          };
        }
    >;
    fetchQuoteSnapshot(
      credentials: {
        apiUrl: string;
        apiKey: string;
      },
      watchlist: Array<{
        symbol: string;
        name: string;
        market: "US" | "HK" | "CN";
        source: "preset";
      }>,
    ): Promise<
      | {
          ok: true;
          snapshots: Array<{
            symbol: string;
            market: "US" | "HK" | "CN";
            lastPrice: number;
            previousClose: number;
            openPrice?: number;
            highPrice?: number;
            lowPrice?: number;
            changePercent: number;
            volume: number;
            amount?: number;
            quoteTime: string;
            receivedAt: string;
            provider: "alphafeed";
            name?: string;
          }>;
          health: AlphaFeedProviderHealth;
        }
      | {
          ok: false;
          error: {
            message: string;
            health: AlphaFeedProviderHealth;
          };
        }
    >;
    fetchHistoricalBars(
      credentials: {
        apiUrl: string;
        apiKey: string;
      },
      request: {
        symbol: string;
        market: "US" | "HK" | "CN";
        timeframe: "realtime" | "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
        count?: number;
        startTime?: number;
        endTime?: number;
        adjust?: "none" | "forward" | "backward" | "forward_additive" | "backward_additive";
      },
    ): Promise<
      | {
          ok: true;
          bars: Array<{
            symbol: string;
            market: "US" | "HK" | "CN";
            timeframe: "realtime" | "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
            timestamp: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
            amount: number;
            provider: "alphafeed";
          }>;
          health: AlphaFeedProviderHealth;
        }
      | {
          ok: false;
          error: {
            message: string;
            health: AlphaFeedProviderHealth;
          };
        }
    >;
    fetchIntradayBars(
      credentials: {
        apiUrl: string;
        apiKey: string;
      },
      request: {
        symbol: string;
        market: "US" | "HK" | "CN";
        timeframe: "realtime" | "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
        count?: number;
        startTime?: number;
        endTime?: number;
      },
    ): Promise<
      | {
          ok: true;
          bars: Array<{
            symbol: string;
            market: "US" | "HK" | "CN";
            timeframe: "realtime" | "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
            timestamp: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
            amount: number;
            provider: "alphafeed";
          }>;
          health: AlphaFeedProviderHealth;
        }
      | {
          ok: false;
          error: {
            message: string;
            health: AlphaFeedProviderHealth;
          };
        }
    >;
    connectStream(request: {
      credentials: {
        wsUrl: string;
        apiKey: string;
      };
      mode: "watchlist" | "all-symbols";
      watchlist: Array<{
        symbol: string;
        name: string;
        market: "US" | "HK" | "CN";
        source: "preset";
      }>;
    }): Promise<{
      ok: true;
      health: AlphaFeedProviderHealth;
      state: "idle" | "connecting" | "connected" | "fallback";
    }>;
    readStreamSnapshot(): Promise<{
      ok: true;
      snapshots: Array<{
        symbol: string;
        market: "US" | "HK" | "CN";
        lastPrice: number;
        previousClose: number;
        openPrice?: number;
        highPrice?: number;
        lowPrice?: number;
        changePercent: number;
        volume: number;
        amount?: number;
        quoteTime: string;
        receivedAt: string;
        provider: "alphafeed";
      }>;
      health: AlphaFeedProviderHealth;
      state: "idle" | "connecting" | "connected" | "fallback";
    }>;
    disconnectStream(): Promise<{
      ok: true;
      health: AlphaFeedProviderHealth;
      state: "idle" | "connecting" | "connected" | "fallback";
    }>;
  };
  readonly longPort?: {
    verifyCredentials(credentials: {
      apiUrl: string;
      appKey: string;
      appSecret: string;
      accessToken: string;
    }): Promise<
      | {
          ok: true;
          summary: {
            apiUrl: string;
            appKeyPreview: string;
            accessTokenPreview: string;
            markets: Array<"US" | "HK" | "CN">;
            verifiedAt: string;
            accountId?: string;
            authMode: "legacy-api-key";
          };
        }
      | {
          ok: false;
          error: {
            message: string;
          };
        }
    >;
    fetchQuoteSnapshot(
      credentials: {
        apiUrl: string;
        appKey: string;
        appSecret: string;
        accessToken: string;
      },
      watchlist: Array<{
        symbol: string;
        name: string;
        market: "US" | "HK" | "CN";
        source: "preset";
      }>,
    ): Promise<
      | {
          ok: true;
          snapshots: Array<{
            symbol: string;
            market: "US" | "HK" | "CN";
            lastPrice: number;
            previousClose: number;
            changePercent: number;
            volume: number;
            quoteTime: string;
            receivedAt: string;
            provider: "longport";
          }>;
        }
      | {
          ok: false;
          error: {
            message: string;
          };
        }
    >;
    fetchHistoricalBars(
      credentials: {
        apiUrl: string;
        appKey: string;
        appSecret: string;
        accessToken: string;
      },
      request: {
        symbol: string;
        market: "US" | "HK" | "CN";
        timeframe: "realtime" | "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
        count?: number;
        startTime?: number;
        endTime?: number;
      },
    ): Promise<
      | {
          ok: true;
          bars: Array<{
            symbol: string;
            market: "US" | "HK" | "CN";
            timeframe: "realtime" | "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
            timestamp: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
            amount: number;
            provider: "longport";
          }>;
        }
      | {
          ok: false;
          error: {
            message: string;
          };
        }
    >;
  };
}

interface AlphaFeedProviderHealth {
  status: "ok" | "auth_failed" | "permission_denied" | "rate_limited" | "network_error" | "invalid_response" | "error";
  message: string;
  checkedAt: string;
  latencyMs: number;
  nextRetryAt?: string;
}

interface Window {
  readonly quantDesktop?: QuantDesktopBridge;
}
