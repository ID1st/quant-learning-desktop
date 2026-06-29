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

export interface PineStrategyPreflightInput {
  fileName: string;
  sourceText: string;
}

export type PineStrategyDeclaration = "indicator" | "strategy" | "library" | "unknown";
export type PineStrategyTranslationStatus = "ready" | "manual-review" | "unsupported";

export interface PineStrategyInputDraft {
  key: string;
  type: string;
  label: string;
}

export interface PineStrategyTranslationPlan {
  status: PineStrategyTranslationStatus;
  reasons: string[];
}

export interface PineTranslationDeclarationIR {
  type: PineStrategyDeclaration;
  title: string;
  overlay: boolean | null;
  version: string | null;
}

export interface PineTranslationVisualIR {
  kind: "plot" | "plotshape" | "plotchar" | "plotbar" | "plotcandle";
  expression: string;
}

export interface PineTranslationAlertIR {
  condition: string;
  title: string;
}

export interface PineTranslationIR {
  fileName: string;
  declaration: PineTranslationDeclarationIR;
  inputs: PineStrategyInputDraft[];
  visuals: PineTranslationVisualIR[];
  alerts: PineTranslationAlertIR[];
  unsupportedCalls: string[];
}

export interface PineTranslationPlanOutput {
  status: PineStrategyTranslationStatus;
  reasons: string[];
  ir: PineTranslationIR;
}

export type PineTranslationPlanResult =
  | {
      ok: true;
      plan: PineTranslationPlanOutput;
    }
  | {
      ok: false;
      error: PineStrategyPreflightError;
    };

export interface PineStrategyPreflightSummary {
  fileName: string;
  title: string;
  version: string | null;
  declaration: PineStrategyDeclaration;
  overlay: boolean | null;
  lineCount: number;
  inputCount: number;
  plotCount: number;
  alertCount: number;
  inputs: PineStrategyInputDraft[];
  canCreateDraft: boolean;
  translationPlan: PineStrategyTranslationPlan;
  warnings: string[];
}

export type PineStrategyPreflightErrorCode = "EMPTY_SOURCE" | "NOT_PINE_SCRIPT";

export interface PineStrategyPreflightError {
  code: PineStrategyPreflightErrorCode;
  message: string;
}

export type PineStrategyPreflightResult =
  | {
      ok: true;
      summary: PineStrategyPreflightSummary;
    }
  | {
      ok: false;
      error: PineStrategyPreflightError;
    };

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

function countMatches(sourceText: string, pattern: RegExp) {
  return sourceText.match(pattern)?.length ?? 0;
}

function parseDeclarationArgs(sourceText: string) {
  const match = sourceText.match(/\b(?:indicator|strategy|library)\s*\(([^)]*)\)/i);
  return match?.[1] ?? "";
}

function parseQuotedTitle(args: string) {
  return args.match(/["']([^"']+)["']/)?.[1] ?? "未命名 Pine 策略";
}

function parseOverlay(args: string) {
  const match = args.match(/\boverlay\s*=\s*(true|false)/i);
  return match ? match[1].toLowerCase() === "true" : null;
}

function parsePineInputs(sourceText: string): PineStrategyInputDraft[] {
  const inputs: PineStrategyInputDraft[] = [];
  const pattern = /^\s*(\w+)\s*=\s*input(?:\.(\w+))?\s*\(([^)]*)\)/gim;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sourceText)) !== null) {
    const args = match[3] ?? "";
    inputs.push({
      key: match[1],
      type: match[2] ?? "any",
      label: args.match(/["']([^"']+)["']/)?.[1] ?? match[1],
    });
  }

  return inputs;
}

function findUnsupportedOrderCalls(sourceText: string) {
  return ["strategy.entry", "strategy.exit", "strategy.order", "strategy.close"].filter((call) => sourceText.includes(call));
}

function parseVisuals(sourceText: string): PineTranslationVisualIR[] {
  const visuals: PineTranslationVisualIR[] = [];
  const pattern = /\b(plot|plotshape|plotchar|plotbar|plotcandle)\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sourceText)) !== null) {
    visuals.push({
      kind: match[1].toLowerCase() as PineTranslationVisualIR["kind"],
      expression: (match[2] ?? "").trim(),
    });
  }

  return visuals;
}

function parseAlerts(sourceText: string): PineTranslationAlertIR[] {
  const alerts: PineTranslationAlertIR[] = [];
  const pattern = /\balertcondition\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sourceText)) !== null) {
    const args = match[1] ?? "";
    alerts.push({
      condition: args.split(",")[0]?.trim() ?? "",
      title: args.match(/["']([^"']+)["']/)?.[1] ?? "未命名告警",
    });
  }

  return alerts;
}

