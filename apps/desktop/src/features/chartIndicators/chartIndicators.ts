import type { CandlePoint, ChartPaneModel, ChartRenderLayer } from "@quant/chart";
import type { Market } from "@quant/shared";
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
  type IndicatorConvention,
  type IndicatorValuePoint,
} from "./indicatorMath.ts";

export type ChartIndicatorPlacement = "overlay" | "pane";
export type ChartIndicatorParameterValue = number | boolean;
export type IndicatorConventionMode = "auto" | IndicatorConvention;

export interface ChartIndicatorParameter {
  readonly key: string;
  readonly label: string;
  readonly type: "number" | "boolean";
  readonly defaultValue: ChartIndicatorParameterValue;
  readonly aShareDefaultValue?: ChartIndicatorParameterValue;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
}

export type ChartIndicatorEvaluationResult =
  | { readonly placement: "overlay"; readonly layer: ChartRenderLayer }
  | { readonly placement: "pane"; readonly pane: ChartPaneModel };

export interface ChartIndicatorDefinition {
  readonly id: string;
  readonly name: string;
  /**
   * Optional for legacy plugins. Missing placement is normalized to a main-chart overlay.
   */
  readonly placement?: ChartIndicatorPlacement;
  readonly parameters: readonly ChartIndicatorParameter[];
  evaluate(
    candles: readonly CandlePoint[],
    parameters: Readonly<Record<string, ChartIndicatorParameterValue>>,
    convention?: IndicatorConvention,
  ): ChartIndicatorEvaluationResult | ChartRenderLayer | null;
}

export interface ChartIndicatorRegistry {
  register(definition: ChartIndicatorDefinition): void;
  get(id: string): ChartIndicatorDefinition | undefined;
  list(): readonly ChartIndicatorDefinition[];
}

export interface ChartIndicatorInstanceSettings {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly parametersByConvention: Readonly<
    Record<IndicatorConvention, Readonly<Record<string, ChartIndicatorParameterValue>>>
  >;
}

export interface ChartIndicatorSettings {
  readonly conventionMode: IndicatorConventionMode;
  readonly instances: Readonly<Record<string, ChartIndicatorInstanceSettings>>;
}

export type ChartIndicatorEvaluation =
  | {
      readonly id: string;
      readonly placement: "overlay";
      readonly visible: boolean;
      readonly layer: ChartRenderLayer;
    }
  | {
      readonly id: string;
      readonly placement: "pane";
      readonly visible: boolean;
      readonly pane: ChartPaneModel;
    };

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

const builtInById = new Map(
  builtInChartIndicatorDefinitions.map((definition) => [definition.id, definition]),
);

export const defaultChartIndicatorSettings: ChartIndicatorSettings = {
  conventionMode: "auto",
  instances: Object.fromEntries(
    builtInChartIndicatorDefinitions.map((definition) => [
      definition.id,
      createDefaultIndicatorInstance(definition),
    ]),
  ),
};

export function createChartIndicatorRegistry(
  initialDefinitions: readonly ChartIndicatorDefinition[] = [],
): ChartIndicatorRegistry {
  const definitions = new Map<string, ChartIndicatorDefinition>();
  initialDefinitions.forEach((definition) => definitions.set(definition.id, definition));
  return {
    register(definition) {
      if (definitions.has(definition.id)) throw new Error(`重复指标注册：${definition.id}`);
      definitions.set(definition.id, definition);
    },
    get: (id) => definitions.get(id),
    list: () => Array.from(definitions.values()),
  };
}

function defaultParameters(definition: ChartIndicatorDefinition, convention: IndicatorConvention) {
  return Object.fromEntries(
    definition.parameters.map((parameter) => [
      parameter.key,
      convention === "a-share"
        ? (parameter.aShareDefaultValue ?? parameter.defaultValue)
        : parameter.defaultValue,
    ]),
  );
}

export function createDefaultIndicatorInstance(
  definition: ChartIndicatorDefinition,
  enabled = false,
): ChartIndicatorInstanceSettings {
  return {
    available: true,
    enabled,
    visible: true,
    parametersByConvention: {
      "a-share": defaultParameters(definition, "a-share"),
      "cross-market": defaultParameters(definition, "cross-market"),
    },
  };
}

export function getIndicatorInstance(
  settings: ChartIndicatorSettings,
  indicatorId: string,
  definition?: ChartIndicatorDefinition,
): ChartIndicatorInstanceSettings {
  const instances =
    settings &&
    typeof settings === "object" &&
    settings.instances &&
    typeof settings.instances === "object"
      ? settings.instances
      : {};
  const resolvedDefinition = definition ?? builtInById.get(indicatorId);
  return (
    instances[indicatorId] ??
    (resolvedDefinition
      ? createDefaultIndicatorInstance(resolvedDefinition)
      : {
          available: true,
          enabled: false,
          visible: true,
          parametersByConvention: { "a-share": {}, "cross-market": {} },
        })
  );
}

