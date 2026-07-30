import type { Bar, StrategyInput, StrategySignal, StrategyVisualElement } from "./contracts.ts";

export const GREEN = "#089981";
export const RED = "#F23645";
export const BLUE = "#2157F3";
export const MONO_BULL = "#B2B5BE";
export const MONO_BEAR = "#5D606B";
export const MAX_OBJECTS = 500;

export type Direction = 1 | -1;
export type StructureScope = "internal" | "swing";

export interface PivotPoint {
  index: number;
  confirmationIndex: number;
  timestamp: number;
  price: number;
  side: "high" | "low";
  crossed: boolean;
}

export interface StructureState {
  high?: PivotPoint;
  low?: PivotPoint;
  previousHigh?: PivotPoint;
  previousLow?: PivotPoint;
  trend: -1 | 0 | 1;
}

export interface OrderBlock {
  id: string;
  scope: StructureScope;
  direction: Direction;
  createdIndex: number;
  fromTimestamp: number;
  fromPrice: number;
  toPrice: number;
}

export interface FairValueGap {
  id: string;
  direction: Direction;
  fromTimestamp: number;
  fromPrice: number;
  toPrice: number;
}

export interface SMCParameters {
  mode: "historical" | "present";
  style: "colored" | "monochrome";
  showTrendCandles: boolean;
  showInternalStructure: boolean;
  internalBullishDisplay: "all" | "bos" | "choch";
  internalBearishDisplay: "all" | "bos" | "choch";
  internalConfluenceFilter: boolean;
  internalStructureTextSize: "tiny" | "small" | "normal";
  showSwingStructure: boolean;
  swingBullishDisplay: "all" | "bos" | "choch";
  swingBearishDisplay: "all" | "bos" | "choch";
  swingStructureTextSize: "tiny" | "small" | "normal";
  showSwingPoints: boolean;
  showStrongWeakHighLow: boolean;
  swingLength: number;
  showInternalOrderBlocks: boolean;
  internalOrderBlockCount: number;
  showSwingOrderBlocks: boolean;
  swingOrderBlockCount: number;
  orderBlockFilter: "atr" | "cumulative-mean-range";
  orderBlockMitigation: "high-low" | "close";
  showEqualHighLow: boolean;
  equalHighLowLength: number;
  equalHighLowThreshold: number;
  equalHighLowTextSize: "tiny" | "small" | "normal";
  showFairValueGaps: boolean;
  fairValueGapAutoThreshold: boolean;
  fairValueGapTimeframe: "current" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
  fairValueGapExtend: number;
  showDailyLevels: boolean;
  showWeeklyLevels: boolean;
  showMonthlyLevels: boolean;
  showPremiumDiscountZones: boolean;
  internalBullishColor: string;
  internalBearishColor: string;
  swingBullishColor: string;
  swingBearishColor: string;
  internalBullishOrderBlockColor: string;
  internalBearishOrderBlockColor: string;
  swingBullishOrderBlockColor: string;
  swingBearishOrderBlockColor: string;
  bullishFairValueGapColor: string;
  bearishFairValueGapColor: string;
  dailyLevelsStyle: "solid" | "dashed" | "dotted";
  dailyLevelsColor: string;
  weeklyLevelsStyle: "solid" | "dashed" | "dotted";
  weeklyLevelsColor: string;
  monthlyLevelsStyle: "solid" | "dashed" | "dotted";
  monthlyLevelsColor: string;
  premiumZoneColor: string;
  equilibriumZoneColor: string;
  discountZoneColor: string;
}

export interface RunContext {
  bars: Bar[];
  parameters: SMCParameters;
  bullishColor: string;
  bearishColor: string;
  internalBullishColor: string;
  internalBearishColor: string;
  atr: Array<number | undefined>;
  cumulativeMeanRange: Array<number | undefined>;
  elements: StrategyVisualElement[];
  signals: StrategySignal[];
  alerts: string[];
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  structureCount: number;
  equalLevelCount: number;
  fvgCount: number;
}

