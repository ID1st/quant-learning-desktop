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
  fromTimestamp?: number;
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
  fromTimestamp?: number;
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

function getPositiveNumberParameter(parameters: Record<string, unknown>, key: string, fallback: number) {
  const value = getNumberParameter(parameters, key, fallback);
  return value > 0 ? value : fallback;
}

function getBooleanParameter(parameters: Record<string, unknown>, key: string, fallback: boolean) {
  const value = parameters[key];
  return typeof value === "boolean" ? value : fallback;
}

function averageRange(bars: Bar[]) {
  if (bars.length === 0) {
    return 0;
  }

  return bars.reduce((total, bar) => total + Math.max(0, bar.high - bar.low), 0) / bars.length;
}

function runUtorbStrategy(strategy: StrategyDefinition, input: StrategyInput): StrategyOutput {
  const enabled = input.enabled ?? true;
  const openingRangeMinutes = getPositiveNumberParameter(input.parameters, "openingRangeMinutes", 30);
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

function runTrendTargetsStrategy(strategy: StrategyDefinition, input: StrategyInput): StrategyOutput {
  const enabled = input.enabled ?? true;
  const trendLength = Math.max(2, Math.round(getPositiveNumberParameter(input.parameters, "trendLength", 10)));
  const targetMultiplier = getPositiveNumberParameter(input.parameters, "targetMultiplier", 1.5);
  const showStopLoss = getBooleanParameter(input.parameters, "showStopLoss", true);

  if (!enabled) {
    return createPlaceholderOutput(strategy, false);
  }

  if (input.bars.length < 3) {
    const output = createPlaceholderOutput(strategy, true);
    return {
      ...output,
      logs: ["Trend Targets 需要至少 3 根 K 线才能计算趋势基准和目标位。"],
    };
  }

  const startIndex = Math.max(0, input.bars.length - trendLength - 1);
  const lastBar = input.bars[input.bars.length - 1];
  const trendBars = input.bars.slice(startIndex);
  const trendStartBar = trendBars[0];
  const slope = (lastBar.close - trendStartBar.close) / Math.max(1, input.bars.length - 1 - startIndex);
  const direction = slope >= 0 ? "bullish" : "bearish";
  const elements: StrategyVisualElement[] = [
    {
      id: "trend-targets-baseline",
      kind: "trend-line",
      points: trendBars.map((bar) => ({ timestamp: bar.timestamp, price: bar.close })),
      tone: direction,
    },
  ];
  const signals: StrategySignal[] = [];
  let previousSignalType: StrategySignal["type"] | null = null;

  input.bars.forEach((bar, index) => {
    if (index < 2) {
      return;
    }

    const comparisonBars = input.bars.slice(Math.max(0, index - trendLength), index);
    const priorHigh = Math.max(...comparisonBars.map((item) => item.high));
    const priorLow = Math.min(...comparisonBars.map((item) => item.low));
    const signalType = bar.close > priorHigh ? "buy" : bar.close < priorLow ? "sell" : null;

    if (!signalType || signalType === previousSignalType) {
      return;
    }

    previousSignalType = signalType;
    signals.push({
      timestamp: bar.timestamp,
      type: signalType,
      price: bar.close,
      label: signalType === "buy" ? "趋势目标多头突破" : "趋势目标空头跌破",
    });
    elements.push({
      id: `trend-targets-${signalType}-${bar.timestamp}`,
      kind: "signal-marker",
      timestamp: bar.timestamp,
      price: signalType === "buy" ? bar.low : bar.high,
      direction: signalType === "buy" ? "up" : "down",
      tone: signalType,
    });
  });

  const latestSignal = signals[signals.length - 1];
  const latestSignalBar = latestSignal ? input.bars.find((bar) => bar.timestamp === latestSignal.timestamp) : undefined;
  const setupSide = latestSignal?.type === "sell" ? "sell" : "buy";
  const projectionBar = latestSignalBar ?? lastBar;
  const projectionIndex = input.bars.indexOf(projectionBar);
  const riskBars = input.bars.slice(Math.max(0, projectionIndex - trendLength + 1), projectionIndex + 1);
  const riskRange = Math.max(0.01, averageRange(riskBars));
  const entryPrice = projectionBar.close;
  const stopPrice = setupSide === "buy" ? projectionBar.low - riskRange : projectionBar.high + riskRange;
  const riskDistance = Math.abs(entryPrice - stopPrice);
  const targetOne = setupSide === "buy" ? entryPrice + riskDistance * 0.5 : entryPrice - riskDistance * 0.5;
  const targetTwo = setupSide === "buy" ? entryPrice + riskDistance : entryPrice - riskDistance;
  const targetThree = setupSide === "buy" ? entryPrice + riskDistance * targetMultiplier : entryPrice - riskDistance * targetMultiplier;
  const projectionStart = projectionBar.timestamp;

  elements.push(
    {
      id: "trend-targets-target-zone",
      kind: "band",
      fromPrice: Math.min(entryPrice, targetThree),
      toPrice: Math.max(entryPrice, targetThree),
      tone: "target",
      fromTimestamp: projectionStart,
    },
    {
      id: "trend-targets-risk-zone",
      kind: "band",
      fromPrice: Math.min(entryPrice, stopPrice),
      toPrice: Math.max(entryPrice, stopPrice),
      tone: "risk",
      fromTimestamp: projectionStart,
    },
    {
      id: "trend-targets-entry",
      kind: "price-line",
      price: entryPrice,
      label: `Entry ▸ ${entryPrice.toFixed(2)}`,
      tone: "neutral",
      fromTimestamp: projectionStart,
    },
    {
      id: "trend-targets-target-1",
      kind: "price-line",
      price: targetOne,
      label: `✓ TP1 ▸ ${targetOne.toFixed(2)}`,
      tone: "target",
      fromTimestamp: projectionStart,
    },
    {
      id: "trend-targets-target-2",
      kind: "price-line",
      price: targetTwo,
      label: `✓ TP2 ▸ ${targetTwo.toFixed(2)}`,
      tone: "target",
      fromTimestamp: projectionStart,
    },
    {
      id: "trend-targets-target-3",
      kind: "price-line",
      price: targetThree,
      label: `✓ TP3 ▸ ${targetThree.toFixed(2)}`,
      tone: "target",
      fromTimestamp: projectionStart,
    },
  );

  if (showStopLoss) {
    elements.push({
      id: "trend-targets-stop",
      kind: "price-line",
      price: stopPrice,
      label: `✕ SL ▸ ${stopPrice.toFixed(2)}`,
      tone: "stop",
      fromTimestamp: projectionStart,
    });
  }

  return {
    signals,
    overlays: elements,
    render: {
      strategyId: strategy.key,
      strategyName: strategy.name,
      enabled,
      zIndex: 11,
      elements,
    },
    metrics: {
      trendSlope: slope,
      averageRange: riskRange,
      entryPrice,
      stopPrice,
      targetOne,
      targetTwo,
      targetThree,
      signalCount: signals.length,
    },
    logs: [
      `Trend Targets 已生成 ${direction === "bullish" ? "多头" : "空头"}基准线和目标位。`,
      `当前入场参考 ${entryPrice.toFixed(2)}，止损 ${stopPrice.toFixed(2)}，目标3 ${targetThree.toFixed(2)}。`,
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
    description: "从 trend-targets.md 最小转译的趋势目标策略，输出趋势基准线、入场参考、止损和三档目标位。",
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
    run: (input) => runTrendTargetsStrategy(trendTargetsStrategy, input),
  };

  registry.register(utorbStrategy);
  registry.register(trendTargetsStrategy);

  return registry;
}

export function createEmptyStrategyRegistry(): StrategyRegistry {
  return new StrategyRegistry();
}
