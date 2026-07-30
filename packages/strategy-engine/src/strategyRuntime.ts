import type {
  StrategyDefinition,
  StrategyInput,
  StrategyRunRequest,
  StrategyRunResult,
} from "./contracts.ts";

export class StrategyRegistry {
  private readonly strategies = new Map<string, StrategyDefinition>();

  register(strategy: StrategyDefinition): void {
    this.strategies.set(strategy.key, strategy);
  }

  get(key: string): StrategyDefinition | undefined {
    return this.strategies.get(key);
  }

  list(): StrategyDefinition[] {
    return Array.from(this.strategies.values());
  }
}

export function resolveStrategyParameters(
  strategy: StrategyDefinition,
  parameters: Record<string, unknown> = {},
) {
  return strategy.parameterSchema.reduce<Record<string, unknown>>((resolved, parameter) => {
    resolved[parameter.key] = parameters[parameter.key] ?? parameter.defaultValue;
    return resolved;
  }, {});
}

export function createStrategyInput(
  strategy: StrategyDefinition,
  request: StrategyRunRequest,
): StrategyInput {
  return {
    symbol: request.symbol,
    market: request.market,
    timeframe: request.timeframe,
    bars: request.bars,
    seriesByTimeframe: request.seriesByTimeframe,
    confirmedThroughTimestamp: request.confirmedThroughTimestamp,
    parameters: resolveStrategyParameters(strategy, request.parameters),
    runMode: request.runMode,
    enabled: request.enabled ?? strategy.defaultEnabled ?? true,
  };
}

export function runRegisteredStrategy(
  registry: StrategyRegistry,
  request: StrategyRunRequest,
): StrategyRunResult {
  const strategy = registry.get(request.strategyKey);

  if (!strategy) {
    throw new Error(`策略不存在：${request.strategyKey}`);
  }

  const input = createStrategyInput(strategy, request);
  const executionInput =
    input.confirmedThroughTimestamp === undefined
      ? input
      : {
          ...input,
          bars: input.bars.filter((bar) => bar.timestamp <= input.confirmedThroughTimestamp!),
        };
  const output = strategy.run(executionInput);

  return {
    strategy,
    input,
    output: {
      ...output,
      render: {
        ...output.render,
        enabled: input.enabled ?? output.render.enabled,
      },
    },
  };
}
