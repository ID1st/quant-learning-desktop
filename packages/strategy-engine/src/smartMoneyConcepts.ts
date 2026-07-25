import type { Timeframe } from "@quant/shared";

import type {
  Bar,
  StrategyBand,
  StrategyDefinition,
  StrategyInput,
  StrategyLabel,
  StrategyOutput,
  StrategyPriceLine,
  StrategySignal,
  StrategyVisualElement,
} from "./index.ts";

/**
 * Deterministic TypeScript translation of Smart Money Concepts by LuxAlgo.
 * Original: https://www.tradingview.com/script/CnB3fSph-Smart-Money-Concepts-SMC-LuxAlgo/
 * License: CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/
 */
const GREEN = "#089981";
const RED = "#F23645";
const BLUE = "#2157F3";
const MONO_BULL = "#B2B5BE";
const MONO_BEAR = "#5D606B";
const MAX_OBJECTS = 500;

type Direction = 1 | -1;
type StructureScope = "internal" | "swing";

interface PivotPoint {
  index: number;
  confirmationIndex: number;
  timestamp: number;
  price: number;
  side: "high" | "low";
  crossed: boolean;
}

interface StructureState {
  high?: PivotPoint;
  low?: PivotPoint;
  previousHigh?: PivotPoint;
  previousLow?: PivotPoint;
  trend: -1 | 0 | 1;
}

interface OrderBlock {
  id: string;
  scope: StructureScope;
  direction: Direction;
  createdIndex: number;
  fromTimestamp: number;
  fromPrice: number;
  toPrice: number;
}

interface FairValueGap {
  id: string;
  direction: Direction;
  fromTimestamp: number;
  fromPrice: number;
  toPrice: number;
}

