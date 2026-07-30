import { ipcMain } from "electron";
import type {
  AlphaFeedApiCredentials,
  AlphaFeedBarRequest,
  LongPortBarRequest,
} from "@quant/api-client";
import type { LongPortApiCredentials } from "@quant/api-client";
import type { MarketWatchlistItem } from "../features/marketData/marketDataSyncService.ts";
import type { AlphaFeedStreamConnectRequest } from "./alphaFeedStreamBridge.ts";
import {
  createProviderDataIpcHandlers,
  providerDataIpcChannels,
  type ProviderDataIpcHandlers,
} from "./providerDataIpcContract.ts";
import {
  assertAlphaFeedCredentials,
  assertAlphaFeedStreamCredentials,
  assertLongPortCredentials,
  assertMarketDataBarRequest,
  assertMarketDataItems,
  assertRecord,
  assertTrustedIpcSender,
  type DesktopRendererSecurityPolicy,
} from "./electronSecurity.ts";

export function registerProviderDataIpcHandlers(
  securityPolicy: DesktopRendererSecurityPolicy,
  handlers: ProviderDataIpcHandlers = createProviderDataIpcHandlers(),
) {
  ipcMain.handle(
    providerDataIpcChannels.verifyAlphaFeedCredentials,
    (event, credentials: unknown) => {
      assertTrustedIpcSender(event, securityPolicy);
      assertAlphaFeedCredentials(credentials);
      return handlers.verifyAlphaFeedCredentials(credentials as unknown as AlphaFeedApiCredentials);
    },
  );
  ipcMain.handle(
    providerDataIpcChannels.fetchAlphaFeedQuoteSnapshot,
    (event, credentials: unknown, watchlist: unknown) => {
      assertTrustedIpcSender(event, securityPolicy);
      assertAlphaFeedCredentials(credentials);
      assertMarketDataItems(watchlist);
      return handlers.fetchAlphaFeedQuoteSnapshot(
        credentials as unknown as AlphaFeedApiCredentials,
        watchlist as MarketWatchlistItem[],
      );
    },
  );
  ipcMain.handle(
    providerDataIpcChannels.fetchAlphaFeedHistoricalBars,
    (event, credentials: unknown, request: unknown) => {
      assertTrustedIpcSender(event, securityPolicy);
      assertAlphaFeedCredentials(credentials);
      assertMarketDataBarRequest(request, true);
      return handlers.fetchAlphaFeedHistoricalBars(
        credentials as unknown as AlphaFeedApiCredentials,
        request as AlphaFeedBarRequest,
      );
    },
  );
  ipcMain.handle(
    providerDataIpcChannels.fetchAlphaFeedIntradayBars,
    (event, credentials: unknown, request: unknown) => {
      assertTrustedIpcSender(event, securityPolicy);
      assertAlphaFeedCredentials(credentials);
      assertMarketDataBarRequest(request, true);
      return handlers.fetchAlphaFeedIntradayBars(
        credentials as unknown as AlphaFeedApiCredentials,
        request as AlphaFeedBarRequest,
      );
    },
  );
  ipcMain.handle(providerDataIpcChannels.connectAlphaFeedStream, (event, request: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertRecord(request, "request");
    assertAlphaFeedStreamCredentials(request.credentials);
    if (request.mode !== "watchlist" && request.mode !== "all-symbols")
      throw new TypeError("request.mode is invalid.");
    assertMarketDataItems(request.watchlist, request.mode === "all-symbols");
    return handlers.connectAlphaFeedStream(request as unknown as AlphaFeedStreamConnectRequest);
  });
  ipcMain.handle(providerDataIpcChannels.readAlphaFeedStreamSnapshot, (event) => {
    assertTrustedIpcSender(event, securityPolicy);
    return handlers.readAlphaFeedStreamSnapshot();
  });
  ipcMain.handle(providerDataIpcChannels.disconnectAlphaFeedStream, (event) => {
    assertTrustedIpcSender(event, securityPolicy);
    return handlers.disconnectAlphaFeedStream();
  });
  ipcMain.handle(
    providerDataIpcChannels.verifyLongPortCredentials,
    (event, credentials: unknown) => {
      assertTrustedIpcSender(event, securityPolicy);
      assertLongPortCredentials(credentials);
      return handlers.verifyLongPortCredentials(credentials as unknown as LongPortApiCredentials);
    },
  );
  ipcMain.handle(
    providerDataIpcChannels.fetchLongPortQuoteSnapshot,
    (event, credentials: unknown, watchlist: unknown) => {
      assertTrustedIpcSender(event, securityPolicy);
      assertLongPortCredentials(credentials);
      assertMarketDataItems(watchlist);
      return handlers.fetchLongPortQuoteSnapshot(
        credentials as unknown as LongPortApiCredentials,
        watchlist as MarketWatchlistItem[],
      );
    },
  );
  ipcMain.handle(
    providerDataIpcChannels.fetchLongPortHistoricalBars,
    (event, credentials: unknown, request: unknown) => {
      assertTrustedIpcSender(event, securityPolicy);
      assertLongPortCredentials(credentials);
      assertMarketDataBarRequest(request);
      return handlers.fetchLongPortHistoricalBars(
        credentials as unknown as LongPortApiCredentials,
        request as LongPortBarRequest,
      );
    },
  );
}
