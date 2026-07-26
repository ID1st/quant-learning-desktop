import { crossover, crossunder, ema, sma, wma } from "@quant/pine-runtime";
import type { Market, Timeframe } from "@quant/shared";
import { createMachineLearningPriceTargetsStrategyDefinition } from "./machineLearningPriceTargets.ts";
import { createSmartMoneyConceptsStrategyDefinition } from "./smartMoneyConcepts.ts";

export * from "./backtest.ts";
export { createMachineLearningPriceTargetsStrategyDefinition } from "./machineLearningPriceTargets.ts";
export { createMachineLearningPriceTargetsVisualFixture } from "./machineLearningPriceTargetsVisualFixture.ts";
export { createSmcVisualFixture } from "./smartMoneyConceptsVisualFixture.ts";

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
  type: "number" | "boolean" | "select" | "color";
  defaultValue: number | boolean | string;
  description?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface StrategyInput {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  bars: Bar[];
  seriesByTimeframe?: Partial<Record<Timeframe, readonly Bar[]>>;
  confirmedThroughTimestamp?: number;
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
  seriesByTimeframe?: Partial<Record<Timeframe, readonly Bar[]>>;
  confirmedThroughTimestamp?: number;
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
  backtestAction?: "enter-long" | "enter-short" | "exit-long" | "exit-short" | "none";
  price?: number;
  label?: string;
}

export interface StrategyVisualBase {
  id: string;
  visible?: boolean;
  zIndex?: number;
  color?: string;
  opacity?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  textSize?: "tiny" | "small" | "normal" | "large";
  labelAnchor?: "above" | "below" | "center" | "right";
  extendRight?: boolean;
  placement?: "under-candles" | "over-candles";
}

export interface StrategySignalMarker extends StrategyVisualBase {
  kind: "signal-marker";
  timestamp: number;
  price: number;
  direction: "up" | "down";
  tone: "buy" | "sell" | "neutral";
  shape?: "triangle" | "label-up" | "label-down";
  text?: string;
}

export interface StrategyPriceLine extends StrategyVisualBase {
  kind: "price-line";
  price: number;
  label?: string;
  tone: "target" | "stop" | "range" | "neutral";
  fromTimestamp?: number;
  toTimestamp?: number;
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
  toTimestamp?: number;
  fillColor?: string;
  borderColor?: string;
}

export interface StrategyLabel extends StrategyVisualBase {
  kind: "label";
  timestamp: number;
  price: number;
  text: string;
  tone: "info" | "warning" | "success";
}

export interface StrategyCandleStyle extends StrategyVisualBase {
  kind: "candle-style";
  timestamp: number;
  color: string;
}

export type StrategyVisualElement =
  | StrategySignalMarker
  | StrategyPriceLine
  | StrategyTrendLine
  | StrategyBand
  | StrategyLabel
  | StrategyCandleStyle;

export interface StrategyHudPanel {
  id: string;
  title: string;
  valueHeading?: string;
  placement: "top-right";
  rows: Array<{
    id: string;
    label: string;
    value: string;
    tone?: "neutral" | "positive" | "negative" | "muted";
  }>;
}

export interface StrategyRenderOutput {
  strategyId: string;
  strategyName: string;
  enabled: boolean;
  zIndex: number;
  elements: StrategyVisualElement[];
  hudPanels?: StrategyHudPanel[];
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
  strategyType?: "indicator" | "strategy";
  defaultEnabled?: boolean;
  supportedMarkets: Market[];
  supportedTimeframes: Timeframe[];
  realtimeHistoryRequirement?: {
    minimumBars: number;
    preferredBars: number;
    sessionCount: number;
  };
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

export interface PineTranslationCalculationIR {
  key: string;
  expression: string;
}

export interface PineTranslationIR {
  fileName: string;
  declaration: PineTranslationDeclarationIR;
  inputs: PineStrategyInputDraft[];
  calculations: PineTranslationCalculationIR[];
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

export interface UserStrategyDraftDefinition {
  key: string;
  name: string;
  version: string;
  description: string;
  sourceType: "user";
  sourceFile: string;
  runnable: false;
  supportedMarkets: Market[];
  supportedTimeframes: Timeframe[];
  parameterSchema: StrategyParameterDefinition[];
  translation: PineTranslationPlanOutput;
}

export type UserStrategyDraftDefinitionResult =
  | {
      ok: true;
      draft: UserStrategyDraftDefinition;
    }
  | {
      ok: false;
      error: PineStrategyPreflightError;
    };

export type RunnableUserStrategyErrorCode = "DRAFT_NOT_READY" | "UNSUPPORTED_SUBSET";

export interface RunnableUserStrategyError {
  code: RunnableUserStrategyErrorCode;
  message: string;
  details: string[];
}

export type RunnableUserStrategyDefinitionResult =
  | {
      ok: true;
      strategy: StrategyDefinition;
    }
  | {
      ok: false;
      error: RunnableUserStrategyError;
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

function findUnsupportedPineStatements(sourceText: string) {
  const supportedStatements = [
    /^(?:indicator|strategy|library)\s*\(.+\)$/i,
    /^\w+\s*=\s*input(?:\.\w+)?\s*\(.+\)$/i,
    /^\w+\s*=\s*ta\.sma\s*\(.+\)$/i,
    /^(?:plot|plotshape|plotchar|plotbar|plotcandle)\s*\(.+\)$/i,
    /^alertcondition\s*\(.+\)$/i,
    /^strategy\.(?:entry|exit|order|close)\s*\(.+\)$/i,
  ];

  return sourceText.split(/\r?\n/).flatMap((sourceLine, index) => {
    const line = sourceLine.replace(/\/\/.*$/u, "").trim();
    if (!line || supportedStatements.some((pattern) => pattern.test(line))) {
      return [];
    }
    return [`line ${index + 1}: ${line.slice(0, 160)}`];
  });
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

function parseCalculations(sourceText: string): PineTranslationCalculationIR[] {
  const calculations: PineTranslationCalculationIR[] = [];
  const pattern = /^\s*(\w+)\s*=\s*(ta\.(?:sma)\s*\([^)]*\))\s*$/gim;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sourceText)) !== null) {
    calculations.push({
      key: match[1],
      expression: match[2].replace(/\s+/g, " ").trim(),
    });
  }

  return calculations;
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

function createDraftKey(title: string) {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return `user-${normalized || "pine-strategy"}`;
}

function parseInputDefaultValue(input: PineStrategyInputDraft, sourceText: string): number | boolean | string {
  const pattern = new RegExp(`^\\s*${input.key}\\s*=\\s*input(?:\\.${input.type})?\\s*\\(([^)]*)\\)`, "im");
  const args = sourceText.match(pattern)?.[1] ?? "";
  const firstArg = args.split(",")[0]?.trim() ?? "";

  if (input.type === "bool") {
    return firstArg.toLowerCase() === "true";
  }

  if (["int", "float"].includes(input.type)) {
    const value = Number(firstArg);
    return Number.isFinite(value) ? value : 0;
  }

  return firstArg.replace(/^["']|["']$/g, "") || "";
}

function mapPineInputToParameter(input: PineStrategyInputDraft, sourceText: string): StrategyParameterDefinition {
  const isNumber = ["int", "float"].includes(input.type);
  const isBoolean = input.type === "bool";

  return {
    key: input.key,
    label: input.label,
    type: isNumber ? "number" : isBoolean ? "boolean" : "select",
    defaultValue: parseInputDefaultValue(input, sourceText),
    description: `从 Pine input.${input.type} 自动生成的草稿参数。`,
  };
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
  const unsupportedStatements = findUnsupportedPineStatements(sourceText);

  if (unsupportedOrderCalls.length > 0) {
    warnings.push(`检测到暂不支持的交易下单调用：${unsupportedOrderCalls.join(" / ")}。`);
  }

  if (unsupportedStatements.length > 0) {
    warnings.push(`Unsupported Pine statements require manual review: ${unsupportedStatements.join(" / ")}`);
  }

  if (declaration === "library") {
    warnings.push("library 脚本不能直接作为可运行策略导入。");
  }

  const reasons = [...warnings];
  const translationStatus: PineStrategyTranslationStatus =
    declaration === "library"
      ? "unsupported"
      : unsupportedOrderCalls.length > 0 || unsupportedStatements.length > 0
        ? "manual-review"
        : "ready";

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
        calculations: parseCalculations(sourceText),
        visuals: parseVisuals(sourceText),
        alerts: parseAlerts(sourceText),
        unsupportedCalls: [...findUnsupportedOrderCalls(sourceText), ...findUnsupportedPineStatements(sourceText)],
      },
    },
  };
}

