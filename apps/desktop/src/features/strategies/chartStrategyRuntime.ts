import {
  runRegisteredStrategy,
  type Bar,
  type StrategyDefinition,
  type StrategyRegistry,
  type StrategyRunResult,
} from "@quant/strategy-engine";
import type { Market, Timeframe } from "@quant/shared";

export interface ChartStrategyWorkspaceState {
  enabled: boolean;
  showLayer: boolean;
  parameters: Record<string, unknown>;
}

export interface ChartStrategyRunItem {
  strategy: StrategyDefinition;
  settings: ChartStrategyWorkspaceState;
  result: StrategyRunResult;
}

export interface ChartStrategySignalRow {
  id: string;
  strategyKey: string;
  timestamp: number;
  strategyName: string;
  time: string;
  direction: "向上突破" | "向下突破" | "提醒";
  tone: "buy" | "sell" | "exit" | "alert";
  price: string;
  label: string;
}

export interface RunChartStrategiesOptions {
  readonly strategies: readonly StrategyDefinition[];
  readonly registry: StrategyRegistry;
  readonly settingsByStrategyKey: Record<string, ChartStrategyWorkspaceState>;
  readonly resolveDefaultSettings: (strategy: StrategyDefinition, index: number) => ChartStrategyWorkspaceState;
  readonly symbol: string;
  readonly market: Market;
  readonly timeframe: Timeframe;
  readonly bars: Bar[];
  readonly seriesByTimeframe?: Partial<Record<Timeframe, readonly Bar[]>>;
  readonly confirmedThroughTimestamp?: number;
}

export function getRealtimeStrategyHistoryRequirement(
  strategies: readonly StrategyDefinition[],
  settingsByStrategyKey: Record<string, ChartStrategyWorkspaceState>,
) {
  return strategies.reduce(
    (requirement, strategy) => {
      const enabled = settingsByStrategyKey[strategy.key]?.enabled ?? strategy.defaultEnabled ?? false;
      const next = enabled ? strategy.realtimeHistoryRequirement : undefined;
      return next
        ? {
            minimumBars: Math.max(requirement.minimumBars, next.minimumBars),
            preferredBars: Math.max(requirement.preferredBars, next.preferredBars),
            sessionCount: Math.max(requirement.sessionCount, next.sessionCount),
          }
        : requirement;
    },
    { minimumBars: 0, preferredBars: 2_500, sessionCount: 5 },
  );
}

export function runChartStrategies(options: RunChartStrategiesOptions): ChartStrategyRunItem[] {
  return options.strategies.map((strategy, index) => {
    const settings = options.settingsByStrategyKey[strategy.key] ?? options.resolveDefaultSettings(strategy, index);
    let result: StrategyRunResult;

    try {
      result = strategy.supportedTimeframes.includes(options.timeframe)
        ? runRegisteredStrategy(options.registry, {
            strategyKey: strategy.key,
            symbol: options.symbol,
            market: options.market,
            timeframe: options.timeframe,
            bars: options.bars,
            seriesByTimeframe: options.seriesByTimeframe,
            confirmedThroughTimestamp: options.confirmedThroughTimestamp,
            runMode: "backtest",
            enabled: settings.enabled,
            parameters: settings.parameters,
          })
        : createFailedStrategyRunResult(
            strategy,
            settings,
            options.symbol,
            options.market,
            options.timeframe,
            getUnsupportedTimeframeMessage(strategy, options.timeframe),
          );
    } catch (error) {
      result = createFailedStrategyRunResult(
        strategy,
        settings,
        options.symbol,
        options.market,
        options.timeframe,
        getErrorMessage(error),
      );
    }

    return {
      strategy,
      settings,
      result,
    };
  });
}

export function buildChartStrategyLogItems(
  runs: readonly ChartStrategyRunItem[],
  context: { readonly symbol: string; readonly timeframe: Timeframe },
): string[] {
  return runs.flatMap(({ result, settings }) =>
    settings.enabled
      ? [
          `运行 ${result.strategy.name}，标的 ${context.symbol}，周期 ${context.timeframe}。`,
          ...result.output.logs,
          ...result.output.alerts.map((alert) => `提醒：${alert}`),
        ]
      : [`${result.strategy.name} 当前已停用。`],
  );
}

export function buildChartStrategySignalRows(runs: readonly ChartStrategyRunItem[]): ChartStrategySignalRow[] {
  return runs.flatMap(({ result }) =>
    result.output.signals.map((signal, index) => ({
      id: `${result.strategy.key}-${signal.type}-${signal.timestamp}-${index}`,
      strategyKey: result.strategy.key,
      timestamp: signal.timestamp,
      strategyName: formatChartStrategySignalName(result.strategy),
      time: formatSignalTime(signal.timestamp),
      direction: signal.type === "buy" ? "向上突破" : signal.type === "sell" ? "向下突破" : "提醒",
      tone: signal.type,
      price: signal.price === undefined ? "-" : signal.price.toFixed(2),
      label: signal.label ?? "策略信号",
    })),
  );
}

export function formatChartStrategySignalName(strategy: Pick<StrategyDefinition, "key" | "name">) {
  if (strategy.key === "smart-money-concepts") {
    return strategy.name.replace(/\s*\[LuxAlgo\]$/, "");
  }
  if (strategy.key === "machine-learning-price-targets") {
    return strategy.name.replace(/\s*\[AlgoAlpha\]$/, "");
  }

  return strategy.name;
}

export function createFailedStrategyRunResult(
  strategy: StrategyDefinition,
  settings: ChartStrategyWorkspaceState,
  symbol: string,
  market: Market,
  timeframe: Timeframe,
  message: string,
): StrategyRunResult {
  return {
    strategy,
    input: {
      symbol,
      market,
      timeframe,
      bars: [],
      parameters: settings.parameters,
      runMode: "backtest",
      enabled: settings.enabled,
    },
    output: {
      signals: [],
      overlays: [],
      render: {
        strategyId: strategy.key,
        strategyName: strategy.name,
        enabled: false,
        zIndex: 10,
        elements: [],
      },
      metrics: {},
      logs: [`${strategy.name} 运行失败：${message}`],
      alerts: [],
    },
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function getUnsupportedTimeframeMessage(strategy: StrategyDefinition, timeframe: Timeframe) {
  const supported = strategy.supportedTimeframes.join(" / ");
  const dataLimitNote =
    strategy.key === "utorb"
      ? "UTORB 属于开盘区间突破策略，需要分钟级 K 线计算开盘高低点。"
      : "当前图表周期不在该策略声明的支持范围内。";

  return `${dataLimitNote} 当前周期：${timeframe}；策略支持周期：${supported}。`;
}

function formatSignalTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
