import type { InstalledPluginRecord, PluginManager, PluginRuntimeModule } from "./pluginManager.ts";

export type PluginIpcErrorCode = "PLUGIN_OPERATION_FAILED" | "PLUGIN_RUNTIME_ISOLATION_REQUIRED";

export type PluginIpcResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: { readonly code: PluginIpcErrorCode; readonly message: string } };

export interface PluginIpcHandlers {
  list(): Promise<PluginIpcResult<readonly InstalledPluginRecord[]>>;
  installFromDirectory(directory: string): Promise<PluginIpcResult<InstalledPluginRecord>>;
  setEnabled(pluginId: string, enabled: boolean): Promise<PluginIpcResult<InstalledPluginRecord>>;
  reportRuntimeFailure(pluginId: string, message: string): Promise<PluginIpcResult<InstalledPluginRecord>>;
  uninstall(pluginId: string): Promise<PluginIpcResult<null>>;
  readEnabledRuntimeModules(): Promise<PluginIpcResult<readonly PluginRuntimeModule[]>>;
}

export interface PluginIpcBridge {
  list(): Promise<PluginIpcResult<readonly InstalledPluginRecord[]>>;
  installLocalPlugin(): Promise<PluginIpcResult<InstalledPluginRecord>>;
  setEnabled(pluginId: string, enabled: boolean): Promise<PluginIpcResult<InstalledPluginRecord>>;
  reportRuntimeFailure(pluginId: string, message: string): Promise<PluginIpcResult<InstalledPluginRecord>>;
  uninstall(pluginId: string): Promise<PluginIpcResult<null>>;
  readEnabledRuntimeModules(): Promise<PluginIpcResult<readonly PluginRuntimeModule[]>>;
}

export const pluginIpcChannels = {
  list: "plugins:list",
  installLocal: "plugins:installLocal",
  setEnabled: "plugins:setEnabled",
  reportRuntimeFailure: "plugins:reportRuntimeFailure",
  uninstall: "plugins:uninstall",
  readEnabledRuntimeModules: "plugins:readEnabledRuntimeModules",
} as const;

export function createPluginIpcHandlers(manager: PluginManager): PluginIpcHandlers {
  return {
    async list() {
      return { ok: true, data: manager.list() };
    },
    installFromDirectory: (directory) => invoke(() => manager.installFromDirectory(directory)),
    setEnabled: (pluginId, enabled) => invoke(() => manager.setEnabled(pluginId, enabled)),
    reportRuntimeFailure: (pluginId, message) => invoke(() => manager.recordRuntimeFailure(pluginId, message)),
    uninstall: (pluginId) => invoke(async () => {
      await manager.uninstall(pluginId);
      return null;
    }),
    async readEnabledRuntimeModules() {
      return {
        ok: false,
        error: {
          code: "PLUGIN_RUNTIME_ISOLATION_REQUIRED",
          message: "第三方插件运行时正在升级隔离机制，当前仅支持安装与管理。",
        },
      };
    },
  };
}

async function invoke<T>(operation: () => Promise<T>): Promise<PluginIpcResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "PLUGIN_OPERATION_FAILED",
        message: error instanceof Error && error.message.trim() ? error.message : "插件操作失败。",
      },
    };
  }
}