export function createUserStrategyDraftDefinition(input: PineStrategyPreflightInput): UserStrategyDraftDefinitionResult {
  const translationPlan = createPineTranslationPlan(input);

  if (!translationPlan.ok) {
    return translationPlan;
  }

  const sourceText = input.sourceText.trim();
  const { ir } = translationPlan.plan;

  return {
    ok: true,
    draft: {
      key: createDraftKey(ir.declaration.title),
      name: ir.declaration.title,
      version: "0.0.0-draft",
      description: "由 Pine Script 导入生成的用户策略草稿，等待后续子集转译为可运行策略。",
      sourceType: "user",
      sourceFile: ir.fileName,
      runnable: false,
      supportedMarkets: ["US", "HK", "CN"],
      supportedTimeframes: ["realtime", "1m", "5m", "15m", "30m", "1h", "1d", "1w"],
      parameterSchema: ir.inputs.map((pineInput) => mapPineInputToParameter(pineInput, sourceText)),
      translation: translationPlan.plan,
    },
  };
}

function getBarSeries(input: StrategyInput, key: string): Array<number | null> | null {
  if (key === "open" || key === "high" || key === "low" || key === "close" || key === "volume") {
    return input.bars.map((bar) => bar[key]);
  }

  return null;
}

function resolveNumericToken(token: string, draft: UserStrategyDraftDefinition, input: StrategyInput): number | null {
  const normalized = token.trim();
  const literalValue = Number(normalized);

  if (Number.isFinite(literalValue)) {
    return literalValue;
  }

  const parameter = draft.parameterSchema.find((item) => item.key === normalized);
  const parameterValue = input.parameters[normalized] ?? parameter?.defaultValue;
  const numericValue = Number(parameterValue);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function evaluateCalculation(
  calculation: PineTranslationCalculationIR,
  draft: UserStrategyDraftDefinition,
  input: StrategyInput,
  seriesByKey: Map<string, Array<number | null>>,
): Array<number | null> | null {
  const smaMatch = calculation.expression.match(/^ta\.sma\s*\(\s*(\w+)\s*,\s*([^)]+)\)$/i);

  if (!smaMatch) {
    return null;
  }

  const sourceSeries = seriesByKey.get(smaMatch[1]) ?? getBarSeries(input, smaMatch[1]);
  const length = resolveNumericToken(smaMatch[2], draft, input);

  if (!sourceSeries || length === null || length <= 0) {
    return null;
  }

  return sma(sourceSeries, Math.max(1, Math.round(length)));
}

function evaluateSeriesToken(
  token: string,
  input: StrategyInput,
  seriesByKey: Map<string, Array<number | null>>,
): Array<number | null> | null {
  const normalized = token.trim();
  return seriesByKey.get(normalized) ?? getBarSeries(input, normalized);
}

function evaluateAlertCondition(
  condition: string,
  input: StrategyInput,
  seriesByKey: Map<string, Array<number | null>>,
): boolean[] | null {
  const match = condition.match(/^(\w+)\s*(>=|<=|>|<)\s*(\w+)$/);

  if (!match) {
    return null;
  }

  const leftSeries = evaluateSeriesToken(match[1], input, seriesByKey);
  const rightSeries = evaluateSeriesToken(match[3], input, seriesByKey);

  if (!leftSeries || !rightSeries) {
    return null;
  }

  return leftSeries.map((leftValue, index) => {
    const rightValue = rightSeries[index];

    if (leftValue === null || rightValue === null || leftValue === undefined || rightValue === undefined) {
      return false;
    }

    if (match[2] === ">") {
      return leftValue > rightValue;
    }

    if (match[2] === "<") {
      return leftValue < rightValue;
    }

    if (match[2] === ">=") {
      return leftValue >= rightValue;
    }

    return leftValue <= rightValue;
  });
}

function findRunnableSubsetIssues(draft: UserStrategyDraftDefinition) {
  const calculations = draft.translation.ir.calculations ?? [];
  const calculationKeys = new Set(calculations.map((calculation) => calculation.key));
  const builtinSeries = new Set(["open", "high", "low", "close", "volume"]);
  const issues: string[] = [];

  for (const calculation of calculations) {
    if (!/^ta\.sma\s*\(\s*\w+\s*,\s*[^)]+\)$/i.test(calculation.expression)) {
      issues.push(`不支持的计算表达式：${calculation.key} = ${calculation.expression}`);
    }
  }

  for (const visual of draft.translation.ir.visuals) {
    if (visual.kind !== "plot") {
      issues.push(`不支持的可视化声明：${visual.kind}`);
      continue;
    }

    const expression = visual.expression.split(",")[0]?.trim() ?? "";
    if (!builtinSeries.has(expression) && !calculationKeys.has(expression)) {
      issues.push(`plot 引用了不支持的表达式：${visual.expression}`);
    }
  }

  for (const alert of draft.translation.ir.alerts) {
    const match = alert.condition.match(/^(\w+)\s*(>=|<=|>|<)\s*(\w+)$/);

    if (!match) {
      issues.push(`不支持的告警条件：${alert.condition}`);
      continue;
    }

    for (const token of [match[1], match[3]]) {
      if (!builtinSeries.has(token) && !calculationKeys.has(token)) {
        issues.push(`告警条件引用了不支持的表达式：${token}`);
      }
    }
  }

  return issues;
}

