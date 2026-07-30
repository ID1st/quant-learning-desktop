import type {
  StrategyInput,
  StrategyOutput,
  StrategyParameterDefinition,
} from "@quant/strategy-engine";
import type { Market, Timeframe } from "@quant/shared";
import type { PluginRuntimeModule } from "./pluginManager.ts";

export interface PluginStrategyRuntimeDescriptor {
  readonly kind: "strategy";
  readonly pluginId: string;
  readonly key: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly supportedMarkets: readonly Market[];
  readonly supportedTimeframes: readonly Timeframe[];
  readonly parameterSchema: readonly StrategyParameterDefinition[];
}

export interface PluginRuntimeFailureRecord {
  readonly pluginId: string;
  readonly message: string;
}

export interface PluginRuntimeSnapshot {
  readonly strategies: readonly PluginStrategyRuntimeDescriptor[];
  readonly logs: readonly { readonly pluginId: string; readonly message: string }[];
  readonly failures: readonly PluginRuntimeFailureRecord[];
}

export type PluginRuntimeHostRequest =
  | {
      readonly id: string;
      readonly type: "refresh";
      readonly modules: readonly PluginRuntimeModule[];
    }
  | {
      readonly id: string;
      readonly type: "run-strategy";
      readonly pluginId: string;
      readonly key: string;
      readonly input: StrategyInput;
    };

export type PluginRuntimeHostResponse =
  | {
      readonly id: string;
      readonly ok: true;
      readonly type: "refresh";
      readonly snapshot: PluginRuntimeSnapshot;
    }
  | {
      readonly id: string;
      readonly ok: true;
      readonly type: "run-strategy";
      readonly output: StrategyOutput;
    }
  | { readonly id: string; readonly ok: false; readonly message: string };
