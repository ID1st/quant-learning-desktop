import type { StrategyInput, StrategyOutput } from "@quant/strategy-engine";
import type { InstalledPluginRecord, PluginManager } from "./pluginManager.ts";
import { createPluginRuntimeHost, type PluginRuntimeHost } from "./pluginRuntimeHost.ts";
import type { PluginRuntimeSnapshot } from "./pluginRuntimeProtocol.ts";

export type PluginIpcErrorCode = "PLUGIN_OPERATION_FAILED" | "PLUGIN_RUNTIME_UNAVAILABLE";

export type PluginIpcResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: { readonly code: PluginIpcErrorCode; readonly message: string } };

export interface PluginIpcHandlers {
  list(): Promise<PluginIpcResult<readonly InstalledPluginRecord[]>>;
  installFromDirectory(directory: string): Promise<PluginIpcResult<InstalledPluginRecord>>;
  setEnabled(pluginId: string, enabled: boolean): Promise<PluginIpcResult<InstalledPluginRecord>>;
  reportRuntimeFailure(pluginId: string, message: string): Promise<PluginIpcResult<InstalledPluginRecord>>;
  uninstall(pluginId: string): Promise<PluginIpcResult<null>>;
  getRuntimeSnapshot(): Promise<PluginIpcResult<PluginRuntimeSnapshot>>;
  runStrategy(pluginId: string, key: string, input: StrategyInput): Promise<PluginIpcResult<StrategyOutput>>;
}

export interface PluginIpcBridge {
  list(): Promise<PluginIpcResult<readonly InstalledPluginRecord[]>>;
  installLocalPlugin(): Promise<PluginIpcResult<InstalledPluginRecord>>;
  setEnabled(pluginId: string, enabled: boolean): Promise<PluginIpcResult<InstalledPluginRecord>>;
  reportRuntimeFailure(pluginId: string, message: string): Promise<PluginIpcResult<InstalledPluginRecord>>;
  uninstall(pluginId: string): Promise<PluginIpcResult<null>>;
  getRuntimeSnapshot(): Promise<PluginIpcResult<PluginRuntimeSnapshot>>;
  runStrategy(pluginId: string, key: string, input: StrategyInput): Promise<PluginIpcResult<StrategyOutput>>;
}

export const pluginIpcChannels = {
  list: "plugins:list",
  installLocal: "plugins:installLocal",
  setEnabled: "plugins:setEnabled",
  reportRuntimeFailure: "plugins:reportRuntimeFailure",
  uninstall: "plugins:uninstall",
  getRuntimeSnapshot: "plugins:getRuntimeSnapshot",
  runStrategy: "plugins:runStrategy",
} as const;

export function createPluginIpcHandlers(manager: PluginManager, runtime: PluginRuntimeHost = createPluginRuntimeHost({ manager })): PluginIpcHandlers {
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
    getRuntimeSnapshot: () => invoke(() => runtime.refresh(), "PLUGIN_RUNTIME_UNAVAILABLE"),
    runStrategy: (pluginId, key, input) => invoke(() => runtime.runStrategy(pluginId, key, input), "PLUGIN_RUNTIME_UNAVAILABLE"),
  };
}

async function invoke<T>(operation: () => Promise<T>, code: PluginIpcErrorCode = "PLUGIN_OPERATION_FAILED"): Promise<PluginIpcResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return {
      ok: false,
      error: {
        code,
        message: error instanceof Error && error.message.trim() ? error.message : "Plugin runtime failed.",
      },
    };
  }
}
