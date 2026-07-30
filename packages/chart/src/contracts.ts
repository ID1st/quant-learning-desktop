import type { Market, Timeframe } from "@quant/shared";
import type { ChartLabelAnchor, ChartLineStyle } from "./strategyLayerStyle.ts";

export interface ChartContext {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
}

export interface ChartAdapter {
  mount(container: HTMLElement, context: ChartContext): void;
  update(context: ChartContext): void;
  destroy(): void;
}

export interface CandlePoint {
  time: string;
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  signal?: "buy" | "sell";
}

export type ChartDisplayMode = "candlestick" | "line";
export type ChartLayerTone = "buy" | "sell" | "range" | "risk" | "target" | "stop" | "neutral";
export type ChartTrendTone = "bullish" | "bearish" | "neutral";

export interface ChartLayerVisualBase {
  visible?: boolean;
  zIndex?: number;
  color?: string;
  opacity?: number;
  lineStyle?: ChartLineStyle;
  textSize?: "tiny" | "small" | "normal" | "large";
  labelAnchor?: ChartLabelAnchor;
  extendRight?: boolean;
  placement?: "under-candles" | "over-candles";
}

export type ChartLayerElement = ChartLayerVisualBase &
  (
    | {
        id: string;
        kind: "signal-marker";
        timestamp: number;
        price: number;
        direction: "up" | "down";
        tone: Extract<ChartLayerTone, "buy" | "sell" | "neutral">;
        shape?: "triangle" | "label-up" | "label-down";
        text?: string;
      }
    | {
        id: string;
        kind: "price-line";
        price: number;
        label?: string;
        tone: Extract<ChartLayerTone, "target" | "stop" | "range" | "neutral">;
        fromTimestamp?: number;
        toTimestamp?: number;
      }
    | {
        id: string;
        kind: "trend-line";
        points: Array<{ timestamp: number; price: number }>;
        tone: ChartTrendTone;
      }
    | {
        id: string;
        kind: "point-series";
        points: Array<{ timestamp: number; price: number }>;
        tone: ChartTrendTone;
        radius?: number;
      }
    | {
        id: string;
        kind: "channel";
        upper: Array<{ timestamp: number; price: number }>;
        middle?: Array<{ timestamp: number; price: number }>;
        lower: Array<{ timestamp: number; price: number }>;
        upperTone?: ChartTrendTone;
        middleTone?: ChartTrendTone;
        lowerTone?: ChartTrendTone;
        fillColor?: string;
      }
    | {
        id: string;
        kind: "band";
        fromPrice: number;
        toPrice: number;
        label?: string;
        tone: Extract<ChartLayerTone, "range" | "risk" | "target" | "stop">;
        fromTimestamp?: number;
        toTimestamp?: number;
        fillColor?: string;
        borderColor?: string;
      }
    | {
        id: string;
        kind: "text";
        timestamp: number;
        price: number;
        text: string;
        tone?: "info" | "warning" | "success";
      }
    | {
        id: string;
        kind: "candle-style";
        timestamp: number;
        color: string;
      }
  );

export interface ChartHudPanel {
  id: string;
  title: string;
  valueHeading?: string;
  placement: "top-right";
  rows: Array<{
    id: string;
    label: string;
    value: string;
    tone?: "neutral" | "positive" | "negative" | "muted";
  }>;
}

export interface ChartLayer {
  strategyId: string;
  strategyName: string;
  enabled: boolean;
  zIndex: number;
  elements: ChartLayerElement[];
  hudPanels?: ChartHudPanel[];
}

export type ChartLayerSource = "strategy" | "indicator" | "drawing";

export interface ChartRenderLayer {
  id: string;
  name: string;
  source: ChartLayerSource;
  enabled: boolean;
  visible: boolean;
  zIndex: number;
  elements: ChartLayerElement[];
  hudPanels?: ChartHudPanel[];
  legendValues?: Array<{ readonly label: string; readonly value: string; readonly color?: string }>;
}

export interface ChartPaneValuePoint {
  readonly timestamp: number;
  readonly value: number;
  readonly tone?: "positive" | "negative" | "neutral";
}

export interface ChartPaneSeries {
  readonly id: string;
  readonly name: string;
  readonly type: "line" | "histogram" | "columns";
  readonly color: string;
  readonly negativeColor?: string;
  readonly values: readonly ChartPaneValuePoint[];
}

export interface ChartPaneReferenceLine {
  readonly id: string;
  readonly value: number;
  readonly label?: string;
  readonly color?: string;
}

export interface ChartPaneModel {
  readonly id: string;
  readonly name: string;
  readonly parameterSummary: string;
  readonly series: readonly ChartPaneSeries[];
  readonly referenceLines?: readonly ChartPaneReferenceLine[];
  readonly latestValues?: readonly {
    readonly label: string;
    readonly value: string;
    readonly color?: string;
  }[];
  readonly axis?: {
    readonly minimum?: number;
    readonly maximum?: number;
    readonly includeZero?: boolean;
  };
}

export interface ChartViewportProps {
  context?: ChartContext;
  candles?: CandlePoint[];
  showSignals?: boolean;
  strategyLayers?: ChartLayer[];
  layers?: ChartRenderLayer[];
  secondaryPane?: ChartPaneModel;
  secondaryPaneRatio?: number;
  onSecondaryPaneRatioChange?: (ratio: number) => void;
  onSecondaryPaneSettings?: () => void;
  onSecondaryPaneClose?: () => void;
  showStrategyLayers?: boolean;
  showCrosshair?: boolean;
  showGrid?: boolean;
  showPriceLabels?: boolean;
  showCurrentPriceLine?: boolean;
  displayMode?: ChartDisplayMode;
  canvasWidth?: number;
  canvasHeight?: number;
  initialVisibleBars?: number;
  resetViewKey?: number;
  focusLatestKey?: number;
  lockPriceScale?: boolean;
  drawingTool?: "trend-line" | "horizontal-line" | "text" | null;
  onDrawingPoint?: (point: { readonly timestamp: number; readonly price: number }) => void;
  onDrawingElementSelect?: (drawingId: string) => void;
  onDrawingElementMove?: (
    drawingId: string,
    pointIndex: number | null,
    point: { readonly timestamp: number; readonly price: number },
  ) => void;
  onDrawingElementDragEnd?: () => void;
  loadingState?: {
    readonly stage: string;
    readonly message: string;
    readonly isError?: boolean;
  };
}