export function numberParameter(input: StrategyInput, key: string, fallback: number, minimum = 0) {
  const value = Number(input.parameters[key]);
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

export function booleanParameter(input: StrategyInput, key: string, fallback: boolean) {
  const value = input.parameters[key];
  return typeof value === "boolean" ? value : fallback;
}

export function stringParameter<T extends string>(
  input: StrategyInput,
  key: string,
  fallback: T,
  allowed: readonly T[],
) {
  const value = input.parameters[key];
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

export function colorParameter(input: StrategyInput, key: string, fallback: string) {
  const value = input.parameters[key];
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : fallback;
}

export function resolveParameters(input: StrategyInput): SMCParameters {
  return {
    mode: stringParameter(input, "mode", "historical", ["historical", "present"]),
    style: stringParameter(input, "style", "colored", ["colored", "monochrome"]),
    showTrendCandles: booleanParameter(input, "showTrendCandles", false),
    showInternalStructure: booleanParameter(input, "showInternalStructure", true),
    internalBullishDisplay: stringParameter(input, "internalBullishDisplay", "all", [
      "all",
      "bos",
      "choch",
    ]),
    internalBearishDisplay: stringParameter(input, "internalBearishDisplay", "all", [
      "all",
      "bos",
      "choch",
    ]),
    internalConfluenceFilter: booleanParameter(input, "internalConfluenceFilter", false),
    internalStructureTextSize: stringParameter(input, "internalStructureTextSize", "tiny", [
      "tiny",
      "small",
      "normal",
    ]),
    showSwingStructure: booleanParameter(input, "showSwingStructure", true),
    swingBullishDisplay: stringParameter(input, "swingBullishDisplay", "all", [
      "all",
      "bos",
      "choch",
    ]),
    swingBearishDisplay: stringParameter(input, "swingBearishDisplay", "all", [
      "all",
      "bos",
      "choch",
    ]),
    swingStructureTextSize: stringParameter(input, "swingStructureTextSize", "small", [
      "tiny",
      "small",
      "normal",
    ]),
    showSwingPoints: booleanParameter(input, "showSwingPoints", false),
    showStrongWeakHighLow: booleanParameter(input, "showStrongWeakHighLow", true),
    swingLength: Math.round(numberParameter(input, "swingLength", 50, 10)),
    showInternalOrderBlocks: booleanParameter(input, "showInternalOrderBlocks", true),
    internalOrderBlockCount: Math.round(numberParameter(input, "internalOrderBlockCount", 5, 1)),
    showSwingOrderBlocks: booleanParameter(input, "showSwingOrderBlocks", false),
    swingOrderBlockCount: Math.round(numberParameter(input, "swingOrderBlockCount", 5, 1)),
    orderBlockFilter: stringParameter(input, "orderBlockFilter", "atr", [
      "atr",
      "cumulative-mean-range",
    ]),
    orderBlockMitigation: stringParameter(input, "orderBlockMitigation", "high-low", [
      "high-low",
      "close",
    ]),
    showEqualHighLow: booleanParameter(input, "showEqualHighLow", true),
    equalHighLowLength: Math.round(numberParameter(input, "equalHighLowLength", 3, 1)),
    equalHighLowThreshold: numberParameter(input, "equalHighLowThreshold", 0.1),
    equalHighLowTextSize: stringParameter(input, "equalHighLowTextSize", "tiny", [
      "tiny",
      "small",
      "normal",
    ]),
    showFairValueGaps: booleanParameter(input, "showFairValueGaps", false),
    fairValueGapAutoThreshold: booleanParameter(input, "fairValueGapAutoThreshold", true),
    fairValueGapTimeframe: stringParameter(input, "fairValueGapTimeframe", "current", [
      "current",
      "5m",
      "15m",
      "30m",
      "1h",
      "1d",
      "1w",
    ]),
    fairValueGapExtend: Math.round(numberParameter(input, "fairValueGapExtend", 1)),
    showDailyLevels: booleanParameter(input, "showDailyLevels", false),
    showWeeklyLevels: booleanParameter(input, "showWeeklyLevels", false),
    showMonthlyLevels: booleanParameter(input, "showMonthlyLevels", false),
    showPremiumDiscountZones: booleanParameter(input, "showPremiumDiscountZones", false),
    internalBullishColor: colorParameter(input, "internalBullishColor", GREEN),
    internalBearishColor: colorParameter(input, "internalBearishColor", RED),
    swingBullishColor: colorParameter(input, "swingBullishColor", GREEN),
    swingBearishColor: colorParameter(input, "swingBearishColor", RED),
    internalBullishOrderBlockColor: colorParameter(
      input,
      "internalBullishOrderBlockColor",
      "#3179F5",
    ),
    internalBearishOrderBlockColor: colorParameter(
      input,
      "internalBearishOrderBlockColor",
      "#F77C80",
    ),
    swingBullishOrderBlockColor: colorParameter(input, "swingBullishOrderBlockColor", "#1848CC"),
    swingBearishOrderBlockColor: colorParameter(input, "swingBearishOrderBlockColor", "#B22833"),
    bullishFairValueGapColor: colorParameter(input, "bullishFairValueGapColor", "#00FF68"),
    bearishFairValueGapColor: colorParameter(input, "bearishFairValueGapColor", "#FF0008"),
    dailyLevelsStyle: stringParameter(input, "dailyLevelsStyle", "solid", [
      "solid",
      "dashed",
      "dotted",
    ]),
    dailyLevelsColor: colorParameter(input, "dailyLevelsColor", BLUE),
    weeklyLevelsStyle: stringParameter(input, "weeklyLevelsStyle", "solid", [
      "solid",
      "dashed",
      "dotted",
    ]),
    weeklyLevelsColor: colorParameter(input, "weeklyLevelsColor", BLUE),
    monthlyLevelsStyle: stringParameter(input, "monthlyLevelsStyle", "solid", [
      "solid",
      "dashed",
      "dotted",
    ]),
    monthlyLevelsColor: colorParameter(input, "monthlyLevelsColor", BLUE),
    premiumZoneColor: colorParameter(input, "premiumZoneColor", RED),
    equilibriumZoneColor: colorParameter(input, "equilibriumZoneColor", "#878B94"),
    discountZoneColor: colorParameter(input, "discountZoneColor", GREEN),
  };
}