export function resolveIndicatorConvention(
  mode: IndicatorConventionMode,
  market: Market,
): IndicatorConvention {
  if (mode !== "auto") return mode;
  return market === "CN" ? "a-share" : "cross-market";
}

export function getIndicatorParameters(
  instance: ChartIndicatorInstanceSettings,
  convention: IndicatorConvention,
): Readonly<Record<string, ChartIndicatorParameterValue>> {
  return instance.parametersByConvention[convention] ?? {};
}

export function updateIndicatorInstance(
  settings: ChartIndicatorSettings,
  indicatorId: string,
  update: (current: ChartIndicatorInstanceSettings) => ChartIndicatorInstanceSettings,
  definition?: ChartIndicatorDefinition,
): ChartIndicatorSettings {
  const current = getIndicatorInstance(settings, indicatorId, definition);
  return { ...settings, instances: { ...settings.instances, [indicatorId]: update(current) } };
}

export function setIndicatorEnabled(
  settings: ChartIndicatorSettings,
  indicatorId: string,
  enabled: boolean,
  definitions: readonly ChartIndicatorDefinition[] = builtInChartIndicatorDefinitions,
): ChartIndicatorSettings {
  const definition =
    definitions.find((item) => item.id === indicatorId) ?? builtInById.get(indicatorId);
  const instances = { ...settings.instances };
  if (enabled && definition?.placement === "pane") {
    definitions
      .filter((item) => item.placement === "pane" && item.id !== indicatorId)
      .forEach((item) => {
        const current = getIndicatorInstance(settings, item.id, item);
        instances[item.id] = { ...current, enabled: false };
      });
  }
  const current = getIndicatorInstance({ ...settings, instances }, indicatorId, definition);
  instances[indicatorId] = { ...current, available: true, enabled, visible: true };
  return { ...settings, instances };
}

export function updateIndicatorParameter(
  settings: ChartIndicatorSettings,
  indicatorId: string,
  convention: IndicatorConvention,
  key: string,
  value: ChartIndicatorParameterValue,
  definitionOverride?: ChartIndicatorDefinition,
): ChartIndicatorSettings {
  const definition = definitionOverride ?? builtInById.get(indicatorId);
  if (!definition) return settings;
  return updateIndicatorInstance(
    settings,
    indicatorId,
    (current) => ({
      ...current,
      parametersByConvention: {
        ...current.parametersByConvention,
        [convention]: sanitizeIndicatorParameters(
          { ...current.parametersByConvention[convention], [key]: value },
          definition,
          convention,
        ),
      },
    }),
    definition,
  );
}

export function ensureChartIndicatorSettings(
  settings: ChartIndicatorSettings,
  definitions: readonly ChartIndicatorDefinition[],
): ChartIndicatorSettings {
  const instances = { ...settings.instances };
  definitions.forEach((definition) => {
    instances[definition.id] = sanitizeIndicatorInstance(instances[definition.id], definition);
  });
  let paneFound = false;
  definitions
    .filter((definition) => definition.placement === "pane")
    .forEach((definition) => {
      const instance = instances[definition.id]!;
      if (!instance.enabled) return;
      instances[definition.id] = { ...instance, enabled: !paneFound };
      paneFound = true;
    });
  return {
    conventionMode: sanitizeConventionMode(settings.conventionMode),
    instances,
  };
}

function normalizeEvaluation(
  result: ChartIndicatorEvaluationResult | ChartRenderLayer,
  definition: ChartIndicatorDefinition,
): ChartIndicatorEvaluationResult {
  if ("placement" in result && (result.placement === "overlay" || result.placement === "pane"))
    return result as ChartIndicatorEvaluationResult;
  return {
    placement: definition.placement === "pane" ? "pane" : "overlay",
    layer: result as ChartRenderLayer,
  } as ChartIndicatorEvaluationResult;
}

export function createChartIndicatorEvaluations(
  candles: readonly CandlePoint[],
  settings: ChartIndicatorSettings,
  convention: IndicatorConvention,
  definitions: readonly ChartIndicatorDefinition[] = builtInChartIndicatorDefinitions,
): ChartIndicatorEvaluation[] {
  const evaluations: ChartIndicatorEvaluation[] = [];
  definitions.forEach((definition) => {
    const instance = getIndicatorInstance(settings, definition.id, definition);
    if (!instance.available || !instance.enabled) return;
    try {
      const evaluated = definition.evaluate(
        candles,
        sanitizeIndicatorParameters(
          getIndicatorParameters(instance, convention),
          definition,
          convention,
        ),
        convention,
      );
      if (!evaluated) return;
      const result = normalizeEvaluation(evaluated, definition);
      if (result.placement === "pane") {
        evaluations.push({
          id: definition.id,
          placement: "pane",
          visible: instance.visible,
          pane: result.pane,
        });
        return;
      }
      evaluations.push({
        id: definition.id,
        placement: "overlay",
        visible: instance.visible,
        layer: { ...result.layer, visible: instance.visible, zIndex: result.layer.zIndex ?? 20 },
      });
    } catch {
      return;
    }
  });
  return evaluations;
}

