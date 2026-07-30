import { createMachineLearningPriceTargetsStrategyDefinition } from "./machineLearningPriceTargets.ts";
import { createSmartMoneyConceptsStrategyDefinition } from "./smartMoneyConceptsDefinition.ts";
import { StrategyRegistry } from "./strategyRuntime.ts";
import { createTrendTargetsStrategyDefinition } from "./trendTargets.ts";
import { createUtorbStrategyDefinition } from "./ultimateOpeningRangeBreakout.ts";

export function createPresetStrategyRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry();
  registry.register(createUtorbStrategyDefinition());
  registry.register(createTrendTargetsStrategyDefinition());
  registry.register(createSmartMoneyConceptsStrategyDefinition());
  registry.register(createMachineLearningPriceTargetsStrategyDefinition());
  return registry;
}

export function createEmptyStrategyRegistry(): StrategyRegistry {
  return new StrategyRegistry();
}