export function createRunnableUserStrategyDefinition(draft: UserStrategyDraftDefinition): RunnableUserStrategyDefinitionResult {
  if (draft.translation.status !== "ready") {
    return {
      ok: false,
      error: {
        code: "DRAFT_NOT_READY",
        message: "用户策略草稿尚未进入可转译状态。",
        details: draft.translation.reasons,
      },
    };
  }

  const subsetIssues = findRunnableSubsetIssues(draft);
  if (subsetIssues.length > 0) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_SUBSET",
        message: "当前 Pine 子集暂不支持该草稿。",
        details: subsetIssues,
      },
    };
  }

  return {
    ok: true,
    strategy: {
      key: draft.key,
      name: draft.name,
      version: draft.version,
      description: draft.description,
      sourceType: "user",
      sourceFile: draft.sourceFile,
      supportedMarkets: draft.supportedMarkets,
      supportedTimeframes: draft.supportedTimeframes,
      parameterSchema: draft.parameterSchema,
      run(input) {
        const enabled = input.enabled ?? true;
        const seriesByKey = new Map<string, Array<number | null>>();

        seriesByKey.set("open", input.bars.map((bar) => bar.open));
        seriesByKey.set("high", input.bars.map((bar) => bar.high));
        seriesByKey.set("low", input.bars.map((bar) => bar.low));
        seriesByKey.set("close", input.bars.map((bar) => bar.close));
        seriesByKey.set("volume", input.bars.map((bar) => bar.volume));

        for (const calculation of draft.translation.ir.calculations ?? []) {
          const outputSeries = evaluateCalculation(calculation, draft, input, seriesByKey);
          if (outputSeries) {
            seriesByKey.set(calculation.key, outputSeries);
          }
        }

        const elements: StrategyVisualElement[] = [];
        draft.translation.ir.visuals.forEach((visual, visualIndex) => {
          const expression = visual.expression.split(",")[0]?.trim() ?? "";
          const series = evaluateSeriesToken(expression, input, seriesByKey);

          if (!series) {
            return;
          }

          const points = series.flatMap((price, index) =>
            price === null || price === undefined
              ? []
              : [
                  {
                    timestamp: input.bars[index].timestamp,
                    price,
                  },
                ],
          );

          elements.push({
            id: `${draft.key}-plot-${visualIndex}`,
            kind: "trend-line",
            points,
            tone: "neutral",
            visible: true,
            zIndex: 2,
          });
        });

        const signals: StrategySignal[] = [];
        for (const alert of draft.translation.ir.alerts) {
          const matches = evaluateAlertCondition(alert.condition, input, seriesByKey);
          if (!matches) {
            continue;
          }

          matches.forEach((matched, index) => {
            if (!matched) {
              return;
            }

            signals.push({
              timestamp: input.bars[index].timestamp,
              type: "alert",
              price: input.bars[index].close,
              label: alert.title,
            });
            elements.push({
              id: `${draft.key}-alert-${signals.length}`,
              kind: "signal-marker",
              timestamp: input.bars[index].timestamp,
              price: input.bars[index].close,
              direction: "up",
              tone: "neutral",
              visible: true,
              zIndex: 4,
            });
          });
        }

        return {
          signals: enabled ? signals : [],
          overlays: enabled ? elements : [],
          render: {
            strategyId: draft.key,
            strategyName: draft.name,
            enabled,
            zIndex: 20,
            elements: enabled ? elements : [],
          },
          metrics: {
            signalCount: enabled ? signals.length : 0,
            plotCount: draft.translation.ir.visuals.length,
          },
          logs: [`已按 Pine 最小子集运行用户策略：${draft.name}`],
          alerts: enabled ? signals.map((signal) => signal.label ?? "Pine alert") : [],
        };
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
    seriesByTimeframe: request.seriesByTimeframe,
    confirmedThroughTimestamp: request.confirmedThroughTimestamp,
    parameters: resolveStrategyParameters(strategy, request.parameters),
    runMode: request.runMode,
    enabled: request.enabled ?? strategy.defaultEnabled ?? true,
  };
}

export function runRegisteredStrategy(registry: StrategyRegistry, request: StrategyRunRequest): StrategyRunResult {
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

function getStringParameter(parameters: Record<string, unknown>, key: string, fallback: string) {
  const value = parameters[key];
  return typeof value === "string" ? value : fallback;
}

function getColorParameter(parameters: Record<string, unknown>, key: string, fallback: string) {
  const value = getStringParameter(parameters, key, fallback);
  return /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function wilderMovingAverage(values: readonly number[], period: number): Array<number | null> {
  const length = Math.max(1, Math.round(period));
  let previous: number | null = null;

  return values.map((value, index) => {
    if (previous === null) {
      const window = values.slice(index - length + 1, index + 1);
      if (window.length < length) {
        return null;
      }

      previous = window.reduce((total, item) => total + item, 0) / length;
      return previous;
    }

    previous = (previous * (length - 1) + value) / length;
    return previous;
  });
}

function pineAtr(bars: readonly Bar[], period: number): Array<number | null> {
  const trueRanges = bars.map((bar, index) => {
    const previousClose = bars[index - 1]?.close ?? bar.close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });

  return wilderMovingAverage(trueRanges, period);
}

function isSeriesNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const marketTimeZones: Record<Market, string> = {
  US: "America/New_York",
  HK: "Asia/Hong_Kong",
  CN: "Asia/Shanghai",
};
const zonedDateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getZonedDateParts(timestamp: number, timeZone: string): CalendarDate & { hour: number; minute: number } {
  let formatter = zonedDateFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    zonedDateFormatterCache.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function shiftCalendarDate(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function calendarDateKey(date: CalendarDate) {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function zonedDateTimeToTimestamp(date: CalendarDate, hour: number, minute: number, timeZone: string) {
  const desiredAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let timestamp = desiredAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getZonedDateParts(timestamp, timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const correction = desiredAsUtc - actualAsUtc;
    timestamp += correction;
    if (correction === 0) {
      break;
    }
  }
  return timestamp;
}

function runUtorbStrategy(strategy: StrategyDefinition, input: StrategyInput): StrategyOutput {
  const enabled = input.enabled ?? true;
  const sessionStartHour = Math.min(23, Math.max(0, Math.round(getNumberParameter(input.parameters, "sessionStartHour", 9))));
  const sessionStartMinute = Math.min(59, Math.max(0, Math.round(getNumberParameter(input.parameters, "sessionStartMinute", 30))));
  const openingRangeMinutes = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "openingRangeMinutes", 30)));
  const sessionDays = getStringParameter(input.parameters, "sessionDays", "1234567").replace(/[^1-7]/g, "") || "1234567";
  const timezoneMode = getStringParameter(input.parameters, "timezoneMode", "fixed-offset") === "market"
    ? "market"
    : "fixed-offset";
  const timezoneOffsetHours = Math.min(12, Math.max(-12, getNumberParameter(input.parameters, "timezoneOffsetHours", -5)));
  const sessionTimeZone = marketTimeZones[input.market];
  const rangeSource = getStringParameter(input.parameters, "rangeSource", "high-low") === "close" ? "close" : "high-low";
  const showTargets = getBooleanParameter(input.parameters, "showTargets", true);
  const showTargetLabels = getBooleanParameter(input.parameters, "showTargetLabels", true);
  const bullColor = getColorParameter(input.parameters, "bullColor", "#089981");
  const bearColor = getColorParameter(input.parameters, "bearColor", "#f23645");
  const neutralColor = getColorParameter(input.parameters, "neutralColor", "#5b9cf6");
  const backgroundTransparency = Math.min(100, Math.max(0, getNumberParameter(input.parameters, "backgroundTransparency", 85)));
  const signalLabelSize = getStringParameter(input.parameters, "signalLabelSize", "small");
  const signalTextSize: StrategyVisualBase["textSize"] =
    signalLabelSize === "tiny" || signalLabelSize === "small" || signalLabelSize === "large"
      ? signalLabelSize
      : "normal";
  const targetZoneOpacities = [5, 7.5, 2.5].map(
    (transparencyOffset) =>
      (100 - Math.min(100, Math.max(0, backgroundTransparency + transparencyOffset))) / 100,
  );
  const extensionType = getStringParameter(input.parameters, "extensionType", "multiples") === "fibonacci" ? "fibonacci" : "multiples";
  const extensionMultipliers = extensionType === "fibonacci"
    ? [0.382, 0.618, 1]
    : [
        Math.max(0, getNumberParameter(input.parameters, "extensionMultiplierOne", 1)),
        Math.max(0, getNumberParameter(input.parameters, "extensionMultiplierTwo", 2)),
        Math.max(0, getNumberParameter(input.parameters, "extensionMultiplierThree", 3)),
      ];
  const showVolumeProfile = getBooleanParameter(input.parameters, "showVolumeProfile", true);
  const volumeProfileRows = Math.min(50, Math.max(5, Math.round(getPositiveNumberParameter(input.parameters, "volumeProfileRows", 14))));
  const volumeProfileWidthPercent = Math.min(100, Math.max(1, getPositiveNumberParameter(input.parameters, "volumeProfileWidthPercent", 30)));
  const volumeProfileColor = getColorParameter(input.parameters, "volumeProfileColor", "#5b9cf6");
  const stopPlotting = getBooleanParameter(input.parameters, "stopPlotting", true);
  const plottingEndType = getStringParameter(input.parameters, "plottingEndType", "new-york-close");
  const manualEndHour = Math.min(23, Math.max(0, Math.round(getNumberParameter(input.parameters, "manualEndHour", 16))));
  const manualEndMinute = Math.min(59, Math.max(0, Math.round(getNumberParameter(input.parameters, "manualEndMinute", 0))));
  const plottingEndMinutes = plottingEndType === "london-close"
    ? 11 * 60 + 30
    : plottingEndType === "manual"
      ? manualEndHour * 60 + manualEndMinute
      : plottingEndType === "end-of-day"
        ? 23 * 60 + 59
        : 17 * 60;
  const showTrailingStop = getBooleanParameter(input.parameters, "showTrailingStop", false);
  const trailingStopAtrMultiplier = getPositiveNumberParameter(input.parameters, "trailingStopAtrMultiplier", 2);
  const trailingStopAtrPeriod = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "trailingStopAtrPeriod", 14)));
  const showOptimizer = getBooleanParameter(input.parameters, "showOptimizer", false);

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

  const bars = [...input.bars].sort((left, right) => left.timestamp - right.timestamp);
  const atr = pineAtr(bars, trailingStopAtrPeriod);
  const volumeAverage = sma(bars.map((bar) => bar.volume), 20);
  const elements: StrategyVisualElement[] = [];
  const signals: StrategySignal[] = [];
  const targetAlerts: string[] = [];
  const hour = 60 * 60 * 1000;
  const timezoneOffset = timezoneOffsetHours * hour;
  const sessionStartMinutes = sessionStartHour * 60 + sessionStartMinute;
  const openingRangeDuration = openingRangeMinutes * 60 * 1000;
  const optimizerMultipliers = [1, 1.5, 2, 2.5, 3];
  const optimizerProfits = optimizerMultipliers.map(() => 0);
  const optimizerStops: Array<number | null> = optimizerMultipliers.map(() => null);
  const optimizerDirections = optimizerMultipliers.map(() => 0);
  const targetHits = { upper: [0, 0, 0], lower: [0, 0, 0] };
  const sessionTargetReached = { upper: [false, false, false], lower: [false, false, false] };
  let totalSessions = 0;
  let sessionKey: number | null = null;
  let sessionStartTimestamp = 0;
  let sessionEndTimestamp = 0;
  let plottingEndTimestamp = 0;
  let openingRangeHigh = 0;
  let openingRangeLow = 0;
  let sessionEnded = false;
  let previousInSession = false;
  let canSignalUp = true;
  let canSignalDown = true;
  let activeDirection = 0;
  let entryPrice = 0;
  let trailStop: number | null = null;
  let totalTrailProfit = 0;
  let currentTrailPoints: Array<{ timestamp: number; price: number }> = [];
  let trailSegmentDirection = 0;
  let trailSegmentIndex = 0;
  let latestVolumeProfile = new Map<number, number>();
  let latestTickSize = 0.01;
  let lastSessionRendered: number | null = null;
  let lastLocalDayKey: number | null = null;
  let previousClose: number | null = null;
  let previousUpperTargetThree: number | null = null;
  let previousLowerTargetThree: number | null = null;

  const getSessionDate = (timestamp: number): CalendarDate => {
    if (timezoneMode === "market") {
      const { year, month, day: dayOfMonth } = getZonedDateParts(timestamp, sessionTimeZone);
      return { year, month, day: dayOfMonth };
    }
    const local = new Date(timestamp + timezoneOffset);
    return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate() };
  };

  const localDateTimeToTimestamp = (
    date: CalendarDate,
    localHour: number,
    localMinute: number,
    timeZone = sessionTimeZone,
  ) =>
    timezoneMode === "market"
      ? zonedDateTimeToTimestamp(date, localHour, localMinute, timeZone)
      : Date.UTC(date.year, date.month - 1, date.day, localHour, localMinute) - timezoneOffset;

  const getPlotEndTimestamp = (date: CalendarDate, start: number) => {
    let plotEnd: number;
    if (timezoneMode === "market" && plottingEndType === "new-york-close") {
      plotEnd = zonedDateTimeToTimestamp(date, 17, 0, "America/New_York");
    } else if (timezoneMode === "market" && plottingEndType === "london-close") {
      plotEnd = zonedDateTimeToTimestamp(date, 16, 30, "Europe/London");
    } else {
      plotEnd = localDateTimeToTimestamp(
        date,
        Math.floor(plottingEndMinutes / 60),
        plottingEndMinutes % 60,
      );
    }
    if (plotEnd <= start) {
      const nextDate = shiftCalendarDate(date, 1);
      if (timezoneMode === "market" && plottingEndType === "new-york-close") {
        return zonedDateTimeToTimestamp(nextDate, 17, 0, "America/New_York");
      }
      if (timezoneMode === "market" && plottingEndType === "london-close") {
        return zonedDateTimeToTimestamp(nextDate, 16, 30, "Europe/London");
      }
      return localDateTimeToTimestamp(
        nextDate,
        Math.floor(plottingEndMinutes / 60),
        plottingEndMinutes % 60,
      );
    }
    return plotEnd;
  };

  const getSessionWindow = (timestamp: number) => {
    const currentDate = getSessionDate(timestamp);
    for (const date of [currentDate, shiftCalendarDate(currentDate, -1)]) {
      const start = localDateTimeToTimestamp(date, sessionStartHour, sessionStartMinute);
      const end = start + openingRangeDuration;
      const pineDay = new Date(calendarDateKey(date)).getUTCDay() + 1;
      if (sessionDays.includes(String(pineDay)) && timestamp >= start && timestamp < end) {
        return {
          key: calendarDateKey(date),
          start,
          end,
          plotEnd: getPlotEndTimestamp(date, start),
        };
      }
    }
    return null;
  };

  const flushTrailSegment = () => {
    if (showTrailingStop && currentTrailPoints.length > 1) {
      elements.push({
        id: `utorb-trail-${trailSegmentIndex}`,
        kind: "trend-line",
        points: currentTrailPoints,
        tone: trailSegmentDirection > 0 ? "bullish" : "bearish",
        color: trailSegmentDirection > 0 ? bullColor : bearColor,
      });
      trailSegmentIndex += 1;
    }
    currentTrailPoints = [];
    trailSegmentDirection = 0;
  };

  const addSessionElements = () => {
    if (sessionKey === null || lastSessionRendered === sessionKey || openingRangeHigh <= openingRangeLow) return;
    const range = openingRangeHigh - openingRangeLow;
    const upper = extensionMultipliers.map((multiplier) => openingRangeHigh + range * multiplier);
    const lower = extensionMultipliers.map((multiplier) => openingRangeLow - range * multiplier);
    const key = String(sessionKey);

    elements.push(
      {
        id: `utorb-opening-range-high-${key}`,
        kind: "price-line",
        price: openingRangeHigh,
        tone: "range",
        color: neutralColor,
        fromTimestamp: sessionStartTimestamp,
        toTimestamp: plottingEndTimestamp,
      },
      {
        id: `utorb-opening-range-low-${key}`,
        kind: "price-line",
        price: openingRangeLow,
        tone: "range",
        color: neutralColor,
        fromTimestamp: sessionStartTimestamp,
        toTimestamp: plottingEndTimestamp,
      },
      {
        id: `utorb-opening-range-${key}`,
        kind: "band",
        fromPrice: openingRangeLow,
        toPrice: openingRangeHigh,
        tone: "range",
        fillColor: neutralColor,
        borderColor: neutralColor,
        opacity: (100 - backgroundTransparency) / 100,
        fromTimestamp: sessionStartTimestamp,
        toTimestamp: plottingEndTimestamp,
      },
    );

    if (showTargets) {
      upper.forEach((price, index) => {
        elements.push(
          {
            id: `utorb-target-zone-up-${index + 1}-${key}`,
            kind: "band",
            fromPrice: index === 0 ? openingRangeHigh : upper[index - 1],
            toPrice: price,
            tone: "target",
            fillColor: bullColor,
            borderColor: bullColor,
            opacity: targetZoneOpacities[index],
            fromTimestamp: sessionStartTimestamp,
            toTimestamp: plottingEndTimestamp,
          },
          {
            id: `utorb-target-up-${index + 1}-${key}`,
            kind: "price-line",
            price,
            tone: "target",
            color: bullColor,
            fromTimestamp: sessionStartTimestamp,
            toTimestamp: plottingEndTimestamp,
          },
        );
      });
      lower.forEach((price, index) => {
        elements.push(
          {
            id: `utorb-target-zone-down-${index + 1}-${key}`,
            kind: "band",
            fromPrice: index === 0 ? openingRangeLow : lower[index - 1],
            toPrice: price,
            tone: "risk",
            fillColor: bearColor,
            borderColor: bearColor,
            opacity: targetZoneOpacities[index],
            fromTimestamp: sessionStartTimestamp,
            toTimestamp: plottingEndTimestamp,
          },
          {
            id: `utorb-target-down-${index + 1}-${key}`,
            kind: "price-line",
            price,
            tone: "stop",
            color: bearColor,
            fromTimestamp: sessionStartTimestamp,
            toTimestamp: plottingEndTimestamp,
          },
        );
      });
    }

    lastSessionRendered = sessionKey;
  };

  bars.forEach((bar, index) => {
    const localDayKey = calendarDateKey(getSessionDate(bar.timestamp));
    if (lastLocalDayKey !== null && localDayKey !== lastLocalDayKey) {
      if (previousInSession && sessionKey !== null && openingRangeHigh > openingRangeLow) {
        totalSessions += 1;
      }
      addSessionElements();
      flushTrailSegment();
      sessionKey = null;
      sessionStartTimestamp = 0;
      sessionEndTimestamp = 0;
      plottingEndTimestamp = 0;
      openingRangeHigh = Number.NEGATIVE_INFINITY;
      openingRangeLow = Number.POSITIVE_INFINITY;
      sessionEnded = false;
      canSignalUp = true;
      canSignalDown = true;
      activeDirection = 0;
      entryPrice = 0;
      trailStop = null;
      latestVolumeProfile = new Map();
      latestTickSize = 0.01;
      sessionTargetReached.upper.fill(false);
      sessionTargetReached.lower.fill(false);
      optimizerStops.fill(null);
      optimizerDirections.fill(0);
      previousInSession = false;
      previousUpperTargetThree = null;
      previousLowerTargetThree = null;
    }
    lastLocalDayKey = localDayKey;

    const window = getSessionWindow(bar.timestamp);
    const inSession = window !== null;

    if (window && window.key !== sessionKey) {
      addSessionElements();
      flushTrailSegment();
      sessionKey = window.key;
      sessionStartTimestamp = window.start;
      sessionEndTimestamp = window.end;
      plottingEndTimestamp = window.plotEnd;
      openingRangeHigh = Number.NEGATIVE_INFINITY;
      openingRangeLow = Number.POSITIVE_INFINITY;
      sessionEnded = false;
      canSignalUp = true;
      canSignalDown = true;
      activeDirection = 0;
      trailStop = null;
      latestVolumeProfile = new Map();
      latestTickSize = 0.01;
      sessionTargetReached.upper.fill(false);
      sessionTargetReached.lower.fill(false);
      optimizerStops.fill(null);
      optimizerDirections.fill(0);
    }

    if (inSession) {
      const high = rangeSource === "close" ? Math.max(bar.open, bar.close) : bar.high;
      const low = rangeSource === "close" ? Math.min(bar.open, bar.close) : bar.low;
      openingRangeHigh = Math.max(openingRangeHigh, high);
      openingRangeLow = Math.min(openingRangeLow, low);
      const range = openingRangeHigh - openingRangeLow;
      if (range > 0) latestTickSize = Math.max(0.01, range / volumeProfileRows);
      const priceLevel = Math.round(bar.close / latestTickSize) * latestTickSize;
      latestVolumeProfile.set(priceLevel, (latestVolumeProfile.get(priceLevel) ?? 0) + bar.volume);
      canSignalUp = true;
      canSignalDown = true;
      activeDirection = 0;
      trailStop = null;
      flushTrailSegment();
    }

    if (!inSession && previousInSession && sessionKey !== null) {
      sessionEnded = true;
      totalSessions += 1;
      addSessionElements();
    }

    const hasRange = sessionKey !== null && Number.isFinite(openingRangeHigh) && Number.isFinite(openingRangeLow) && openingRangeHigh > openingRangeLow;
    const range = hasRange ? openingRangeHigh - openingRangeLow : 0;
    const upperTargets = extensionMultipliers.map((multiplier) => openingRangeHigh + range * multiplier);
    const lowerTargets = extensionMultipliers.map((multiplier) => openingRangeLow - range * multiplier);
    const displayAllowed = !stopPlotting || (sessionKey !== null && bar.timestamp >= sessionStartTimestamp && bar.timestamp <= plottingEndTimestamp);

    if (hasRange && previousClose !== null && previousUpperTargetThree !== null) {
      const crossedUpperTarget = (bar.close > upperTargets[2] && previousClose <= previousUpperTargetThree) ||
        (bar.close < upperTargets[2] && previousClose >= previousUpperTargetThree);
      if (crossedUpperTarget) targetAlerts.push(`最终向上目标已触及：${upperTargets[2].toFixed(2)}`);
    }
    if (hasRange && previousClose !== null && previousLowerTargetThree !== null) {
      const crossedLowerTarget = (bar.close > lowerTargets[2] && previousClose <= previousLowerTargetThree) ||
        (bar.close < lowerTargets[2] && previousClose >= previousLowerTargetThree);
      if (crossedLowerTarget) targetAlerts.push(`最终向下目标已触及：${lowerTargets[2].toFixed(2)}`);
    }

    if (sessionEnded && hasRange) {
      upperTargets.forEach((target, targetIndex) => {
        if (bar.high >= target && !sessionTargetReached.upper[targetIndex]) {
          targetHits.upper[targetIndex] += 1;
          sessionTargetReached.upper[targetIndex] = true;
        }
      });
      lowerTargets.forEach((target, targetIndex) => {
        if (bar.low <= target && !sessionTargetReached.lower[targetIndex]) {
          targetHits.lower[targetIndex] += 1;
          sessionTargetReached.lower[targetIndex] = true;
        }
      });
    }

    const breakoutUp = !inSession && sessionEnded && hasRange && displayAllowed && previousClose !== null && previousClose <= openingRangeHigh && bar.close > openingRangeHigh;
    const breakoutDown = !inSession && sessionEnded && hasRange && displayAllowed && previousClose !== null && previousClose >= openingRangeLow && bar.close < openingRangeLow;
    const highVolume = isSeriesNumber(volumeAverage[index]) && bar.volume > volumeAverage[index]!;
    const volumeSuffix = highVolume ? "（高量）" : "（低量）";
    const currentAtr = atr[index];

    if (breakoutUp && canSignalUp) {
      const label = `向上突破${volumeSuffix}`;
      signals.push({
        timestamp: bar.timestamp,
        type: "buy",
        backtestAction: activeDirection === 0 ? "enter-long" : "none",
        price: bar.close,
        label,
      });
      elements.push({
        id: `utorb-buy-${bar.timestamp}`,
        kind: "signal-marker",
        timestamp: bar.timestamp,
        price: bar.high,
        direction: "down",
        tone: "buy",
        shape: "label-down",
        text: label,
        textSize: signalTextSize,
        color: bullColor,
        placement: "over-candles",
      });
      canSignalUp = false;
      if (activeDirection === 0) {
        activeDirection = 1;
        entryPrice = openingRangeHigh;
        trailStop = isSeriesNumber(currentAtr) ? bar.low - currentAtr * trailingStopAtrMultiplier : null;
        optimizerMultipliers.forEach((multiplier, optimizerIndex) => {
          optimizerDirections[optimizerIndex] = 1;
          optimizerStops[optimizerIndex] = isSeriesNumber(currentAtr) ? bar.low - currentAtr * multiplier : null;
        });
      }
    }

    if (breakoutDown && canSignalDown) {
      const label = `向下突破${volumeSuffix}`;
      signals.push({
        timestamp: bar.timestamp,
        type: "sell",
        backtestAction: activeDirection === 0 ? "enter-short" : "none",
        price: bar.close,
        label,
      });
      elements.push({
        id: `utorb-sell-${bar.timestamp}`,
        kind: "signal-marker",
        timestamp: bar.timestamp,
        price: bar.low,
        direction: "up",
        tone: "sell",
        shape: "label-up",
        text: label,
        textSize: signalTextSize,
        color: bearColor,
        placement: "over-candles",
      });
      canSignalDown = false;
      if (activeDirection === 0) {
        activeDirection = -1;
        entryPrice = openingRangeLow;
        trailStop = isSeriesNumber(currentAtr) ? bar.high + currentAtr * trailingStopAtrMultiplier : null;
        optimizerMultipliers.forEach((multiplier, optimizerIndex) => {
          optimizerDirections[optimizerIndex] = -1;
          optimizerStops[optimizerIndex] = isSeriesNumber(currentAtr) ? bar.high + currentAtr * multiplier : null;
        });
      }
    }

    if (activeDirection !== 0 && isSeriesNumber(currentAtr)) {
      trailStop = activeDirection > 0
        ? Math.max(trailStop ?? bar.low - currentAtr * trailingStopAtrMultiplier, bar.low - currentAtr * trailingStopAtrMultiplier)
        : Math.min(trailStop ?? bar.high + currentAtr * trailingStopAtrMultiplier, bar.high + currentAtr * trailingStopAtrMultiplier);
      if (trailSegmentDirection !== activeDirection) {
        flushTrailSegment();
        trailSegmentDirection = activeDirection;
      }
      currentTrailPoints.push({ timestamp: bar.timestamp, price: trailStop });

      const stopped = activeDirection > 0 ? bar.close < trailStop : bar.close > trailStop;
      if (stopped || !displayAllowed) {
        const exitBacktestAction = activeDirection > 0 ? "exit-long" : "exit-short";
        totalTrailProfit += activeDirection > 0 ? bar.close - entryPrice : entryPrice - bar.close;
        signals.push({
          timestamp: bar.timestamp,
          type: "exit",
          backtestAction: exitBacktestAction,
          price: bar.close,
          label: "移动风险线失效",
        });
        elements.push({
          id: `utorb-exit-${bar.timestamp}`,
          kind: "signal-marker",
          timestamp: bar.timestamp,
          price: trailStop,
          direction: activeDirection > 0 ? "down" : "up",
          tone: "neutral",
        });
        activeDirection = 0;
        trailStop = null;
        flushTrailSegment();
      }
    }

    if (showOptimizer && isSeriesNumber(currentAtr)) {
      optimizerMultipliers.forEach((multiplier, optimizerIndex) => {
        const direction = optimizerDirections[optimizerIndex];
        if (direction === 0) return;
        const candidate = direction > 0 ? bar.low - currentAtr * multiplier : bar.high + currentAtr * multiplier;
        const nextStop = direction > 0
          ? Math.max(optimizerStops[optimizerIndex] ?? candidate, candidate)
          : Math.min(optimizerStops[optimizerIndex] ?? candidate, candidate);
        optimizerStops[optimizerIndex] = nextStop;
        const stopped = direction > 0 ? bar.close < nextStop : bar.close > nextStop;
        if (stopped || !displayAllowed) {
          optimizerProfits[optimizerIndex] += direction > 0 ? bar.close - entryPrice : entryPrice - bar.close;
          optimizerDirections[optimizerIndex] = 0;
        }
      });
    }

    previousInSession = inSession;
    previousClose = bar.close;
    previousUpperTargetThree = hasRange ? upperTargets[2] : null;
    previousLowerTargetThree = hasRange ? lowerTargets[2] : null;
  });

  addSessionElements();
  flushTrailSegment();

  if (showVolumeProfile && latestVolumeProfile.size > 0 && sessionKey !== null) {
    const maximumVolume = Math.max(...latestVolumeProfile.values());
    const maximumWidth = openingRangeDuration * (volumeProfileWidthPercent / 100);
    const profileEndTimestamp = bars.at(-1)!.timestamp;
    [...latestVolumeProfile.entries()].sort(([left], [right]) => left - right).forEach(([price, volume], index) => {
      const width = maximumWidth * (volume / Math.max(1, maximumVolume));
      elements.push({
        id: `utorb-volume-profile-${index}`,
        kind: "band",
        fromPrice: price - latestTickSize / 2,
        toPrice: price + latestTickSize / 2,
        label: volume === maximumVolume ? "POC" : undefined,
        tone: "range",
        fillColor: volumeProfileColor,
        borderColor: volumeProfileColor,
        opacity: volume === maximumVolume ? 0.72 : 0.42,
        fromTimestamp: profileEndTimestamp - width,
        toTimestamp: profileEndTimestamp,
      });
    });
  }

  const openingRange = Math.max(0, openingRangeHigh - openingRangeLow);
  const upperTargets = extensionMultipliers.map((multiplier) => openingRangeHigh + openingRange * multiplier);
  const lowerTargets = extensionMultipliers.map((multiplier) => openingRangeLow - openingRange * multiplier);
  const bestOptimizerIndex = optimizerProfits.reduce(
    (best, profit, index) => profit > optimizerProfits[best] ? index : best,
    0,
  );
  const hitRate = (hits: number) => totalSessions > 0 ? (hits / totalSessions) * 100 : 0;
  const latestSessionSuffix = sessionKey === null ? null : `-${sessionKey}`;
  elements.forEach((element) => {
    if (element.kind !== "price-line") return;
    const isLatestSession = latestSessionSuffix !== null && element.id.endsWith(latestSessionSuffix);
    if (!isLatestSession || !showTargetLabels) {
      element.label = undefined;
      return;
    }
    if (element.id.startsWith("utorb-opening-range-high-")) {
      element.label = "开盘高点";
      return;
    }
    if (element.id.startsWith("utorb-opening-range-low-")) {
      element.label = "开盘低点";
      return;
    }
    const targetMatch = /^utorb-target-(up|down)-([1-3])-/.exec(element.id);
    if (!targetMatch) return;
    const targetIndex = Number(targetMatch[2]) - 1;
    const hits = targetMatch[1] === "up" ? targetHits.upper[targetIndex] : targetHits.lower[targetIndex];
    element.label = `目标 ${targetIndex + 1} (${Math.round(hitRate(hits))}%)`;
  });

  const directionalSignalCount = signals.filter((signal) => signal.type === "buy" || signal.type === "sell").length;

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
      upperTargetOne: upperTargets[0],
      upperTargetTwo: upperTargets[1],
      upperTargetThree: upperTargets[2],
      lowerTargetOne: lowerTargets[0],
      lowerTargetTwo: lowerTargets[1],
      lowerTargetThree: lowerTargets[2],
      totalSessions,
      upperTargetOneHits: targetHits.upper[0],
      upperTargetTwoHits: targetHits.upper[1],
      upperTargetThreeHits: targetHits.upper[2],
      lowerTargetOneHits: targetHits.lower[0],
      lowerTargetTwoHits: targetHits.lower[1],
      lowerTargetThreeHits: targetHits.lower[2],
      upperTargetOneHitRate: hitRate(targetHits.upper[0]),
      upperTargetTwoHitRate: hitRate(targetHits.upper[1]),
      upperTargetThreeHitRate: hitRate(targetHits.upper[2]),
      lowerTargetOneHitRate: hitRate(targetHits.lower[0]),
      lowerTargetTwoHitRate: hitRate(targetHits.lower[1]),
      lowerTargetThreeHitRate: hitRate(targetHits.lower[2]),
      totalTrailingProfit: totalTrailProfit,
      bestTrailingStopMultiplier: optimizerMultipliers[bestOptimizerIndex],
      bestTrailingStopProfit: optimizerProfits[bestOptimizerIndex],
      signalCount: directionalSignalCount,
    },
    logs: [
      timezoneMode === "market"
        ? `UTORB 已按市场时区 ${sessionTimeZone} 追踪 ${totalSessions} 个开盘区间。`
        : `UTORB 已按 UTC${timezoneOffsetHours >= 0 ? "+" : ""}${timezoneOffsetHours} 追踪 ${totalSessions} 个开盘区间。`,
      `最新区间 ${openingRangeLow.toFixed(2)} - ${openingRangeHigh.toFixed(2)}，生成 ${directionalSignalCount} 个突破信号。`,
    ],
    alerts: [...signals.map((signal) => signal.label ?? signal.type), ...targetAlerts],
  };
}

