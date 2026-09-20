import {
  formatStrategyDisplayName,
  type ChartStrategyWorkspaceState,
} from "../strategies/chartStrategyRuntime.ts";
import type { AppLanguage } from "../../i18n/i18n.ts";

export interface StrategyQuickMenuDefinition {
  readonly key: string;
  readonly name: string;
  readonly sourceType: "preset" | "user" | "plugin";
  readonly parameterSchema: readonly { readonly key: string }[];
}

export interface StrategyQuickMenuItem {
  readonly key: string;
  readonly name: string;
  readonly sourceType: StrategyQuickMenuDefinition["sourceType"];
  readonly enabled: boolean;
  readonly hasParameters: boolean;
}

export function createStrategyQuickMenuItems(
  strategies: readonly StrategyQuickMenuDefinition[],
  settingsByStrategyKey: Readonly<Record<string, Pick<ChartStrategyWorkspaceState, "enabled">>>,
  language: AppLanguage = "zh-CN",
): StrategyQuickMenuItem[] {
  return strategies.map((strategy) => ({
    key: strategy.key,
    name: formatStrategyDisplayName(strategy, language),
    sourceType: strategy.sourceType,
    enabled: settingsByStrategyKey[strategy.key]?.enabled ?? false,
    hasParameters: strategy.parameterSchema.length > 0,
  }));
}

export function toggleStrategyFromQuickMenu(
  state: ChartStrategyWorkspaceState,
): ChartStrategyWorkspaceState {
  const enabled = !state.enabled;
  return {
    ...state,
    enabled,
    showLayer: enabled ? true : state.showLayer,
  };
}
