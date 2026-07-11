import type { CandlePoint, ChartRenderLayer } from "@quant/chart";

export interface ChartIndicatorParameter {
  readonly key: string;
  readonly label: string;
  readonly type: "number" | "boolean";
  readonly defaultValue: number | boolean;
}

export interface ChartIndicatorDefinition {
  readonly id: string;
  readonly name: string;
  readonly parameters: readonly ChartIndicatorParameter[];
  evaluate(candles: readonly CandlePoint[], parameters: Readonly<Record<string, unknown>>): ChartRenderLayer | null;
}

export interface ChartIndicatorRegistry {
  register(definition: ChartIndicatorDefinition): void;
  get(id: string): ChartIndicatorDefinition | undefined;
  list(): readonly ChartIndicatorDefinition[];
}

export function createChartIndicatorRegistry(initialDefinitions: readonly ChartIndicatorDefinition[] = []): ChartIndicatorRegistry {
  const definitions = new Map<string, ChartIndicatorDefinition>();
  return {
    register(definition) {
      if (definitions.has(definition.id)) throw new Error(`重复指标注册：${definition.id}`);
      definitions.set(definition.id, definition);
    },
    get: (id) => definitions.get(id),
    list: () => Array.from(definitions.values()),
  };
}

export interface ChartIndicatorSettings {
  readonly movingAverage: { readonly available: boolean; readonly enabled: boolean; readonly visible: boolean; readonly window: number };
  readonly bollingerBands: { readonly available: boolean; readonly enabled: boolean; readonly visible: boolean; readonly window: number; readonly multiplier: number };
}

export const defaultChartIndicatorSettings: ChartIndicatorSettings = {
  movingAverage: { available: true, enabled: true, visible: true, window: 9 },
  bollingerBands: { available: true, enabled: false, visible: true, window: 20, multiplier: 2 },
};

export function createChartIndicatorLayers(candles: readonly CandlePoint[], settings: ChartIndicatorSettings): ChartRenderLayer[] {
  const points = candles.map((candle, index) => ({ timestamp: candle.timestamp ?? index, close: candle.close }));
  const layers: ChartRenderLayer[] = [];

  if (settings.movingAverage.available && settings.movingAverage.enabled) {
    layers.push({
      id: "indicator-moving-average",
      name: `均线 ${settings.movingAverage.window}`,
      source: "indicator",
      enabled: true,
      visible: settings.movingAverage.visible,
      zIndex: 20,
      elements: [{
        id: "moving-average-line",
        kind: "trend-line",
        tone: "bullish",
        points: movingAverage(points, settings.movingAverage.window),
      }],
    });
  }

  if (settings.bollingerBands.available && settings.bollingerBands.enabled) {
    const bands = bollingerBands(points, settings.bollingerBands.window, settings.bollingerBands.multiplier);
    layers.push({
      id: "indicator-bollinger-bands",
      name: "布林带",
      source: "indicator",
      enabled: true,
      visible: settings.bollingerBands.visible,
      zIndex: 18,
      elements: [
        { id: "boll-upper", kind: "trend-line", tone: "bearish", points: bands.map((point) => ({ timestamp: point.timestamp, price: point.upper })) },
        { id: "boll-mid", kind: "trend-line", tone: "neutral", points: bands.map((point) => ({ timestamp: point.timestamp, price: point.mid })) },
        { id: "boll-lower", kind: "trend-line", tone: "bullish", points: bands.map((point) => ({ timestamp: point.timestamp, price: point.lower })) },
      ],
    });
  }

  return layers;
}

export function createPluginIndicatorLayers(
  candles: readonly CandlePoint[],
  definitions: readonly ChartIndicatorDefinition[],
): ChartRenderLayer[] {
  return definitions.flatMap((definition) => {
    try {
      const parameters = Object.fromEntries(definition.parameters.map((parameter) => [parameter.key, parameter.defaultValue]));
      const layer = definition.evaluate(candles, parameters);
      return layer ? [layer] : [];
    } catch {
      return [];
    }
  });
}

function movingAverage(points: readonly { timestamp: number; close: number }[], window: number) {
  const size = Math.max(2, Math.min(240, Math.round(window)));
  return points.map((point, index) => {
    const values = points.slice(Math.max(0, index - size + 1), index + 1);
    return { timestamp: point.timestamp, price: values.reduce((total, item) => total + item.close, 0) / values.length };
  });
}

function bollingerBands(points: readonly { timestamp: number; close: number }[], window: number, multiplier: number) {
  const size = Math.max(2, Math.min(240, Math.round(window)));
  const factor = Math.max(0.1, Math.min(6, multiplier));
  return points.map((point, index) => {
    const values = points.slice(Math.max(0, index - size + 1), index + 1).map((item) => item.close);
    const mid = values.reduce((total, value) => total + value, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((total, value) => total + (value - mid) ** 2, 0) / values.length);
    return { timestamp: point.timestamp, mid, upper: mid + deviation * factor, lower: mid - deviation * factor };
  });
}
