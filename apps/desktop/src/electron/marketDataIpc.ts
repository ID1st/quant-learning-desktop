import { ipcMain } from "electron";
import {
  createMarketDataIpcShellHandlers,
  marketDataIpcChannels,
  type MarketDataIpcHandlers,
  type MarketDataIpcQuoteSnapshotRequest,
  type MarketDataIpcInstrumentSearchRequest,
  type MarketDataIpcRequestContext,
  type MarketDataIpcStreamConnectRequest,
  type MarketDataIpcStreamReadRequest,
} from "./marketDataIpcContract.ts";
import type { MarketDataIpcBarRequest } from "./marketDataIpcContract.ts";
import {
  assertMarketDataBarRequest,
  assertMarketDataContext,
  assertMarketDataItems,
  assertMarketDataProviderPolicy,
  assertMarketDataSearchRequest,
  assertRecord,
  assertTrustedIpcSender,
  type DesktopRendererSecurityPolicy,
} from "./electronSecurity.ts";
export { createMarketDataIpcHandlers, type MarketDataIpcHandlerDependencies } from "./marketDataIpcHandlers.ts";

export function registerMarketDataIpcHandlers(
  securityPolicy: DesktopRendererSecurityPolicy,
  handlers: MarketDataIpcHandlers = createMarketDataIpcShellHandlers(),
) {
  ipcMain.handle(marketDataIpcChannels.getProviderStatus, (event, context: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketDataContext(context);
    return handlers.getProviderStatus(context as MarketDataIpcRequestContext);
  });
  ipcMain.handle(marketDataIpcChannels.fetchQuoteSnapshot, (event, request: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketDataRequestEnvelope(request, true);
    return handlers.fetchQuoteSnapshot(request as unknown as MarketDataIpcQuoteSnapshotRequest);
  });
  ipcMain.handle(
    marketDataIpcChannels.fetchHistoricalBars,
    (event, request: unknown) => {
      assertTrustedIpcSender(event, securityPolicy);
      assertMarketDataBarRequestEnvelope(request);
      return handlers.fetchHistoricalBars(request as Omit<MarketDataIpcBarRequest, "capability">);
    },
  );
  ipcMain.handle(marketDataIpcChannels.fetchIntradayBars, (event, request: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketDataBarRequestEnvelope(request);
    return handlers.fetchIntradayBars(request as Omit<MarketDataIpcBarRequest, "capability">);
  });
  ipcMain.handle(marketDataIpcChannels.searchInstruments, (event, request: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketDataSearchRequest(request);
    return handlers.searchInstruments(request as unknown as MarketDataIpcInstrumentSearchRequest);
  });
  ipcMain.handle(marketDataIpcChannels.connectQuoteStream, (event, request: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketDataRequestEnvelope(request, true);
    return handlers.connectQuoteStream(request as unknown as MarketDataIpcStreamConnectRequest);
  });
  ipcMain.handle(marketDataIpcChannels.readQuoteStreamSnapshot, (event, request: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketDataRequestEnvelope(request, true);
    return handlers.readQuoteStreamSnapshot(request as unknown as MarketDataIpcStreamReadRequest);
  });
  ipcMain.handle(marketDataIpcChannels.disconnectQuoteStream, (event, context: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketDataContext(context);
    return handlers.disconnectQuoteStream(context as MarketDataIpcRequestContext);
  });
}

function assertMarketDataRequestEnvelope(value: unknown, requireItems: boolean) {
  assertRecord(value, "request");
  assertMarketDataContext(value.context);
  if (requireItems) assertMarketDataItems(value.items);
  assertMarketDataProviderPolicy(value.providerPolicy);
}

function assertMarketDataBarRequestEnvelope(value: unknown) {
  assertRecord(value, "request");
  assertMarketDataContext(value.context);
  assertMarketDataBarRequest(value.request);
  assertMarketDataProviderPolicy(value.providerPolicy);
}
