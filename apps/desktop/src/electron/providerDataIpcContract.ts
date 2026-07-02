import type { AlphaFeedApiCredentials, AlphaFeedBarRequest, LongPortBarRequest } from "@quant/api-client";
import type { LongPortApiCredentials } from "@quant/api-client";
import type { MarketWatchlistItem } from "../features/marketData/marketDataSyncService.ts";
import {
  fetchAlphaFeedHistoricalBarsWithRest,
  fetchAlphaFeedIntradayBarsWithRest,
  fetchAlphaFeedQuoteSnapshotsWithRest,
  verifyAlphaFeedCredentialsWithRest,
  type AlphaFeedBridgeBarsResult,
  type AlphaFeedBridgeQuoteSnapshotResult,
  type AlphaFeedBridgeVerificationResult,
} from "./alphaFeedBridge.ts";
import {
  createAlphaFeedStreamSession,
  type AlphaFeedStreamConnectRequest,
  type AlphaFeedStreamControlResult,
  type AlphaFeedStreamSnapshotResult,
} from "./alphaFeedStreamBridge.ts";
import {
  fetchLongPortHistoricalBarsWithSdk,
  fetchLongPortQuoteSnapshotsWithSdk,
  verifyLongPortCredentialsWithSdk,
  type LongPortBridgeBarsResult,
  type LongPortBridgeQuoteSnapshotResult,
  type LongPortBridgeVerificationResult,
} from "./longPortBridge.ts";

export interface ProviderDataIpcHandlers {
  verifyAlphaFeedCredentials(credentials: AlphaFeedApiCredentials): Promise<AlphaFeedBridgeVerificationResult>;
  fetchAlphaFeedQuoteSnapshot(
    credentials: AlphaFeedApiCredentials,
    watchlist: MarketWatchlistItem[],
  ): Promise<AlphaFeedBridgeQuoteSnapshotResult>;
  fetchAlphaFeedHistoricalBars(
    credentials: AlphaFeedApiCredentials,
    request: AlphaFeedBarRequest,
  ): Promise<AlphaFeedBridgeBarsResult>;
  fetchAlphaFeedIntradayBars(credentials: AlphaFeedApiCredentials, request: AlphaFeedBarRequest): Promise<AlphaFeedBridgeBarsResult>;
  connectAlphaFeedStream(request: AlphaFeedStreamConnectRequest): Promise<AlphaFeedStreamControlResult>;
  readAlphaFeedStreamSnapshot(): Promise<AlphaFeedStreamSnapshotResult>;
  disconnectAlphaFeedStream(): Promise<AlphaFeedStreamControlResult>;
  verifyLongPortCredentials(credentials: LongPortApiCredentials): Promise<LongPortBridgeVerificationResult>;
  fetchLongPortQuoteSnapshot(
    credentials: LongPortApiCredentials,
    watchlist: MarketWatchlistItem[],
  ): Promise<LongPortBridgeQuoteSnapshotResult>;
  fetchLongPortHistoricalBars(credentials: LongPortApiCredentials, request: LongPortBarRequest): Promise<LongPortBridgeBarsResult>;
}

export interface ProviderDataIpcDependencies {
  verifyAlphaFeedCredentials?: ProviderDataIpcHandlers["verifyAlphaFeedCredentials"];
  fetchAlphaFeedQuoteSnapshot?: ProviderDataIpcHandlers["fetchAlphaFeedQuoteSnapshot"];
  fetchAlphaFeedHistoricalBars?: ProviderDataIpcHandlers["fetchAlphaFeedHistoricalBars"];
  fetchAlphaFeedIntradayBars?: ProviderDataIpcHandlers["fetchAlphaFeedIntradayBars"];
  connectAlphaFeedStream?: ProviderDataIpcHandlers["connectAlphaFeedStream"];
  readAlphaFeedStreamSnapshot?: ProviderDataIpcHandlers["readAlphaFeedStreamSnapshot"];
  disconnectAlphaFeedStream?: ProviderDataIpcHandlers["disconnectAlphaFeedStream"];
  verifyLongPortCredentials?: ProviderDataIpcHandlers["verifyLongPortCredentials"];
  fetchLongPortQuoteSnapshot?: ProviderDataIpcHandlers["fetchLongPortQuoteSnapshot"];
  fetchLongPortHistoricalBars?: ProviderDataIpcHandlers["fetchLongPortHistoricalBars"];
}

const defaultAlphaFeedStreamSession = createAlphaFeedStreamSession();

export const providerDataIpcChannels = {
  verifyAlphaFeedCredentials: "providerData:verifyAlphaFeedCredentials",
  fetchAlphaFeedQuoteSnapshot: "providerData:fetchAlphaFeedQuoteSnapshot",
  fetchAlphaFeedHistoricalBars: "providerData:fetchAlphaFeedHistoricalBars",
  fetchAlphaFeedIntradayBars: "providerData:fetchAlphaFeedIntradayBars",
  connectAlphaFeedStream: "providerData:connectAlphaFeedStream",
  readAlphaFeedStreamSnapshot: "providerData:readAlphaFeedStreamSnapshot",
  disconnectAlphaFeedStream: "providerData:disconnectAlphaFeedStream",
  verifyLongPortCredentials: "providerData:verifyLongPortCredentials",
  fetchLongPortQuoteSnapshot: "providerData:fetchLongPortQuoteSnapshot",
  fetchLongPortHistoricalBars: "providerData:fetchLongPortHistoricalBars",
} as const;

export function createProviderDataIpcHandlers(dependencies: ProviderDataIpcDependencies = {}): ProviderDataIpcHandlers {
  return {
    verifyAlphaFeedCredentials: dependencies.verifyAlphaFeedCredentials ?? verifyAlphaFeedCredentialsWithRest,
    fetchAlphaFeedQuoteSnapshot: dependencies.fetchAlphaFeedQuoteSnapshot ?? fetchAlphaFeedQuoteSnapshotsWithRest,
    fetchAlphaFeedHistoricalBars: dependencies.fetchAlphaFeedHistoricalBars ?? fetchAlphaFeedHistoricalBarsWithRest,
    fetchAlphaFeedIntradayBars: dependencies.fetchAlphaFeedIntradayBars ?? fetchAlphaFeedIntradayBarsWithRest,
    connectAlphaFeedStream: dependencies.connectAlphaFeedStream ?? defaultAlphaFeedStreamSession.connect,
    readAlphaFeedStreamSnapshot: dependencies.readAlphaFeedStreamSnapshot ?? defaultAlphaFeedStreamSession.readSnapshot,
    disconnectAlphaFeedStream: dependencies.disconnectAlphaFeedStream ?? defaultAlphaFeedStreamSession.disconnect,
    verifyLongPortCredentials: dependencies.verifyLongPortCredentials ?? verifyLongPortCredentialsWithSdk,
    fetchLongPortQuoteSnapshot: dependencies.fetchLongPortQuoteSnapshot ?? fetchLongPortQuoteSnapshotsWithSdk,
    fetchLongPortHistoricalBars: dependencies.fetchLongPortHistoricalBars ?? fetchLongPortHistoricalBarsWithSdk,
  };
}
