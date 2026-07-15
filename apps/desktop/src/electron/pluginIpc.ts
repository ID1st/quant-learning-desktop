import { dialog, ipcMain } from "electron";
import { createPluginIpcHandlers, pluginIpcChannels, type PluginIpcHandlers } from "./pluginIpcContract.ts";
import type { PluginManager } from "./pluginManager.ts";
import { createPluginRuntimeHost } from "./pluginRuntimeHost.ts";
import {
  assertBoolean,
  assertBoundedString,
  assertPluginId,
  assertPluginStrategyInput,
  assertTrustedIpcSender,
  type DesktopRendererSecurityPolicy,
} from "./electronSecurity.ts";

export interface PluginDirectoryPicker {
  pickDirectory(): Promise<string | null>;
}

export function registerPluginIpcHandlers(
  securityPolicy: DesktopRendererSecurityPolicy,
  manager: PluginManager,
  directoryPicker: PluginDirectoryPicker = createElectronPluginDirectoryPicker(),
  handlers: PluginIpcHandlers = createPluginIpcHandlers(manager, createPluginRuntimeHost({ manager })),
) {
  ipcMain.handle(pluginIpcChannels.list, (event) => {
    assertTrustedIpcSender(event, securityPolicy);
    return handlers.list();
  });
  ipcMain.handle(pluginIpcChannels.installLocal, async (event) => {
    assertTrustedIpcSender(event, securityPolicy);
    const directory = await directoryPicker.pickDirectory();
    return directory
      ? handlers.installFromDirectory(directory)
      : { ok: false as const, error: { code: "PLUGIN_OPERATION_FAILED" as const, message: "已取消选择插件目录。" } };
  });
  ipcMain.handle(pluginIpcChannels.setEnabled, (event, pluginId: unknown, enabled: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertPluginId(pluginId);
    assertBoolean(enabled, "enabled");
    return handlers.setEnabled(pluginId, enabled);
  });
  ipcMain.handle(pluginIpcChannels.reportRuntimeFailure, (event, pluginId: unknown, message: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertPluginId(pluginId);
    assertBoundedString(message, "message", { maxLength: 800 });
    return handlers.reportRuntimeFailure(pluginId, message);
  });
  ipcMain.handle(pluginIpcChannels.uninstall, (event, pluginId: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertPluginId(pluginId);
    return handlers.uninstall(pluginId);
  });
  ipcMain.handle(pluginIpcChannels.getRuntimeSnapshot, (event) => {
    assertTrustedIpcSender(event, securityPolicy);
    return handlers.getRuntimeSnapshot();
  });
  ipcMain.handle(pluginIpcChannels.runStrategy, (event, pluginId: unknown, key: unknown, input: unknown) => {
    assertTrustedIpcSender(event, securityPolicy);
    assertPluginId(pluginId);
    assertBoundedString(key, "key", { maxLength: 200 });
    if (!key.startsWith(`${pluginId}:`)) throw new TypeError("key must belong to pluginId.");
    assertPluginStrategyInput(input);
    return handlers.runStrategy(pluginId, key, input);
  });
}

function createElectronPluginDirectoryPicker(): PluginDirectoryPicker {
  return {
    async pickDirectory() {
      const result = await dialog.showOpenDialog({
        title: "选择插件目录",
        properties: ["openDirectory"],
      });
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
  };
}
