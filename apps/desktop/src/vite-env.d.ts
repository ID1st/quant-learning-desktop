/// <reference types="vite/client" />

interface QuantDesktopLocalDatabaseBridge {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface QuantDesktopBridge {
  readonly platform: "desktop";
  readonly version: string;
  readonly localDatabase?: QuantDesktopLocalDatabaseBridge;
  readonly secureCredentials?: {
    saveAlphaFeed(credentials: { apiUrl: string; apiKey: string }): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    readAlphaFeed(): Promise<{ ok: true; credentials: { apiUrl: string; apiKey: string } | null } | { ok: false; error: { message: string } }>;
    clearAlphaFeed(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
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
        apiKey: string;
      },
      request: {
        symbol: string;
        market: "US" | "HK" | "CN";
        timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
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
            timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
            timestamp: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
            amount: number;
            provider: "alphafeed";
          }>;
        }
      | {
          ok: false;
          error: {
            message: string;
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
        timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
        count?: number;
      },
    ): Promise<
      | {
          ok: true;
          bars: Array<{
            symbol: string;
            market: "US" | "HK" | "CN";
            timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
            timestamp: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
            amount: number;
            provider: "alphafeed";
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
  };
}

interface Window {
  readonly quantDesktop?: QuantDesktopBridge;
}
