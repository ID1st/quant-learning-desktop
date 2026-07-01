import { ipcMain } from "electron";
import type { AlphaFeedApiCredentials, AlphaFeedBarRequest } from "@quant/api-client";
import type { LongPortApiCredentials } from "@quant/api-client";
import type { MarketWatchlistItem } from "../features/marketData/marketDataSyncService.ts";
import { createProviderDataIpcHandlers, providerDataIpcChannels, type ProviderDataIpcHandlers } from "./providerDataIpcContract.ts";

export function registerProviderDataIpcHandlers(handlers: ProviderDataIpcHandlers = createProviderDataIpcHandlers()) {
  ipcMain.handle(providerDataIpcChannels.verifyAlphaFeedCredentials, (_event, credentials: AlphaFeedApiCredentials) =>
    handlers.verifyAlphaFeedCredentials(credentials),
  );
  ipcMain.handle(
    providerDataIpcChannels.fetchAlphaFeedQuoteSnapshot,
    (_event, credentials: AlphaFeedApiCredentials, watchlist: MarketWatchlistItem[]) =>
      handlers.fetchAlphaFeedQuoteSnapshot(credentials, watchlist),
  );
  ipcMain.handle(
    providerDataIpcChannels.fetchAlphaFeedHistoricalBars,
    (_event, credentials: AlphaFeedApiCredentials, request: AlphaFeedBarRequest) =>
      handlers.fetchAlphaFeedHistoricalBars(credentials, request),
  );
  ipcMain.handle(
    providerDataIpcChannels.fetchAlphaFeedIntradayBars,
    (_event, credentials: AlphaFeedApiCredentials, request: AlphaFeedBarRequest) => handlers.fetchAlphaFeedIntradayBars(credentials, request),
  );
  ipcMain.handle(providerDataIpcChannels.verifyLongPortCredentials, (_event, credentials: LongPortApiCredentials) =>
    handlers.verifyLongPortCredentials(credentials),
  );
  ipcMain.handle(
    providerDataIpcChannels.fetchLongPortQuoteSnapshot,
    (_event, credentials: LongPortApiCredentials, watchlist: MarketWatchlistItem[]) =>
      handlers.fetchLongPortQuoteSnapshot(credentials, watchlist),
  );
}
