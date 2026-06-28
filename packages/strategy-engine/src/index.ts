import { crossover, crossunder } from "@quant/pine-runtime";
import type { Market, Timeframe } from "@quant/shared";

export interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyParameterDefinition {
  key: string;
  label: string;
  type: "number" | "boolean" | "select";
  defaultValue: number | boolean | string;
  description?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface StrategyInput {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  bars: Bar[];
  parameters: Record<string, unknown>;
  runMode: "backtest" | "realtime";
  enabled?: boolean;
}

export interface StrategyRunRequest {
  strategyKey: string;
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  bars: Bar[];
  parameters?: Record<string, unknown>;
  runMode: "backtest" | "realtime";
  enabled?: boolean;
}

export interface StrategyRunResult {
  strategy: StrategyDefinition;
  input: StrategyInput;
  output: StrategyOutput;
}

export interface StrategySignal {
  timestamp: number;
  type: "buy" | "sell" | "exit" | "alert";
  price?: number;
  label?: string;
}

export interface StrategyVisualBase {
  id: string;
  visible?: boolean;
  zIndex?: number;
}

export interface StrategySignalMarker extends StrategyVisualBase {
  kind: "signal-marker";
  timestamp: number;
  price: number;
  direction: "up" | "down";
  tone: "buy" | "sell" | "neutral";
}

export interface StrategyPriceLine extends StrategyVisualBase {
  kind: "price-line";
  price: number;
  label: string;
  tone: "target" | "stop" | "range" | "neutral";
}

export interface StrategyTrendLine extends StrategyVisualBase {
  kind: "trend-line";
  points: Array<{ timestamp: number; price: number }>;
  tone: "bullish" | "bearish" | "neutral";
}

export interface StrategyBand extends StrategyVisualBase {
  kind: "band";
  fromPrice: number;
  toPrice: number;
  label?: string;
  tone: "range" | "risk" | "target";
}

export interface StrategyLabel extends StrategyVisualBase {
  kind: "label";
  timestamp: number;
  price: number;
  text: string;
  tone: "info" | "warning" | "success";
}

export type StrategyVisualElement =
  | StrategySignalMarker
  | StrategyPriceLine
  | StrategyTrendLine
  | StrategyBand
  | StrategyLabel;

export interface StrategyRenderOutput {
  strategyId: string;
  strategyName: string;
  enabled: boolean;
  zIndex: number;
  elements: StrategyVisualElement[];
}

export interface StrategyOutput {
  signals: StrategySignal[];
  overlays: StrategyVisualElement[];
  render: StrategyRenderOutput;
  metrics: Record<string, number>;
  logs: string[];
  alerts: string[];
}

export interface StrategyDefinition {
  key: string;
  name: string;
  version: string;
  description: string;
  sourceType: "preset" | "user" | "plugin";
  sourceFile?: string;
  supportedMarkets: Market[];
  supportedTimeframes: Timeframe[];
  parameterSchema: StrategyParameterDefinition[];
  run(input: StrategyInput): StrategyOutput;
}

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

export function resolveStrategyParameters(strategy: StrategyDefinition, parameters: Record<string, unknown> = {}) {
  return strategy.parameterSchema.reduce<Record<string, unknown>>((resolved, parameter) => {
    resolved[parameter.key] = parameters[parameter.key] ?? parameter.defaultValue;
    return resolved;
  }, {});
}

export function createStrategyInput(strategy: StrategyDefinition, request: StrategyRunRequest): StrategyInput {
  return {
    symbol: request.symbol,
    market: request.market,
    timeframe: request.timeframe,
    bars: request.bars,
    parameters: resolveStrategyParameters(strategy, request.parameters),
    runMode: request.runMode,
    enabled: request.enabled ?? true,
  };
}

export function runRegisteredStrategy(registry: StrategyRegistry, request: StrategyRunRequest): StrategyRunResult {
  const strategy = registry.get(request.strategyKey);

  if (!strategy) {
    throw new Error(`策略不存在：${request.strategyKey}`);
  }

  const input = createStrategyInput(strategy, request);
  const output = strategy.run(input);

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

function createPlaceholderOutput(strategy: StrategyDefinition, enabled = true): StrategyOutput {
  return {
    signals: [],
    overlays: [],
    render: {
      strategyId: strategy.key,
      strategyName: strategy.name,
      enabled,
      zIndex: 10,
      elements: [],
    },
    metrics: {},
    logs: [`${strategy.name} 当前仅完成注册，Pine Script 转译将在后续模块进行。`],
    alerts: [],
  };
}

function getNumberParameter(parameters: Record<string, unknown>, key: string, fallback: number) {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBooleanParameter(parameters: Record<string, unknown>, key: string, fallback: boolean) {
  const value = parameters[key];
  return typeof value === "boolean" ? value : fallback;
}

function runUtorbStrategy(strategy: StrategyDefinition, input: StrategyInput): StrategyOutput {
  const enabled = input.enabled ?? true;
  const openingRangeMinutes = getNumberParameter(input.parameters, "openingRangeMinutes", 30);
  const showTargets = getBooleanParameter(input.parameters, "showTargets", true);

  if (!enabled) {
    return createPlaceholderOutput(strategy, false);
  }

  if (input.bars.length < 2) {
    const output = createPlaceholderOutput(strategy, true);
    return {
      ...output,
      logs: ["UTORB 需要至少 2 根 K 线才能计算开盘区间和突破信号。"],
    };
  }

  const sessionStart = input.bars[0].timestamp;
  const sessionEnd = sessionStart + openingRangeMinutes * 60 * 1000;
  const openingBars = input.bars.filter((bar) => bar.timestamp < sessionEnd);
  const effectiveOpeningBars = openingBars.length > 0 ? openingBars : [input.bars[0]];
  const openingRangeHigh = Math.max(...effectiveOpeningBars.map((bar) => bar.high));
  const openingRangeLow = Math.min(...effectiveOpeningBars.map((bar) => bar.low));
  const openingRange = openingRangeHigh - openingRangeLow;
  const closes = input.bars.map((bar) => bar.close);
  const highLine = input.bars.map(() => openingRangeHigh);
  const lowLine = input.bars.map(() => openingRangeLow);
  const breakoutUp = crossover(closes, highLine);
  const breakoutDown = crossunder(closes, lowLine);
  const firstUpIndex = breakoutUp.findIndex((value, index) => value && input.bars[index].timestamp >= sessionEnd);
  const firstDownIndex = breakoutDown.findIndex((value, index) => value && input.bars[index].timestamp >= sessionEnd);
  const elements: StrategyVisualElement[] = [
    {
      id: "utorb-opening-range-high",
      kind: "price-line",
      price: openingRangeHigh,
      label: "开盘区间高点",
      tone: "range",
    },
    {
      id: "utorb-opening-range-low",
      kind: "price-line",
      price: openingRangeLow,
      label: "开盘区间低点",
      tone: "range",
    },
    {
      id: "utorb-opening-range-band",
      kind: "band",
      fromPrice: openingRangeLow,
      toPrice: openingRangeHigh,
      label: "开盘区间",
      tone: "range",
    },
  ];
  const signals: StrategySignal[] = [];

  if (showTargets && openingRange > 0) {
    elements.push(
      {
        id: "utorb-target-up-1",
        kind: "price-line",
        price: openingRangeHigh + openingRange,
        label: "上方目标 1",
        tone: "target",
      },
      {
        id: "utorb-target-down-1",
        kind: "price-line",
        price: openingRangeLow - openingRange,
        label: "下方目标 1",
        tone: "target",
      },
    );
  }

  if (firstUpIndex >= 0) {
    const bar = input.bars[firstUpIndex];
    signals.push({ timestamp: bar.timestamp, type: "buy", price: bar.close, label: "开盘区间上破" });
    elements.push({
      id: `utorb-buy-${bar.timestamp}`,
      kind: "signal-marker",
      timestamp: bar.timestamp,
      price: bar.low,
      direction: "up",
      tone: "buy",
    });
  }

  if (firstDownIndex >= 0) {
    const bar = input.bars[firstDownIndex];
    signals.push({ timestamp: bar.timestamp, type: "sell", price: bar.close, label: "开盘区间下破" });
    elements.push({
      id: `utorb-sell-${bar.timestamp}`,
      kind: "signal-marker",
      timestamp: bar.timestamp,
      price: bar.high,
      direction: "down",
      tone: "sell",
    });
  }

  return {
    signals,
    overlays: elements,
    render: {
      strategyId: strategy.key,
      strategyName: strategy.name,
      enabled,
      zIndex: 10,
      elements,
    },
    metrics: {
      openingRangeHigh,
      openingRangeLow,
      openingRange,
      signalCount: signals.length,
    },
    logs: [
      `UTORB 已计算开盘区间：${openingRangeLow.toFixed(2)} - ${openingRangeHigh.toFixed(2)}。`,
      `已生成 ${signals.length} 个突破信号和 ${elements.length} 个图表元素。`,
    ],
    alerts: signals.map((signal) => signal.label ?? signal.type),
  };
}

export function createPresetStrategyRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry();

  const utorbStrategy: StrategyDefinition = {
    key: "utorb",
    name: "UTORB 开盘区间突破",
    version: "0.1.0",
    description: "从 utorb.md 规划转译的开盘区间突破策略，后续输出突破信号、区间线和目标位。",
    sourceType: "preset",
    sourceFile: "trading-strategies/utorb.md",
    supportedMarkets: ["US", "HK", "CN"],
    supportedTimeframes: ["1m", "5m", "15m", "30m"],
    parameterSchema: [
      {
        key: "openingRangeMinutes",
        label: "开盘区间分钟数",
        type: "number",
        defaultValue: 30,
        description: "用于计算开盘高低点的时间窗口。",
      },
      {
        key: "showTargets",
        label: "显示目标位",
        type: "boolean",
        defaultValue: true,
      },
      {
        key: "riskMode",
        label: "风控模式",
        type: "select",
        defaultValue: "balanced",
        options: [
          { label: "保守", value: "conservative" },
          { label: "均衡", value: "balanced" },
          { label: "进取", value: "aggressive" },
        ],
      },
    ],
    run: (input) => runUtorbStrategy(utorbStrategy, input),
  };

  const trendTargetsStrategy: StrategyDefinition = {
    key: "trend-targets",
    name: "Trend Targets 趋势目标",
    version: "0.1.0",
    description: "从 trend-targets.md 规划转译的趋势目标策略，后续输出趋势线、入场、止损和目标价。",
    sourceType: "preset",
    sourceFile: "trading-strategies/trend-targets.md",
    supportedMarkets: ["US", "HK", "CN"],
    supportedTimeframes: ["15m", "30m", "1h", "1d"],
    parameterSchema: [
      {
        key: "trendLength",
        label: "趋势长度",
        type: "number",
        defaultValue: 10,
      },
      {
        key: "targetMultiplier",
        label: "目标倍数",
        type: "number",
        defaultValue: 1.5,
      },
      {
        key: "showStopLoss",
        label: "显示止损线",
        type: "boolean",
        defaultValue: true,
      },
    ],
    run: (input) => createPlaceholderOutput(trendTargetsStrategy, input.enabled ?? true),
  };

  registry.register(utorbStrategy);
  registry.register(trendTargetsStrategy);

  return registry;
}

export function createEmptyStrategyRegistry(): StrategyRegistry {
  return new StrategyRegistry();
}
