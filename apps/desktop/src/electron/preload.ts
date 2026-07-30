import { contextBridge, ipcRenderer } from "electron";
import type { QuantDesktopAuthBridge } from "../../../../packages/shared/src/auth.ts";
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
import { marketDataIpcChannels } from "./marketDataIpcContract";
import type { MarketDataIpcBridge } from "./marketDataIpcContract";
import { marketBarCacheIpcChannels } from "./marketBarCacheIpcContract";
import type { MarketBarCacheIpcBridge } from "./marketBarCacheIpcContract";
import { providerDataIpcChannels } from "./providerDataIpcChannels";
import { pluginIpcChannels } from "./pluginIpcContract";
import type { PluginIpcBridge } from "./pluginIpcContract";
import type { AlphaFeedStreamCredentials } from "./secureCredentialStore";
import { authIpcChannels } from "./authIpcContract";

export interface DesktopBridge {
  readonly platform: "desktop";
  readonly version: string;
  readonly auth: QuantDesktopAuthBridge;
  readonly secureCredentials: {
    saveAlphaFeed(credentials: AlphaFeedApiCredentials): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    clearAlphaFeed(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    saveAlphaFeedStream(credentials: AlphaFeedStreamCredentials): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    clearAlphaFeedStream(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    saveLongPort(credentials: LongPortApiCredentials): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
    clearLongPort(): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
  };
  readonly marketData: MarketDataIpcBridge;
  readonly marketBarCache: MarketBarCacheIpcBridge;
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

async function invokeSecureCredential<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

async function invokeProviderData<T>(channel: string, ...payload: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...payload) as Promise<T>;
}

async function invokeMarketData<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

async function invokeMarketBarCache<T>(
  channel: string,
  payload?: unknown,
): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

async function invokePlugin<T>(channel: string, ...payload: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...payload) as Promise<T>;
}

export const desktopBridge: DesktopBridge = {
  platform: "desktop",
  version: "0.1.0",
  auth: {
    bootstrap: () => ipcRenderer.invoke(authIpcChannels.bootstrap),
    requestRegistrationCode: (input) =>
      ipcRenderer.invoke(authIpcChannels.requestRegistrationCode, input),
    register: (input) => ipcRenderer.invoke(authIpcChannels.register, input),
    login: (input) => ipcRenderer.invoke(authIpcChannels.login, input),
    redeemInvite: (input) =>
      ipcRenderer.invoke(authIpcChannels.redeemInvite, input),
    renewEntitlement: (input) =>
      ipcRenderer.invoke(authIpcChannels.renewEntitlement, input),
    requestPasswordReset: (input) =>
      ipcRenderer.invoke(authIpcChannels.requestPasswordReset, input),
    resetPassword: (input) =>
      ipcRenderer.invoke(authIpcChannels.resetPassword, input),
    logout: () => ipcRenderer.invoke(authIpcChannels.logout),
    getSnapshot: () => ipcRenderer.invoke(authIpcChannels.getSnapshot),
    subscribe: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        state: Parameters<typeof listener>[0],
      ) => listener(state);
      ipcRenderer.on(authIpcChannels.stateChanged, wrappedListener);
      return () =>
        ipcRenderer.removeListener(
          authIpcChannels.stateChanged,
          wrappedListener,
        );
    },
  },
  secureCredentials: {
    saveAlphaFeed: async (credentials) => {
      const result = await invokeSecureCredential<{ ok: true; value: null } | { ok: false; error: { message: string } }>(
        "secureCredentials:saveAlphaFeed",
        credentials,
      );
      return result.ok ? { ok: true } : result;
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
  marketBarCache: {
    read: (request) => invokeMarketBarCache(marketBarCacheIpcChannels.read, request),
    write: (request) => invokeMarketBarCache(marketBarCacheIpcChannels.write, request),
    summary: () => invokeMarketBarCache(marketBarCacheIpcChannels.summary),
    prune: (request) => invokeMarketBarCache(marketBarCacheIpcChannels.prune, request),
    clear: (key) => invokeMarketBarCache(marketBarCacheIpcChannels.clear, key),
    clearAll: () => invokeMarketBarCache(marketBarCacheIpcChannels.clearAll),
    legacyMigrationState: () =>
      invokeMarketBarCache(marketBarCacheIpcChannels.legacyMigrationState),
    recordLegacyMigration: (request) =>
      invokeMarketBarCache(
        marketBarCacheIpcChannels.recordLegacyMigration,
        request,
      ),
  },
  plugins: {
    list: () => invokePlugin(pluginIpcChannels.list),
    installLocalPlugin: () => invokePlugin(pluginIpcChannels.installLocal),
    setEnabled: (pluginId, enabled) => invokePlugin(pluginIpcChannels.setEnabled, pluginId, enabled),
    reportRuntimeFailure: (pluginId, message) => invokePlugin(pluginIpcChannels.reportRuntimeFailure, pluginId, message),
    uninstall: (pluginId) => invokePlugin(pluginIpcChannels.uninstall, pluginId),
    getRuntimeSnapshot: () => invokePlugin(pluginIpcChannels.getRuntimeSnapshot),
    runStrategy: (pluginId, key, input) => invokePlugin(pluginIpcChannels.runStrategy, pluginId, key, input),
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

window.addEventListener("online", () => {
  ipcRenderer.send(authIpcChannels.revalidate);
});
