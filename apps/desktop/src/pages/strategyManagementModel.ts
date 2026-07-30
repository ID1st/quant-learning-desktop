import {
  createPresetStrategyRegistry,
  type BacktestSettings,
  type StrategyParameterDefinition,
} from "@quant/strategy-engine";
import type { Market, Timeframe } from "@quant/shared";

export type StrategyFilter = "all" | "enabled" | "disabled";

export const presetRegistry = createPresetStrategyRegistry();
export const strategyPreviewSymbol = {
  symbol: "AAPL.US",
  displaySymbol: "AAPL",
  market: "US" as const,
};
export const strategyPreviewTimeframe: Timeframe = "realtime";

export interface BacktestContext {
  id: string;
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  barCount: number;
}

export const defaultBacktestSettings: BacktestSettings = {
  initialCapital: 100_000,
  feeRate: 0.0005,
  slippageRate: 0.0005,
  allowShort: false,
};

export const samplePineSource = `//@version=5
indicator("用户策略示例", overlay=true)
length = input.int(20, "均线长度")
basis = ta.sma(close, length)
plot(basis)
alertcondition(close > basis, "上穿均线")
`;

export function formatTranslationStatus(status: string) {
  if (status === "ready") {
    return "待转译";
  }

  if (status === "manual-review") {
    return "需人工复核";
  }

  return "暂不支持";
}

export function formatDeclaration(type: string) {
  if (type === "strategy") {
    return "策略脚本";
  }

  if (type === "indicator") {
    return "指标脚本";
  }

  return "Pine 脚本";
}

export function formatOverlay(overlay: boolean | null) {
  if (overlay === null) {
    return "未声明";
  }

  return overlay ? "是" : "否";
}

export function coerceParameterValue(
  parameter: StrategyParameterDefinition,
  value: string | boolean,
) {
  if (parameter.type === "boolean") {
    return Boolean(value);
  }

  if (parameter.type === "number") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  return String(value);
}

export function createBacktestContextId(
  context: Pick<BacktestContext, "symbol" | "market" | "timeframe">,
) {
  return `${context.market}:${context.symbol}:${context.timeframe}`;
}

export function formatBacktestTimeframe(timeframe: Timeframe) {
  return timeframe === "realtime" ? "分时" : timeframe;
}

export function formatBacktestNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

export function formatBacktestPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatBacktestDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  }).format(new Date(value));
}