function runTrendTargetsStrategy(strategy: StrategyDefinition, input: StrategyInput): StrategyOutput {
  const enabled = input.enabled ?? true;
  const supertrendFactor = getPositiveNumberParameter(input.parameters, "supertrendFactor", 12);
  const supertrendAtrPeriod = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "supertrendAtrPeriod", 90)));
  const wmaLength = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "wmaLength", 40)));
  const emaLength = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "emaLength", 14)));
  const confirmationCount = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "confirmationCount", 3)));
  const showTargets = getBooleanParameter(input.parameters, "showTargets", true);
  const atrPeriod = Math.max(1, Math.round(getPositiveNumberParameter(input.parameters, "atrPeriod", 14)));
  const stopLossAtrMultiplier = getPositiveNumberParameter(input.parameters, "stopLossAtrMultiplier", 5);
  const targetOneMultiplier = getPositiveNumberParameter(input.parameters, "targetOneMultiplier", 0.5);
  const targetTwoMultiplier = getPositiveNumberParameter(input.parameters, "targetTwoMultiplier", 1);
  const targetThreeMultiplier = getPositiveNumberParameter(input.parameters, "targetThreeMultiplier", 1.5);
  const showStopLoss = getBooleanParameter(input.parameters, "showStopLoss", true);
  const bullColor = getColorParameter(input.parameters, "bullColor", "#00ffbb");
  const bearColor = getColorParameter(input.parameters, "bearColor", "#ff1100");

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

  const bars = [...input.bars].sort((left, right) => left.timestamp - right.timestamp);
  const supertrendAtr = pineAtr(bars, supertrendAtrPeriod);
  const lowerBand: number[] = [];
  const upperBand: number[] = [];
  const midpoint: number[] = [];

  bars.forEach((bar, index) => {
    const atr = supertrendAtr[index];
    const source = (bar.high + bar.low) / 2;
    const rawLower = isSeriesNumber(atr) ? source - supertrendFactor * atr : null;
    const rawUpper = isSeriesNumber(atr) ? source + supertrendFactor * atr : null;
    const previousLower = lowerBand[index - 1] ?? 0;
    const previousUpper = upperBand[index - 1] ?? 0;
    const previousClose = bars[index - 1]?.close ?? bar.close;
    const nextLower = isSeriesNumber(rawLower) && (rawLower > previousLower || previousClose < previousLower)
      ? rawLower
      : previousLower;
    const nextUpper = isSeriesNumber(rawUpper) && (rawUpper < previousUpper || previousClose > previousUpper)
      ? rawUpper
      : previousUpper;

    lowerBand.push(nextLower);
    upperBand.push(nextUpper);
    midpoint.push((nextLower + nextUpper) / 2);
  });

  const baseline = ema(wma(midpoint, wmaLength), emaLength);
  const trend: number[] = [];
  const elements: StrategyVisualElement[] = [];
  const signals: StrategySignal[] = [];
  let currentTrend = 0;
  let rejectionCount = 0;
  type BaselineSegment = {
    tone: "bullish" | "bearish" | "neutral";
    points: Array<{ timestamp: number; price: number }>;
  };
  let baselineSegment: BaselineSegment | null = null;
  const baselineSegments: BaselineSegment[] = [];

  bars.forEach((bar, index) => {
    const value = baseline[index];
    const previousValue = baseline[index - 1];
    const previousPreviousValue = baseline[index - 2];
    const previousTrend = currentTrend;
    const turnedBullish = isSeriesNumber(value) && isSeriesNumber(previousValue) && isSeriesNumber(previousPreviousValue) &&
      value > previousValue && previousValue <= previousPreviousValue;
    const turnedBearish = isSeriesNumber(value) && isSeriesNumber(previousValue) && isSeriesNumber(previousPreviousValue) &&
      value < previousValue && previousValue >= previousPreviousValue;

    if (turnedBullish) currentTrend = 1;
    if (turnedBearish) currentTrend = -1;
    trend.push(currentTrend);
    elements.push({
      id: `trend-targets-candle-${bar.timestamp}`,
      kind: "candle-style",
      timestamp: bar.timestamp,
      color: currentTrend === 1 ? bullColor : bearColor,
      opacity: 0.5,
      placement: "over-candles",
    });

    if (isSeriesNumber(value)) {
      const tone = currentTrend > 0 ? "bullish" : currentTrend < 0 ? "bearish" : "neutral";
      const point = { timestamp: bar.timestamp, price: value };
      if (!baselineSegment || baselineSegment.tone !== tone) {
        const boundaryPoint = baselineSegment?.points.at(-1);
        baselineSegment = { tone, points: boundaryPoint ? [boundaryPoint, point] : [point] };
        baselineSegments.push(baselineSegment);
      } else {
        baselineSegment.points.push(point);
      }
    }

    const trendChanged = currentTrend !== previousTrend;
    if (previousTrend <= 0 && currentTrend > 0) {
      signals.push({ timestamp: bar.timestamp, type: "buy", price: bar.close, label: "向上趋势转变" });
      elements.push({
        id: `trend-targets-buy-${bar.timestamp}`,
        kind: "signal-marker",
        timestamp: bar.timestamp,
        price: isSeriesNumber(value) ? value : bar.low,
        direction: "up",
        tone: "buy",
        shape: "label-up",
        color: bullColor,
        placement: "over-candles",
      });
    } else if (previousTrend >= 0 && currentTrend < 0) {
      signals.push({ timestamp: bar.timestamp, type: "sell", price: bar.close, label: "向下趋势转变" });
      elements.push({
        id: `trend-targets-sell-${bar.timestamp}`,
        kind: "signal-marker",
        timestamp: bar.timestamp,
        price: isSeriesNumber(value) ? value : bar.high,
        direction: "down",
        tone: "sell",
        shape: "label-down",
        color: bearColor,
        placement: "over-candles",
      });
    }

    const rejected = isSeriesNumber(value) && currentTrend !== 0 && bar.high > value && bar.low < value;
    if (rejected) rejectionCount += 1;
    if (trendChanged || (!rejected && rejectionCount > 0)) rejectionCount = 0;

    if (rejectionCount > confirmationCount && isSeriesNumber(value)) {
      const bullish = currentTrend > 0;
      const label = bullish ? "向上拒绝确认" : "向下拒绝确认";
      signals.push({ timestamp: bar.timestamp, type: "alert", price: value, label });
      elements.push({
        id: `trend-targets-rejection-${bar.timestamp}`,
        kind: "signal-marker",
        timestamp: bar.timestamp,
        price: value,
        direction: bullish ? "up" : "down",
        tone: bullish ? "buy" : "sell",
        shape: "triangle",
        color: bullish ? bullColor : bearColor,
        placement: "over-candles",
      });
    }
  });

  baselineSegments.forEach((segment, index) => {
    if (segment.points.length > 1) {
      elements.unshift({
        id: `trend-targets-baseline-${index}`,
        kind: "trend-line",
        points: segment.points,
        tone: segment.tone,
        color: segment.tone === "bullish" ? bullColor : bearColor,
        opacity: 0.5,
      });
    }
  });

  const directionalSignals = signals.filter((signal) => signal.type === "buy" || signal.type === "sell");
  const latestSignal = directionalSignals[directionalSignals.length - 1];
  const latestSignalBar = latestSignal ? bars.find((bar) => bar.timestamp === latestSignal.timestamp) : undefined;
  const projectionIndex = latestSignalBar ? bars.indexOf(latestSignalBar) : -1;
  const volatility = pineAtr(bars, atrPeriod);
  const riskRange = projectionIndex >= 0 && isSeriesNumber(volatility[projectionIndex]) ? volatility[projectionIndex] : 0;
  const entryPrice = latestSignalBar?.close ?? 0;
  const setupSide = latestSignal?.type === "sell" ? "sell" : "buy";
  const stopPrice = latestSignalBar
    ? setupSide === "buy"
      ? latestSignalBar.low - riskRange * stopLossAtrMultiplier
      : latestSignalBar.high + riskRange * stopLossAtrMultiplier
    : 0;
  const riskDistance = Math.abs(entryPrice - stopPrice);
  const targetOne = setupSide === "buy" ? entryPrice + riskDistance * targetOneMultiplier : entryPrice - riskDistance * targetOneMultiplier;
  const targetTwo = setupSide === "buy" ? entryPrice + riskDistance * targetTwoMultiplier : entryPrice - riskDistance * targetTwoMultiplier;
  const targetThree = setupSide === "buy" ? entryPrice + riskDistance * targetThreeMultiplier : entryPrice - riskDistance * targetThreeMultiplier;
  const setupAlerts: string[] = [];
  const targetTouched = [false, false, false];
  let stopTouched = false;

  if (latestSignalBar && projectionIndex >= 0 && riskRange > 0) {
    let previousBar = latestSignalBar;
    bars.slice(projectionIndex + 1).forEach((bar) => {
      [targetOne, targetTwo, targetThree].forEach((target, targetIndex) => {
        const crossedUp = bar.close > target && previousBar.close <= target;
        if (crossedUp) {
          targetTouched[targetIndex] = true;
          setupAlerts.push(`目标${targetIndex + 1}已触及：${target.toFixed(2)}`);
        }
      });

      const crossedStopUp = bar.close > stopPrice && previousBar.close <= stopPrice;
      const crossedStopDown = bar.close < stopPrice && previousBar.close >= stopPrice;
      if (crossedStopUp) {
        stopTouched = true;
        setupAlerts.push("价格上穿风险线 - 潜在上行趋势");
      }
      if (crossedStopDown) {
        stopTouched = true;
        setupAlerts.push("价格下穿风险线 - 潜在下行趋势");
      }

      const rejectedBearish = bar.high > stopPrice && previousBar.high <= stopPrice && bar.close < stopPrice;
      const rejectedBullish = bar.low < stopPrice && previousBar.low >= stopPrice && bar.close > stopPrice;
      if (rejectedBearish) setupAlerts.push("价格在风险线被拒绝 - 向下拒绝信号");
      if (rejectedBullish) setupAlerts.push("价格在风险线被拒绝 - 向上拒绝信号");
      previousBar = bar;
    });
  }

  if (showTargets && latestSignalBar && riskRange > 0) {
    const projectionStart = latestSignalBar.timestamp;
    elements.push(
      {
        id: "trend-targets-risk-zone",
        kind: "band",
        fromPrice: Math.min(entryPrice, stopPrice),
        toPrice: Math.max(entryPrice, stopPrice),
        tone: "risk",
        fillColor: bearColor,
        borderColor: bearColor,
        opacity: 0.05,
        fromTimestamp: projectionStart,
      },
      {
        id: "trend-targets-entry",
        kind: "price-line",
        price: entryPrice,
        label: `入场 ▸ ${entryPrice.toFixed(2)}`,
        tone: "neutral",
        color: setupSide === "buy" ? bullColor : bearColor,
        fromTimestamp: projectionStart,
      },
      {
        id: "trend-targets-target-zone",
        kind: "band",
        fromPrice: Math.min(entryPrice, targetThree),
        toPrice: Math.max(entryPrice, targetThree),
        tone: "target",
        fillColor: bullColor,
        borderColor: bullColor,
        opacity: 0.05,
        fromTimestamp: projectionStart,
      },
      {
        id: "trend-targets-target-1",
        kind: "price-line",
        price: targetOne,
        label: `✓ 目标1 ▸ ${targetOne.toFixed(2)}`,
        tone: "target",
        color: bullColor,
        fromTimestamp: projectionStart,
      },
      {
        id: "trend-targets-target-2",
        kind: "price-line",
        price: targetTwo,
        label: `✓ 目标2 ▸ ${targetTwo.toFixed(2)}`,
        tone: "target",
        color: bullColor,
        fromTimestamp: projectionStart,
      },
      {
        id: "trend-targets-target-3",
        kind: "price-line",
        price: targetThree,
        label: `✓ 目标3 ▸ ${targetThree.toFixed(2)}`,
        tone: "target",
        color: bullColor,
        fromTimestamp: projectionStart,
      },
    );

    if (showStopLoss) {
      elements.push({
        id: "trend-targets-stop",
        kind: "price-line",
        price: stopPrice,
        label: `✕ 风险线 ▸ ${stopPrice.toFixed(2)}`,
        tone: "stop",
        color: bearColor,
        fromTimestamp: projectionStart,
      });
    }
  }

  const lastBaseline = [...baseline].reverse().find(isSeriesNumber) ?? 0;
  const previousBaseline = [...baseline.slice(0, -1)].reverse().find(isSeriesNumber) ?? lastBaseline;
  const slope = lastBaseline - previousBaseline;
  const direction = (trend[trend.length - 1] ?? 0) >= 0 ? "bullish" : "bearish";

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
      averageTrueRange: riskRange,
      baseline: lastBaseline,
      supertrendFactor,
      supertrendAtrPeriod,
      confirmationCount,
      entryPrice,
      stopPrice,
      targetOne,
      targetTwo,
      targetThree,
      targetOneTouched: targetTouched[0] ? 1 : 0,
      targetTwoTouched: targetTouched[1] ? 1 : 0,
      targetThreeTouched: targetTouched[2] ? 1 : 0,
      stopTouched: stopTouched ? 1 : 0,
      rejectionCount,
      signalCount: directionalSignals.length,
    },
    logs: [
      `Trend Targets 已生成 ${direction === "bullish" ? "上行" : "下行"}基准线和目标位。`,
      `当前信号参考 ${entryPrice.toFixed(2)}，风险线 ${stopPrice.toFixed(2)}，目标3 ${targetThree.toFixed(2)}。`,
    ],
    alerts: [...signals.map((signal) => signal.label ?? signal.type), ...setupAlerts],
  };
}

