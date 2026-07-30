import type { StrategyInput, StrategyOutput } from "@quant/strategy-engine";
import type { PluginManager } from "./pluginManager.ts";
import type { PluginRuntimeSnapshot } from "./pluginRuntimeProtocol.ts";

export const pluginExecutionDisabledMessage =
  "Third-party plugin strategy execution is disabled until a no-Node sandbox is available.";

export interface PluginRuntimeHost {
  refresh(): Promise<PluginRuntimeSnapshot>;
  runStrategy(pluginId: string, key: string, input: StrategyInput): Promise<StrategyOutput>;
  dispose(): void;
}

export interface PluginRuntimeHostOptions {
  readonly manager: PluginManager;
}

export function createPluginRuntimeHost(options: PluginRuntimeHostOptions): PluginRuntimeHost {
  return {
    async refresh() {
      const logs = options.manager
        .list()
        .filter((plugin) => plugin.status === "enabled" && plugin.manifest.type === "strategy")
        .map((plugin) => ({
          pluginId: plugin.manifest.id,
          message: pluginExecutionDisabledMessage,
        }));
      return { strategies: [], logs, failures: [] };
    },
    async runStrategy(pluginId, key, input) {
      void key;
      void input;
      await options.manager.recordRuntimeFailure(pluginId, pluginExecutionDisabledMessage);
      throw new Error(pluginExecutionDisabledMessage);
    },
    dispose() {},
  };
}
