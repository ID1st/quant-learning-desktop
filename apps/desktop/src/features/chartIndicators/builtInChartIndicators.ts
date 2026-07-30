import type { ChartPaneModel } from "@quant/chart";
import {
  calculateBbi,
  calculateBoll,
  calculateCci,
  calculateEma,
  calculateEne,
  calculateKdj,
  calculateMa,
  calculateMacd,
  calculateRsi,
  calculateSar,
  calculateVolumeMa,
  calculateWr,
  type IndicatorValuePoint,
} from "./indicatorMath.ts";
import type {
  ChartIndicatorDefinition,
  ChartIndicatorEvaluationResult,
  ChartIndicatorParameterValue,
} from "./chartIndicatorContracts.ts";

const overlayColors = ["#f5c451", "#58a6ff", "#b48efa", "#42c7b9"];
const paneColors = ["#f5c451", "#58a6ff", "#b48efa"];

const linePoints = (points: readonly IndicatorValuePoint[]) =>
  points.map((point) => ({ timestamp: point.timestamp, price: point.value }));

const latestValue = (points: readonly IndicatorValuePoint[]) => points.at(-1)?.value;
const formatValue = (value: number | undefined, digits = 2) =>
  Number.isFinite(value) ? value!.toFixed(digits) : "--";

function lineLayer(
  id: string,
  name: string,
  series: readonly {
    readonly id: string;
    readonly label: string;
    readonly color: string;
    readonly points: readonly IndicatorValuePoint[];
  }[],
): ChartIndicatorEvaluationResult {
  return {
    placement: "overlay",
    layer: {
      id: `indicator-${id}`,
      name,
      source: "indicator",
      enabled: true,
      visible: true,
      zIndex: 20,
      elements: series.map((item) => ({
        id: `${id}-${item.id}`,
        kind: "trend-line" as const,
        tone: "neutral" as const,
        color: item.color,
        points: linePoints(item.points),
      })),
      legendValues: series.map((item) => ({
        label: item.label,
        value: formatValue(latestValue(item.points)),
        color: item.color,
      })),
    },
  };
}

function createPane(
  id: string,
  name: string,
  parameterSummary: string,
  series: ChartPaneModel["series"],
  referenceLines?: ChartPaneModel["referenceLines"],
  axis?: ChartPaneModel["axis"],
): ChartIndicatorEvaluationResult {
  return {
    placement: "pane",
    pane: {
      id: `indicator-${id}`,
      name,
      parameterSummary,
      series,
      referenceLines,
      axis,
      latestValues: series.map((item) => ({
        label: item.name,
        value: formatValue(item.values.at(-1)?.value),
        color: item.color,
      })),
    },
  };
}

const numeric = (parameters: Readonly<Record<string, ChartIndicatorParameterValue>>, key: string) =>
  Number(parameters[key]);