interface SMCParameters {
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

interface RunContext {
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

function numberParameter(input: StrategyInput, key: string, fallback: number, minimum = 0) {
  const value = Number(input.parameters[key]);
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function booleanParameter(input: StrategyInput, key: string, fallback: boolean) {
  const value = input.parameters[key];
  return typeof value === "boolean" ? value : fallback;
}

function stringParameter<T extends string>(input: StrategyInput, key: string, fallback: T, allowed: readonly T[]) {
  const value = input.parameters[key];
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function colorParameter(input: StrategyInput, key: string, fallback: string) {
  const value = input.parameters[key];
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

function resolveParameters(input: StrategyInput): SMCParameters {
  return {
    mode: stringParameter(input, "mode", "historical", ["historical", "present"]),
    style: stringParameter(input, "style", "colored", ["colored", "monochrome"]),
    showTrendCandles: booleanParameter(input, "showTrendCandles", false),
    showInternalStructure: booleanParameter(input, "showInternalStructure", true),
    internalBullishDisplay: stringParameter(input, "internalBullishDisplay", "all", ["all", "bos", "choch"]),
    internalBearishDisplay: stringParameter(input, "internalBearishDisplay", "all", ["all", "bos", "choch"]),
    internalConfluenceFilter: booleanParameter(input, "internalConfluenceFilter", false),
    internalStructureTextSize: stringParameter(input, "internalStructureTextSize", "tiny", ["tiny", "small", "normal"]),
    showSwingStructure: booleanParameter(input, "showSwingStructure", true),
    swingBullishDisplay: stringParameter(input, "swingBullishDisplay", "all", ["all", "bos", "choch"]),
    swingBearishDisplay: stringParameter(input, "swingBearishDisplay", "all", ["all", "bos", "choch"]),
    swingStructureTextSize: stringParameter(input, "swingStructureTextSize", "small", ["tiny", "small", "normal"]),
    showSwingPoints: booleanParameter(input, "showSwingPoints", false),
    showStrongWeakHighLow: booleanParameter(input, "showStrongWeakHighLow", true),
    swingLength: Math.round(numberParameter(input, "swingLength", 50, 10)),
    showInternalOrderBlocks: booleanParameter(input, "showInternalOrderBlocks", true),
    internalOrderBlockCount: Math.round(numberParameter(input, "internalOrderBlockCount", 5, 1)),
    showSwingOrderBlocks: booleanParameter(input, "showSwingOrderBlocks", false),
    swingOrderBlockCount: Math.round(numberParameter(input, "swingOrderBlockCount", 5, 1)),
    orderBlockFilter: stringParameter(input, "orderBlockFilter", "atr", ["atr", "cumulative-mean-range"]),
    orderBlockMitigation: stringParameter(input, "orderBlockMitigation", "high-low", ["high-low", "close"]),
    showEqualHighLow: booleanParameter(input, "showEqualHighLow", true),
    equalHighLowLength: Math.round(numberParameter(input, "equalHighLowLength", 3, 1)),
    equalHighLowThreshold: numberParameter(input, "equalHighLowThreshold", 0.1),
    equalHighLowTextSize: stringParameter(input, "equalHighLowTextSize", "tiny", ["tiny", "small", "normal"]),
    showFairValueGaps: booleanParameter(input, "showFairValueGaps", false),
    fairValueGapAutoThreshold: booleanParameter(input, "fairValueGapAutoThreshold", true),
    fairValueGapTimeframe: stringParameter(input, "fairValueGapTimeframe", "current", ["current", "5m", "15m", "30m", "1h", "1d", "1w"]),
    fairValueGapExtend: Math.round(numberParameter(input, "fairValueGapExtend", 1)),
    showDailyLevels: booleanParameter(input, "showDailyLevels", false),
    showWeeklyLevels: booleanParameter(input, "showWeeklyLevels", false),
    showMonthlyLevels: booleanParameter(input, "showMonthlyLevels", false),
    showPremiumDiscountZones: booleanParameter(input, "showPremiumDiscountZones", false),
    internalBullishColor: colorParameter(input, "internalBullishColor", GREEN),
    internalBearishColor: colorParameter(input, "internalBearishColor", RED),
    swingBullishColor: colorParameter(input, "swingBullishColor", GREEN),
    swingBearishColor: colorParameter(input, "swingBearishColor", RED),
    internalBullishOrderBlockColor: colorParameter(input, "internalBullishOrderBlockColor", "#3179F5"),
    internalBearishOrderBlockColor: colorParameter(input, "internalBearishOrderBlockColor", "#F77C80"),
    swingBullishOrderBlockColor: colorParameter(input, "swingBullishOrderBlockColor", "#1848CC"),
    swingBearishOrderBlockColor: colorParameter(input, "swingBearishOrderBlockColor", "#B22833"),
    bullishFairValueGapColor: colorParameter(input, "bullishFairValueGapColor", "#00FF68"),
    bearishFairValueGapColor: colorParameter(input, "bearishFairValueGapColor", "#FF0008"),
    dailyLevelsStyle: stringParameter(input, "dailyLevelsStyle", "solid", ["solid", "dashed", "dotted"]),
    dailyLevelsColor: colorParameter(input, "dailyLevelsColor", BLUE),
    weeklyLevelsStyle: stringParameter(input, "weeklyLevelsStyle", "solid", ["solid", "dashed", "dotted"]),
    weeklyLevelsColor: colorParameter(input, "weeklyLevelsColor", BLUE),
    monthlyLevelsStyle: stringParameter(input, "monthlyLevelsStyle", "solid", ["solid", "dashed", "dotted"]),
    monthlyLevelsColor: colorParameter(input, "monthlyLevelsColor", BLUE),
    premiumZoneColor: colorParameter(input, "premiumZoneColor", RED),
    equilibriumZoneColor: colorParameter(input, "equilibriumZoneColor", "#878B94"),
    discountZoneColor: colorParameter(input, "discountZoneColor", GREEN),
  };
}

function trueRange(bars: readonly Bar[], index: number) {
  const bar = bars[index];
  const previousClose = index > 0 ? bars[index - 1].close : bar.close;
  return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
}

function computeAtr(bars: readonly Bar[], length: number) {
  const result: Array<number | undefined> = Array(bars.length).fill(undefined);
  let rolling = 0;
  let value = 0;

  bars.forEach((_, index) => {
    const range = trueRange(bars, index);
    if (index < length) {
      rolling += range;
    }
    if (index === length - 1) {
      value = rolling / length;
      result[index] = value;
    } else if (index >= length) {
      value = (value * (length - 1) + range) / length;
      result[index] = value;
    }
  });

  return result;
}

function computeCumulativeMeanRange(bars: readonly Bar[]) {
  const result: Array<number | undefined> = [];
  let sum = 0;
  bars.forEach((bar, index) => {
    sum += bar.high - bar.low;
    result.push(sum / (index + 1));
  });
  return result;
}

function detectPivots(bars: readonly Bar[], size: number): PivotPoint[] {
  const pivots: PivotPoint[] = [];
  for (let index = size; index + size < bars.length; index += 1) {
    const candidate = bars[index];
    let isHigh = true;
    let isLow = true;
    for (let cursor = index - size; cursor <= index + size; cursor += 1) {
      if (cursor === index) {
        continue;
      }
      isHigh = isHigh && candidate.high > bars[cursor].high;
      isLow = isLow && candidate.low < bars[cursor].low;
    }
    if (isHigh) {
      pivots.push({
        index,
        confirmationIndex: index + size,
        timestamp: candidate.timestamp,
        price: candidate.high,
        side: "high",
        crossed: false,
      });
    }
    if (isLow) {
      pivots.push({
        index,
        confirmationIndex: index + size,
        timestamp: candidate.timestamp,
        price: candidate.low,
        side: "low",
        crossed: false,
      });
    }
  }
  return pivots.sort((left, right) => left.confirmationIndex - right.confirmationIndex);
}

function pushCapped<T>(items: T[], item: T, limit = MAX_OBJECTS) {
  items.push(item);
  if (items.length > limit) {
    items.splice(0, items.length - limit);
  }
}

function addAlert(context: RunContext, timestamp: number, price: number, label: string) {
  pushCapped(context.signals, { timestamp, price, type: "alert", label });
  pushCapped(context.alerts, label);
}

function structureElement(
  scope: StructureScope,
  direction: Direction,
  label: "BOS" | "CHoCH",
  pivot: PivotPoint,
  breakBar: Bar,
  color: string,
  textSize: "tiny" | "small" | "normal",
  ordinal: number,
): StrategyPriceLine {
  return {
    id: `smc-structure-${scope}-${direction > 0 ? "bull" : "bear"}-${ordinal}`,
    kind: "price-line",
    price: pivot.price,
    label,
    tone: "neutral",
    fromTimestamp: pivot.timestamp,
    toTimestamp: breakBar.timestamp,
    color,
    opacity: 1,
    lineStyle: scope === "internal" ? "dashed" : "solid",
    textSize,
    labelAnchor: direction > 0 ? "above" : "below",
    placement: "over-candles",
    zIndex: scope === "internal" ? 41 : 42,
  };
}

function createOrderBlock(
  context: RunContext,
  scope: StructureScope,
  direction: Direction,
  fromIndex: number,
  toIndex: number,
) {
  if (fromIndex >= toIndex) {
    return;
  }
  const filterSeries = context.parameters.orderBlockFilter === "atr" ? context.atr : context.cumulativeMeanRange;
  const candidates = context.bars
    .slice(fromIndex, toIndex + 1)
    .map((bar, offset) => ({ bar, index: fromIndex + offset }))
    .filter(({ bar, index }) => {
      const threshold = filterSeries[index];
      return threshold === undefined || bar.high - bar.low <= threshold * 2;
    });
  if (candidates.length === 0) {
    return;
  }
  const source = candidates.reduce((selected, candidate) => {
    if (direction > 0) {
      return candidate.bar.low < selected.bar.low ? candidate : selected;
    }
    return candidate.bar.high > selected.bar.high ? candidate : selected;
  });
  context.orderBlocks.push({
    id: `smc-order-block-${scope}-${direction > 0 ? "bull" : "bear"}-${source.index}`,
    scope,
    direction,
    createdIndex: toIndex,
    fromTimestamp: source.bar.timestamp,
    fromPrice: source.bar.low,
    toPrice: source.bar.high,
  });
}

function resolveOrderBlockLifecycles(context: RunContext) {
  context.orderBlocks = context.orderBlocks.filter((block) => {
    const invalidatingBar = context.bars.slice(block.createdIndex + 1).find((bar) => {
      const mitigation =
        context.parameters.orderBlockMitigation === "close"
          ? bar.close
          : block.direction > 0
            ? bar.low
            : bar.high;
      return block.direction > 0 ? mitigation < block.fromPrice : mitigation > block.toPrice;
    });
    if (invalidatingBar) {
      addAlert(
        context,
        invalidatingBar.timestamp,
        invalidatingBar.close,
        `${block.scope === "internal" ? "Internal" : "Swing"} ${block.direction > 0 ? "Bullish" : "Bearish"} Order Block Breakout`,
      );
    }
    return !invalidatingBar;
  });
}

function addEqualLevel(
  context: RunContext,
  current: PivotPoint,
  previous: PivotPoint | undefined,
  direction: Direction,
) {
  if (!context.parameters.showEqualHighLow || !previous) {
    return;
  }
  const atr = context.atr[current.confirmationIndex];
  if (atr === undefined || Math.abs(current.price - previous.price) > context.parameters.equalHighLowThreshold * atr) {
    return;
  }
  const label = direction > 0 ? "EQH" : "EQL";
  const color = direction > 0 ? context.bearishColor : context.bullishColor;
  const price = (current.price + previous.price) / 2;
  const id = `smc-equal-${label.toLowerCase()}-${context.equalLevelCount++}`;
  pushCapped(context.elements, {
    id,
    kind: "price-line",
    price,
    tone: "neutral",
    fromTimestamp: previous.timestamp,
    toTimestamp: current.timestamp,
    color,
    lineStyle: "dotted",
    opacity: 1,
    placement: "over-candles",
    zIndex: 45,
  });
  pushCapped(context.elements, {
    id: `${id}-label`,
    kind: "label",
    timestamp: Math.round((previous.timestamp + current.timestamp) / 2),
    price,
    text: label,
    tone: direction > 0 ? "warning" : "success",
    color,
    textSize: context.parameters.equalHighLowTextSize,
    labelAnchor: direction > 0 ? "above" : "below",
    placement: "over-candles",
    zIndex: 46,
  });
  addAlert(context, context.bars[current.confirmationIndex].timestamp, price, `Equal ${direction > 0 ? "High" : "Low"}`);
}

function processEqualLevels(context: RunContext) {
  let previousHigh: PivotPoint | undefined;
  let previousLow: PivotPoint | undefined;
  detectPivots(context.bars, context.parameters.equalHighLowLength).forEach((pivot) => {
    if (pivot.side === "high") {
      addEqualLevel(context, pivot, previousHigh, 1);
      previousHigh = pivot;
    } else {
      addEqualLevel(context, pivot, previousLow, -1);
      previousLow = pivot;
    }
  });
}

function processStructure(context: RunContext, scope: StructureScope, size: number) {
  const pivots = detectPivots(context.bars, size);
  const byConfirmation = new Map<number, PivotPoint[]>();
  pivots.forEach((pivot) => {
    const confirmed = byConfirmation.get(pivot.confirmationIndex) ?? [];
    confirmed.push(pivot);
    byConfirmation.set(pivot.confirmationIndex, confirmed);
  });
  const state: StructureState = { trend: 0 };
  const trendByBar: Array<-1 | 0 | 1> = Array(context.bars.length).fill(0);

  context.bars.forEach((bar, index) => {
    for (const pivot of byConfirmation.get(index) ?? []) {
      if (pivot.side === "high") {
        state.previousHigh = state.high;
        state.high = pivot;
        if (scope === "swing" && context.parameters.showSwingPoints && state.previousHigh) {
          const label = pivot.price > state.previousHigh.price ? "HH" : "LH";
          pushCapped(context.elements, {
            id: `smc-swing-point-high-${pivot.index}`,
            kind: "label",
            timestamp: pivot.timestamp,
            price: pivot.price,
            text: label,
            tone: label === "HH" ? "success" : "warning",
            color: label === "HH" ? context.bullishColor : context.bearishColor,
            textSize: "tiny",
            labelAnchor: "above",
            placement: "over-candles",
            zIndex: 46,
          });
        }
      } else {
        state.previousLow = state.low;
        state.low = pivot;
        if (scope === "swing" && context.parameters.showSwingPoints && state.previousLow) {
          const label = pivot.price < state.previousLow.price ? "LL" : "HL";
          pushCapped(context.elements, {
            id: `smc-swing-point-low-${pivot.index}`,
            kind: "label",
            timestamp: pivot.timestamp,
            price: pivot.price,
            text: label,
            tone: label === "HL" ? "success" : "warning",
            color: label === "HL" ? context.bullishColor : context.bearishColor,
            textSize: "tiny",
            labelAnchor: "below",
            placement: "over-candles",
            zIndex: 46,
          });
        }
      }
    }

    const previousClose = index > 0 ? context.bars[index - 1].close : bar.close;
    const bullishConfluence =
      !context.parameters.internalConfluenceFilter ||
      bar.high - Math.max(bar.close, bar.open) > Math.min(bar.close, bar.open) - bar.low;
    const bearishConfluence =
      !context.parameters.internalConfluenceFilter ||
      bar.high - Math.max(bar.close, bar.open) < Math.min(bar.close, bar.open) - bar.low;
    if (
      state.high &&
      !state.high.crossed &&
      previousClose <= state.high.price &&
      bar.close > state.high.price &&
      (scope === "swing" || bullishConfluence)
    ) {
      const label = state.trend < 0 ? "CHoCH" : "BOS";
      state.high.crossed = true;
      state.trend = 1;
      context.structureCount += 1;
      const displayFilter =
        scope === "internal"
          ? context.parameters.internalBullishDisplay
          : context.parameters.swingBullishDisplay;
      const visible =
        (scope === "internal" ? context.parameters.showInternalStructure : context.parameters.showSwingStructure) &&
        (displayFilter === "all" || displayFilter === label.toLowerCase());
      if (visible) {
        const color = scope === "internal" ? context.internalBullishColor : context.bullishColor;
        const size =
          scope === "internal"
            ? context.parameters.internalStructureTextSize
            : context.parameters.swingStructureTextSize;
        pushCapped(
          context.elements,
          structureElement(scope, 1, label, state.high, bar, color, size, context.structureCount),
        );
      }
      const showBlock =
        scope === "internal" ? context.parameters.showInternalOrderBlocks : context.parameters.showSwingOrderBlocks;
      if (showBlock) {
        createOrderBlock(context, scope, 1, state.high.index, index);
      }
      addAlert(context, bar.timestamp, bar.close, `${scope === "internal" ? "Internal" : "Swing"} Bullish ${label}`);
    }
    if (
      state.low &&
      !state.low.crossed &&
      previousClose >= state.low.price &&
      bar.close < state.low.price &&
      (scope === "swing" || bearishConfluence)
    ) {
      const label = state.trend > 0 ? "CHoCH" : "BOS";
      state.low.crossed = true;
      state.trend = -1;
      context.structureCount += 1;
      const displayFilter =
        scope === "internal"
          ? context.parameters.internalBearishDisplay
          : context.parameters.swingBearishDisplay;
      const visible =
        (scope === "internal" ? context.parameters.showInternalStructure : context.parameters.showSwingStructure) &&
        (displayFilter === "all" || displayFilter === label.toLowerCase());
      if (visible) {
        const color = scope === "internal" ? context.internalBearishColor : context.bearishColor;
        const size =
          scope === "internal"
            ? context.parameters.internalStructureTextSize
            : context.parameters.swingStructureTextSize;
        pushCapped(
          context.elements,
          structureElement(scope, -1, label, state.low, bar, color, size, context.structureCount),
        );
      }
      const showBlock =
        scope === "internal" ? context.parameters.showInternalOrderBlocks : context.parameters.showSwingOrderBlocks;
      if (showBlock) {
        createOrderBlock(context, scope, -1, state.low.index, index);
      }
      addAlert(context, bar.timestamp, bar.close, `${scope === "internal" ? "Internal" : "Swing"} Bearish ${label}`);
    }
    trendByBar[index] = state.trend;
  });

  return { state, trendByBar };
}

function detectFairValueGaps(context: RunContext, sourceBars: readonly Bar[] = context.bars) {
  if (!context.parameters.showFairValueGaps) {
    return;
  }
  let cumulativeChange = 0;
  sourceBars.forEach((bar, index) => {
    if (index < 2) {
      return;
    }
    context.fairValueGaps = context.fairValueGaps.filter((gap) =>
      gap.direction > 0 ? bar.low > gap.fromPrice : bar.high < gap.toPrice,
    );
    const previous = sourceBars[index - 1];
    const twoBack = sourceBars[index - 2];
    const change = Math.abs(previous.close - previous.open) / Math.max(Math.abs(previous.open), Number.EPSILON);
    cumulativeChange += change;
    const threshold = context.parameters.fairValueGapAutoThreshold ? (cumulativeChange / (index - 1)) * 2 : 0;
    if (bar.low > twoBack.high && previous.close > twoBack.high && change > threshold) {
      context.fairValueGaps.push({
        id: `smc-fvg-bull-${index}`,
        direction: 1,
        fromTimestamp: twoBack.timestamp,
        fromPrice: twoBack.high,
        toPrice: bar.low,
      });
      context.fvgCount += 1;
      addAlert(context, bar.timestamp, bar.close, "Bullish Fair Value Gap");
    }
    if (bar.high < twoBack.low && previous.close < twoBack.low && change > threshold) {
      context.fairValueGaps.push({
        id: `smc-fvg-bear-${index}`,
        direction: -1,
        fromTimestamp: twoBack.timestamp,
        fromPrice: bar.high,
        toPrice: twoBack.low,
      });
      context.fvgCount += 1;
      addAlert(context, bar.timestamp, bar.close, "Bearish Fair Value Gap");
    }
  });
}

function appendOrderBlockElements(context: RunContext) {
  const lastTimestamp = context.bars.at(-1)?.timestamp;
  const selected = context.orderBlocks.filter((block) => {
    const sameScope = context.orderBlocks.filter((candidate) => candidate.scope === block.scope);
    const count =
      block.scope === "internal"
        ? context.parameters.internalOrderBlockCount
        : context.parameters.swingOrderBlockCount;
    return sameScope.slice(-count).includes(block);
  });
  selected.forEach((block) => {
    const isInternal = block.scope === "internal";
    const fillColor =
      block.direction > 0
        ? isInternal
          ? context.parameters.internalBullishOrderBlockColor
          : context.parameters.swingBullishOrderBlockColor
        : isInternal
          ? context.parameters.internalBearishOrderBlockColor
          : context.parameters.swingBearishOrderBlockColor;
    pushCapped(context.elements, {
      id: block.id,
      kind: "band",
      fromPrice: block.fromPrice,
      toPrice: block.toPrice,
      tone: block.direction > 0 ? "target" : "risk",
      fromTimestamp: block.fromTimestamp,
      toTimestamp: lastTimestamp,
      fillColor,
      borderColor: fillColor,
      opacity: isInternal ? 0.3 : 0.24,
      extendRight: true,
      placement: "under-candles",
      zIndex: isInternal ? 12 : 8,
    });
  });
}

function appendFairValueGapElements(context: RunContext) {
  const interval = context.bars.length > 1 ? context.bars.at(-1)!.timestamp - context.bars.at(-2)!.timestamp : 60_000;
  context.fairValueGaps.slice(-MAX_OBJECTS).forEach((gap) => {
    const midpoint = (gap.fromPrice + gap.toPrice) / 2;
    const fillColor =
      gap.direction > 0 ? context.parameters.bullishFairValueGapColor : context.parameters.bearishFairValueGapColor;
    const toTimestamp =
      context.bars.at(-1)!.timestamp + context.parameters.fairValueGapExtend * Math.max(interval, 1);
    const halves: Array<[number, number]> = [
      [gap.fromPrice, midpoint],
      [midpoint, gap.toPrice],
    ];
    halves.forEach(([fromPrice, toPrice], half) => {
      pushCapped(context.elements, {
        id: `${gap.id}-${half}`,
        kind: "band",
        fromPrice,
        toPrice,
        tone: gap.direction > 0 ? "target" : "risk",
        fromTimestamp: gap.fromTimestamp,
        toTimestamp,
        fillColor,
        borderColor: fillColor,
        opacity: 0.3,
        placement: "under-candles",
        zIndex: 15,
      });
    });
  });
}

function appendStrongWeakLevels(context: RunContext, state: StructureState) {
  if (!context.parameters.showStrongWeakHighLow) {
    return;
  }
  const lastTimestamp = context.bars.at(-1)?.timestamp;
  const levels: Array<{ pivot: PivotPoint | undefined; label: string; direction: Direction }> = [
    {
      pivot: state.high,
      label: state.trend >= 0 ? "Weak High" : "Strong High",
      direction: state.trend >= 0 ? -1 : 1,
    },
    {
      pivot: state.low,
      label: state.trend >= 0 ? "Strong Low" : "Weak Low",
      direction: state.trend >= 0 ? 1 : -1,
    },
  ];
  levels.forEach(({ pivot, label, direction }) => {
    if (!pivot) {
      return;
    }
    pushCapped(context.elements, {
      id: `smc-${label.toLowerCase().replace(" ", "-")}`,
      kind: "price-line",
      price: pivot.price,
      label,
      tone: "neutral",
      fromTimestamp: pivot.timestamp,
      toTimestamp: lastTimestamp,
      color: direction > 0 ? context.bullishColor : context.bearishColor,
      opacity: 1,
      lineStyle: "solid",
      textSize: "tiny",
      labelAnchor: "right",
      extendRight: true,
      placement: "over-candles",
      zIndex: 48,
    });
  });
}

function appendPremiumDiscountZones(context: RunContext, state: StructureState) {
  if (!context.parameters.showPremiumDiscountZones || !state.high || !state.low) {
    return;
  }
  const high = state.high.price;
  const low = state.low.price;
  const range = high - low;
  if (range <= 0) {
    return;
  }
  const fromTimestamp = Math.min(state.high.timestamp, state.low.timestamp);
  const lastTimestamp = context.bars.at(-1)!.timestamp;
  const zones: Array<[string, number, number, string]> = [
    ["Premium", high - range * 0.05, high, context.parameters.premiumZoneColor],
    ["Equilibrium", low + range * 0.475, low + range * 0.525, context.parameters.equilibriumZoneColor],
    ["Discount", low, low + range * 0.05, context.parameters.discountZoneColor],
  ];
  zones.forEach(([label, fromPrice, toPrice, color], index) => {
    pushCapped(context.elements, {
      id: `smc-zone-${label.toLowerCase()}`,
      kind: "band",
      fromPrice: Number(fromPrice),
      toPrice: Number(toPrice),
      label,
      tone: index === 0 ? "risk" : index === 2 ? "target" : "range",
      fromTimestamp,
      toTimestamp: lastTimestamp,
      fillColor: color,
      borderColor: color,
      opacity: 0.1,
      extendRight: true,
      placement: "under-candles",
      zIndex: 5,
    });
  });
}

const timeframeDuration: Partial<Record<Timeframe, number>> = {
  "1d": 24 * 60 * 60 * 1_000,
  "1w": 7 * 24 * 60 * 60 * 1_000,
};

function confirmedBars(series: readonly Bar[] | undefined, timeframe: "1d" | "1w", cutoff: number) {
  const duration = timeframeDuration[timeframe] ?? 0;
  return (series ?? []).filter((bar) => bar.timestamp + duration <= cutoff);
}

function appendPreviousHighLow(
  context: RunContext,
  series: readonly Bar[] | undefined,
  timeframe: "1d" | "1w",
  prefix: "PD" | "PW",
  lineStyle: "solid" | "dashed" | "dotted",
  color: string,
) {
  const cutoff = context.bars.at(-1)!.timestamp;
  const confirmed = confirmedBars(series, timeframe, cutoff);
  const previous = confirmed.at(-1);
  if (!previous) {
    return;
  }
  const fromTimestamp = previous.timestamp;
  ([
    ["H", previous.high],
    ["L", previous.low],
  ] as const).forEach(([side, price]) => {
    pushCapped(context.elements, {
      id: `smc-${prefix.toLowerCase()}${side.toLowerCase()}`,
      kind: "price-line",
      price,
      label: `${prefix}${side}`,
      tone: "neutral",
      fromTimestamp,
      toTimestamp: cutoff,
      color,
      opacity: 0.85,
      lineStyle,
      textSize: "tiny",
      labelAnchor: "right",
      extendRight: true,
      placement: "over-candles",
      zIndex: 47,
    });
  });
}

function appendPreviousMonthlyHighLow(
  context: RunContext,
  dailySeries: readonly Bar[] | undefined,
  lineStyle: "solid" | "dashed" | "dotted",
  color: string,
) {
  const cutoff = context.bars.at(-1)!.timestamp;
  const confirmed = confirmedBars(dailySeries, "1d", cutoff);
  const months = new Map<string, Bar[]>();
  confirmed.forEach((bar) => {
    const date = new Date(bar.timestamp);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    const month = months.get(key) ?? [];
    month.push(bar);
    months.set(key, month);
  });
  const monthEntries = [...months.entries()].sort((left, right) => left[1][0].timestamp - right[1][0].timestamp);
  const currentDate = new Date(cutoff);
  const currentKey = `${currentDate.getUTCFullYear()}-${currentDate.getUTCMonth()}`;
  const previous = monthEntries.filter(([key]) => key !== currentKey).at(-1)?.[1];
  if (!previous?.length) {
    return;
  }
  const high = Math.max(...previous.map((bar) => bar.high));
  const low = Math.min(...previous.map((bar) => bar.low));
  ([
    ["PMH", high],
    ["PML", low],
  ] as const).forEach(([label, price]) => {
    pushCapped(context.elements, {
      id: `smc-${label.toLowerCase()}`,
      kind: "price-line",
      price,
      label,
      tone: "neutral",
      fromTimestamp: previous[0].timestamp,
      toTimestamp: cutoff,
      color,
      lineStyle,
      textSize: "tiny",
      labelAnchor: "right",
      extendRight: true,
      placement: "over-candles",
      zIndex: 47,
    });
  });
}

function applyPresentMode(elements: StrategyVisualElement[]) {
  const categories = new Map<string, StrategyVisualElement>();
  elements.forEach((element) => {
    const category = element.id
      .replace(/-\d+(?:-\d+)?$/, "")
      .replace(/-(bull|bear)$/, "")
      .replace(/-(high|low)$/, "");
    categories.set(category, element);
  });
  return [...categories.values()];
}

function capHistoricalElements(elements: StrategyVisualElement[]) {
  const byObjectType = new Map<"line" | "label" | "box" | "candle", StrategyVisualElement[]>();
  elements.forEach((element) => {
    const key =
      element.kind === "price-line" || element.kind === "trend-line"
        ? "line"
        : element.kind === "label"
          ? "label"
          : element.kind === "band"
            ? "box"
            : "candle";
    const values = byObjectType.get(key) ?? [];
    values.push(element);
    byObjectType.set(key, values);
  });
  const retained = new Set(
    [...byObjectType.values()].flatMap((values) => values.slice(-MAX_OBJECTS)),
  );
  return elements.filter((element) => retained.has(element));
}

function deduplicateCoincidentStructureElements(elements: StrategyVisualElement[]) {
  const preferred = new Map<string, StrategyPriceLine>();
  elements.forEach((element) => {
    if (element.kind !== "price-line" || !element.id.startsWith("smc-structure-")) {
      return;
    }
    const key = `${element.label}:${element.price}:${element.fromTimestamp}:${element.toTimestamp}`;
    const current = preferred.get(key);
    if (!current || (element.zIndex ?? 0) > (current.zIndex ?? 0)) {
      preferred.set(key, element);
    }
  });
  return elements.filter((element) => {
    if (element.kind !== "price-line" || !element.id.startsWith("smc-structure-")) {
      return true;
    }
    const key = `${element.label}:${element.price}:${element.fromTimestamp}:${element.toTimestamp}`;
    return preferred.get(key) === element;
  });
}

function runSmartMoneyConcepts(strategy: StrategyDefinition, input: StrategyInput): StrategyOutput {
  const enabled = input.enabled ?? strategy.defaultEnabled ?? false;
  const bars = [...input.bars].sort((left, right) => left.timestamp - right.timestamp);
  if (!enabled || bars.length === 0) {
    return {
      signals: [],
      overlays: [],
      render: {
        strategyId: strategy.key,
        strategyName: strategy.name,
        enabled,
        zIndex: 40,
        elements: [],
      },
      metrics: {
        "Structure Ready": bars.length >= 51 ? 1 : 0,
        "ATR Ready": bars.length >= 200 ? 1 : 0,
      },
      logs: enabled ? ["SMC is waiting for market data."] : ["Smart Money Concepts is disabled."],
      alerts: [],
    };
  }

  const parameters = resolveParameters(input);
  const context: RunContext = {
    bars,
    parameters,
    bullishColor: parameters.style === "monochrome" ? MONO_BULL : parameters.swingBullishColor,
    bearishColor: parameters.style === "monochrome" ? MONO_BEAR : parameters.swingBearishColor,
    internalBullishColor: parameters.style === "monochrome" ? MONO_BULL : parameters.internalBullishColor,
    internalBearishColor: parameters.style === "monochrome" ? MONO_BEAR : parameters.internalBearishColor,
    atr: computeAtr(bars, 200),
    cumulativeMeanRange: computeCumulativeMeanRange(bars),
    elements: [],
    signals: [],
    alerts: [],
    orderBlocks: [],
    fairValueGaps: [],
    structureCount: 0,
    equalLevelCount: 0,
    fvgCount: 0,
  };

  const structureReady = bars.length >= 51;
  const internal = structureReady ? processStructure(context, "internal", 5) : { state: { trend: 0 } as StructureState, trendByBar: Array<-1 | 0 | 1>(bars.length).fill(0) };
  const swing = structureReady ? processStructure(context, "swing", parameters.swingLength) : { state: { trend: 0 } as StructureState, trendByBar: Array<-1 | 0 | 1>(bars.length).fill(0) };
  context.elements = deduplicateCoincidentStructureElements(context.elements);
  if (structureReady) {
    processEqualLevels(context);
  }
  resolveOrderBlockLifecycles(context);
  const requestedFvgSeries =
    parameters.fairValueGapTimeframe === "current"
      ? bars
      : input.seriesByTimeframe?.[parameters.fairValueGapTimeframe] ?? [];
  const fvgSeries =
    parameters.fairValueGapTimeframe === "1d" || parameters.fairValueGapTimeframe === "1w"
      ? confirmedBars(requestedFvgSeries, parameters.fairValueGapTimeframe, bars.at(-1)!.timestamp)
      : requestedFvgSeries;
  detectFairValueGaps(context, fvgSeries);
  appendOrderBlockElements(context);
  appendFairValueGapElements(context);
  appendStrongWeakLevels(context, swing.state);
  appendPremiumDiscountZones(context, swing.state);

  if (parameters.showTrendCandles) {
    swing.trendByBar.forEach((trend, index) => {
      if (trend === 0) {
        return;
      }
      pushCapped(context.elements, {
        id: `smc-candle-${bars[index].timestamp}`,
        kind: "candle-style",
        timestamp: bars[index].timestamp,
        color: trend > 0 ? context.bullishColor : context.bearishColor,
        opacity: 1,
        placement: "over-candles",
        zIndex: 35,
      });
    });
  }

  if (parameters.showDailyLevels && input.timeframe !== "1d" && input.timeframe !== "1w") {
    appendPreviousHighLow(
      context,
      input.seriesByTimeframe?.["1d"],
      "1d",
      "PD",
      parameters.dailyLevelsStyle,
      parameters.dailyLevelsColor,
    );
  }
  if (parameters.showWeeklyLevels && input.timeframe !== "1w") {
    appendPreviousHighLow(
      context,
      input.seriesByTimeframe?.["1w"],
      "1w",
      "PW",
      parameters.weeklyLevelsStyle,
      parameters.weeklyLevelsColor,
    );
  }
  if (parameters.showMonthlyLevels) {
    appendPreviousMonthlyHighLow(
      context,
      input.seriesByTimeframe?.["1d"],
      parameters.monthlyLevelsStyle,
      parameters.monthlyLevelsColor,
    );
  }

  const elements = parameters.mode === "present" ? applyPresentMode(context.elements) : capHistoricalElements(context.elements);
  const logs = [
    "Smart Money Concepts is a deterministic TypeScript translation of the LuxAlgo indicator for local research.",
  ];
  if (bars.length < 51) {
    logs.push(`Structure warm-up: ${bars.length}/51 bars.`);
  }
  if (bars.length < 200) {
    logs.push(`ATR(200) warm-up: ${bars.length}/200 bars; ATR-dependent filters remain unavailable.`);
  }

  return {
    signals: context.signals.slice(-MAX_OBJECTS),
    overlays: elements,
    render: {
      strategyId: strategy.key,
      strategyName: strategy.name,
      enabled,
      zIndex: 40,
      elements,
    },
    metrics: {
      "Structure Ready": bars.length >= 51 ? 1 : 0,
      "ATR Ready": bars.length >= 200 ? 1 : 0,
      "Structure Events": context.structureCount,
      "Active Order Blocks": context.orderBlocks.length,
      "Equal High Low Events": context.equalLevelCount,
      "Active Fair Value Gaps": context.fairValueGaps.length,
      "Alert Events": context.signals.length,
      "Internal Trend": internal.state.trend,
      "Swing Trend": swing.state.trend,
    },
    logs,
    alerts: context.alerts.slice(-MAX_OBJECTS),
  };
}

export function createSmartMoneyConceptsStrategyDefinition(): StrategyDefinition {
  const strategy: StrategyDefinition = {
    key: "smart-money-concepts",
    name: "Smart Money Concepts [LuxAlgo]",
    version: "1.0.0",
    description:
      "确定性复刻 LuxAlgo Smart Money Concepts：内部/摆动结构、订单块、EQH/EQL、FVG、多周期高低点与溢价/均衡/折价区域。",
    sourceType: "preset",
    sourceFile: "trading-strategies/Smart Money Concepts.md",
    strategyType: "indicator",
    defaultEnabled: false,
    supportedMarkets: ["CN", "HK", "US"],
    supportedTimeframes: ["realtime", "1m", "5m", "15m", "30m", "1h", "1d", "1w"],
    parameterSchema: [
      {
        key: "mode",
        label: "显示模式",
        type: "select",
        defaultValue: "historical",
        options: [
          { label: "Historical", value: "historical" },
          { label: "Present", value: "present" },
        ],
      },
      {
        key: "style",
        label: "颜色样式",
        type: "select",
        defaultValue: "colored",
        options: [
          { label: "Colored", value: "colored" },
          { label: "Monochrome", value: "monochrome" },
        ],
      },
      { key: "showTrendCandles", label: "按趋势着色蜡烛", type: "boolean", defaultValue: false },
      { key: "showInternalStructure", label: "内部结构", type: "boolean", defaultValue: true },
      {
        key: "internalBullishDisplay",
        label: "内部看涨结构",
        type: "select",
        defaultValue: "all",
        options: [
          { label: "All", value: "all" },
          { label: "BOS", value: "bos" },
          { label: "CHoCH", value: "choch" },
        ],
      },
      {
        key: "internalBearishDisplay",
        label: "内部看跌结构",
        type: "select",
        defaultValue: "all",
        options: [
          { label: "All", value: "all" },
          { label: "BOS", value: "bos" },
          { label: "CHoCH", value: "choch" },
        ],
      },
      { key: "internalConfluenceFilter", label: "内部结构 Confluence Filter", type: "boolean", defaultValue: false },
      {
        key: "internalStructureTextSize",
        label: "内部结构标签大小",
        type: "select",
        defaultValue: "tiny",
        options: [
          { label: "Tiny", value: "tiny" },
          { label: "Small", value: "small" },
          { label: "Normal", value: "normal" },
        ],
      },
      { key: "showSwingStructure", label: "摆动结构", type: "boolean", defaultValue: true },
      {
        key: "swingBullishDisplay",
        label: "摆动看涨结构",
        type: "select",
        defaultValue: "all",
        options: [
          { label: "All", value: "all" },
          { label: "BOS", value: "bos" },
          { label: "CHoCH", value: "choch" },
        ],
      },
      {
        key: "swingBearishDisplay",
        label: "摆动看跌结构",
        type: "select",
        defaultValue: "all",
        options: [
          { label: "All", value: "all" },
          { label: "BOS", value: "bos" },
          { label: "CHoCH", value: "choch" },
        ],
      },
      {
        key: "swingStructureTextSize",
        label: "摆动结构标签大小",
        type: "select",
        defaultValue: "small",
        options: [
          { label: "Tiny", value: "tiny" },
          { label: "Small", value: "small" },
          { label: "Normal", value: "normal" },
        ],
      },
      { key: "showSwingPoints", label: "HH / HL / LH / LL", type: "boolean", defaultValue: false },
      { key: "showStrongWeakHighLow", label: "Strong / Weak High / Low", type: "boolean", defaultValue: true },
      { key: "swingLength", label: "摆动枢轴长度", type: "number", defaultValue: 50 },
      { key: "showInternalOrderBlocks", label: "内部订单块", type: "boolean", defaultValue: true },
      { key: "internalOrderBlockCount", label: "内部订单块数量", type: "number", defaultValue: 5 },
      { key: "showSwingOrderBlocks", label: "摆动订单块", type: "boolean", defaultValue: false },
      { key: "swingOrderBlockCount", label: "摆动订单块数量", type: "number", defaultValue: 5 },
      {
        key: "orderBlockFilter",
        label: "订单块波动过滤",
        type: "select",
        defaultValue: "atr",
        options: [
          { label: "ATR (200)", value: "atr" },
          { label: "Cumulative Mean Range", value: "cumulative-mean-range" },
        ],
      },
      {
        key: "orderBlockMitigation",
        label: "订单块失效来源",
        type: "select",
        defaultValue: "high-low",
        options: [
          { label: "High / Low", value: "high-low" },
          { label: "Close", value: "close" },
        ],
      },
      { key: "showEqualHighLow", label: "EQH / EQL", type: "boolean", defaultValue: true },
      { key: "equalHighLowLength", label: "EQH / EQL 确认长度", type: "number", defaultValue: 3 },
      { key: "equalHighLowThreshold", label: "EQH / EQL 阈值", type: "number", defaultValue: 0.1 },
      {
        key: "equalHighLowTextSize",
        label: "EQH / EQL 标签大小",
        type: "select",
        defaultValue: "tiny",
        options: [
          { label: "Tiny", value: "tiny" },
          { label: "Small", value: "small" },
          { label: "Normal", value: "normal" },
        ],
      },
      { key: "showFairValueGaps", label: "Fair Value Gaps", type: "boolean", defaultValue: false },
      { key: "fairValueGapAutoThreshold", label: "FVG 自动阈值", type: "boolean", defaultValue: true },
      {
        key: "fairValueGapTimeframe",
        label: "FVG 周期",
        type: "select",
        defaultValue: "current",
        options: [
          { label: "当前周期", value: "current" },
          { label: "5m", value: "5m" },
          { label: "15m", value: "15m" },
          { label: "30m", value: "30m" },
          { label: "1h", value: "1h" },
          { label: "1d", value: "1d" },
          { label: "1w", value: "1w" },
        ],
      },
      { key: "fairValueGapExtend", label: "FVG 右侧延伸", type: "number", defaultValue: 1 },
      { key: "showDailyLevels", label: "前日高低点", type: "boolean", defaultValue: false },
      {
        key: "dailyLevelsStyle",
        label: "前日高低点线型",
        type: "select",
        defaultValue: "solid",
        options: [
          { label: "Solid", value: "solid" },
          { label: "Dashed", value: "dashed" },
          { label: "Dotted", value: "dotted" },
        ],
      },
      { key: "showWeeklyLevels", label: "前周高低点", type: "boolean", defaultValue: false },
      {
        key: "weeklyLevelsStyle",
        label: "前周高低点线型",
        type: "select",
        defaultValue: "solid",
        options: [
          { label: "Solid", value: "solid" },
          { label: "Dashed", value: "dashed" },
          { label: "Dotted", value: "dotted" },
        ],
      },
      { key: "showMonthlyLevels", label: "前月高低点", type: "boolean", defaultValue: false },
      {
        key: "monthlyLevelsStyle",
        label: "前月高低点线型",
        type: "select",
        defaultValue: "solid",
        options: [
          { label: "Solid", value: "solid" },
          { label: "Dashed", value: "dashed" },
          { label: "Dotted", value: "dotted" },
        ],
      },
      { key: "showPremiumDiscountZones", label: "Premium / Equilibrium / Discount", type: "boolean", defaultValue: false },
      { key: "internalBullishColor", label: "内部看涨结构颜色", type: "color", defaultValue: GREEN },
      { key: "internalBearishColor", label: "内部看跌结构颜色", type: "color", defaultValue: RED },
      { key: "swingBullishColor", label: "摆动看涨结构颜色", type: "color", defaultValue: GREEN },
      { key: "swingBearishColor", label: "摆动看跌结构颜色", type: "color", defaultValue: RED },
      { key: "internalBullishOrderBlockColor", label: "内部看涨订单块", type: "color", defaultValue: "#3179F5" },
      { key: "internalBearishOrderBlockColor", label: "内部看跌订单块", type: "color", defaultValue: "#F77C80" },
      { key: "swingBullishOrderBlockColor", label: "摆动看涨订单块", type: "color", defaultValue: "#1848CC" },
      { key: "swingBearishOrderBlockColor", label: "摆动看跌订单块", type: "color", defaultValue: "#B22833" },
      { key: "bullishFairValueGapColor", label: "看涨 FVG", type: "color", defaultValue: "#00FF68" },
      { key: "bearishFairValueGapColor", label: "看跌 FVG", type: "color", defaultValue: "#FF0008" },
      { key: "dailyLevelsColor", label: "前日高低点颜色", type: "color", defaultValue: BLUE },
      { key: "weeklyLevelsColor", label: "前周高低点颜色", type: "color", defaultValue: BLUE },
      { key: "monthlyLevelsColor", label: "前月高低点颜色", type: "color", defaultValue: BLUE },
      { key: "premiumZoneColor", label: "Premium Zone", type: "color", defaultValue: RED },
      { key: "equilibriumZoneColor", label: "Equilibrium Zone", type: "color", defaultValue: "#878B94" },
      { key: "discountZoneColor", label: "Discount Zone", type: "color", defaultValue: GREEN },
    ],
    run: (input) => runSmartMoneyConcepts(strategy, input),
  };

  return strategy;
}
