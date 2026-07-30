import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type { Market, Timeframe } from "@quant/shared";
import {
  clampChartVisibleRange,
  getChartFuturePaddingBars,
  getPriceScaleOffsetForAnchor,
  panChartPriceRange,
  getScaledPriceRange,
  panChartVisibleRange,
  shouldInitializeChartViewAfterSparseLoad,
  syncChartVisibleRangeForDataUpdate,
  zoomChartVisibleRange,
  type ChartVisibleRange,
} from "./viewportMath.ts";
import { getProjectedPriceLabelLayout } from "./priceLabelLayout.ts";
import { clampSecondaryPaneRatio, getChartPaneGridTemplate } from "./paneLayout.ts";
import { shouldRenderChartLayer } from "./layerVisibility.ts";
import { getResponsiveSvgViewBoxHeight } from "./responsiveSvg.ts";
import {
  getChartHudRightOffset,
  getChartLabelPosition,
  getChartLineDasharray,
  getChartTextSize,
  getSignalMarkerLabelWidth,
  shouldExtendTimedElementToPlotRight,
  type ChartLabelAnchor,
  type ChartLineStyle,
} from "./strategyLayerStyle.ts";

export {
  clampChartVisibleRange,
  getChartFuturePaddingBars,
  getPriceScaleOffsetForAnchor,
  panChartPriceRange,
  getScaledPriceRange,
  panChartVisibleRange,
  shouldInitializeChartViewAfterSparseLoad,
  syncChartVisibleRangeForDataUpdate,
  zoomChartVisibleRange,
  type ChartVisibleRange,
} from "./viewportMath.ts";
export { clampSecondaryPaneRatio, getChartPaneGridTemplate } from "./paneLayout.ts";
export { shouldRenderChartLayer } from "./layerVisibility.ts";

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

interface ChartScaleDomain {
  minPrice: number;
  maxPrice: number;
}

const defaultContext: ChartContext = {
  symbol: "AAPL",
  market: "US",
  timeframe: "1d",
};

function generateCandles(context: ChartContext): CandlePoint[] {
  const seed = context.symbol.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  let previousClose = 166 + (seed % 28);
  const intervalMs =
    context.timeframe === "1w"
      ? 7 * 24 * 60 * 60_000
      : context.timeframe === "realtime"
        ? 60_000
        : 24 * 60 * 60_000;
  const endTimestamp = Date.now();

  return Array.from({ length: 64 }, (_, index) => {
    const wave = Math.sin((index + seed) / 4.2) * 3.8 + Math.cos(index / 7) * 2.4;
    const open = previousClose + Math.sin(index / 3) * 1.1;
    const close = open + wave * 0.42 + (index % 5 === 0 ? 1.2 : -0.3);
    const high = Math.max(open, close) + 1.4 + Math.abs(Math.sin(index)) * 2.1;
    const low = Math.min(open, close) - 1.2 - Math.abs(Math.cos(index)) * 1.8;
    const volume = 580000 + Math.round(Math.abs(wave) * 130000 + (index % 9) * 42000);
    previousClose = close;
    const timestamp = endTimestamp - (63 - index) * intervalMs;

    return {
      time: formatBeijingChartTime(timestamp, context.timeframe),
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      signal:
        index === 14 || index === 38 ? "buy" : index === 27 || index === 52 ? "sell" : undefined,
    };
  });
}

function createSmoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) {
    return "";
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} Q ${controlX} ${previous.y} ${point.x} ${point.y}`;
  }, "");
}

function formatPrice(value: number) {
  return value.toFixed(2);
}

function formatBeijingChartTime(timestamp: number, timeframe: Timeframe) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const date = `${value("year")}-${value("month")}-${value("day")}`;

  if (timeframe === "realtime") {
    return `${date} ${value("hour")}:${value("minute")}:${value("second")}`;
  }

  if (timeframe === "1d" || timeframe === "1w") {
    return date;
  }

  return `${date} ${value("hour")}:${value("minute")}`;
}

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function createDefaultVisibleRange(candleCount: number, visibleBarCount = 96): ChartVisibleRange {
  return {
    start: Math.max(0, candleCount - Math.max(12, visibleBarCount)),
    end: candleCount,
  };
}

function calculateScaleDomain(candles: CandlePoint[], range: ChartVisibleRange): ChartScaleDomain {
  const safeRange = clampChartVisibleRange(range, candles.length);
  const domainCandles = candles.slice(safeRange.start, safeRange.end);
  const highs = domainCandles.map((candle) => candle.high).filter(isFiniteNumber);
  const lows = domainCandles.map((candle) => candle.low).filter(isFiniteNumber);
  const closeFallbacks = domainCandles.map((candle) => candle.close).filter(isFiniteNumber);
  const fallbackPrice = closeFallbacks[closeFallbacks.length - 1] ?? 1;
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const safeMaxPrice = isFiniteNumber(maxPrice) ? maxPrice : fallbackPrice;
  const safeMinPrice = isFiniteNumber(minPrice) ? minPrice : fallbackPrice;
  const padding = Math.max((safeMaxPrice - safeMinPrice) * 0.08, safeMaxPrice * 0.002, 0.01);

  return {
    minPrice: safeMinPrice - padding,
    maxPrice: safeMaxPrice + padding,
  };
}

interface SecondaryPaneCanvasProps {
  readonly pane: ChartPaneModel;
  readonly width: number;
  readonly height: number;
  readonly plotLeft: number;
  readonly plotRight: number;
  readonly candleWidth: number;
  readonly hoverX: number | null;
  readonly hoveredTimestamp?: number;
  readonly showCrosshair: boolean;
  readonly showGrid: boolean;
  readonly showPriceLabels: boolean;
  readonly timeTicks: readonly { readonly x: number; readonly label: string }[];
  readonly timestampToX: (timestamp: number) => number | null;
  readonly onMouseMove: (event: MouseEvent<SVGSVGElement>) => void;
  readonly onMouseLeave: () => void;
  readonly onWheel: (event: WheelEvent<SVGSVGElement>) => void;
  readonly onPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
  readonly onSettings?: () => void;
  readonly onClose?: () => void;
}

function useResponsiveSvgViewBoxSize(fallbackWidth: number, fallbackHeight: number) {
  const [canvas, setCanvas] = useState<SVGSVGElement | null>(null);
  const [viewBoxSize, setViewBoxSize] = useState({
    width: fallbackWidth,
    height: fallbackHeight,
  });
  const canvasRef = useCallback((node: SVGSVGElement | null) => setCanvas(node), []);

  useEffect(() => {
    if (!canvas) {
      return;
    }

    const updateSize = (width: number, height: number) => {
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return;
      }
      setViewBoxSize((currentSize) =>
        Math.abs(currentSize.width - width) < 0.1 && Math.abs(currentSize.height - height) < 0.1
          ? currentSize
          : { width, height },
      );
    };

    const initialBounds = canvas.getBoundingClientRect();
    updateSize(initialBounds.width, initialBounds.height);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        updateSize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [canvas]);

  return { canvasRef, ...viewBoxSize };
}

function SecondaryPaneCanvas({
  pane,
  width,
  height,
  plotLeft,
  plotRight,
  candleWidth,
  hoverX,
  hoveredTimestamp,
  showCrosshair,
  showGrid,
  showPriceLabels,
  timeTicks,
  timestampToX,
  onMouseMove,
  onMouseLeave,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSettings,
  onClose,
}: SecondaryPaneCanvasProps) {
  const measuredSize = useResponsiveSvgViewBoxSize(width, height);
  const viewBoxHeight = getResponsiveSvgViewBoxHeight({
    cssHeight: measuredSize.height,
    cssWidth: measuredSize.width,
    fallbackHeight: height,
    viewBoxWidth: width,
  });
  const plotTop = 34;
  const plotBottom = viewBoxHeight - 28;
  const visibleValues = pane.series.flatMap((series) =>
    series.values.flatMap((point) => (timestampToX(point.timestamp) === null ? [] : [point.value])),
  );
  const referenceValues = pane.referenceLines?.map((line) => line.value) ?? [];
  const requestedMinimum = pane.axis?.minimum;
  const requestedMaximum = pane.axis?.maximum;
  const includeZero =
    pane.axis?.includeZero ?? pane.series.some((series) => series.type !== "line");
  const rawMinimum =
    requestedMinimum ??
    Math.min(...visibleValues, ...referenceValues, includeZero ? 0 : Number.POSITIVE_INFINITY);
  const rawMaximum =
    requestedMaximum ??
    Math.max(...visibleValues, ...referenceValues, includeZero ? 0 : Number.NEGATIVE_INFINITY);
  const fallbackMinimum = Number.isFinite(rawMinimum) ? rawMinimum : 0;
  const fallbackMaximum = Number.isFinite(rawMaximum) ? rawMaximum : 1;
  const padding =
    requestedMinimum !== undefined && requestedMaximum !== undefined
      ? 0
      : Math.max((fallbackMaximum - fallbackMinimum) * 0.08, 0.01);
  const minimum = requestedMinimum ?? fallbackMinimum - padding;
  const maximum = requestedMaximum ?? fallbackMaximum + padding;
  const range = Math.max(0.000001, maximum - minimum);
  const valueToY = (value: number) =>
    plotTop + ((maximum - value) / range) * (plotBottom - plotTop);
  const zeroY = valueToY(Math.min(maximum, Math.max(minimum, 0)));
  const axisTicks = Array.from({ length: 4 }, (_, index) => maximum - (range / 3) * index);
  const hoveredValue = pane.series
    .flatMap((series) => series.values)
    .find((point) => point.timestamp === hoveredTimestamp)?.value;

  return (
    <div className="chart-secondary-pane">
      <div className="chart-secondary-pane-title">
        <strong>{pane.name}</strong>
        <span>{pane.parameterSummary}</span>
        {pane.latestValues?.map((item) => (
          <span key={item.label} style={{ color: item.color }}>
            {item.label} {item.value}
          </span>
        ))}
        <span className="chart-secondary-pane-actions">
          {onSettings && (
            <button aria-label={`${pane.name} 参数`} onClick={onSettings} type="button">
              参数
            </button>
          )}
          {onClose && (
            <button aria-label={`关闭 ${pane.name}`} onClick={onClose} type="button">
              关闭
            </button>
          )}
        </span>
      </div>
      <svg
        className="chart-secondary-canvas"
        ref={measuredSize.canvasRef}
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        role="img"
        viewBox={`0 0 ${width} ${viewBoxHeight}`}
      >
        <rect className="chart-bg" height={viewBoxHeight} width={width} />
        {showGrid &&
          Array.from({ length: 4 }, (_, index) => {
            const y = plotTop + ((plotBottom - plotTop) / 3) * index;
            return (
              <line
                className="chart-grid-line"
                key={`secondary-h-${index}`}
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
              />
            );
          })}
        {showGrid &&
          Array.from({ length: 10 }, (_, index) => {
            const x = plotLeft + ((plotRight - plotLeft) / 9) * index;
            return (
              <line
                className="chart-grid-line"
                key={`secondary-v-${index}`}
                x1={x}
                x2={x}
                y1={plotTop}
                y2={plotBottom}
              />
            );
          })}
        {pane.referenceLines?.map((line) => (
          <g className="chart-pane-reference" key={line.id}>
            <line
              style={{ stroke: line.color }}
              x1={plotLeft}
              x2={plotRight}
              y1={valueToY(line.value)}
              y2={valueToY(line.value)}
            />
            {line.label && (
              <text x={plotRight - 4} y={valueToY(line.value) - 4}>
                {line.label}
              </text>
            )}
          </g>
        ))}
        {pane.series.map((series) => {
          const points = series.values.flatMap((point) => {
            const x = timestampToX(point.timestamp);
            return x === null || !Number.isFinite(point.value)
              ? []
              : [{ x, y: valueToY(point.value), point }];
          });
          if (series.type === "line") {
            return points.length < 2 ? null : (
              <path
                className="chart-pane-line"
                d={createSmoothPath(points)}
                key={series.id}
                style={{ stroke: series.color }}
              />
            );
          }
          return (
            <g key={series.id}>
              {points.map(({ x, y, point }) => {
                const top = Math.min(y, zeroY);
                const barHeight = Math.max(1, Math.abs(zeroY - y));
                const fill =
                  point.tone === "negative" ? (series.negativeColor ?? series.color) : series.color;
                return (
                  <rect
                    fill={fill}
                    height={barHeight}
                    key={`${series.id}-${point.timestamp}`}
                    opacity=".76"
                    width={Math.max(2, candleWidth)}
                    x={x - candleWidth / 2}
                    y={top}
                  />
                );
              })}
            </g>
          );
        })}
        {showPriceLabels && (
          <g className="price-axis-labels">
            {axisTicks.map((value) => (
              <text key={value} x={plotRight + 10} y={valueToY(value) + 4}>
                {formatPrice(value)}
              </text>
            ))}
          </g>
        )}
        <g className="time-axis-labels">
          {timeTicks.map((tick) => (
            <text key={`${tick.label}-${tick.x}`} x={tick.x} y={viewBoxHeight - 8}>
              {tick.label}
            </text>
          ))}
        </g>
        {showCrosshair && hoverX !== null && (
          <g className="crosshair">
            <line x1={hoverX} x2={hoverX} y1={plotTop} y2={plotBottom} />
            {hoveredValue !== undefined && (
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={valueToY(hoveredValue)}
                y2={valueToY(hoveredValue)}
              />
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

export function ChartViewport({
  candles: providedCandles,
  context = defaultContext,
  showSignals = true,
  strategyLayers = [],
  layers = [],
  secondaryPane,
  secondaryPaneRatio = 0.26,
  onSecondaryPaneRatioChange,
  onSecondaryPaneSettings,
  onSecondaryPaneClose,
  showStrategyLayers = true,
  showCrosshair = true,
  showGrid = true,
  showPriceLabels = true,
  showCurrentPriceLine = true,
  displayMode = "candlestick",
  canvasWidth = 980,
  canvasHeight = 520,
  initialVisibleBars = 96,
  resetViewKey = 0,
  focusLatestKey = 0,
  lockPriceScale = false,
  drawingTool = null,
  onDrawingPoint,
  onDrawingElementSelect,
  onDrawingElementMove,
  onDrawingElementDragEnd,
  loadingState,
}: ChartViewportProps) {
  const generatedCandles = useMemo(
    () => generateCandles(context),
    [context.symbol, context.market, context.timeframe],
  );
  const candles = providedCandles ?? generatedCandles;
  const contextKey = `${context.market}:${context.symbol}:${context.timeframe}`;
  const [visibleRange, setVisibleRange] = useState<ChartVisibleRange>(() =>
    createDefaultVisibleRange(candles.length, initialVisibleBars),
  );
  const [scaleDomain, setScaleDomain] = useState<ChartScaleDomain>(() =>
    calculateScaleDomain(candles, createDefaultVisibleRange(candles.length, initialVisibleBars)),
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(candles.length - 1);
  const previousChartStateRef = useRef({
    candleCount: candles.length,
    contextKey,
    resetViewKey,
    focusLatestKey,
  });
  const dragStateRef = useRef<
    | {
        mode: "pan";
        pointerId: number;
        startX: number;
        startY: number;
        startRange: ChartVisibleRange;
        startPriceOffset: number;
      }
    | {
        mode: "price-scale";
        pointerId: number;
        startY: number;
        startScaleFactor: number;
        anchorRatio: number;
        anchorPrice: number;
        baseMinPrice: number;
        baseMaxPrice: number;
      }
    | { mode: "drawing"; pointerId: number; drawingId: string; pointIndex: number | null }
    | null
  >(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isScalingPriceAxis, setIsScalingPriceAxis] = useState(false);
  const [priceScaleFactor, setPriceScaleFactor] = useState(1);
  const [pricePanOffset, setPricePanOffset] = useState(0);
  const secondaryPanRef = useRef<{
    pointerId: number;
    startX: number;
    startRange: ChartVisibleRange;
  } | null>(null);
  const measuredSize = useResponsiveSvgViewBoxSize(canvasWidth, canvasHeight);
  const width = measuredSize.width;
  const height = measuredSize.height;
  const hasCandles = candles.length > 0;
  const minimumInteractiveCandleCount = 12;

  useEffect(() => {
    const previous = previousChartStateRef.current;
    const shouldResetScale =
      previous.contextKey !== contextKey || previous.resetViewKey !== resetViewKey;
    const shouldFocusLatest = previous.focusLatestKey !== focusLatestKey;

    const shouldInitializeAfterSparseLoad = shouldInitializeChartViewAfterSparseLoad(
      previous.candleCount,
      candles.length,
      minimumInteractiveCandleCount,
    );

    if (
      shouldResetScale ||
      shouldFocusLatest ||
      (previous.candleCount === 0 && candles.length > 0) ||
      shouldInitializeAfterSparseLoad
    ) {
      const nextRange = createDefaultVisibleRange(candles.length, initialVisibleBars);
      setVisibleRange(nextRange);
      setScaleDomain(calculateScaleDomain(candles, nextRange));
      setHoverIndex(candles.length > 0 ? candles.length - 1 : null);
      setPriceScaleFactor(1);
      setPricePanOffset(0);
      previousChartStateRef.current = {
        candleCount: candles.length,
        contextKey,
        resetViewKey,
        focusLatestKey,
      };
      return;
    }

    setVisibleRange((current) =>
      syncChartVisibleRangeForDataUpdate(
        current,
        previous.candleCount,
        candles.length,
        getChartFuturePaddingBars(current),
      ),
    );
    setHoverIndex((current) => {
      if (candles.length === 0) {
        return null;
      }

      if (current === null) {
        return null;
      }

      return current >= previous.candleCount - 1
        ? candles.length - 1
        : Math.min(current, candles.length - 1);
    });
    previousChartStateRef.current = {
      candleCount: candles.length,
      contextKey,
      resetViewKey,
      focusLatestKey,
    };
  }, [candles, contextKey, focusLatestKey, initialVisibleBars, resetViewKey]);

  if (loadingState || !hasCandles) {
    return (
      <section
        className="chart-viewport"
        aria-label={`${context.symbol} ${context.timeframe} K 线图`}
      >
        <div className="chart-legend">
          <strong>{context.symbol}</strong>
          <span>{context.market}</span>
          <span>{context.timeframe}</span>
        </div>
        <div className="chart-interaction-toolbar" aria-label="图表缩放和移动">
          <button disabled type="button">
            放大
          </button>
          <button disabled type="button">
            缩小
          </button>
          <button disabled type="button">
            左移
          </button>
          <button disabled type="button">
            右移
          </button>
          <button disabled type="button">
            重置
          </button>
        </div>
        <div className="chart-loading-canvas">
          <svg aria-hidden="true" className="chart-loading-grid" viewBox="0 0 980 520">
            <rect className="chart-bg" height="520" width="980" />
            {Array.from({ length: 8 }, (_, index) => (
              <line
                className="chart-grid-line"
                key={`h-${index}`}
                x1="54"
                x2="894"
                y1={34 + (452 / 7) * index}
                y2={34 + (452 / 7) * index}
              />
            ))}
            {Array.from({ length: 10 }, (_, index) => (
              <line
                className="chart-grid-line"
                key={`v-${index}`}
                x1={54 + (840 / 9) * index}
                x2={54 + (840 / 9) * index}
                y1="34"
                y2="486"
              />
            ))}
            <line className="chart-loading-axis" x1="894" x2="894" y1="34" y2="486" />
            <g className="price-axis-labels">
              <text className="price-axis-title" x="904" y="48">
                价格
              </text>
              {Array.from({ length: 6 }, (_, index) => (
                <text key={`price-${index}`} x="904" y={112 + index * 66}>
                  --
                </text>
              ))}
            </g>
            <g className="time-axis-labels">
              {Array.from({ length: 5 }, (_, index) => (
                <text key={`time-${index}`} x={120 + index * 180} y="510">
                  --:--
                </text>
              ))}
            </g>
          </svg>
          <div
            className={`chart-loading-state${loadingState?.isError ? " error" : ""}`}
            role="status"
          >
            {!loadingState?.isError && (
              <span className="chart-loading-spinner" aria-hidden="true" />
            )}
            <strong>{loadingState?.isError ? "数据暂不可用" : "正在准备图表"}</strong>
            <span>{loadingState?.message ?? "暂无可用行情数据"}</span>
          </div>
        </div>
      </section>
    );
  }

  const chartTop = (34 / 520) * height;
  const chartBottom = secondaryPane ? height - 10 : height - 34;
  const priceHeight = Math.max(1, chartBottom - chartTop);
  const paddingX = (54 / 980) * width;
  const priceAxisWidth = (86 / 980) * width;
  const plotRight = width - priceAxisWidth;
  const safeVisibleRange = clampChartVisibleRange(
    visibleRange,
    candles.length,
    12,
    getChartFuturePaddingBars(visibleRange),
  );
  const visibleCandles = candles.slice(safeVisibleRange.start, safeVisibleRange.end);
  const visibleCount = Math.max(1, safeVisibleRange.end - safeVisibleRange.start);
  const candleGap = (plotRight - paddingX) / visibleCount;
  const candleWidth = Math.max(5, candleGap * 0.58);
  const scaledPriceRange = getScaledPriceRange(
    scaleDomain.minPrice,
    scaleDomain.maxPrice,
    priceScaleFactor,
  );
  const pannedPriceRange = panChartPriceRange(
    scaledPriceRange.min,
    scaledPriceRange.max,
    pricePanOffset,
  );
  const maxPrice = pannedPriceRange.max;
  const minPrice = pannedPriceRange.min;
  const priceRange = Math.max(1, maxPrice - minPrice);
  const safeHoverIndex = hoverIndex === null ? null : Math.min(hoverIndex, candles.length - 1);
  const hoveredCandle =
    safeHoverIndex === null ? candles[candles.length - 1] : candles[safeHoverIndex];

  const priceToY = (price: number) => chartTop + ((maxPrice - price) / priceRange) * priceHeight;
  const indexToX = (index: number) =>
    paddingX + (index - safeVisibleRange.start) * candleGap + candleGap / 2;
  const timestampToX = (timestamp: number) => {
    const exactIndex = candles.findIndex((candle) => candle.timestamp === timestamp);

    if (exactIndex >= 0) {
      return exactIndex >= safeVisibleRange.start && exactIndex < safeVisibleRange.end
        ? indexToX(exactIndex)
        : null;
    }

    const nearestIndex = candles.reduce((nearest, candle, index) => {
      if (candle.timestamp === undefined) {
        return nearest;
      }

      const currentDistance = Math.abs(candle.timestamp - timestamp);
      const nearestTimestamp = candles[nearest]?.timestamp;
      const nearestDistance =
        nearestTimestamp === undefined
          ? Number.POSITIVE_INFINITY
          : Math.abs(nearestTimestamp - timestamp);
      return currentDistance < nearestDistance ? index : nearest;
    }, 0);

    return nearestIndex >= safeVisibleRange.start && nearestIndex < safeVisibleRange.end
      ? indexToX(nearestIndex)
      : null;
  };
  const timedElementBounds = (
    fromTimestamp?: number,
    toTimestamp?: number,
    extendRight = false,
  ) => {
    const visibleStartTimestamp = visibleCandles[0]?.timestamp;
    const visibleEndTimestamp = visibleCandles[visibleCandles.length - 1]?.timestamp;
    if (
      typeof visibleStartTimestamp !== "number" ||
      !Number.isFinite(visibleStartTimestamp) ||
      typeof visibleEndTimestamp !== "number" ||
      !Number.isFinite(visibleEndTimestamp)
    )
      return null;
    const hasFromTimestamp = typeof fromTimestamp === "number" && Number.isFinite(fromTimestamp);
    const hasToTimestamp = typeof toTimestamp === "number" && Number.isFinite(toTimestamp);
    const safeToTimestamp = typeof toTimestamp === "number" ? toTimestamp : Number.NaN;
    if (hasToTimestamp && toTimestamp < visibleStartTimestamp) return null;
    if (hasFromTimestamp && fromTimestamp > visibleEndTimestamp) return null;

    const x1 =
      !hasFromTimestamp || fromTimestamp <= visibleStartTimestamp
        ? paddingX
        : timestampToX(fromTimestamp);
    const x2 = shouldExtendTimedElementToPlotRight({
      extendRight,
      hasToTimestamp,
      toTimestamp: safeToTimestamp,
      visibleEndTimestamp,
    })
      ? plotRight
      : timestampToX(safeToTimestamp);
    if (x1 === null || x2 === null) return null;
    return { x1, x2: Math.max(x1 + 2, x2) };
  };
  const chartDepthPath = createSmoothPath(
    visibleCandles.map((candle, offset) => ({
      x: indexToX(safeVisibleRange.start + offset),
      y: priceToY(candle.close),
    })),
  );
  const closedChartDepthPath = chartDepthPath
    ? `${chartDepthPath} L ${plotRight} ${chartBottom} L ${paddingX} ${chartBottom} Z`
    : null;
  const closeLinePath = createSmoothPath(
    visibleCandles.map((candle, offset) => ({
      x: indexToX(safeVisibleRange.start + offset),
      y: priceToY(candle.close),
    })),
  );
  const hoverX = safeHoverIndex === null ? null : indexToX(safeHoverIndex);
  const latestCandle = candles[candles.length - 1];
  const latestPriceY = priceToY(latestCandle.close);
  const latestPriceTone = latestCandle.close >= latestCandle.open ? "up" : "down";
  const isLatestVisible =
    candles.length - 1 >= safeVisibleRange.start && candles.length - 1 < safeVisibleRange.end;
  const priceTicks = Array.from({ length: 6 }, (_, index) => maxPrice - (priceRange / 5) * index);
  const timeTickOffsets = Array.from({ length: Math.min(6, visibleCount) }, (_, index) =>
    Math.round(
      (Math.max(1, visibleCount) - 1) * (index / Math.max(1, Math.min(6, visibleCount) - 1)),
    ),
  );

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = width / rect.width;
    const x = (event.clientX - rect.left) * ratio;
    const nextIndex =
      safeVisibleRange.start + Math.round((x - paddingX - candleGap / 2) / candleGap);
    setHoverIndex(Math.min(candles.length - 1, Math.max(safeVisibleRange.start, nextIndex)));
  };
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const zoomFactor = event.deltaY < 0 ? 0.84 : 1.18;
    applyVisibleRangeWithScale((current) =>
      zoomChartVisibleRange(
        current,
        candles.length,
        anchorRatio,
        zoomFactor,
        getChartFuturePaddingBars(current),
      ),
    );
  };
  const applyVisibleRangeWithScale = (
    resolveRange: (current: ChartVisibleRange) => ChartVisibleRange,
  ) => {
    setVisibleRange((current) => {
      const nextRange = resolveRange(current);
      setScaleDomain(calculateScaleDomain(candles, nextRange));
      return nextRange;
    });
  };
  const beginPriceAxisScale = (event: PointerEvent<SVGElement>, canvas: SVGSVGElement) => {
    if (lockPriceScale) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const chartY = (event.clientY - rect.top) * (height / Math.max(1, rect.height));
    const anchorRatio = Math.max(0, Math.min(1, (chartY - chartTop) / priceHeight));
    canvas.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      mode: "price-scale",
      pointerId: event.pointerId,
      startY: event.clientY,
      startScaleFactor: priceScaleFactor,
      anchorRatio,
      anchorPrice: maxPrice - priceRange * anchorRatio,
      baseMinPrice: scaleDomain.minPrice,
      baseMaxPrice: scaleDomain.maxPrice,
    };
    setIsScalingPriceAxis(true);
  };
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = width / rect.width;
    const x = (event.clientX - rect.left) * ratio;

    if (drawingTool && x < plotRight && onDrawingPoint) {
      const index = Math.min(
        candles.length - 1,
        Math.max(
          safeVisibleRange.start,
          safeVisibleRange.start + Math.round((x - paddingX - candleGap / 2) / candleGap),
        ),
      );
      const candle = candles[index];
      const y = (event.clientY - rect.top) * (height / rect.height);
      onDrawingPoint({
        timestamp: candle?.timestamp ?? 0,
        price: maxPrice - ((y - chartTop) / priceHeight) * priceRange,
      });
      return;
    }

    if (x >= plotRight && !lockPriceScale) {
      beginPriceAxisScale(event, event.currentTarget);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      mode: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRange: safeVisibleRange,
      startPriceOffset: pricePanOffset,
    };
    setIsPanning(true);
  };
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.mode === "drawing") {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (width / rect.width);
      const y = (event.clientY - rect.top) * (height / rect.height);
      const index = Math.min(
        candles.length - 1,
        Math.max(
          safeVisibleRange.start,
          safeVisibleRange.start + Math.round((x - paddingX - candleGap / 2) / candleGap),
        ),
      );
      onDrawingElementMove?.(dragState.drawingId, dragState.pointIndex, {
        timestamp: candles[index]?.timestamp ?? 0,
        price: maxPrice - ((y - chartTop) / priceHeight) * priceRange,
      });
      return;
    }

    if (dragState.mode === "price-scale") {
      const deltaY = event.clientY - dragState.startY;
      const nextScaleFactor = Math.max(
        0.25,
        Math.min(4, dragState.startScaleFactor * Math.exp(deltaY / 220)),
      );
      setPriceScaleFactor(nextScaleFactor);
      setPricePanOffset(
        getPriceScaleOffsetForAnchor(
          dragState.baseMinPrice,
          dragState.baseMaxPrice,
          nextScaleFactor,
          dragState.anchorRatio,
          dragState.anchorPrice,
        ),
      );
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const windowSize = Math.max(1, dragState.startRange.end - dragState.startRange.start);
    const deltaBars = -((event.clientX - dragState.startX) / Math.max(1, rect.width)) * windowSize;
    const deltaPrice = ((event.clientY - dragState.startY) / Math.max(1, rect.height)) * priceRange;
    setVisibleRange(
      panChartVisibleRange(
        dragState.startRange,
        candles.length,
        deltaBars,
        getChartFuturePaddingBars(dragState.startRange),
      ),
    );
    setPricePanOffset(dragState.startPriceOffset + deltaPrice);
  };
  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      if (dragStateRef.current.mode === "drawing") onDrawingElementDragEnd?.();
      dragStateRef.current = null;
      setIsPanning(false);
      setIsScalingPriceAxis(false);
    }
  };
  const handleSecondaryPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    secondaryPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startRange: safeVisibleRange,
    };
  };
  const handleSecondaryPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = secondaryPanRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const windowSize = Math.max(1, drag.startRange.end - drag.startRange.start);
    const deltaBars = -((event.clientX - drag.startX) / Math.max(1, rect.width)) * windowSize;
    setVisibleRange(
      panChartVisibleRange(
        drag.startRange,
        candles.length,
        deltaBars,
        getChartFuturePaddingBars(drag.startRange),
      ),
    );
  };
  const handleSecondaryPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (secondaryPanRef.current?.pointerId === event.pointerId) secondaryPanRef.current = null;
  };
  const resetInteractionView = () => {
    const nextRange = createDefaultVisibleRange(candles.length, initialVisibleBars);
    setVisibleRange(nextRange);
    setScaleDomain(calculateScaleDomain(candles, nextRange));
    setHoverIndex(candles.length - 1);
    setPriceScaleFactor(1);
    setPricePanOffset(0);
  };
  const beginDrawingDrag = (
    event: PointerEvent<SVGElement>,
    drawingId: string,
    pointIndex: number | null,
  ) => {
    event.stopPropagation();
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    onDrawingElementSelect?.(drawingId);
    dragStateRef.current = { mode: "drawing", pointerId: event.pointerId, drawingId, pointIndex };
  };
  const handlePaneSeparatorPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container || !onSecondaryPaneRatioChange) return;
    event.preventDefault();
    const bounds = container.getBoundingClientRect();
    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      onSecondaryPaneRatioChange(
        clampSecondaryPaneRatio((bounds.bottom - moveEvent.clientY) / Math.max(1, bounds.height)),
      );
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };
  const handlePaneSeparatorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSecondaryPaneRatioChange || !["ArrowUp", "ArrowDown", "Home"].includes(event.key))
      return;
    event.preventDefault();
    if (event.key === "Home") onSecondaryPaneRatioChange(0.26);
    else
      onSecondaryPaneRatioChange(
        clampSecondaryPaneRatio(secondaryPaneRatio + (event.key === "ArrowUp" ? 0.02 : -0.02)),
      );
  };

  if (!isFiniteNumber(maxPrice) || !isFiniteNumber(minPrice)) {
    return (
      <section
        className="chart-viewport"
        aria-label={`${context.symbol} ${context.timeframe} K 线图`}
      >
        <div className="chart-legend">
          <strong>{context.symbol}</strong>
          <span>{context.market}</span>
          <span>{context.timeframe}</span>
        </div>
        <div className="chart-empty-state">行情或策略图层数据异常，无法渲染图表</div>
      </section>
    );
  }

  const renderLayers = [
    ...strategyLayers.map((layer): ChartRenderLayer => ({
      id: layer.strategyId,
      name: layer.strategyName,
      source: "strategy",
      enabled: layer.enabled,
      visible: true,
      zIndex: layer.zIndex,
      elements: layer.elements,
      hudPanels: layer.hudPanels,
    })),
    ...layers,
  ]
    .filter((layer) => shouldRenderChartLayer(layer, showStrategyLayers))
    .sort((left, right) => left.zIndex - right.zIndex);
  const candleStyleByTimestamp = new Map<number, ChartLayerElement & { kind: "candle-style" }>();
  renderLayers.forEach((layer) => {
    [...layer.elements]
      .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0))
      .forEach((element) => {
        if (element.kind === "candle-style" && element.visible !== false) {
          candleStyleByTimestamp.set(element.timestamp, element);
        }
      });
  });
  const renderChartLayers = (placement: "under-candles" | "over-candles") =>
    renderLayers.flatMap((layer) =>
      [...layer.elements]
        .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0))
        .map((element) => {
          if (
            element.visible === false ||
            element.kind === "candle-style" ||
            (element.placement ?? "under-candles") !== placement
          ) {
            return null;
          }

          if (element.kind === "band") {
            if (!isFiniteNumber(element.fromPrice) || !isFiniteNumber(element.toPrice)) {
              return null;
            }

            const y = priceToY(Math.max(element.fromPrice, element.toPrice));
            const bandHeight = Math.max(
              2,
              Math.abs(priceToY(element.fromPrice) - priceToY(element.toPrice)),
            );
            const bounds = timedElementBounds(
              element.fromTimestamp,
              element.toTimestamp,
              element.extendRight,
            );
            if (!bounds) return null;
            return (
              <rect
                className={`strategy-band ${element.tone}`}
                data-element-id={element.id}
                data-strategy-id={layer.id}
                height={bandHeight}
                key={`${placement}-${layer.id}-${element.id}`}
                style={{
                  fill: element.fillColor ?? element.color,
                  fillOpacity: element.opacity,
                  stroke: element.borderColor ?? element.color,
                  strokeOpacity: element.opacity,
                }}
                width={bounds.x2 - bounds.x1}
                x={bounds.x1}
                y={y}
              />
            );
          }

          if (element.kind === "price-line") {
            if (!isFiniteNumber(element.price)) {
              return null;
            }

            const y = priceToY(element.price);
            const isProjected =
              isFiniteNumber(element.fromTimestamp ?? Number.NaN) && !element.labelAnchor;
            const bounds = timedElementBounds(
              element.fromTimestamp,
              element.toTimestamp,
              element.extendRight,
            );
            if (!bounds) return null;
            const hasLabel = Boolean(element.label);
            const projectedLabelLayout =
              hasLabel && isProjected && !element.labelAnchor
                ? getProjectedPriceLabelLayout({
                    label: element.label!,
                    lineEndX: bounds.x2,
                    priceY: y,
                    plotLeft: paddingX,
                    plotRight,
                  })
                : null;
            const anchoredLabel =
              hasLabel && element.labelAnchor
                ? getChartLabelPosition(element.labelAnchor, bounds, y)
                : null;

            return (
              <g
                className={`strategy-price-line ${element.tone}${isProjected ? " projected" : ""}`}
                data-element-id={element.id}
                data-strategy-id={layer.id}
                key={`${placement}-${layer.id}-${element.id}`}
                onPointerDown={
                  layer.source === "drawing"
                    ? (event) => beginDrawingDrag(event, element.id, null)
                    : undefined
                }
              >
                <line
                  style={{
                    stroke: element.color,
                    strokeDasharray: getChartLineDasharray(element.lineStyle),
                    strokeOpacity: element.opacity,
                  }}
                  x1={bounds.x1}
                  x2={projectedLabelLayout?.lineEndX ?? bounds.x2}
                  y1={y}
                  y2={y}
                />
                {projectedLabelLayout && (
                  <rect
                    height={20}
                    rx={3}
                    style={
                      element.color
                        ? {
                            fill: element.color,
                            fillOpacity: 0.3,
                            stroke: element.color,
                            strokeOpacity: 0.5,
                          }
                        : undefined
                    }
                    width={projectedLabelLayout.width}
                    x={projectedLabelLayout.x}
                    y={projectedLabelLayout.y}
                  />
                )}
                {hasLabel && (
                  <text
                    style={{
                      fill: element.color,
                      fontSize: getChartTextSize(element.textSize),
                      opacity: element.opacity,
                    }}
                    textAnchor={anchoredLabel?.textAnchor}
                    x={
                      anchoredLabel?.x ??
                      (projectedLabelLayout
                        ? projectedLabelLayout.x + projectedLabelLayout.width - 7
                        : bounds.x2 - 8)
                    }
                    y={
                      anchoredLabel?.y ??
                      (projectedLabelLayout ? projectedLabelLayout.y + 14 : y - 5)
                    }
                  >
                    {element.label}
                  </text>
                )}
              </g>
            );
          }

          if (element.kind === "trend-line") {
            const trendPoints = element.points
              .filter((point) => isFiniteNumber(point.timestamp) && isFiniteNumber(point.price))
              .map((point) => ({ x: timestampToX(point.timestamp), y: priceToY(point.price) }));
            const visibleTrendPoints = trendPoints.filter(
              (point): point is { x: number; y: number } => point.x !== null,
            );

            if (visibleTrendPoints.length < 2) {
              return null;
            }

            return (
              <g key={`${placement}-${layer.id}-${element.id}`}>
                <path
                  className={`strategy-trend-line ${element.tone}`}
                  d={createSmoothPath(visibleTrendPoints)}
                  style={{
                    fill: "none",
                    stroke: element.color,
                    strokeDasharray: getChartLineDasharray(element.lineStyle),
                    strokeOpacity: element.opacity,
                  }}
                />
                {layer.source === "drawing" &&
                  visibleTrendPoints.map((point, pointIndex) => (
                    <circle
                      className="drawing-handle"
                      cx={point.x}
                      cy={point.y}
                      key={`${element.id}-${pointIndex}`}
                      onPointerDown={(event) => beginDrawingDrag(event, element.id, pointIndex)}
                      r="6"
                    />
                  ))}
              </g>
            );
          }

          if (element.kind === "point-series") {
            return element.points
              .filter((point) => isFiniteNumber(point.timestamp) && isFiniteNumber(point.price))
              .flatMap((point) => {
                const x = timestampToX(point.timestamp);
                if (x === null) return [];
                return [
                  <circle
                    className={`indicator-point-series ${element.tone}`}
                    cx={x}
                    cy={priceToY(point.price)}
                    key={`${placement}-${layer.id}-${element.id}-${point.timestamp}`}
                    r={element.radius ?? 2}
                    style={{ fill: element.color, opacity: element.opacity }}
                  />,
                ];
              });
          }

          if (element.kind === "channel") {
            const toVisiblePoints = (points: readonly { timestamp: number; price: number }[]) =>
              points
                .filter((point) => isFiniteNumber(point.timestamp) && isFiniteNumber(point.price))
                .map((point) => ({ x: timestampToX(point.timestamp), y: priceToY(point.price) }))
                .filter((point): point is { x: number; y: number } => point.x !== null);
            const upper = toVisiblePoints(element.upper);
            const middle = toVisiblePoints(element.middle ?? []);
            const lower = toVisiblePoints(element.lower);
            if (upper.length < 2 || lower.length < 2) return null;
            const fillPath = [
              `M ${upper.map((point) => `${point.x} ${point.y}`).join(" L ")}`,
              `L ${[...lower]
                .reverse()
                .map((point) => `${point.x} ${point.y}`)
                .join(" L ")}`,
              "Z",
            ].join(" ");
            return (
              <g className="indicator-channel" key={`${placement}-${layer.id}-${element.id}`}>
                {element.fillColor && (
                  <path d={fillPath} style={{ fill: element.fillColor, stroke: "none" }} />
                )}
                <path
                  className={`strategy-trend-line ${element.upperTone ?? "bearish"}`}
                  d={createSmoothPath(upper)}
                />
                {middle.length >= 2 && (
                  <path
                    className={`strategy-trend-line ${element.middleTone ?? "neutral"}`}
                    d={createSmoothPath(middle)}
                  />
                )}
                <path
                  className={`strategy-trend-line ${element.lowerTone ?? "bullish"}`}
                  d={createSmoothPath(lower)}
                />
              </g>
            );
          }

          if (element.kind === "text") {
            const x = timestampToX(element.timestamp);
            if (x === null || !isFiniteNumber(element.price)) {
              return null;
            }
            const priceY = priceToY(element.price);
            const anchor = getChartLabelPosition(element.labelAnchor, { x1: x, x2: x }, priceY);
            return (
              <text
                className="chart-text-annotation"
                data-element-id={element.id}
                data-strategy-id={layer.id}
                key={`${placement}-${layer.id}-${element.id}`}
                onPointerDown={
                  layer.source === "drawing"
                    ? (event) => beginDrawingDrag(event, element.id, null)
                    : undefined
                }
                style={{
                  fill: element.color,
                  fontSize: getChartTextSize(element.textSize),
                  opacity: element.opacity,
                }}
                textAnchor={anchor.textAnchor}
                x={anchor.x}
                y={anchor.y}
              >
                {element.text}
              </text>
            );
          }

          if (!isFiniteNumber(element.timestamp) || !isFiniteNumber(element.price)) {
            return null;
          }

          const x = timestampToX(element.timestamp);
          if (x === null) {
            return null;
          }
          const y = priceToY(element.price);
          const points =
            element.direction === "up"
              ? `${x},${y - 18} ${x - 8},${y - 3} ${x + 8},${y - 3}`
              : `${x},${y + 18} ${x - 8},${y + 3} ${x + 8},${y + 3}`;
          const markerShape = element.shape ?? "triangle";

          if (markerShape !== "triangle") {
            const isUp = markerShape === "label-up";
            const rectY = isUp ? y : y - 24;
            const markerText = element.text ?? (isUp ? "▲" : "▼");
            const markerWidth = getSignalMarkerLabelWidth(markerText);
            const pointer = isUp
              ? `${x},${y - 9} ${x - 7},${y} ${x + 7},${y}`
              : `${x},${y + 9} ${x - 7},${y} ${x + 7},${y}`;
            return (
              <g
                className={`strategy-signal-marker label ${element.tone}`}
                data-element-id={element.id}
                data-strategy-id={layer.id}
                key={`${placement}-${layer.id}-${element.id}`}
                style={{ opacity: element.opacity }}
              >
                <polygon points={pointer} style={{ fill: element.color }} />
                <rect
                  height="24"
                  rx="4"
                  style={{ fill: element.color }}
                  width={markerWidth}
                  x={x - markerWidth / 2}
                  y={rectY}
                />
                <text style={{ fontSize: getChartTextSize(element.textSize) }} x={x} y={rectY + 16}>
                  {markerText}
                </text>
              </g>
            );
          }

          return (
            <g
              className={`strategy-signal-marker ${element.tone}`}
              key={`${placement}-${layer.id}-${element.id}`}
              style={{ opacity: element.opacity }}
            >
              <polygon points={points} style={{ fill: element.color }} />
            </g>
          );
        }),
    );

  return (
    <section
      className="chart-viewport"
      aria-label={`${context.symbol} ${context.timeframe} K 线图`}
    >
      <div className="chart-legend">
        <strong>{context.symbol}</strong>
        <span>{context.market}</span>
        <span>{context.timeframe}</span>
        <span>O {formatPrice(hoveredCandle.open)}</span>
        <span>H {formatPrice(hoveredCandle.high)}</span>
        <span>L {formatPrice(hoveredCandle.low)}</span>
        <span>C {formatPrice(hoveredCandle.close)}</span>
        <span>V {Math.round(hoveredCandle.volume).toLocaleString("zh-CN")}</span>
        <span>{hoveredCandle.time}</span>
        <span>
          {safeVisibleRange.start + 1}-{safeVisibleRange.end} / {candles.length}
        </span>
        {renderLayers
          .flatMap((layer) => layer.legendValues ?? [])
          .map((item, index) => (
            <span key={`${item.label}-${index}`} style={{ color: item.color }}>
              {item.label} {item.value}
            </span>
          ))}
      </div>

      <div className="chart-interaction-toolbar" aria-label="图表缩放和平移">
        <button
          onClick={() =>
            applyVisibleRangeWithScale((current) =>
              zoomChartVisibleRange(
                current,
                candles.length,
                0.5,
                0.84,
                getChartFuturePaddingBars(current),
              ),
            )
          }
          type="button"
        >
          放大
        </button>
        <button
          onClick={() =>
            applyVisibleRangeWithScale((current) =>
              zoomChartVisibleRange(
                current,
                candles.length,
                0.5,
                1.18,
                getChartFuturePaddingBars(current),
              ),
            )
          }
          type="button"
        >
          缩小
        </button>
        <button
          onClick={() =>
            setVisibleRange((current) =>
              panChartVisibleRange(
                current,
                candles.length,
                -Math.max(1, Math.round((current.end - current.start) * 0.25)),
                getChartFuturePaddingBars(current),
              ),
            )
          }
          type="button"
        >
          左移
        </button>
        <button
          onClick={() =>
            setVisibleRange((current) =>
              panChartVisibleRange(
                current,
                candles.length,
                Math.max(1, Math.round((current.end - current.start) * 0.25)),
                getChartFuturePaddingBars(current),
              ),
            )
          }
          type="button"
        >
          右移
        </button>
        <button onClick={resetInteractionView} type="button">
          重置
        </button>
      </div>

      <div
        className="chart-pane-stack"
        style={{
          gridTemplateRows: getChartPaneGridTemplate(
            secondaryPane ? secondaryPaneRatio : undefined,
          ),
        }}
      >
        <svg
          className={`chart-canvas${isPanning ? " panning" : ""}${isScalingPriceAxis ? " scaling-price-axis" : ""}`}
          ref={measuredSize.canvasRef}
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={handleMouseMove}
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <linearGradient id="chartDepth" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#1b2d42" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#0b1117" stopOpacity="0" />
            </linearGradient>
          </defs>

          <rect className="chart-bg" height={height} width={width} />
          {showGrid &&
            Array.from({ length: 8 }, (_, index) => {
              const y = chartTop + (priceHeight / 7) * index;
              return (
                <line
                  className="chart-grid-line"
                  key={`h-${index}`}
                  x1={paddingX}
                  x2={plotRight}
                  y1={y}
                  y2={y}
                />
              );
            })}
          {showGrid &&
            Array.from({ length: 10 }, (_, index) => {
              const x = paddingX + ((plotRight - paddingX) / 9) * index;
              return (
                <line
                  className="chart-grid-line"
                  key={`v-${index}`}
                  x1={x}
                  x2={x}
                  y1={chartTop}
                  y2={chartBottom}
                />
              );
            })}

          {displayMode === "line" && closedChartDepthPath && (
            <path className="chart-depth" d={closedChartDepthPath} />
          )}

          {renderChartLayers("under-candles")}

          {displayMode === "line" && <path className="intraday-close-line" d={closeLinePath} />}

          {visibleCandles.map((candle, offset) => {
            const index = safeVisibleRange.start + offset;
            const x = indexToX(index);
            const isUp = candle.close >= candle.open;
            const openY = priceToY(candle.open);
            const closeY = priceToY(candle.close);
            const highY = priceToY(candle.high);
            const lowY = priceToY(candle.low);
            const bodyY = Math.min(openY, closeY);
            const bodyHeight = Math.max(3, Math.abs(openY - closeY));
            const candleStyle =
              candle.timestamp === undefined
                ? undefined
                : candleStyleByTimestamp.get(candle.timestamp);

            return (
              <g key={`${candle.timestamp}-${index}`}>
                {displayMode === "candlestick" && (
                  <>
                    <line
                      className={isUp ? "candle-wick up" : "candle-wick down"}
                      style={
                        candleStyle
                          ? { opacity: candleStyle.opacity, stroke: candleStyle.color }
                          : undefined
                      }
                      x1={x}
                      x2={x}
                      y1={highY}
                      y2={lowY}
                    />
                    <rect
                      className={isUp ? "candle-body up" : "candle-body down"}
                      height={bodyHeight}
                      style={
                        candleStyle
                          ? { fill: candleStyle.color, opacity: candleStyle.opacity }
                          : undefined
                      }
                      rx="2"
                      width={candleWidth}
                      x={x - candleWidth / 2}
                      y={bodyY}
                    />
                  </>
                )}
                {showSignals && candle.signal === "buy" && (
                  <g className="signal-marker buy">
                    <polygon
                      points={`${x},${lowY + 24} ${x - 9},${lowY + 40} ${x + 9},${lowY + 40}`}
                    />
                  </g>
                )}
                {showSignals && candle.signal === "sell" && (
                  <g className="signal-marker sell">
                    <polygon
                      points={`${x},${highY - 24} ${x - 9},${highY - 40} ${x + 9},${highY - 40}`}
                    />
                  </g>
                )}
              </g>
            );
          })}

          {renderChartLayers("over-candles")}

          {showCurrentPriceLine && isLatestVisible && (
            <g className={`current-price-line ${latestPriceTone}`}>
              <line x1={paddingX} x2={plotRight} y1={latestPriceY} y2={latestPriceY} />
              {showPriceLabels && (
                <>
                  <rect height={24} rx={4} width={74} x={plotRight - 70} y={latestPriceY - 12} />
                  <text x={plotRight - 33} y={latestPriceY + 4}>
                    {formatPrice(latestCandle.close)}
                  </text>
                </>
              )}
            </g>
          )}

          {showPriceLabels && (
            <g className="price-axis-labels">
              <text className="price-axis-title" x={plotRight + 10} y={chartTop + 14}>
                价格
              </text>
              {priceTicks.map((price) => (
                <text key={price} x={plotRight + 10} y={priceToY(price) + 4}>
                  {formatPrice(price)}
                </text>
              ))}
            </g>
          )}

          {!secondaryPane && (
            <g className="time-axis-labels">
              {timeTickOffsets.map((offset) => {
                const index = safeVisibleRange.start + offset;
                const candle = candles[index];

                if (!candle) {
                  return null;
                }

                return (
                  <text key={`${candle.time}-${index}`} x={indexToX(index)} y={height - 8}>
                    {candle.time}
                  </text>
                );
              })}
            </g>
          )}

          {showCrosshair && hoverX !== null && (
            <g className="crosshair">
              <line x1={hoverX} x2={hoverX} y1={chartTop} y2={chartBottom} />
              <line
                x1={paddingX}
                x2={plotRight}
                y1={priceToY(hoveredCandle.close)}
                y2={priceToY(hoveredCandle.close)}
              />
              {showPriceLabels && (
                <>
                  <rect
                    className="crosshair-price-label"
                    height={22}
                    rx={4}
                    width={68}
                    x={plotRight - 64}
                    y={priceToY(hoveredCandle.close) - 11}
                  />
                  <text
                    className="crosshair-price-text"
                    x={plotRight - 30}
                    y={priceToY(hoveredCandle.close) + 4}
                  >
                    {formatPrice(hoveredCandle.close)}
                  </text>
                </>
              )}
            </g>
          )}

          <rect
            className="price-axis-hit-area"
            height={priceHeight}
            onPointerDown={(event) => {
              event.stopPropagation();
              const canvas = event.currentTarget.ownerSVGElement;
              if (canvas) {
                beginPriceAxisScale(event, canvas);
              }
            }}
            width={priceAxisWidth}
            x={plotRight}
            y={chartTop}
          />
        </svg>
        {secondaryPane && (
          <>
            <div
              aria-label="调整副图高度"
              aria-orientation="horizontal"
              aria-valuemax={45}
              aria-valuemin={18}
              aria-valuenow={Math.round(clampSecondaryPaneRatio(secondaryPaneRatio) * 100)}
              className="chart-pane-separator"
              onDoubleClick={() => onSecondaryPaneRatioChange?.(0.26)}
              onKeyDown={handlePaneSeparatorKeyDown}
              onPointerDown={handlePaneSeparatorPointerDown}
              role="separator"
              tabIndex={0}
            />
            <SecondaryPaneCanvas
              candleWidth={candleWidth}
              height={220}
              hoveredTimestamp={hoveredCandle.timestamp}
              hoverX={hoverX}
              onClose={onSecondaryPaneClose}
              onMouseLeave={() => setHoverIndex(null)}
              onMouseMove={handleMouseMove}
              onPointerDown={handleSecondaryPointerDown}
              onPointerMove={handleSecondaryPointerMove}
              onPointerUp={handleSecondaryPointerUp}
              onSettings={onSecondaryPaneSettings}
              onWheel={handleWheel}
              pane={secondaryPane}
              plotLeft={paddingX}
              plotRight={plotRight}
              showCrosshair={showCrosshair}
              showGrid={showGrid}
              showPriceLabels={showPriceLabels}
              timeTicks={timeTickOffsets.flatMap((offset) => {
                const index = safeVisibleRange.start + offset;
                const candle = candles[index];
                return candle ? [{ x: indexToX(index), label: candle.time }] : [];
              })}
              timestampToX={timestampToX}
              width={width}
            />
          </>
        )}
      </div>
      {showStrategyLayers && (
        <div
          className="chart-hud-stack"
          style={{ "--chart-hud-right": getChartHudRightOffset() } as CSSProperties}
        >
          {renderLayers.flatMap((layer) =>
            (layer.hudPanels ?? []).map((panel) => (
              <table
                aria-label={panel.title}
                className="chart-hud-panel"
                key={`${layer.id}-${panel.id}`}
              >
                <thead>
                  <tr>
                    <th>{panel.title}</th>
                    <th>{panel.valueHeading ?? "Value"}</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.rows.map((row) => (
                    <tr className={row.tone ?? "neutral"} key={row.id}>
                      <th>{row.label}</th>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )),
          )}
        </div>
      )}
    </section>
  );
}
