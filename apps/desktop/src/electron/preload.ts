import { contextBridge, ipcRenderer } from "electron";
import type {
  AlphaFeedApiCredentials,
  AlphaFeedBarRequest,
  AlphaFeedMarketDataBar,
  AlphaFeedVerificationSummary,
} from "../../../../packages/api-client/src/alphafeed.ts";
import type { LongPortApiCredentials, LongPortVerificationSummary } from "../../../../packages/api-client/src/longport.ts";
import type { MarketQuoteSnapshot, MarketWatchlistItem } from "../features/marketData/marketDataSyncService.ts";
import { createDesktopBridgeFromPersistenceStore, createMemoryPersistenceStore } from "./localPersistence";
import { providerDataIpcChannels } from "./providerDataIpcContract";

export interface DesktopBridge {
  readonly platform: "desktop";
  readonly version: string;
  readonly localDatabase: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  readonly secureCredentials: {
    saveAlphaFeed(credentials: AlphaFeedApiCredentials): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    readAlphaFeed(): Promise<{ ok: true; credentials: AlphaFeedApiCredentials | null } | { ok: false; error: { message: string } }>;
    clearAlphaFeed(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    saveLongPort(credentials: LongPortApiCredentials): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    readLongPort(): Promise<{ ok: true; credentials: LongPortApiCredentials | null } | { ok: false; error: { message: string } }>;
    clearLongPort(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
  };
  readonly longPort: {
    verifyCredentials(credentials: LongPortApiCredentials): Promise<
      | {
          ok: true;
          summary: LongPortVerificationSummary;
        }
      | {
          ok: false;
          error: {
            message: string;
          };
        }
    >;
    fetchQuoteSnapshot(
      credentials: LongPortApiCredentials,
      watchlist: MarketWatchlistItem[],
    ): Promise<
      | {
          ok: true;
          snapshots: MarketQuoteSnapshot[];
        }
      | {
          ok: false;
          error: {
            message: string;
          };
        }
    >;
  };
  readonly alphaFeed: {
    verifyCredentials(credentials: AlphaFeedApiCredentials): Promise<
      | {
          ok: true;
          summary: AlphaFeedVerificationSummary;
        }
      | {
          ok: false;
          error: {
            message: string;
          };
        }
    >;
    fetchQuoteSnapshot(
      credentials: AlphaFeedApiCredentials,
      watchlist: MarketWatchlistItem[],
    ): Promise<
      | {
          ok: true;
          snapshots: MarketQuoteSnapshot[];
        }
      | {
          ok: false;
          error: {
            message: string;
          };
        }
    >;
    fetchHistoricalBars(
      credentials: AlphaFeedApiCredentials,
      request: AlphaFeedBarRequest,
    ): Promise<
      | {
          ok: true;
          bars: AlphaFeedMarketDataBar[];
        }
      | {
          ok: false;
          error: {
            message: string;
          };
        }
    >;
    fetchIntradayBars(
      credentials: AlphaFeedApiCredentials,
      request: AlphaFeedBarRequest,
    ): Promise<
      | {
          ok: true;
          bars: AlphaFeedMarketDataBar[];
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

const preloadLocalDatabaseStore = createMemoryPersistenceStore();

async function invokeSecureCredential<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

async function invokeProviderData<T>(channel: string, ...payload: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...payload) as Promise<T>;
}

export const desktopBridge: DesktopBridge = {
  platform: "desktop",
  version: "0.1.0",
  localDatabase: createDesktopBridgeFromPersistenceStore(preloadLocalDatabaseStore),
  secureCredentials: {
    saveAlphaFeed: async (credentials) => {
      const result = await invokeSecureCredential<{ ok: true; value: null } | { ok: false; error: { message: string } }>(
        "secureCredentials:saveAlphaFeed",
        credentials,
      );
      return result.ok ? { ok: true } : result;
    },
    readAlphaFeed: async () => {
      const result = await invokeSecureCredential<
        { ok: true; value: AlphaFeedApiCredentials | null } | { ok: false; error: { message: string } }
      >("secureCredentials:readAlphaFeed");
      return result.ok ? { ok: true, credentials: result.value } : result;
    },
    clearAlphaFeed: async () => {
      const result = await invokeSecureCredential<{ ok: true; value: null } | { ok: false; error: { message: string } }>(
        "secureCredentials:clearAlphaFeed",
      );
      return result.ok ? { ok: true } : result;
    },
    saveLongPort: async (credentials) => {
      const result = await invokeSecureCredential<{ ok: true; value: null } | { ok: false; error: { message: string } }>(
        "secureCredentials:saveLongPort",
        credentials,
      );
      return result.ok ? { ok: true } : result;
    },
    readLongPort: async () => {
      const result = await invokeSecureCredential<
        { ok: true; value: LongPortApiCredentials | null } | { ok: false; error: { message: string } }
      >("secureCredentials:readLongPort");
      return result.ok ? { ok: true, credentials: result.value } : result;
    },
    clearLongPort: async () => {
      const result = await invokeSecureCredential<{ ok: true; value: null } | { ok: false; error: { message: string } }>(
        "secureCredentials:clearLongPort",
      );
      return result.ok ? { ok: true } : result;
    },
  },
  longPort: {
    verifyCredentials: (credentials) => invokeProviderData(providerDataIpcChannels.verifyLongPortCredentials, credentials),
    fetchQuoteSnapshot: (credentials, watchlist) =>
      invokeProviderData(providerDataIpcChannels.fetchLongPortQuoteSnapshot, credentials, watchlist),
  },
  alphaFeed: {
    verifyCredentials: (credentials) => invokeProviderData(providerDataIpcChannels.verifyAlphaFeedCredentials, credentials),
    fetchQuoteSnapshot: (credentials, watchlist) =>
      invokeProviderData(providerDataIpcChannels.fetchAlphaFeedQuoteSnapshot, credentials, watchlist),
    fetchHistoricalBars: (credentials, request) =>
      invokeProviderData(providerDataIpcChannels.fetchAlphaFeedHistoricalBars, credentials, request),
    fetchIntradayBars: (credentials, request) =>
      invokeProviderData(providerDataIpcChannels.fetchAlphaFeedIntradayBars, credentials, request),
  },
};

contextBridge.exposeInMainWorld("quantDesktop", desktopBridge);