export const builtInChartIndicatorDefinitions: readonly ChartIndicatorDefinition[] = [
  {
    id: "ma",
    name: "MA",
    placement: "overlay",
    parameters: [1, 2, 3, 4].map((index) => ({
      key: `period${index}`,
      label: `MA${index} 周期`,
      type: "number" as const,
      defaultValue: [5, 10, 20, 60][index - 1]!,
      minimum: 2,
      maximum: 240,
      step: 1,
    })),
    evaluate: (candles, parameters) => {
      const periods = [1, 2, 3, 4].map((index) => numeric(parameters, `period${index}`));
      return lineLayer(
        "ma",
        "MA",
        periods.map((period, index) => ({
          id: String(period),
          label: `MA${period}`,
          color: overlayColors[index]!,
          points: calculateMa(candles, period),
        })),
      );
    },
  },
  {
    id: "boll",
    name: "BOLL",
    placement: "overlay",
    parameters: [
      {
        key: "period",
        label: "周期",
        type: "number",
        defaultValue: 20,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
      {
        key: "multiplier",
        label: "标准差倍数",
        type: "number",
        defaultValue: 2,
        minimum: 0.1,
        maximum: 6,
        step: 0.1,
      },
    ],
    evaluate: (candles, parameters) => {
      const period = numeric(parameters, "period");
      const multiplier = numeric(parameters, "multiplier");
      const bands = calculateBoll(candles, period, multiplier);
      return {
        placement: "overlay",
        layer: {
          id: "indicator-boll",
          name: "BOLL",
          source: "indicator",
          enabled: true,
          visible: true,
          zIndex: 18,
          elements: [
            {
              id: "boll-channel",
              kind: "channel",
              upper: bands.map((point) => ({ timestamp: point.timestamp, price: point.upper })),
              middle: bands.map((point) => ({ timestamp: point.timestamp, price: point.mid })),
              lower: bands.map((point) => ({ timestamp: point.timestamp, price: point.lower })),
              upperTone: "bearish",
              middleTone: "neutral",
              lowerTone: "bullish",
              fillColor: "rgba(88,166,255,.07)",
            },
          ],
          legendValues: [
            { label: "UP", value: formatValue(bands.at(-1)?.upper), color: "#e06c75" },
            { label: "MID", value: formatValue(bands.at(-1)?.mid), color: "#f5c451" },
            { label: "LOW", value: formatValue(bands.at(-1)?.lower), color: "#42c7b9" },
          ],
        },
      };
    },
  },
  {
    id: "ema",
    name: "EMA",
    placement: "overlay",
    parameters: [1, 2, 3, 4].map((index) => ({
      key: `period${index}`,
      label: `EMA${index} 周期`,
      type: "number" as const,
      defaultValue: [5, 10, 20, 60][index - 1]!,
      minimum: 2,
      maximum: 240,
      step: 1,
    })),
    evaluate: (candles, parameters) => {
      const periods = [1, 2, 3, 4].map((index) => numeric(parameters, `period${index}`));
      return lineLayer(
        "ema",
        "EMA",
        periods.map((period, index) => ({
          id: String(period),
          label: `EMA${period}`,
          color: overlayColors[index]!,
          points: calculateEma(candles, period),
        })),
      );
    },
  },
  {
    id: "bbi",
    name: "BBI",
    placement: "overlay",
    parameters: [1, 2, 3, 4].map((index) => ({
      key: `period${index}`,
      label: `周期 ${index}`,
      type: "number" as const,
      defaultValue: [3, 6, 12, 24][index - 1]!,
      minimum: 2,
      maximum: 240,
      step: 1,
    })),
    evaluate: (candles, parameters) => {
      const periods = [1, 2, 3, 4].map((index) => numeric(parameters, `period${index}`));
      return lineLayer("bbi", "BBI", [
        { id: "line", label: "BBI", color: "#b48efa", points: calculateBbi(candles, periods) },
      ]);
    },
  },
  {
    id: "ene",
    name: "ENE",
    placement: "overlay",
    parameters: [
      {
        key: "period",
        label: "周期",
        type: "number",
        defaultValue: 10,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
      {
        key: "upperPercent",
        label: "上轨百分比",
        type: "number",
        defaultValue: 11,
        minimum: 0,
        maximum: 100,
        step: 0.1,
      },
      {
        key: "lowerPercent",
        label: "下轨百分比",
        type: "number",
        defaultValue: 9,
        minimum: 0,
        maximum: 100,
        step: 0.1,
      },
    ],
    evaluate: (candles, parameters) => {
      const bands = calculateEne(
        candles,
        numeric(parameters, "period"),
        numeric(parameters, "upperPercent"),
        numeric(parameters, "lowerPercent"),
      );
      return {
        placement: "overlay",
        layer: {
          id: "indicator-ene",
          name: "ENE",
          source: "indicator",
          enabled: true,
          visible: true,
          zIndex: 18,
          elements: [
            {
              id: "ene-channel",
              kind: "channel",
              upper: bands.map((point) => ({ timestamp: point.timestamp, price: point.upper })),
              middle: bands.map((point) => ({ timestamp: point.timestamp, price: point.mid })),
              lower: bands.map((point) => ({ timestamp: point.timestamp, price: point.lower })),
              upperTone: "bearish",
              middleTone: "neutral",
              lowerTone: "bullish",
            },
          ],
          legendValues: [
            { label: "UP", value: formatValue(bands.at(-1)?.upper), color: "#e06c75" },
            { label: "ENE", value: formatValue(bands.at(-1)?.mid), color: "#f5c451" },
            { label: "LOW", value: formatValue(bands.at(-1)?.lower), color: "#42c7b9" },
          ],
        },
      };
    },
  },
  {
    id: "sar",
    name: "SAR",
    placement: "overlay",
    parameters: [
      {
        key: "start",
        label: "起始加速因子",
        type: "number",
        defaultValue: 0.02,
        minimum: 0.001,
        maximum: 1,
        step: 0.01,
      },
      {
        key: "step",
        label: "加速步长",
        type: "number",
        defaultValue: 0.02,
        minimum: 0.001,
        maximum: 1,
        step: 0.01,
      },
      {
        key: "maximum",
        label: "最大加速因子",
        type: "number",
        defaultValue: 0.2,
        minimum: 0.01,
        maximum: 1,
        step: 0.01,
      },
    ],
    evaluate: (candles, parameters) => {
      const points = calculateSar(
        candles,
        numeric(parameters, "start"),
        numeric(parameters, "step"),
        numeric(parameters, "maximum"),
      );
      return {
        placement: "overlay",
        layer: {
          id: "indicator-sar",
          name: "SAR",
          source: "indicator",
          enabled: true,
          visible: true,
          zIndex: 22,
          elements: [
            {
              id: "sar-points",
              kind: "point-series",
              tone: "neutral",
              color: "#f5c451",
              radius: 2.2,
              points: linePoints(points),
            },
          ],
          legendValues: [
            { label: "SAR", value: formatValue(latestValue(points)), color: "#f5c451" },
          ],
        },
      };
    },
  },
  {
    id: "mavol",
    name: "MAVOL",
    placement: "pane",
    parameters: [
      {
        key: "period1",
        label: "短周期",
        type: "number",
        defaultValue: 5,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
      {
        key: "period2",
        label: "长周期",
        type: "number",
        defaultValue: 10,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
    ],
    evaluate: (candles, parameters) => {
      const period1 = numeric(parameters, "period1");
      const period2 = numeric(parameters, "period2");
      return createPane(
        "mavol",
        "MAVOL",
        `${period1}, ${period2}`,
        [
          {
            id: "volume",
            name: "VOL",
            type: "columns",
            color: "#42c7b9",
            negativeColor: "#e06c75",
            values: candles.map((candle, index) => ({
              timestamp: candle.timestamp ?? index,
              value: Math.max(0, Number.isFinite(candle.volume) ? candle.volume : 0),
              tone: candle.close >= candle.open ? "positive" : "negative",
            })),
          },
          {
            id: "ma1",
            name: `MA${period1}`,
            type: "line",
            color: paneColors[0]!,
            values: calculateVolumeMa(candles, period1),
          },
          {
            id: "ma2",
            name: `MA${period2}`,
            type: "line",
            color: paneColors[1]!,
            values: calculateVolumeMa(candles, period2),
          },
        ],
        undefined,
        { minimum: 0, includeZero: true },
      );
    },
  },
  {
    id: "macd",
    name: "MACD",
    placement: "pane",
    parameters: [
      {
        key: "fast",
        label: "快线周期",
        type: "number",
        defaultValue: 12,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
      {
        key: "slow",
        label: "慢线周期",
        type: "number",
        defaultValue: 26,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
      {
        key: "signal",
        label: "信号周期",
        type: "number",
        defaultValue: 9,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
    ],
    evaluate: (candles, parameters, convention = "cross-market") => {
      const fast = numeric(parameters, "fast");
      const slow = numeric(parameters, "slow");
      const signal = numeric(parameters, "signal");
      const points = calculateMacd(candles, fast, slow, signal, convention);
      return createPane(
        "macd",
        "MACD",
        `${fast}, ${slow}, ${signal}`,
        [
          {
            id: "histogram",
            name: "MACD",
            type: "histogram",
            color: "#42c7b9",
            negativeColor: "#e06c75",
            values: points.map((point) => ({
              timestamp: point.timestamp,
              value: point.histogram,
              tone: point.histogram >= 0 ? "positive" : "negative",
            })),
          },
          {
            id: "dif",
            name: "DIF",
            type: "line",
            color: paneColors[0]!,
            values: points.map((point) => ({ timestamp: point.timestamp, value: point.dif })),
          },
          {
            id: "dea",
            name: "DEA",
            type: "line",
            color: paneColors[1]!,
            values: points.map((point) => ({ timestamp: point.timestamp, value: point.dea })),
          },
        ],
        [{ id: "zero", value: 0 }],
        { includeZero: true },
      );
    },
  },
  {
    id: "vol",
    name: "VOL",
    placement: "pane",
    parameters: [],
    evaluate: (candles) =>
      createPane(
        "vol",
        "VOL",
        "成交量",
        [
          {
            id: "volume",
            name: "VOL",
            type: "columns",
            color: "#42c7b9",
            negativeColor: "#e06c75",
            values: candles.map((candle, index) => ({
              timestamp: candle.timestamp ?? index,
              value: Math.max(0, Number.isFinite(candle.volume) ? candle.volume : 0),
              tone: candle.close >= candle.open ? "positive" : "negative",
            })),
          },
        ],
        undefined,
        { minimum: 0, includeZero: true },
      ),
  },
  {
    id: "kdj",
    name: "KDJ",
    placement: "pane",
    parameters: [
      {
        key: "period",
        label: "RSV 周期",
        type: "number",
        defaultValue: 9,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
      {
        key: "kSmoothing",
        label: "K 平滑",
        type: "number",
        defaultValue: 3,
        minimum: 1,
        maximum: 30,
        step: 1,
      },
      {
        key: "dSmoothing",
        label: "D 平滑",
        type: "number",
        defaultValue: 3,
        minimum: 1,
        maximum: 30,
        step: 1,
      },
    ],
    evaluate: (candles, parameters) => {
      const period = numeric(parameters, "period");
      const kSmoothing = numeric(parameters, "kSmoothing");
      const dSmoothing = numeric(parameters, "dSmoothing");
      const points = calculateKdj(candles, period, kSmoothing, dSmoothing);
      return createPane("kdj", "KDJ", `${period}, ${kSmoothing}, ${dSmoothing}`, [
        {
          id: "k",
          name: "K",
          type: "line",
          color: paneColors[0]!,
          values: points.map((point) => ({ timestamp: point.timestamp, value: point.k })),
        },
        {
          id: "d",
          name: "D",
          type: "line",
          color: paneColors[1]!,
          values: points.map((point) => ({ timestamp: point.timestamp, value: point.d })),
        },
        {
          id: "j",
          name: "J",
          type: "line",
          color: paneColors[2]!,
          values: points.map((point) => ({ timestamp: point.timestamp, value: point.j })),
        },
      ]);
    },
  },
  {
    id: "rsi",
    name: "RSI",
    placement: "pane",
    parameters: [
      {
        key: "period1",
        label: "周期 1",
        type: "number",
        defaultValue: 14,
        aShareDefaultValue: 6,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
      {
        key: "period2",
        label: "周期 2",
        type: "number",
        defaultValue: 0,
        aShareDefaultValue: 12,
        minimum: 0,
        maximum: 240,
        step: 1,
      },
      {
        key: "period3",
        label: "周期 3",
        type: "number",
        defaultValue: 0,
        aShareDefaultValue: 24,
        minimum: 0,
        maximum: 240,
        step: 1,
      },
    ],
    evaluate: (candles, parameters, convention = "cross-market") => {
      const periods = [
        numeric(parameters, "period1"),
        numeric(parameters, "period2"),
        numeric(parameters, "period3"),
      ].filter((period) => period >= 2);
      const thresholds = convention === "a-share" ? [20, 80] : [30, 70];
      return createPane(
        "rsi",
        "RSI",
        periods.join(", "),
        periods.map((period, index) => ({
          id: String(period),
          name: `RSI${period}`,
          type: "line",
          color: paneColors[index]!,
          values: calculateRsi(candles, period),
        })),
        [
          { id: "lower", value: thresholds[0]!, label: String(thresholds[0]) },
          { id: "upper", value: thresholds[1]!, label: String(thresholds[1]) },
        ],
        { minimum: 0, maximum: 100 },
      );
    },
  },
  {
    id: "wr",
    name: "WR",
    placement: "pane",
    parameters: [
      {
        key: "period1",
        label: "周期 1",
        type: "number",
        defaultValue: 14,
        aShareDefaultValue: 10,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
      {
        key: "period2",
        label: "周期 2",
        type: "number",
        defaultValue: 0,
        aShareDefaultValue: 6,
        minimum: 0,
        maximum: 240,
        step: 1,
      },
    ],
    evaluate: (candles, parameters) => {
      const periods = [numeric(parameters, "period1"), numeric(parameters, "period2")].filter(
        (period) => period >= 2,
      );
      return createPane(
        "wr",
        "WR",
        periods.join(", "),
        periods.map((period, index) => ({
          id: String(period),
          name: `WR${period}`,
          type: "line",
          color: paneColors[index]!,
          values: calculateWr(candles, period),
        })),
        [
          { id: "lower", value: -80, label: "-80" },
          { id: "upper", value: -20, label: "-20" },
        ],
        { minimum: -100, maximum: 0 },
      );
    },
  },
  {
    id: "cci",
    name: "CCI",
    placement: "pane",
    parameters: [
      {
        key: "period",
        label: "周期",
        type: "number",
        defaultValue: 14,
        minimum: 2,
        maximum: 240,
        step: 1,
      },
      {
        key: "constant",
        label: "常数",
        type: "number",
        defaultValue: 0.015,
        minimum: 0.001,
        maximum: 1,
        step: 0.001,
      },
    ],
    evaluate: (candles, parameters) => {
      const period = numeric(parameters, "period");
      const constant = numeric(parameters, "constant");
      return createPane(
        "cci",
        "CCI",
        `${period}, ${constant}`,
        [
          {
            id: "cci",
            name: "CCI",
            type: "line",
            color: paneColors[0]!,
            values: calculateCci(candles, period, constant),
          },
        ],
        [
          { id: "lower", value: -100, label: "-100" },
          { id: "upper", value: 100, label: "100" },
        ],
        { includeZero: true },
      );
    },
  },
];