export function createChartIndicatorLayers(
  candles: readonly CandlePoint[],
  settings: ChartIndicatorSettings,
  definitions: readonly ChartIndicatorDefinition[] = builtInChartIndicatorDefinitions,
  convention: IndicatorConvention = "cross-market",
): ChartRenderLayer[] {
  return createChartIndicatorEvaluations(candles, settings, convention, definitions).flatMap(
    (evaluation) => (evaluation.placement === "overlay" ? [evaluation.layer] : []),
  );
}

export function createChartSecondaryPane(
  candles: readonly CandlePoint[],
  settings: ChartIndicatorSettings,
  convention: IndicatorConvention,
  definitions: readonly ChartIndicatorDefinition[] = builtInChartIndicatorDefinitions,
): ChartPaneModel | undefined {
  const evaluation = createChartIndicatorEvaluations(
    candles,
    settings,
    convention,
    definitions,
  ).find(
    (item): item is Extract<ChartIndicatorEvaluation, { placement: "pane" }> =>
      item.placement === "pane" && item.visible,
  );
  return evaluation?.pane;
}

export function createPluginIndicatorLayers(
  candles: readonly CandlePoint[],
  definitions: readonly ChartIndicatorDefinition[],
  settings: ChartIndicatorSettings,
  convention: IndicatorConvention = "cross-market",
): ChartRenderLayer[] {
  return createChartIndicatorLayers(candles, settings, definitions, convention);
}

export function sanitizeChartIndicatorSettings(value: unknown): ChartIndicatorSettings {
  if (value && typeof value === "object" && "instances" in value) {
    const parsed = value as { conventionMode?: unknown; instances?: unknown };
    const rawInstances =
      parsed.instances && typeof parsed.instances === "object" && !Array.isArray(parsed.instances)
        ? (parsed.instances as Record<string, unknown>)
        : {};
    const migratedInstances = { ...rawInstances };
    if (!migratedInstances.ma && migratedInstances.sma)
      migratedInstances.ma = migrateSmaInstance(migratedInstances.sma);
    migratedInstances.ema = migrateLegacyWindowParameters(migratedInstances.ema, "ema");
    migratedInstances.boll = migrateLegacyWindowParameters(migratedInstances.boll, "boll");
    const instances = Object.fromEntries(
      builtInChartIndicatorDefinitions.map((definition) => [
        definition.id,
        sanitizeIndicatorInstance(migratedInstances[definition.id], definition),
      ]),
    );
    Object.entries(migratedInstances).forEach(([id, instance]) => {
      if (id !== "sma" && !builtInById.has(id))
        instances[id] = sanitizeUnknownIndicatorInstance(instance);
    });
    return ensureChartIndicatorSettings(
      {
        conventionMode: sanitizeConventionMode(parsed.conventionMode),
        instances,
      },
      builtInChartIndicatorDefinitions,
    );
  }

  const legacy =
    value && typeof value === "object"
      ? (value as {
          movingAverage?: Partial<{
            available: boolean;
            enabled: boolean;
            visible: boolean;
            window: number;
          }>;
          bollingerBands?: Partial<{
            available: boolean;
            enabled: boolean;
            visible: boolean;
            window: number;
            multiplier: number;
          }>;
        })
      : {};
  const instances = Object.fromEntries(
    builtInChartIndicatorDefinitions.map((definition) => [
      definition.id,
      createDefaultIndicatorInstance(definition),
    ]),
  );
  if (legacy.movingAverage)
    instances.ma = sanitizeIndicatorInstance(
      migrateSmaInstance(legacy.movingAverage),
      builtInById.get("ma")!,
    );
  if (legacy.bollingerBands) {
    const legacyBoll = {
      ...legacy.bollingerBands,
      parameters: {
        period: legacy.bollingerBands.window,
        multiplier: legacy.bollingerBands.multiplier,
      },
    };
    instances.boll = sanitizeIndicatorInstance(legacyBoll, builtInById.get("boll")!);
  }
  return { conventionMode: "auto", instances };
}

