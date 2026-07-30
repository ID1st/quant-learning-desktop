import { sma } from "@quant/pine-runtime";
import type { Market, Timeframe } from "@quant/shared";
import type {
  StrategyDefinition,
  StrategyInput,
  StrategyParameterDefinition,
  StrategySignal,
  StrategyVisualElement,
} from "./contracts.ts";

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
  return ["strategy.entry", "strategy.exit", "strategy.order", "strategy.close"].filter((call) =>
    sourceText.includes(call),
  );
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

function parseInputDefaultValue(
  input: PineStrategyInputDraft,
  sourceText: string,
): number | boolean | string {
  const pattern = new RegExp(
    `^\\s*${input.key}\\s*=\\s*input(?:\\.${input.type})?\\s*\\(([^)]*)\\)`,
    "im",
  );
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

function mapPineInputToParameter(
  input: PineStrategyInputDraft,
  sourceText: string,
): StrategyParameterDefinition {
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

export function preflightPineStrategySource(
  input: PineStrategyPreflightInput,
): PineStrategyPreflightResult {
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
  const declaration =
    (declarationMatch?.[1]?.toLowerCase() as PineStrategyDeclaration | undefined) ?? "unknown";
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
    warnings.push(
      `Unsupported Pine statements require manual review: ${unsupportedStatements.join(" / ")}`,
    );
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
      plotCount: countMatches(
        sourceText,
        /\b(?:plot|plotshape|plotchar|plotbar|plotcandle)\s*\(/gi,
      ),
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

export function createPineTranslationPlan(
  input: PineStrategyPreflightInput,
): PineTranslationPlanResult {
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
        unsupportedCalls: [
          ...findUnsupportedOrderCalls(sourceText),
          ...findUnsupportedPineStatements(sourceText),
        ],
      },
    },
  };
}

export function createUserStrategyDraftDefinition(
  input: PineStrategyPreflightInput,
): UserStrategyDraftDefinitionResult {
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

function resolveNumericToken(
  token: string,
  draft: UserStrategyDraftDefinition,
  input: StrategyInput,
): number | null {
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

    if (
      leftValue === null ||
      rightValue === null ||
      leftValue === undefined ||
      rightValue === undefined
    ) {
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

export function createRunnableUserStrategyDefinition(
  draft: UserStrategyDraftDefinition,
): RunnableUserStrategyDefinitionResult {
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

        seriesByKey.set(
          "open",
          input.bars.map((bar) => bar.open),
        );
        seriesByKey.set(
          "high",
          input.bars.map((bar) => bar.high),
        );
        seriesByKey.set(
          "low",
          input.bars.map((bar) => bar.low),
        );
        seriesByKey.set(
          "close",
          input.bars.map((bar) => bar.close),
        );
        seriesByKey.set(
          "volume",
          input.bars.map((bar) => bar.volume),
        );

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
