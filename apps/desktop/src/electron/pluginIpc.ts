import { dialog, ipcMain } from "electron";
import { createPluginIpcHandlers, pluginIpcChannels, type PluginIpcHandlers } from "./pluginIpcContract.ts";
import type { PluginManager } from "./pluginManager.ts";

export interface PluginDirectoryPicker {
  pickDirectory(): Promise<string | null>;
}

export function registerPluginIpcHandlers(
  manager: PluginManager,
  directoryPicker: PluginDirectoryPicker = createElectronPluginDirectoryPicker(),
  handlers: PluginIpcHandlers = createPluginIpcHandlers(manager),
) {
  ipcMain.handle(pluginIpcChannels.list, () => handlers.list());
  ipcMain.handle(pluginIpcChannels.installLocal, async () => {
    const directory = await directoryPicker.pickDirectory();
    return directory
      ? handlers.installFromDirectory(directory)
      : { ok: false as const, error: { code: "PLUGIN_OPERATION_FAILED" as const, message: "已取消选择插件目录。" } };
  });
  ipcMain.handle(pluginIpcChannels.setEnabled, (_event, pluginId: string, enabled: boolean) => handlers.setEnabled(pluginId, enabled));
  ipcMain.handle(pluginIpcChannels.uninstall, (_event, pluginId: string) => handlers.uninstall(pluginId));
  ipcMain.handle(pluginIpcChannels.readEnabledRuntimeModules, () => handlers.readEnabledRuntimeModules());
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
