import { ipcMain } from "electron";
import {
  createMarketDataIpcShellHandlers,
  marketDataIpcChannels,
  type MarketDataIpcHandlers,
  type MarketDataIpcQuoteSnapshotRequest,
  type MarketDataIpcRequestContext,
  type MarketDataIpcStreamConnectRequest,
  type MarketDataIpcStreamReadRequest,
} from "./marketDataIpcContract.ts";
import type { MarketDataIpcBarRequest } from "./marketDataIpcContract.ts";
export { createMarketDataIpcHandlers, type MarketDataIpcHandlerDependencies } from "./marketDataIpcHandlers.ts";

export function registerMarketDataIpcHandlers(handlers: MarketDataIpcHandlers = createMarketDataIpcShellHandlers()) {
  ipcMain.handle(marketDataIpcChannels.getProviderStatus, (_event, context: MarketDataIpcRequestContext) =>
    handlers.getProviderStatus(context),
  );
  ipcMain.handle(marketDataIpcChannels.fetchQuoteSnapshot, (_event, request: MarketDataIpcQuoteSnapshotRequest) =>
    handlers.fetchQuoteSnapshot(request),
  );
  ipcMain.handle(
    marketDataIpcChannels.fetchHistoricalBars,
    (_event, request: Omit<MarketDataIpcBarRequest, "capability">) => handlers.fetchHistoricalBars(request),
  );
  ipcMain.handle(marketDataIpcChannels.fetchIntradayBars, (_event, request: Omit<MarketDataIpcBarRequest, "capability">) =>
    handlers.fetchIntradayBars(request),
  );
  ipcMain.handle(marketDataIpcChannels.connectQuoteStream, (_event, request: MarketDataIpcStreamConnectRequest) =>
    handlers.connectQuoteStream(request),
  );
  ipcMain.handle(marketDataIpcChannels.readQuoteStreamSnapshot, (_event, request: MarketDataIpcStreamReadRequest) =>
    handlers.readQuoteStreamSnapshot(request),
  );
  ipcMain.handle(marketDataIpcChannels.disconnectQuoteStream, (_event, context: MarketDataIpcRequestContext) =>
    handlers.disconnectQuoteStream(context),
  );
}
