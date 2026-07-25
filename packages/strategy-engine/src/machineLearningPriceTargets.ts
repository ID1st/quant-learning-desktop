import {
  atr,
  ema,
  highest,
  hma,
  lowest,
  rollingSum,
  rsi,
  sma,
  supertrend,
  trueRange,
  type SeriesValue,
} from "@quant/pine-runtime";

import type {
  Bar,
  StrategyDefinition,
  StrategyHudPanel,
  StrategyOutput,
  StrategySignal,
  StrategyVisualElement,
} from "./index.ts";

const MINIMUM_BARS = 1_000;
const MAX_HISTORY_BARS = 5_000;
const MAX_BOXES = 500;
const NEUTRAL_CANDLE_COLOR = "#7B8190";

type TrendMethod = "SuperTrend" | "HMA (Increasing or Decreasing)" | "EMA Cross (Fast Slow)";
type Direction = 1 | -1;

interface FeatureVector {
  values: [number, number, number, number, number, number, number, number];
}

interface TrainingSample {
  features: FeatureVector;
  target: number;
}

interface VisualTrade {
  id: number;
  direction: Direction;
  entryTimestamp: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  markerPrice: number;
  endTimestamp: number;
  active: boolean;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numberParameter(parameters: Record<string, unknown>, key: string, fallback: number, minimum = 1) {
  const value = parameters[key];
  return finite(value) ? Math.max(minimum, value) : fallback;
}

function colorParameter(parameters: Record<string, unknown>, key: string, fallback: string) {
  const value = parameters[key];
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

function normalizeRolling(series: readonly SeriesValue[], length: number) {
  const minimum = lowest(series, length);
  const maximum = highest(series, length);

  return series.map((value, index) => {
    const low = minimum[index];
    const high = maximum[index];
    if (!finite(value) || !finite(low) || !finite(high) || high === low) {
      return null;
    }
    return ((value - low) / (high - low)) * 100;
  });
}

function difference(left: readonly SeriesValue[], right: readonly SeriesValue[]) {
  return left.map((value, index) => finite(value) && finite(right[index]) ? value - right[index]! : null);
}

function divide(left: readonly SeriesValue[], right: readonly SeriesValue[], multiplier = 1) {
  return left.map((value, index) => {
    const divisor = right[index];
    return finite(value) && finite(divisor) && divisor !== 0 ? (value / divisor) * multiplier : null;
  });
}

function featureAt(index: number, series: ReadonlyArray<readonly (number | null)[]>): FeatureVector | null {
  const values = series.map((entry) => entry[index]);
  return values.length === 8 && values.every(finite)
    ? { values: values as FeatureVector["values"] }
    : null;
}

function predictRbf(samples: readonly TrainingSample[], current: FeatureVector | null, bandwidth: number) {
  if (!current || samples.length === 0) {
    return null;
  }

  let weightedTargets = 0;
  let kernels = 0;
  for (const sample of samples) {
    const distanceSquared = sample.features.values.reduce((total, value, index) => {
      const differenceValue = value - current.values[index]!;
      return total + differenceValue * differenceValue;
    }, 0);
    const kernel = Math.exp(-Math.pow(Math.sqrt(distanceSquared) / bandwidth, 2));
    weightedTargets += kernel * sample.target;
    kernels += kernel;
  }

  return kernels > 0 && finite(weightedTargets / kernels) ? weightedTargets / kernels : null;
}

function calculateRewardRisk(successRate: number | null) {
  if (!finite(successRate) || successRate <= 0) {
    return null;
  }
  const rewardRisk = 1 / successRate - 1;
  return finite(rewardRisk) && rewardRisk > 0 ? rewardRisk : null;
}

function resolveTradeHit(
  trade: Pick<VisualTrade, "direction" | "targetPrice" | "stopPrice">,
  bar: Pick<Bar, "high" | "low">,
) {
  const targetHit = trade.direction === 1
    ? bar.high >= trade.targetPrice
    : bar.low <= trade.targetPrice;
  if (targetHit) {
    return "target" as const;
  }
  const stopHit = trade.direction === 1
    ? bar.low <= trade.stopPrice
    : bar.high >= trade.stopPrice;
  return stopHit ? "stop" as const : null;
}

function calculateFeatureSeries(
  bars: readonly Bar[],
  scaledTrend: readonly (number | null)[],
): ReadonlyArray<readonly (number | null)[]> {
  const closes = bars.map((bar) => bar.close);
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const volumes = bars.map((bar) => bar.volume);
  const ranges = bars.map((bar) => bar.high - bar.low);
  const highest14 = highest(highs, 14);
  const lowest14 = lowest(lows, 14);
  const dumpFromHigh = highest14.map((value, index) =>
    finite(value) && value !== 0 ? (value - closes[index]!) / value : null);
  const pumpFromLow = lowest14.map((value, index) =>
    finite(value) && value !== 0 ? (closes[index]! - value) / value : null);
  const feature1 = rsi(dumpFromHigh, 14);
  const feature2 = rsi(pumpFromLow, 14);

  const volatility = sma(ranges, 40);
  const volatilityMean = ema(volatility, 20);
  const volatilityChange = difference(volatility, volatilityMean);
  const feature3 = normalizeRolling(volatilityChange, 1_000);
  const volatilityAcceleration = ema(volatilityChange, 10);
  const volatilitySecondDerivative = difference(volatilityChange, volatilityAcceleration);
  const feature4 = normalizeRolling(volatilitySecondDerivative, 1_000);

  const shortVolume = ema(volumes, 7);
  const longVolume = ema(volumes, 14);
  const feature5 = divide(difference(shortVolume, longVolume), longVolume, 100);
  const tr = trueRange(bars);
  const trSum = rollingSum(tr, 14);
  const feature6 = trSum.map((value, index) => {
    const range = finite(highest14[index]) && finite(lowest14[index])
      ? highest14[index]! - lowest14[index]!
      : null;
    return finite(value) && finite(range) && range > 0
      ? (100 * Math.log10(value / range)) / Math.log10(14)
      : null;
  });
  const feature7 = rsi(closes, 14);

  return [feature1, feature2, feature3, feature4, feature5, feature6, feature7, scaledTrend];
}

export const machineLearningPriceTargetsTestSupport = {
  calculateFeatureSeries,
  calculateRewardRisk,
  predictRbf,
  resolveTradeHit,
};

function createHudPanel(input: {
  trainingSize: string;
  predictedMove: number | null;
  successRate: number | null;
  rewardRisk: number | null;
  inTrade: boolean;
}): StrategyHudPanel {
  const percent = (value: number | null) => finite(value) ? `${(value * 100).toFixed(2)}%` : "—";
  const decimal = (value: number | null) => finite(value) ? value.toFixed(2) : "—";

  return {
    id: "ml-price-target-metrics",
    title: "Indicator Metrics",
    valueHeading: "Value",
    placement: "top-right",
    rows: [
      { id: "training-size", label: "Training Data Size", value: input.trainingSize },
      { id: "predicted-move", label: "Predicted Move Size", value: percent(input.predictedMove) },
      {
        id: "success-rate",
        label: "Success Rate (When price moves more or equal to predicted amount)",
        value: percent(input.successRate),
      },
      { id: "recommended-rr", label: "Recommended Reward/Risk Ratio", value: decimal(input.rewardRisk) },
      {
        id: "in-trade",
        label: "In Trade",
        value: input.inTrade ? "Yes" : "No",
        tone: input.inTrade ? "positive" : "muted",
      },
    ],
  };
}

function emptyOutput(
  enabled: boolean,
  logs: string[],
  hudPanel?: StrategyHudPanel,
): StrategyOutput {
  return {
    signals: [],
    overlays: [],
    render: {
      strategyId: "machine-learning-price-targets",
      strategyName: "Machine Learning Price Target Prediction Signals [AlgoAlpha]",
      enabled,
      zIndex: 30,
      elements: [],
      hudPanels: enabled && hudPanel ? [hudPanel] : [],
    },
    metrics: {},
    logs,
    alerts: [],
  };
}

export function runMachineLearningPriceTargets(
  definition: StrategyDefinition,
  input: Parameters<StrategyDefinition["run"]>[0],
): StrategyOutput {
  const enabled = input.enabled ?? definition.defaultEnabled ?? false;
  if (!enabled) {
    return emptyOutput(false, ["Machine Learning Price Targets 当前已停用。"]);
  }

  const confirmedBars = [...input.bars]
    .filter((bar) => input.confirmedThroughTimestamp === undefined || bar.timestamp <= input.confirmedThroughTimestamp)
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-MAX_HISTORY_BARS);
  const confirmedCount = confirmedBars.length;

  if (confirmedCount < MINIMUM_BARS) {
    return emptyOutput(
      true,
      [`Machine Learning Price Targets 预热中：${confirmedCount} / ${MINIMUM_BARS} 根已确认 K 线。`],
      createHudPanel({
        trainingSize: `${confirmedCount} / ${MINIMUM_BARS}`,
        predictedMove: null,
        successRate: null,
        rewardRisk: null,
        inTrade: false,
      }),
    );
  }

  if (confirmedBars.reduce((total, bar) => total + Math.max(0, bar.volume), 0) === 0) {
    return emptyOutput(
      true,
      ["Machine Learning Price Targets 成交量不可用：当前数据源未提供有效 volume。"],
      createHudPanel({
        trainingSize: "成交量不可用",
        predictedMove: null,
        successRate: null,
        rewardRisk: null,
        inTrade: false,
      }),
    );
  }

  const closes = confirmedBars.map((bar) => bar.close);
  const method = (input.parameters.trendMethod ?? "EMA Cross (Fast Slow)") as TrendMethod;
  const hmaLength = Math.round(numberParameter(input.parameters, "hmaLength", 93));
  const fastEmaLength = Math.round(numberParameter(input.parameters, "fastEmaLength", 50));
  const slowEmaLength = Math.round(numberParameter(input.parameters, "slowEmaLength", 200));
  const supertrendFactor = numberParameter(input.parameters, "supertrendFactor", 3, 0.1);
  const supertrendAtrLength = Math.round(numberParameter(input.parameters, "supertrendAtrLength", 10));
  const bandwidth = numberParameter(input.parameters, "bandwidth", 5, 2);
  const hideNaPredictions = input.parameters.hideNaPredictions !== false;
  const bullishColor = colorParameter(input.parameters, "bullishColor", "#00FFBB");
  const bearishColor = colorParameter(input.parameters, "bearishColor", "#FF1100");
  const fastEma = ema(closes, fastEmaLength);
  const slowEma = ema(closes, slowEmaLength);
  const hull = hma(closes, hmaLength);
  const supertrendResult = supertrend(confirmedBars, supertrendFactor, supertrendAtrLength);
  const trend: Array<Direction | null> = confirmedBars.map((_, index) => {
    if (method === "SuperTrend") {
      const direction = supertrendResult.direction[index];
      return direction === null ? null : direction === -1 ? 1 : -1;
    }
    if (method === "HMA (Increasing or Decreasing)") {
      return finite(hull[index]) && finite(hull[index - 1]) ? (hull[index]! > hull[index - 1]! ? 1 : -1) : null;
    }
    return finite(fastEma[index]) && finite(slowEma[index]) ? (fastEma[index]! > slowEma[index]! ? 1 : -1) : null;
  });
  const scaledTrend = trend.map((value) => value === null ? null : value === 1 ? 1 : 0);
  const featureSeries = calculateFeatureSeries(confirmedBars, scaledTrend);
  const atr14 = atr(confirmedBars, 14);

  const samples: TrainingSample[] = [];
  const trades: VisualTrade[] = [];
  const signals: StrategySignal[] = [];
  const alerts: string[] = [];
  const candleStyles: StrategyVisualElement[] = [];
  let activeTrade: VisualTrade | null = null;
  let segmentStart = -1;
  let segmentHigh = Number.NEGATIVE_INFINITY;
  let segmentLow = Number.POSITIVE_INFINITY;
  let segmentPrediction: number | null = null;
  let latestPrediction: number | null = null;
  let totalPredictions = 0;
  let correctPredictions = 0;
  let tradeId = 0;

  confirmedBars.forEach((bar, index) => {
    const direction = trend[index];
    const previousDirection = trend[index - 1];
    const crossed = direction !== null && previousDirection !== null && direction !== previousDirection;

    if (crossed) {
      if (segmentStart >= 0 && previousDirection !== null) {
        const startPrice = confirmedBars[segmentStart]!.close;
        const previousMove = Math.abs(previousDirection === 1
          ? (segmentHigh - startPrice) / startPrice
          : (segmentLow - startPrice) / startPrice);
        const previousFeatures = featureAt(segmentStart, featureSeries);
        if (previousFeatures && finite(previousMove)) {
          samples.unshift({ features: previousFeatures, target: previousMove });
        }
        if (finite(segmentPrediction)) {
          totalPredictions += 1;
          if (previousMove > segmentPrediction) {
            correctPredictions += 1;
          }
        }
      }

      if (activeTrade) {
        activeTrade.active = false;
        activeTrade.endTimestamp = bar.timestamp;
        activeTrade = null;
      }

      const currentFeatures = featureAt(index, featureSeries);
      latestPrediction = predictRbf(samples, currentFeatures, bandwidth);
      const successRate = totalPredictions > 0 ? correctPredictions / totalPredictions : null;
      const rewardRisk = calculateRewardRisk(successRate);
      const prediction = latestPrediction;
      const canCreateSignal = finite(prediction) && finite(rewardRisk)
        && (!hideNaPredictions || prediction !== null);

      if (canCreateSignal && direction !== null) {
        const targetPrice = direction === 1
          ? bar.close + bar.close * prediction
          : bar.close - bar.close * prediction;
        const stopPrice = direction === 1
          ? bar.close - bar.close * prediction / rewardRisk
          : bar.close + bar.close * prediction / rewardRisk;
        const markerOffset = atr14[index] ?? 0;
        const markerPrice = direction === 1 ? stopPrice - markerOffset : stopPrice + markerOffset;

        if ([targetPrice, stopPrice, markerPrice].every(finite)) {
          activeTrade = {
            id: ++tradeId,
            direction,
            entryTimestamp: bar.timestamp,
            entryPrice: bar.close,
            targetPrice,
            stopPrice,
            markerPrice,
            endTimestamp: bar.timestamp,
            active: true,
          };
          trades.push(activeTrade);
          signals.push({
            timestamp: bar.timestamp,
            type: direction === 1 ? "buy" : "sell",
            price: bar.close,
            label: direction === 1 ? "Bullish Signal" : "Bearish Signal",
          });
          alerts.push(direction === 1 ? "New bullish trend signal detected" : "New bearish trend signal detected");
        }
      }

      segmentStart = index;
      segmentHigh = bar.high;
      segmentLow = bar.low;
      segmentPrediction = latestPrediction;
    } else if (direction !== null) {
      if (segmentStart < 0) {
        segmentStart = index;
        segmentPrediction = null;
      }
      segmentHigh = Math.max(segmentHigh, bar.high);
      segmentLow = Math.min(segmentLow, bar.low);
    }

    if (activeTrade && !crossed) {
      activeTrade.endTimestamp = bar.timestamp;
      const tradeHit = resolveTradeHit(activeTrade, bar);
      if (tradeHit) {
        const hitTarget = tradeHit === "target";
        activeTrade.active = false;
        signals.push({
          timestamp: bar.timestamp,
          type: "exit",
          price: hitTarget ? activeTrade.targetPrice : activeTrade.stopPrice,
          label: hitTarget ? "Take Profit Hit" : "Stop Loss Hit",
        });
        alerts.push(hitTarget ? "Take profit level has been reached" : "Stop loss level has been reached");
        activeTrade = null;
      }
    }

    candleStyles.push({
      id: `ml-candle-${bar.timestamp}`,
      kind: "candle-style",
      timestamp: bar.timestamp,
      color: activeTrade ? (activeTrade.direction === 1 ? bullishColor : bearishColor) : NEUTRAL_CANDLE_COLOR,
      opacity: 1,
      zIndex: 35,
    });
  });

  const tradeElements = trades.slice(-Math.floor(MAX_BOXES / 2)).flatMap<StrategyVisualElement>((trade) => [
    {
      id: `ml-target-${trade.id}`,
      kind: "band",
      fromPrice: trade.entryPrice,
      toPrice: trade.targetPrice,
      tone: "target",
      fromTimestamp: trade.entryTimestamp,
      toTimestamp: trade.endTimestamp,
      fillColor: bullishColor,
      borderColor: bullishColor,
      opacity: 0.2,
      placement: "under-candles",
      zIndex: 12,
    },
    {
      id: `ml-risk-${trade.id}`,
      kind: "band",
      fromPrice: trade.entryPrice,
      toPrice: trade.stopPrice,
      tone: "risk",
      fromTimestamp: trade.entryTimestamp,
      toTimestamp: trade.endTimestamp,
      fillColor: bearishColor,
      borderColor: bearishColor,
      opacity: 0.2,
      placement: "under-candles",
      zIndex: 13,
    },
    {
      id: `ml-entry-${trade.id}`,
      kind: "signal-marker",
      timestamp: trade.entryTimestamp,
      price: trade.markerPrice,
      direction: trade.direction === 1 ? "up" : "down",
      tone: trade.direction === 1 ? "buy" : "sell",
      shape: trade.direction === 1 ? "label-up" : "label-down",
      text: trade.direction === 1 ? "▲" : "▼",
      color: trade.direction === 1 ? bullishColor : bearishColor,
      opacity: 1,
      placement: "over-candles",
      zIndex: 50,
    },
  ]);
  const overlays = [...tradeElements, ...candleStyles];
  const successRate = totalPredictions > 0 ? correctPredictions / totalPredictions : null;
  const rewardRisk = calculateRewardRisk(successRate);
  const hudPanel = createHudPanel({
    trainingSize: String(samples.length),
    predictedMove: latestPrediction,
    successRate,
    rewardRisk: finite(rewardRisk) ? rewardRisk : null,
    inTrade: activeTrade !== null,
  });
  const metrics: Record<string, number> = {
    trainingSampleCount: samples.length,
    totalPredictions,
    correctPredictions,
    inTrade: activeTrade ? 1 : 0,
  };
  if (finite(latestPrediction)) metrics.predictedMove = latestPrediction;
  if (finite(successRate)) metrics.successRate = successRate;
  if (finite(rewardRisk)) metrics.recommendedRewardRisk = rewardRisk;

  return {
    signals,
    overlays,
    render: {
      strategyId: definition.key,
      strategyName: definition.name,
      enabled: true,
      zIndex: 30,
      elements: overlays,
      hudPanels: [hudPanel],
    },
    metrics,
    logs: [
      `Machine Learning Price Targets 已使用 ${confirmedCount} 根已确认 K 线，训练样本 ${samples.length} 个。`,
      finite(latestPrediction) ? `当前预测波动 ${(latestPrediction * 100).toFixed(2)}%。` : "当前尚无有效预测。",
    ],
    alerts,
  };
}

export function createMachineLearningPriceTargetsStrategyDefinition(): StrategyDefinition {
  const definition: StrategyDefinition = {
    key: "machine-learning-price-targets",
    name: "Machine Learning Price Target Prediction Signals [AlgoAlpha]",
    version: "1.0.0",
    description: "使用八维市场特征与 RBF 核回归估计趋势段价格移动，并绘制确认后的目标、风险和统计图层。",
    sourceType: "preset",
    sourceFile: "trading-strategies/Machine Learning Price Target Prediction Signals.md",
    strategyType: "indicator",
    defaultEnabled: false,
    supportedMarkets: ["CN", "HK", "US"],
    supportedTimeframes: ["realtime"],
    realtimeHistoryRequirement: {
      minimumBars: MINIMUM_BARS,
      preferredBars: MAX_HISTORY_BARS,
      sessionCount: 22,
    },
    parameterSchema: [
      {
        key: "trendMethod",
        label: "趋势信号",
        type: "select",
        defaultValue: "EMA Cross (Fast Slow)",
        options: [
          { label: "EMA Cross (Fast Slow)", value: "EMA Cross (Fast Slow)" },
          { label: "HMA (Increasing or Decreasing)", value: "HMA (Increasing or Decreasing)" },
          { label: "SuperTrend", value: "SuperTrend" },
        ],
      },
      { key: "hmaLength", label: "HMA 长度", type: "number", defaultValue: 93 },
      { key: "fastEmaLength", label: "快速 EMA", type: "number", defaultValue: 50 },
      { key: "slowEmaLength", label: "慢速 EMA", type: "number", defaultValue: 200 },
      { key: "supertrendFactor", label: "SuperTrend 系数", type: "number", defaultValue: 3 },
      { key: "supertrendAtrLength", label: "SuperTrend ATR 长度", type: "number", defaultValue: 10 },
      { key: "bandwidth", label: "RBF 带宽", type: "number", defaultValue: 5 },
      { key: "hideNaPredictions", label: "隐藏无效预测", type: "boolean", defaultValue: true },
      { key: "bullishColor", label: "看涨颜色", type: "color", defaultValue: "#00FFBB" },
      { key: "bearishColor", label: "看跌颜色", type: "color", defaultValue: "#FF1100" },
    ],
    run: (input) => runMachineLearningPriceTargets(definition, input),
  };

  return definition;
}
