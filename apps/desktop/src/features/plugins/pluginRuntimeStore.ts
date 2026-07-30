import { create } from "zustand";
import type { StrategyDefinition, StrategyInput, StrategyOutput } from "@quant/strategy-engine";
import type { ChartIndicatorDefinition } from "../chartIndicators/chartIndicators.ts";
import type { InstalledPluginRecord } from "../../electron/pluginManager.ts";
import type {
  PluginRuntimeSnapshot,
  PluginStrategyRuntimeDescriptor,
} from "../../electron/pluginRuntimeProtocol.ts";

export type PluginRuntimeStateStatus =
  "idle" | "loading" | "ready" | "degraded" | "unavailable" | "error";

interface PluginRuntimeState {
  plugins: readonly InstalledPluginRecord[];
  strategies: readonly StrategyDefinition[];
  indicators: readonly ChartIndicatorDefinition[];
  status: PluginRuntimeStateStatus;
  message: string;
  refresh(): Promise<void>;
  runStrategies(
    requests: readonly { readonly strategy: StrategyDefinition; readonly input: StrategyInput }[],
  ): Promise<void>;
  installLocalPlugin(): Promise<void>;
  setEnabled(pluginId: string, enabled: boolean): Promise<void>;
  uninstall(pluginId: string): Promise<void>;
}

type OutputCache = Readonly<Record<string, StrategyOutput>>;

function getPluginBridge() {
  return window.quantDesktop?.plugins;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim() ? error.message : "插件操作失败。";
}

function createOutputKey(strategyKey: string, input: StrategyInput) {
  const last = input.bars.at(-1);
  return `${strategyKey}:${input.symbol}:${input.market}:${input.timeframe}:${input.bars.length}:${last?.timestamp ?? 0}:${last?.open ?? 0}:${last?.high ?? 0}:${last?.low ?? 0}:${last?.close ?? 0}:${JSON.stringify(input.parameters)}`;
}

function createStrategyDefinitions(
  descriptors: readonly PluginStrategyRuntimeDescriptor[],
  outputs: OutputCache,
): StrategyDefinition[] {
  return descriptors.map((descriptor) => ({
    key: descriptor.key,
    name: descriptor.name,
    version: descriptor.version,
    description: descriptor.description,
    sourceType: "plugin" as const,
    sourceFile: descriptor.pluginId,
    supportedMarkets: [...descriptor.supportedMarkets],
    supportedTimeframes: [...descriptor.supportedTimeframes],
    parameterSchema: [...descriptor.parameterSchema],
    run(input) {
      return (
        outputs[createOutputKey(descriptor.key, input)] ?? createPendingOutput(descriptor, input)
      );
    },
  }));
}

function createPendingOutput(
  descriptor: PluginStrategyRuntimeDescriptor,
  input: StrategyInput,
): StrategyOutput {
  return {
    signals: [],
    overlays: [],
    render: {
      strategyId: descriptor.key,
      strategyName: descriptor.name,
      enabled: input.enabled !== false,
      zIndex: 20,
      elements: [],
    },
    metrics: {},
    logs: ["插件策略正在隔离宿主中计算。"],
    alerts: [],
  };
}

function createRuntimeState(snapshot: PluginRuntimeSnapshot, outputs: OutputCache) {
  const strategies = createStrategyDefinitions(snapshot.strategies, outputs);
  const status: PluginRuntimeStateStatus = snapshot.failures.length > 0 ? "degraded" : "ready";
  return {
    strategies,
    status,
    message: snapshot.failures.length > 0 ? "部分插件已隔离并降级。" : "插件隔离运行时已就绪。",
  };
}

export const usePluginRuntimeStore = create<PluginRuntimeState>((set, get) => {
  let descriptors: readonly PluginStrategyRuntimeDescriptor[] = [];
  let outputs: OutputCache = {};

  const applySnapshot = (snapshot: PluginRuntimeSnapshot) => {
    descriptors = snapshot.strategies;
    outputs = {};
    set(createRuntimeState(snapshot, outputs));
  };

  return {
    plugins: [],
    strategies: [],
    indicators: [],
    status: "idle",
    message: "插件运行时尚未加载。",
    async refresh() {
      const bridge = getPluginBridge();
      if (!bridge) {
        set({
          plugins: [],
          strategies: [],
          status: "unavailable",
          message: "真实插件管理需要在桌面应用中运行。",
        });
        return;
      }
      set({ status: "loading", message: "正在加载插件隔离运行时…" });
      try {
        const [listResult, runtimeResult] = await Promise.all([
          bridge.list(),
          bridge.getRuntimeSnapshot(),
        ]);
        if (!listResult.ok) {
          set({ status: "error", message: listResult.error.message });
          return;
        }
        if (!runtimeResult.ok) {
          set({
            plugins: listResult.data,
            strategies: [],
            status: "unavailable",
            message: runtimeResult.error.message,
          });
          return;
        }
        applySnapshot(runtimeResult.data as PluginRuntimeSnapshot);
        set({ plugins: listResult.data });
      } catch (error) {
        set({ status: "error", message: getErrorMessage(error) });
      }
    },
    async runStrategies(requests) {
      const bridge = getPluginBridge();
      if (!bridge) return;
      const pluginRequests = requests.filter(
        ({ strategy }) => strategy.sourceType === "plugin" && strategy.sourceFile,
      );
      if (pluginRequests.length === 0) return;
      const results = await Promise.all(
        pluginRequests.map(async ({ strategy, input }) => {
          const result = await bridge.runStrategy(strategy.sourceFile!, strategy.key, input);
          return { strategy, input, result };
        }),
      );
      const nextOutputs: Record<string, StrategyOutput> = { ...outputs };
      let failedMessage: string | null = null;
      results.forEach(({ strategy, input, result }) => {
        if (!result.ok) {
          failedMessage = result.error.message;
          return;
        }
        // The isolated utility host validates and JSON-normalizes this payload before IPC.
        nextOutputs[createOutputKey(strategy.key, input)] =
          result.data as unknown as StrategyOutput;
      });
      outputs = nextOutputs;
      set({
        strategies: createStrategyDefinitions(descriptors, outputs),
        ...(failedMessage ? { status: "degraded" as const, message: failedMessage } : {}),
      });
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
      await get().refresh();
    },
    async setEnabled(pluginId, enabled) {
      const bridge = getPluginBridge();
      if (!bridge) return;
      const result = await bridge.setEnabled(pluginId, enabled);
      if (!result.ok) {
        set({ status: "error", message: result.error.message });
        return;
      }
      await get().refresh();
    },
    async uninstall(pluginId) {
      const bridge = getPluginBridge();
      if (!bridge) return;
      const result = await bridge.uninstall(pluginId);
      if (!result.ok) {
        set({ status: "error", message: result.error.message });
        return;
      }
      await get().refresh();
    },
  };
});
