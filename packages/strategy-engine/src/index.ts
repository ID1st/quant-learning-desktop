import { crossover, crossunder, ema, sma, wma } from "@quant/pine-runtime";
import type { Market, Timeframe } from "@quant/shared";

export * from "./backtest.ts";

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
        calculations: parseCalculations(sourceText),
        visuals: parseVisuals(sourceText),
        alerts: parseAlerts(sourceText),
        unsupportedCalls: findUnsupportedOrderCalls(sourceText),
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

  const supertrendAtr = pineAtr(input.bars, supertrendAtrPeriod);
  const lowerBand: number[] = [];
  const upperBand: number[] = [];
  const midpoint: number[] = [];

  input.bars.forEach((bar, index) => {
    const atr = supertrendAtr[index];
    const source = (bar.high + bar.low) / 2;
    const rawLower = isSeriesNumber(atr) ? source - supertrendFactor * atr : null;
    const rawUpper = isSeriesNumber(atr) ? source + supertrendFactor * atr : null;
    const previousLower = lowerBand[index - 1] ?? 0;
    const previousUpper = upperBand[index - 1] ?? 0;
    const previousClose = input.bars[index - 1]?.close ?? bar.close;
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

  input.bars.forEach((bar, index) => {
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
      signals.push({ timestamp: bar.timestamp, type: "buy", price: bar.close, label: "多头趋势转变" });
      elements.push({
        id: `trend-targets-buy-${bar.timestamp}`,
        kind: "signal-marker",
        timestamp: bar.timestamp,
        price: isSeriesNumber(value) ? value : bar.low,
        direction: "up",
        tone: "buy",
      });
    } else if (previousTrend >= 0 && currentTrend < 0) {
      signals.push({ timestamp: bar.timestamp, type: "sell", price: bar.close, label: "空头趋势转变" });
      elements.push({
        id: `trend-targets-sell-${bar.timestamp}`,
        kind: "signal-marker",
        timestamp: bar.timestamp,
        price: isSeriesNumber(value) ? value : bar.high,
        direction: "down",
        tone: "sell",
      });
    }

    const rejected = isSeriesNumber(value) && currentTrend !== 0 && bar.high > value && bar.low < value;
    if (rejected) rejectionCount += 1;
    if (trendChanged || (!rejected && rejectionCount > 0)) rejectionCount = 0;

    if (rejectionCount > confirmationCount && isSeriesNumber(value)) {
      const bullish = currentTrend > 0;
      const label = bullish ? "多头拒绝确认" : "空头拒绝确认";
      signals.push({ timestamp: bar.timestamp, type: "alert", price: value, label });
      elements.push({
        id: `trend-targets-rejection-${bar.timestamp}`,
        kind: "signal-marker",
        timestamp: bar.timestamp,
        price: value,
        direction: bullish ? "up" : "down",
        tone: "neutral",
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
      });
    }
  });

  const directionalSignals = signals.filter((signal) => signal.type === "buy" || signal.type === "sell");
  const latestSignal = directionalSignals[directionalSignals.length - 1];
  const latestSignalBar = latestSignal ? input.bars.find((bar) => bar.timestamp === latestSignal.timestamp) : undefined;
  const projectionIndex = latestSignalBar ? input.bars.indexOf(latestSignalBar) : -1;
  const volatility = pineAtr(input.bars, atrPeriod);
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

  if (showTargets && latestSignalBar && riskRange > 0) {
    const projectionStart = latestSignalBar.timestamp;
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
      rejectionCount,
      signalCount: directionalSignals.length,
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
    supportedTimeframes: ["realtime", "1m", "5m", "15m", "30m"],
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
    supportedTimeframes: ["realtime", "15m", "30m", "1h", "1d"],
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
