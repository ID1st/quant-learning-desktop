import type { CandlePoint, ChartRenderLayer } from "@quant/chart";

export interface ChartIndicatorSettings {
  readonly movingAverage: { readonly enabled: boolean; readonly window: number };
  readonly bollingerBands: { readonly enabled: boolean; readonly window: number; readonly multiplier: number };
}

export const defaultChartIndicatorSettings: ChartIndicatorSettings = {
  movingAverage: { enabled: true, window: 9 },
  bollingerBands: { enabled: false, window: 20, multiplier: 2 },
};

export function createChartIndicatorLayers(candles: readonly CandlePoint[], settings: ChartIndicatorSettings): ChartRenderLayer[] {
  const points = candles.map((candle, index) => ({ timestamp: candle.timestamp ?? index, close: candle.close }));
  const layers: ChartRenderLayer[] = [];

  if (settings.movingAverage.enabled) {
    layers.push({
      id: "indicator-moving-average",
      name: `均线 ${settings.movingAverage.window}`,
      source: "indicator",
      enabled: true,
      visible: true,
      zIndex: 20,
      elements: [{
        id: "moving-average-line",
        kind: "trend-line",
        tone: "bullish",
        points: movingAverage(points, settings.movingAverage.window),
      }],
    });
  }

  if (settings.bollingerBands.enabled) {
    const bands = bollingerBands(points, settings.bollingerBands.window, settings.bollingerBands.multiplier);
    layers.push({
      id: "indicator-bollinger-bands",
      name: "布林带",
      source: "indicator",
      enabled: true,
      visible: true,
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
