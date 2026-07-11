import { contextBridge, ipcRenderer } from "electron";
import type {
  AlphaFeedApiCredentials,
  AlphaFeedBarRequest,
  AlphaFeedMarketDataBar,
  AlphaFeedVerificationSummary,
} from "../../../../packages/api-client/src/alphafeed.ts";
import type {
  LongPortApiCredentials,
  LongPortBarRequest,
  LongPortMarketDataBar,
  LongPortVerificationSummary,
} from "../../../../packages/api-client/src/longport.ts";
import type { MarketQuoteSnapshot, MarketWatchlistItem } from "../features/marketData/marketDataSyncService.ts";
import type { AlphaFeedStreamConnectionState, AlphaFeedStreamMode } from "./alphaFeedStreamBridge";
import { createDesktopBridgeFromPersistenceStore, createMemoryPersistenceStore } from "./localPersistence";
import { marketDataIpcChannels } from "./marketDataIpcContract";
import type { MarketDataIpcBridge } from "./marketDataIpcContract";
import { providerDataIpcChannels } from "./providerDataIpcContract";
import { pluginIpcChannels } from "./pluginIpcContract";
import type { PluginIpcBridge } from "./pluginIpcContract";
import type { AlphaFeedStreamCredentials } from "./secureCredentialStore";

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
    saveAlphaFeedStream(credentials: AlphaFeedStreamCredentials): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    readAlphaFeedStream(): Promise<{ ok: true; credentials: AlphaFeedStreamCredentials | null } | { ok: false; error: { message: string } }>;
    clearAlphaFeedStream(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    saveLongPort(credentials: LongPortApiCredentials): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    readLongPort(): Promise<{ ok: true; credentials: LongPortApiCredentials | null } | { ok: false; error: { message: string } }>;
    clearLongPort(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
  };
  readonly marketData: MarketDataIpcBridge;
  readonly plugins: PluginIpcBridge;
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
    fetchHistoricalBars(
      credentials: LongPortApiCredentials,
      request: LongPortBarRequest,
    ): Promise<{ ok: true; bars: LongPortMarketDataBar[] } | { ok: false; error: { message: string } }>;
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
    connectStream(request: {
      credentials: AlphaFeedStreamCredentials;
      mode: AlphaFeedStreamMode;
      watchlist: MarketWatchlistItem[];
    }): Promise<{
      ok: true;
      health: AlphaFeedProviderHealth;
      state: AlphaFeedStreamConnectionState;
    }>;
    readStreamSnapshot(): Promise<{
      ok: true;
      snapshots: MarketQuoteSnapshot[];
      health: AlphaFeedProviderHealth;
      state: AlphaFeedStreamConnectionState;
    }>;
    disconnectStream(): Promise<{
      ok: true;
      health: AlphaFeedProviderHealth;
      state: AlphaFeedStreamConnectionState;
    }>;
  };
}

const preloadLocalDatabaseStore = createMemoryPersistenceStore();

async function invokeSecureCredential<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

async function invokeProviderData<T>(channel: string, ...payload: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...payload) as Promise<T>;
}

async function invokeMarketData<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

async function invokePlugin<T>(channel: string, ...payload: unknown[]): Promise<T> {
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
    saveAlphaFeedStream: async (credentials) => {
      const result = await invokeSecureCredential<{ ok: true; value: null } | { ok: false; error: { message: string } }>(
        "secureCredentials:saveAlphaFeedStream",
        credentials,
      );
      return result.ok ? { ok: true } : result;
    },
    readAlphaFeedStream: async () => {
      const result = await invokeSecureCredential<
        { ok: true; value: AlphaFeedStreamCredentials | null } | { ok: false; error: { message: string } }
      >("secureCredentials:readAlphaFeedStream");
      return result.ok ? { ok: true, credentials: result.value } : result;
    },
    clearAlphaFeedStream: async () => {
      const result = await invokeSecureCredential<{ ok: true; value: null } | { ok: false; error: { message: string } }>(
        "secureCredentials:clearAlphaFeedStream",
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
  marketData: {
    getProviderStatus: (context) => invokeMarketData(marketDataIpcChannels.getProviderStatus, context),
    fetchQuoteSnapshot: (request) => invokeMarketData(marketDataIpcChannels.fetchQuoteSnapshot, request),
    fetchHistoricalBars: (request) => invokeMarketData(marketDataIpcChannels.fetchHistoricalBars, request),
    fetchIntradayBars: (request) => invokeMarketData(marketDataIpcChannels.fetchIntradayBars, request),
    searchInstruments: (request) => invokeMarketData(marketDataIpcChannels.searchInstruments, request),
    connectQuoteStream: (request) => invokeMarketData(marketDataIpcChannels.connectQuoteStream, request),
    readQuoteStreamSnapshot: (request) => invokeMarketData(marketDataIpcChannels.readQuoteStreamSnapshot, request),
    disconnectQuoteStream: (context) => invokeMarketData(marketDataIpcChannels.disconnectQuoteStream, context),
  },
  plugins: {
    list: () => invokePlugin(pluginIpcChannels.list),
    installLocalPlugin: () => invokePlugin(pluginIpcChannels.installLocal),
    setEnabled: (pluginId, enabled) => invokePlugin(pluginIpcChannels.setEnabled, pluginId, enabled),
    uninstall: (pluginId) => invokePlugin(pluginIpcChannels.uninstall, pluginId),
    readEnabledRuntimeModules: () => invokePlugin(pluginIpcChannels.readEnabledRuntimeModules),
  },
  longPort: {
    verifyCredentials: (credentials) => invokeProviderData(providerDataIpcChannels.verifyLongPortCredentials, credentials),
    fetchQuoteSnapshot: (credentials, watchlist) =>
      invokeProviderData(providerDataIpcChannels.fetchLongPortQuoteSnapshot, credentials, watchlist),
    fetchHistoricalBars: (credentials, request) => invokeProviderData(providerDataIpcChannels.fetchLongPortHistoricalBars, credentials, request),
  },
  alphaFeed: {
    verifyCredentials: (credentials) => invokeProviderData(providerDataIpcChannels.verifyAlphaFeedCredentials, credentials),
    fetchQuoteSnapshot: (credentials, watchlist) =>
      invokeProviderData(providerDataIpcChannels.fetchAlphaFeedQuoteSnapshot, credentials, watchlist),
    fetchHistoricalBars: (credentials, request) =>
      invokeProviderData(providerDataIpcChannels.fetchAlphaFeedHistoricalBars, credentials, request),
    fetchIntradayBars: (credentials, request) =>
      invokeProviderData(providerDataIpcChannels.fetchAlphaFeedIntradayBars, credentials, request),
    connectStream: (request) => invokeProviderData(providerDataIpcChannels.connectAlphaFeedStream, request),
    readStreamSnapshot: () => invokeProviderData(providerDataIpcChannels.readAlphaFeedStreamSnapshot),
    disconnectStream: () => invokeProviderData(providerDataIpcChannels.disconnectAlphaFeedStream),
  },
};

contextBridge.exposeInMainWorld("quantDesktop", desktopBridge);