export function preflightPineStrategySource(input: PineStrategyPreflightInput): PineStrategyPreflightResult {
  const sourceText = input.sourceText.trim();

  if (sourceText.length === 0) {
    return {
      ok: false,
      error: {
        code: "EMPTY_SOURCE",
        message: "请粘贴 Pine Script 源码后再进行预检。",
      },
    };
  }

  const version = sourceText.match(/\/\/@version\s*=\s*(\d+)/i)?.[1] ?? null;
  const declarationMatch = sourceText.match(/\b(indicator|strategy|library)\s*\(/i);
  const declaration = (declarationMatch?.[1]?.toLowerCase() as PineStrategyDeclaration | undefined) ?? "unknown";
  const declarationArgs = parseDeclarationArgs(sourceText);
  const inputs = parsePineInputs(sourceText);

  if (!version && declaration === "unknown") {
    return {
      ok: false,
      error: {
        code: "NOT_PINE_SCRIPT",
        message: "未识别到 Pine Script 版本或 indicator/strategy/library 声明。",
      },
    };
  }

  const warnings: string[] = [];
  const unsupportedOrderCalls = findUnsupportedOrderCalls(sourceText);

  if (unsupportedOrderCalls.length > 0) {
    warnings.push(`检测到暂不支持的交易下单调用：${unsupportedOrderCalls.join(" / ")}。`);
  }

  if (declaration === "library") {
    warnings.push("library 脚本不能直接作为可运行策略导入。");
  }

  const reasons = [...warnings];
  const translationStatus: PineStrategyTranslationStatus =
    declaration === "library" ? "unsupported" : unsupportedOrderCalls.length > 0 ? "manual-review" : "ready";

  return {
    ok: true,
    summary: {
      fileName: input.fileName.trim() || "未命名 Pine 策略",
      title: parseQuotedTitle(declarationArgs),
      version,
      declaration,
      overlay: parseOverlay(declarationArgs),
      lineCount: sourceText.split(/\r?\n/).length,
      inputCount: inputs.length || countMatches(sourceText, /\binput(?:\.\w+)?\s*\(/gi),
      plotCount: countMatches(sourceText, /\b(?:plot|plotshape|plotchar|plotbar|plotcandle)\s*\(/gi),
      alertCount: countMatches(sourceText, /\balertcondition\s*\(/gi),
      inputs,
      canCreateDraft: translationStatus === "ready",
      translationPlan: {
        status: translationStatus,
        reasons: reasons.length > 0 ? reasons : ["可进入用户策略草稿，等待后续 Pine 子集转译。"],
      },
      warnings,
    },
  };
}

export function createPineTranslationPlan(input: PineStrategyPreflightInput): PineTranslationPlanResult {
  const preflight = preflightPineStrategySource(input);

  if (!preflight.ok) {
    return preflight;
  }

  const sourceText = input.sourceText.trim();

  return {
    ok: true,
    plan: {
      status: preflight.summary.translationPlan.status,
      reasons: preflight.summary.translationPlan.reasons,
      ir: {
        fileName: preflight.summary.fileName,
        declaration: {
          type: preflight.summary.declaration,
          title: preflight.summary.title,
          overlay: preflight.summary.overlay,
          version: preflight.summary.version,
        },
        inputs: preflight.summary.inputs,
        visuals: parseVisuals(sourceText),
        alerts: parseAlerts(sourceText),
        unsupportedCalls: findUnsupportedOrderCalls(sourceText),
      },
    },
  };
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

function averageTrueRange(bars: Bar[], period: number, endIndex: number) {
  const startIndex = Math.max(0, endIndex - period + 1);
  const window = bars.slice(startIndex, endIndex + 1);

  if (window.length === 0) {
    return 0;
  }

  return (
    window.reduce((total, bar, index) => {
      const previousBar = bars[startIndex + index - 1];
      const previousClose = previousBar?.close ?? bar.close;
      const trueRange = Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
      return total + Math.max(0, trueRange);
    }, 0) / window.length
  );
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
  const supertrendFactor = getPositiveNumberParameter(input.parameters, "supertrendFactor", 12);
  const supertrendAtrPeriod = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "supertrendAtrPeriod", 90)));
  const wmaLength = Math.max(2, Math.round(getPositiveNumberParameter(input.parameters, "wmaLength", 40)));
  const emaLength = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "emaLength", 14)));
  const confirmationCount = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "confirmationCount", 3)));
  const showTargets = getBooleanParameter(input.parameters, "showTargets", true);
  const atrPeriod = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "atrPeriod", 14)));
  const stopLossAtrMultiplier = getPositiveNumberParameter(input.parameters, "stopLossAtrMultiplier", 5);
  const targetOneMultiplier = getPositiveNumberParameter(input.parameters, "targetOneMultiplier", 0.5);
  const targetTwoMultiplier = getPositiveNumberParameter(input.parameters, "targetTwoMultiplier", 1);
  const targetThreeMultiplier = getPositiveNumberParameter(input.parameters, "targetThreeMultiplier", 1.5);
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

  const trendLength = Math.max(2, Math.round((wmaLength + emaLength) / 2));
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

    const comparisonBars = input.bars.slice(Math.max(0, index - wmaLength), index);
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
  const riskRange = Math.max(0.01, averageTrueRange(input.bars, atrPeriod, projectionIndex));
  const entryPrice = projectionBar.close;
  const stopDistance = riskRange * stopLossAtrMultiplier;
  const stopPrice = setupSide === "buy" ? projectionBar.low - stopDistance : projectionBar.high + stopDistance;
  const riskDistance = Math.abs(entryPrice - stopPrice);
  const targetOne = setupSide === "buy" ? entryPrice + riskDistance * targetOneMultiplier : entryPrice - riskDistance * targetOneMultiplier;
  const targetTwo = setupSide === "buy" ? entryPrice + riskDistance * targetTwoMultiplier : entryPrice - riskDistance * targetTwoMultiplier;
  const targetThree = setupSide === "buy" ? entryPrice + riskDistance * targetThreeMultiplier : entryPrice - riskDistance * targetThreeMultiplier;
  const projectionStart = projectionBar.timestamp;

  elements.push(
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
  );

  if (showTargets) {
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
        id: "trend-targets-target-1",
        kind: "price-line",
        price: targetOne,
        label: `✓ 目标1 ▸ ${targetOne.toFixed(2)}`,
        tone: "target",
        fromTimestamp: projectionStart,
      },
      {
        id: "trend-targets-target-2",
        kind: "price-line",
        price: targetTwo,
        label: `✓ 目标2 ▸ ${targetTwo.toFixed(2)}`,
        tone: "target",
        fromTimestamp: projectionStart,
      },
      {
        id: "trend-targets-target-3",
        kind: "price-line",
        price: targetThree,
        label: `✓ 目标3 ▸ ${targetThree.toFixed(2)}`,
        tone: "target",
        fromTimestamp: projectionStart,
      },
    );
  }

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
      averageTrueRange: riskRange,
      supertrendFactor,
      supertrendAtrPeriod,
      confirmationCount,
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
        key: "supertrendFactor",
        label: "Supertrend 因子",
        type: "number",
        defaultValue: 12,
        description: "保留自 Pine Script 的趋势带宽参数，完整 Supertrend 复刻时将用于趋势带计算。",
      },
      {
        key: "supertrendAtrPeriod",
        label: "Supertrend ATR 周期",
        type: "number",
        defaultValue: 90,
        description: "保留自 Pine Script 的 Supertrend ATR 周期。",
      },
      {
        key: "wmaLength",
        label: "WMA 长度",
        type: "number",
        defaultValue: 40,
        description: "用于当前最小转译的趋势窗口。",
      },
      {
        key: "emaLength",
        label: "EMA 长度",
        type: "number",
        defaultValue: 14,
        description: "用于估算趋势线平滑长度。",
      },
      {
        key: "confirmationCount",
        label: "确认次数",
        type: "number",
        defaultValue: 3,
        description: "保留自 Pine Script 的拒绝信号确认次数。",
      },
      {
        key: "showTargets",
        label: "显示止盈水平",
        type: "boolean",
        defaultValue: true,
      },
      {
        key: "atrPeriod",
        label: "波动率 ATR 周期",
        type: "number",
        defaultValue: 14,
      },
      {
        key: "stopLossAtrMultiplier",
        label: "止损 ATR 倍数",
        type: "number",
        defaultValue: 5,
      },
      {
        key: "targetOneMultiplier",
        label: "目标1 倍数",
        type: "number",
        defaultValue: 0.5,
      },
      {
        key: "targetTwoMultiplier",
        label: "目标2 倍数",
        type: "number",
        defaultValue: 1,
      },
      {
        key: "targetThreeMultiplier",
        label: "目标3 倍数",
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