function migrateSmaInstance(value: unknown) {
  const parsed =
    value && typeof value === "object"
      ? (value as {
          available?: boolean;
          enabled?: boolean;
          visible?: boolean;
          window?: number;
          parameters?: { window?: number };
        })
      : {};
  const first = Number.isFinite(parsed.parameters?.window)
    ? parsed.parameters!.window!
    : Number.isFinite(parsed.window)
      ? parsed.window!
      : 5;
  const periods = [first, 10, 20, 60].filter((period, index, all) => all.indexOf(period) === index);
  [5, 10, 20, 60].forEach((period) => {
    if (periods.length < 4 && !periods.includes(period)) periods.push(period);
  });
  return {
    available: parsed.available,
    enabled: parsed.enabled,
    visible: parsed.visible,
    parameters: Object.fromEntries(
      periods.slice(0, 4).map((period, index) => [`period${index + 1}`, period]),
    ),
  };
}

function migrateLegacyWindowParameters(value: unknown, indicatorId: "ema" | "boll") {
  if (!value || typeof value !== "object") return value;
  const parsed = value as {
    parameters?: Readonly<Record<string, unknown>>;
    parametersByConvention?: unknown;
  };
  if (
    parsed.parametersByConvention ||
    !parsed.parameters ||
    !Number.isFinite(parsed.parameters.window)
  )
    return value;
  const parameters =
    indicatorId === "ema"
      ? { period1: parsed.parameters.window, period2: 10, period3: 20, period4: 60 }
      : { period: parsed.parameters.window, multiplier: parsed.parameters.multiplier };
  return { ...parsed, parameters };
}

function sanitizeConventionMode(value: unknown): IndicatorConventionMode {
  return value === "a-share" || value === "cross-market" ? value : "auto";
}

function sanitizeUnknownIndicatorInstance(value: unknown): ChartIndicatorInstanceSettings {
  const parsed =
    value && typeof value === "object"
      ? (value as {
          available?: unknown;
          enabled?: unknown;
          visible?: unknown;
          parameters?: unknown;
          parametersByConvention?: Partial<Record<IndicatorConvention, unknown>>;
        })
      : {};
  const sanitizeParameters = (parameters: unknown) =>
    parameters && typeof parameters === "object" && !Array.isArray(parameters)
      ? Object.fromEntries(
          Object.entries(parameters).flatMap(([key, candidate]) =>
            typeof candidate === "boolean" ||
            (typeof candidate === "number" && Number.isFinite(candidate))
              ? [[key, candidate]]
              : [],
          ),
        )
      : {};
  const legacy = sanitizeParameters(parsed.parameters);
  return {
    available: typeof parsed.available === "boolean" ? parsed.available : true,
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
    visible: typeof parsed.visible === "boolean" ? parsed.visible : true,
    parametersByConvention: {
      "a-share": sanitizeParameters(parsed.parametersByConvention?.["a-share"] ?? legacy),
      "cross-market": sanitizeParameters(parsed.parametersByConvention?.["cross-market"] ?? legacy),
    },
  };
}

function sanitizeIndicatorInstance(
  value: unknown,
  definition: ChartIndicatorDefinition,
): ChartIndicatorInstanceSettings {
  const parsed =
    value && typeof value === "object"
      ? (value as {
          available?: unknown;
          enabled?: unknown;
          visible?: unknown;
          parameters?: Readonly<Record<string, unknown>>;
          parametersByConvention?: Partial<
            Record<IndicatorConvention, Readonly<Record<string, unknown>>>
          >;
        })
      : {};
  const legacyParameters = parsed.parameters ?? {};
  return {
    available: typeof parsed.available === "boolean" ? parsed.available : true,
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
    visible: typeof parsed.visible === "boolean" ? parsed.visible : true,
    parametersByConvention: {
      "a-share": sanitizeIndicatorParameters(
        parsed.parametersByConvention?.["a-share"] ?? legacyParameters,
        definition,
        "a-share",
      ),
      "cross-market": sanitizeIndicatorParameters(
        parsed.parametersByConvention?.["cross-market"] ?? legacyParameters,
        definition,
        "cross-market",
      ),
    },
  };
}

function sanitizeIndicatorParameters(
  value: Readonly<Record<string, unknown>>,
  definition: ChartIndicatorDefinition,
  convention: IndicatorConvention,
): Record<string, ChartIndicatorParameterValue> {
  return Object.fromEntries(
    definition.parameters.map((parameter) => {
      const fallback =
        convention === "a-share"
          ? (parameter.aShareDefaultValue ?? parameter.defaultValue)
          : parameter.defaultValue;
      const candidate = value[parameter.key];
      if (parameter.type === "boolean")
        return [parameter.key, typeof candidate === "boolean" ? candidate : fallback];
      const number =
        typeof candidate === "number" && Number.isFinite(candidate) ? candidate : Number(fallback);
      return [
        parameter.key,
        Math.min(
          parameter.maximum ?? Number.POSITIVE_INFINITY,
          Math.max(parameter.minimum ?? Number.NEGATIVE_INFINITY, number),
        ),
      ];
    }),
  );
}
