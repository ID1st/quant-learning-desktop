import { ema, wma } from "@quant/pine-runtime";
import type {
  StrategyDefinition,
  StrategyInput,
  StrategyOutput,
  StrategySignal,
  StrategyVisualElement,
} from "./contracts.ts";
import {
  createPlaceholderOutput,
  getBooleanParameter,
  getColorParameter,
  getPositiveNumberParameter,
  isSeriesNumber,
  pineAtr,
} from "./strategyMath.ts";

function runTrendTargetsStrategy(
  strategy: StrategyDefinition,
  input: StrategyInput,
): StrategyOutput {
  const enabled = input.enabled ?? true;
  const supertrendFactor = getPositiveNumberParameter(input.parameters, "supertrendFactor", 12);
  const supertrendAtrPeriod = Math.max(
    1,
    Math.round(getPositiveNumberParameter(input.parameters, "supertrendAtrPeriod", 90)),
  );
  const wmaLength = Math.max(
    1,
    Math.round(getPositiveNumberParameter(input.parameters, "wmaLength", 40)),
  );
  const emaLength = Math.max(
    1,
    Math.round(getPositiveNumberParameter(input.parameters, "emaLength", 14)),
  );
  const confirmationCount = Math.max(
    1,
    Math.round(getPositiveNumberParameter(input.parameters, "confirmationCount", 3)),
  );
  const showTargets = getBooleanParameter(input.parameters, "showTargets", true);
  const atrPeriod = Math.max(
    1,
    Math.round(getPositiveNumberParameter(input.parameters, "atrPeriod", 14)),
  );
  const stopLossAtrMultiplier = getPositiveNumberParameter(
    input.parameters,
    "stopLossAtrMultiplier",
    5,
  );
  const targetOneMultiplier = getPositiveNumberParameter(
    input.parameters,
    "targetOneMultiplier",
    0.5,
  );
  const targetTwoMultiplier = getPositiveNumberParameter(
    input.parameters,
    "targetTwoMultiplier",
    1,
  );
  const targetThreeMultiplier = getPositiveNumberParameter(
    input.parameters,
    "targetThreeMultiplier",
    1.5,
  );
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
    const nextLower =
      isSeriesNumber(rawLower) && (rawLower > previousLower || previousClose < previousLower)
        ? rawLower
        : previousLower;
    const nextUpper =
      isSeriesNumber(rawUpper) && (rawUpper < previousUpper || previousClose > previousUpper)
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
    const turnedBullish =
      isSeriesNumber(value) &&
      isSeriesNumber(previousValue) &&
      isSeriesNumber(previousPreviousValue) &&
      value > previousValue &&
      previousValue <= previousPreviousValue;
    const turnedBearish =
      isSeriesNumber(value) &&
      isSeriesNumber(previousValue) &&
      isSeriesNumber(previousPreviousValue) &&
      value < previousValue &&
      previousValue >= previousPreviousValue;

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
      signals.push({
        timestamp: bar.timestamp,
        type: "buy",
        price: bar.close,
        label: "向上趋势转变",
      });
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
      signals.push({
        timestamp: bar.timestamp,
        type: "sell",
        price: bar.close,
        label: "向下趋势转变",
      });
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

    const rejected =
      isSeriesNumber(value) && currentTrend !== 0 && bar.high > value && bar.low < value;
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

  const directionalSignals = signals.filter(
    (signal) => signal.type === "buy" || signal.type === "sell",
  );
  const latestSignal = directionalSignals[directionalSignals.length - 1];
  const latestSignalBar = latestSignal
    ? bars.find((bar) => bar.timestamp === latestSignal.timestamp)
    : undefined;
  const projectionIndex = latestSignalBar ? bars.indexOf(latestSignalBar) : -1;
  const volatility = pineAtr(bars, atrPeriod);
  const riskRange =
    projectionIndex >= 0 && isSeriesNumber(volatility[projectionIndex])
      ? volatility[projectionIndex]
      : 0;
  const entryPrice = latestSignalBar?.close ?? 0;
  const setupSide = latestSignal?.type === "sell" ? "sell" : "buy";
  const stopPrice = latestSignalBar
    ? setupSide === "buy"
      ? latestSignalBar.low - riskRange * stopLossAtrMultiplier
      : latestSignalBar.high + riskRange * stopLossAtrMultiplier
    : 0;
  const riskDistance = Math.abs(entryPrice - stopPrice);
  const targetOne =
    setupSide === "buy"
      ? entryPrice + riskDistance * targetOneMultiplier
      : entryPrice - riskDistance * targetOneMultiplier;
  const targetTwo =
    setupSide === "buy"
      ? entryPrice + riskDistance * targetTwoMultiplier
      : entryPrice - riskDistance * targetTwoMultiplier;
  const targetThree =
    setupSide === "buy"
      ? entryPrice + riskDistance * targetThreeMultiplier
      : entryPrice - riskDistance * targetThreeMultiplier;
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

      const rejectedBearish =
        bar.high > stopPrice && previousBar.high <= stopPrice && bar.close < stopPrice;
      const rejectedBullish =
        bar.low < stopPrice && previousBar.low >= stopPrice && bar.close > stopPrice;
      if (rejectedBearish) setupAlerts.push("价格在风险线被拒绝 - 向下拒绝信号");
      if (rejectedBullish) setupAlerts.push("价格在风险线被拒绝 - 向上拒绝信号");
      previousBar = bar;
    });
  }

  if (showTargets && latestSignalBar && riskRange > 0) {
    const projectionStart = latestSignalBar.timestamp;
    const projectionEnd = bars.at(-1)!.timestamp;
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
        toTimestamp: projectionEnd,
      },
      {
        id: "trend-targets-entry",
        kind: "price-line",
        price: entryPrice,
        label: `入场 ▸ ${entryPrice.toFixed(2)}`,
        tone: "neutral",
        color: setupSide === "buy" ? bullColor : bearColor,
        fromTimestamp: projectionStart,
        toTimestamp: projectionEnd,
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
        toTimestamp: projectionEnd,
      },
      {
        id: "trend-targets-target-1",
        kind: "price-line",
        price: targetOne,
        label: `✓ 目标1 ▸ ${targetOne.toFixed(2)}`,
        tone: "target",
        color: bullColor,
        fromTimestamp: projectionStart,
        toTimestamp: projectionEnd,
      },
      {
        id: "trend-targets-target-2",
        kind: "price-line",
        price: targetTwo,
        label: `✓ 目标2 ▸ ${targetTwo.toFixed(2)}`,
        tone: "target",
        color: bullColor,
        fromTimestamp: projectionStart,
        toTimestamp: projectionEnd,
      },
      {
        id: "trend-targets-target-3",
        kind: "price-line",
        price: targetThree,
        label: `✓ 目标3 ▸ ${targetThree.toFixed(2)}`,
        tone: "target",
        color: bullColor,
        fromTimestamp: projectionStart,
        toTimestamp: projectionEnd,
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
        toTimestamp: projectionEnd,
      });
    }
  }

  const lastBaseline = [...baseline].reverse().find(isSeriesNumber) ?? 0;
  const previousBaseline =
    [...baseline.slice(0, -1)].reverse().find(isSeriesNumber) ?? lastBaseline;
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

export function createTrendTargetsStrategyDefinition(): StrategyDefinition {
  const trendTargetsStrategy: StrategyDefinition = {
    key: "trend-targets",
    name: "Trend Targets 趋势目标",
    version: "1.0.0",
    description:
      "按 Pine Script 复刻 Supertrend 中线、WMA/EMA 平滑、趋势转变、拒绝确认与 ATR 目标位。",
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
  return trendTargetsStrategy;
}
