import { ipcMain } from "electron";

import {
  assertMarketBarCacheKey,
  assertMarketBarCachePruneRequest,
  assertMarketBarCacheReadRequest,
  assertMarketBarCacheWriteRequest,
  assertLegacyMarketCacheMigrationRecordRequest,
  marketBarCacheIpcChannels,
  type MarketBarCacheIpcHandlers,
} from "./marketBarCacheIpcContract.ts";
import { assertTrustedIpcSender, type DesktopRendererSecurityPolicy } from "./electronSecurity.ts";

export function registerMarketBarCacheIpcHandlers(
  securityPolicy: DesktopRendererSecurityPolicy,
  handlers: MarketBarCacheIpcHandlers,
) {
  ipcMain.handle(marketBarCacheIpcChannels.read, (event, request: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketBarCacheReadRequest(request);
    return handlers.read(request);
  });
  ipcMain.handle(marketBarCacheIpcChannels.write, (event, request: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketBarCacheWriteRequest(request);
    return handlers.write(request);
  });
  ipcMain.handle(marketBarCacheIpcChannels.summary, (event) => {
    assertTrustedIpcSender(event, securityPolicy);
    return handlers.summary();
  });
  ipcMain.handle(marketBarCacheIpcChannels.prune, (event, request: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketBarCachePruneRequest(request);
    return handlers.prune(request);
  });
  ipcMain.handle(marketBarCacheIpcChannels.clear, (event, key: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertMarketBarCacheKey(key);
    return handlers.clear(key);
  });
  ipcMain.handle(marketBarCacheIpcChannels.clearAll, (event) => {
    assertTrustedIpcSender(event, securityPolicy);
    return handlers.clearAll();
  });
  ipcMain.handle(marketBarCacheIpcChannels.legacyMigrationState, (event) => {
    assertTrustedIpcSender(event, securityPolicy);
    return handlers.legacyMigrationState();
  });
  ipcMain.handle(marketBarCacheIpcChannels.recordLegacyMigration, (event, request: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertLegacyMarketCacheMigrationRecordRequest(request);
    return handlers.recordLegacyMigration(request);
  });

  return () => {
    Object.values(marketBarCacheIpcChannels).forEach((channel) => ipcMain.removeHandler(channel));
  };
}
