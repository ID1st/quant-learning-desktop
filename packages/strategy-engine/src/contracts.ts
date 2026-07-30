import type { Market, Timeframe } from "@quant/shared";

export interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyParameterDefinition {
  key: string;
  label: string;
  type: "number" | "boolean" | "select" | "color";
  defaultValue: number | boolean | string;
  description?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface StrategyInput {
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  bars: Bar[];
  seriesByTimeframe?: Partial<Record<Timeframe, readonly Bar[]>>;
  confirmedThroughTimestamp?: number;
  parameters: Record<string, unknown>;
  runMode: "backtest" | "realtime";
  enabled?: boolean;
}

export interface StrategyRunRequest {
  strategyKey: string;
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  bars: Bar[];
  seriesByTimeframe?: Partial<Record<Timeframe, readonly Bar[]>>;
  confirmedThroughTimestamp?: number;
  parameters?: Record<string, unknown>;
  runMode: "backtest" | "realtime";
  enabled?: boolean;
}

export interface StrategyRunResult {
  strategy: StrategyDefinition;
  input: StrategyInput;
  output: StrategyOutput;
}

export interface StrategySignal {
  timestamp: number;
  type: "buy" | "sell" | "exit" | "alert";
  backtestAction?: "enter-long" | "enter-short" | "exit-long" | "exit-short" | "none";
  price?: number;
  label?: string;
}

export interface StrategyVisualBase {
  id: string;
  visible?: boolean;
  zIndex?: number;
  color?: string;
  opacity?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  textSize?: "tiny" | "small" | "normal" | "large";
  labelAnchor?: "above" | "below" | "center" | "right";
  extendRight?: boolean;
  placement?: "under-candles" | "over-candles";
}

export interface StrategySignalMarker extends StrategyVisualBase {
  kind: "signal-marker";
  timestamp: number;
  price: number;
  direction: "up" | "down";
  tone: "buy" | "sell" | "neutral";
  shape?: "triangle" | "label-up" | "label-down";
  text?: string;
}

export interface StrategyPriceLine extends StrategyVisualBase {
  kind: "price-line";
  price: number;
  label?: string;
  tone: "target" | "stop" | "range" | "neutral";
  fromTimestamp?: number;
  toTimestamp?: number;
}

export interface StrategyTrendLine extends StrategyVisualBase {
  kind: "trend-line";
  points: Array<{ timestamp: number; price: number }>;
  tone: "bullish" | "bearish" | "neutral";
}

export interface StrategyBand extends StrategyVisualBase {
  kind: "band";
  fromPrice: number;
  toPrice: number;
  label?: string;
  tone: "range" | "risk" | "target";
  fromTimestamp?: number;
  toTimestamp?: number;
  fillColor?: string;
  borderColor?: string;
}

export interface StrategyLabel extends StrategyVisualBase {
  kind: "label";
  timestamp: number;
  price: number;
  text: string;
  tone: "info" | "warning" | "success";
}

export interface StrategyCandleStyle extends StrategyVisualBase {
  kind: "candle-style";
  timestamp: number;
  color: string;
}

export type StrategyVisualElement =
  | StrategySignalMarker
  | StrategyPriceLine
  | StrategyTrendLine
  | StrategyBand
  | StrategyLabel
  | StrategyCandleStyle;

export interface StrategyHudPanel {
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

export interface StrategyRenderOutput {
  strategyId: string;
  strategyName: string;
  enabled: boolean;
  zIndex: number;
  elements: StrategyVisualElement[];
  hudPanels?: StrategyHudPanel[];
}

export interface StrategyOutput {
  signals: StrategySignal[];
  overlays: StrategyVisualElement[];
  render: StrategyRenderOutput;
  metrics: Record<string, number>;
  logs: string[];
  alerts: string[];
}

export interface StrategyDefinition {
  key: string;
  name: string;
  version: string;
  description: string;
  sourceType: "preset" | "user" | "plugin";
  sourceFile?: string;
  strategyType?: "indicator" | "strategy";
  defaultEnabled?: boolean;
  supportedMarkets: Market[];
  supportedTimeframes: Timeframe[];
  realtimeHistoryRequirement?: {
    minimumBars: number;
    preferredBars: number;
    sessionCount: number;
  };
  parameterSchema: StrategyParameterDefinition[];
  run(input: StrategyInput): StrategyOutput;
}
