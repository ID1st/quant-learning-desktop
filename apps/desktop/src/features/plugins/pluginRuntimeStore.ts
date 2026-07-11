import { create } from "zustand";
import type { ChartIndicatorDefinition } from "../chartIndicators/chartIndicators.ts";
import type { InstalledPluginRecord, PluginRuntimeModule } from "../../electron/pluginManager.ts";
import type { StrategyDefinition } from "@quant/strategy-engine";
import { activatePluginRuntimeModules, type PluginRuntimeFailure, type PluginRuntimeLogEntry } from "./pluginRuntime.ts";

export type PluginRuntimeStateStatus = "idle" | "loading" | "ready" | "degraded" | "unavailable" | "error";

interface PluginRuntimeState {
  plugins: readonly InstalledPluginRecord[];
  strategies: readonly StrategyDefinition[];
  indicators: readonly ChartIndicatorDefinition[];
  logs: readonly PluginRuntimeLogEntry[];
  status: PluginRuntimeStateStatus;
  message: string;
  refresh(): Promise<void>;
  installLocalPlugin(): Promise<void>;
  setEnabled(pluginId: string, enabled: boolean): Promise<void>;
  uninstall(pluginId: string): Promise<void>;
}

function getPluginBridge() {
  return window.quantDesktop?.plugins;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim() ? error.message : "插件操作失败。";
}

function toRuntimeFailureReporter() {
  return async (failure: PluginRuntimeFailure) => {
    await getPluginBridge()?.reportRuntimeFailure(failure.pluginId, failure.message);
  };
}

export const usePluginRuntimeStore = create<PluginRuntimeState>((set) => ({
  plugins: [],
  strategies: [],
  indicators: [],
  logs: [],
  status: "idle",
  message: "插件运行时尚未加载。",
  async refresh() {
    const bridge = getPluginBridge();
    if (!bridge) {
      set({
        plugins: [],
        strategies: [],
        indicators: [],
        logs: [],
        status: "unavailable",
        message: "真实插件管理需要在桌面应用中运行。",
      });
      return;
    }

    set({ status: "loading", message: "正在加载插件…" });
    try {
      const listResult = await bridge.list();
      if (!listResult.ok) {
        set({ status: "error", message: listResult.error.message });
        return;
      }

      const modulesResult = await bridge.readEnabledRuntimeModules();
      if (!modulesResult.ok) {
        set({ plugins: listResult.data, strategies: [], indicators: [], logs: [], status: "error", message: modulesResult.error.message });
        return;
      }

      const activated = await activatePluginRuntimeModules(modulesResult.data as readonly PluginRuntimeModule[], undefined, {
        onRuntimeFailure: toRuntimeFailureReporter(),
      });
      const refreshedListResult = await bridge.list();
      set({
        plugins: refreshedListResult.ok ? refreshedListResult.data : listResult.data,
        strategies: activated.strategies,
        indicators: activated.indicators,
        logs: activated.logs,
        status: activated.failures.length > 0 ? "degraded" : "ready",
        message: activated.failures.length > 0 ? "部分插件加载失败，已隔离。" : "插件运行时已就绪。",
      });
    } catch (error) {
      set({ status: "error", message: getErrorMessage(error) });
    }
  },
  async installLocalPlugin() {
    const bridge = getPluginBridge();
    if (!bridge) {
      set({ status: "unavailable", message: "真实插件安装需要在桌面应用中运行。" });
      return;
    }

    const result = await bridge.installLocalPlugin();
    if (!result.ok) {
      set({ status: "error", message: result.error.message });
      return;
    }
    await usePluginRuntimeStore.getState().refresh();
  },
  async setEnabled(pluginId, enabled) {
    const bridge = getPluginBridge();
    if (!bridge) {
      set({ status: "unavailable", message: "真实插件管理需要在桌面应用中运行。" });
      return;
    }

    const result = await bridge.setEnabled(pluginId, enabled);
    if (!result.ok) {
      set({ status: "error", message: result.error.message });
      return;
    }
    await usePluginRuntimeStore.getState().refresh();
  },
  async uninstall(pluginId) {
    const bridge = getPluginBridge();
    if (!bridge) {
      set({ status: "unavailable", message: "真实插件管理需要在桌面应用中运行。" });
      return;
    }

    const result = await bridge.uninstall(pluginId);
    if (!result.ok) {
      set({ status: "error", message: result.error.message });
      return;
    }
    await usePluginRuntimeStore.getState().refresh();
  },
}));