export function createPresetStrategyRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry();

  const utorbStrategy: StrategyDefinition = {
    key: "utorb",
    name: "UTORB 开盘区间突破",
    version: "1.0.0",
    description: "按 Pine Script 复刻的逐日开盘区间突破策略，包含扩展目标、量能分类、成交量分布与 ATR 移动风险线。",
    sourceType: "preset",
    sourceFile: "trading-strategies/utorb.md",
    supportedMarkets: ["US", "HK", "CN"],
    supportedTimeframes: ["realtime", "1m", "5m", "15m", "30m"],
    parameterSchema: [
      {
        key: "sessionStartHour",
        label: "开盘时（本地）",
        type: "number",
        defaultValue: 9,
        description: "开盘区间开始小时，按策略时区解释。",
      },
      {
        key: "sessionStartMinute",
        label: "开盘分（本地）",
        type: "number",
        defaultValue: 30,
      },
      {
        key: "openingRangeMinutes",
        label: "开盘区间分钟数",
        type: "number",
        defaultValue: 30,
        description: "对应 Pine 默认 09:30-10:00 的 30 分钟会话。",
      },
      {
        key: "sessionDays",
        label: "适用交易日",
        type: "select",
        defaultValue: "1234567",
        options: [
          { label: "每天", value: "1234567" },
          { label: "周一至周五", value: "23456" },
        ],
      },
      {
        key: "timezoneMode",
        label: "时区模式",
        type: "select",
        defaultValue: "fixed-offset",
        description: "固定偏移与原 Pine 默认 UTC-5 一致；也可切换为市场时区并自动处理夏令时。",
        options: [
          { label: "固定 UTC 偏移", value: "fixed-offset" },
          { label: "跟随市场（自动夏令时）", value: "market" },
        ],
      },
      {
        key: "timezoneOffsetHours",
        label: "时区 UTC 偏移",
        type: "number",
        defaultValue: -5,
        description: "与 Pine 的 UTC-5 默认时区一致；固定偏移，不自动切换夏令时。",
      },
      {
        key: "rangeSource",
        label: "区间来源",
        type: "select",
        defaultValue: "high-low",
        options: [
          { label: "最高/最低价", value: "high-low" },
          { label: "蜡烛实体", value: "close" },
        ],
      },
      {
        key: "showTargets",
        label: "显示扩展水平",
        type: "boolean",
        defaultValue: true,
      },
      { key: "showTargetLabels", label: "显示目标文字标签", type: "boolean", defaultValue: true },
      {
        key: "extensionType",
        label: "扩展类型",
        type: "select",
        defaultValue: "multiples",
        options: [
          { label: "倍数", value: "multiples" },
          { label: "斐波那契", value: "fibonacci" },
        ],
      },
      { key: "extensionMultiplierOne", label: "扩展倍数 1", type: "number", defaultValue: 1 },
      { key: "extensionMultiplierTwo", label: "扩展倍数 2", type: "number", defaultValue: 2 },
      { key: "extensionMultiplierThree", label: "扩展倍数 3", type: "number", defaultValue: 3 },
      { key: "bullColor", label: "多头颜色", type: "color", defaultValue: "#089981" },
      { key: "bearColor", label: "空头颜色", type: "color", defaultValue: "#f23645" },
      { key: "neutralColor", label: "区间颜色", type: "color", defaultValue: "#5b9cf6" },
      { key: "backgroundTransparency", label: "区域透明度", type: "number", defaultValue: 85 },
      {
        key: "signalLabelSize",
        label: "信号标签大小",
        type: "select",
        defaultValue: "small",
        options: [
          { label: "极小", value: "tiny" },
          { label: "小", value: "small" },
          { label: "中", value: "normal" },
          { label: "大", value: "large" },
        ],
      },
      { key: "showVolumeProfile", label: "显示成交量分布", type: "boolean", defaultValue: true },
      { key: "volumeProfileRows", label: "成交量分布行数", type: "number", defaultValue: 14 },
      { key: "volumeProfileWidthPercent", label: "成交量分布宽度 (%)", type: "number", defaultValue: 30 },
      { key: "volumeProfileColor", label: "成交量分布颜色", type: "color", defaultValue: "#5b9cf6" },
      { key: "stopPlotting", label: "限制绘制时长", type: "boolean", defaultValue: true },
      {
        key: "plottingEndType",
        label: "结束绘制于",
        type: "select",
        defaultValue: "new-york-close",
        options: [
          { label: "纽约收盘", value: "new-york-close" },
          { label: "伦敦收盘", value: "london-close" },
          { label: "手动时间", value: "manual" },
          { label: "当日结束", value: "end-of-day" },
        ],
      },
      { key: "manualEndHour", label: "手动结束小时", type: "number", defaultValue: 16 },
      { key: "manualEndMinute", label: "手动结束分钟", type: "number", defaultValue: 0 },
      { key: "showTrailingStop", label: "显示移动风险线", type: "boolean", defaultValue: false },
      { key: "trailingStopAtrMultiplier", label: "移动风险线 ATR 倍数", type: "number", defaultValue: 2 },
      { key: "trailingStopAtrPeriod", label: "移动风险线 ATR 周期", type: "number", defaultValue: 14 },
      { key: "showOptimizer", label: "计算风险线优化器", type: "boolean", defaultValue: false },
    ],
    run: (input) => runUtorbStrategy(utorbStrategy, input),
  };

  const trendTargetsStrategy: StrategyDefinition = {
    key: "trend-targets",
    name: "Trend Targets 趋势目标",
    version: "1.0.0",
    description: "按 Pine Script 复刻 Supertrend 中线、WMA/EMA 平滑、趋势转变、拒绝确认与 ATR 目标位。",
    sourceType: "preset",
    sourceFile: "trading-strategies/trend-targets.md",
    supportedMarkets: ["US", "HK", "CN"],
    supportedTimeframes: ["realtime", "15m", "30m", "1h", "1d"],
    parameterSchema: [
      {
        key: "supertrendFactor",
        label: "Supertrend 因子",
        type: "number",
        defaultValue: 12,
        description: "用于计算 Supertrend 上下轨带宽。",
      },
      {
        key: "supertrendAtrPeriod",
        label: "Supertrend ATR 周期",
        type: "number",
        defaultValue: 90,
        description: "计算 Supertrend 上下轨所用的 Wilder ATR 周期。",
      },
      {
        key: "wmaLength",
        label: "WMA 长度",
        type: "number",
        defaultValue: 40,
        description: "应用于 Supertrend 中点序列的加权移动平均长度。",
      },
      {
        key: "emaLength",
        label: "EMA 长度",
        type: "number",
        defaultValue: 14,
        description: "应用于 WMA 结果的指数移动平均长度。",
      },
      {
        key: "confirmationCount",
        label: "确认次数",
        type: "number",
        defaultValue: 3,
        description: "趋势线被连续穿越并拒绝后的确认门槛。",
      },
      {
        key: "showTargets",
        label: "显示目标水平",
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
        label: "风险线 ATR 倍数",
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
        label: "显示风险线",
        type: "boolean",
        defaultValue: true,
      },
      {
        key: "bullColor",
        label: "多头颜色",
        type: "color",
        defaultValue: "#00ffbb",
      },
      {
        key: "bearColor",
        label: "空头颜色",
        type: "color",
        defaultValue: "#ff1100",
      },
    ],
    run: (input) => runTrendTargetsStrategy(trendTargetsStrategy, input),
  };

  registry.register(utorbStrategy);
  registry.register(trendTargetsStrategy);
  registry.register(createSmartMoneyConceptsStrategyDefinition());
  registry.register(createMachineLearningPriceTargetsStrategyDefinition());

  return registry;
}

export function createEmptyStrategyRegistry(): StrategyRegistry {
  return new StrategyRegistry();
}
