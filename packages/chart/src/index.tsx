import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import type { Market, Timeframe } from "@quant/shared";
import {
  clampChartVisibleRange,
  getScaledPriceRange,
  panChartVisibleRange,
  syncChartVisibleRangeForDataUpdate,
  zoomChartVisibleRange,
  type ChartVisibleRange,
} from "./viewportMath.ts";

export {
  clampChartVisibleRange,
  getScaledPriceRange,
  panChartVisibleRange,
  syncChartVisibleRangeForDataUpdate,
  zoomChartVisibleRange,
  type ChartVisibleRange,
} from "./viewportMath.ts";

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

export type ChartLayerElement =
  | {
      id: string;
      kind: "signal-marker";
      timestamp: number;
      price: number;
      direction: "up" | "down";
      tone: Extract<ChartLayerTone, "buy" | "sell" | "neutral">;
      visible?: boolean;
    }
  | {
      id: string;
      kind: "price-line";
      price: number;
      label: string;
      tone: Extract<ChartLayerTone, "target" | "stop" | "range" | "neutral">;
      fromTimestamp?: number;
      visible?: boolean;
    }
  | {
      id: string;
      kind: "trend-line";
      points: Array<{ timestamp: number; price: number }>;
      tone: ChartTrendTone;
      visible?: boolean;
    }
  | {
      id: string;
      kind: "band";
      fromPrice: number;
      toPrice: number;
      label?: string;
      tone: Extract<ChartLayerTone, "range" | "risk" | "target" | "stop">;
      fromTimestamp?: number;
      visible?: boolean;
    };

export interface ChartLayer {
  strategyId: string;
  strategyName: string;
  enabled: boolean;
  zIndex: number;
  elements: ChartLayerElement[];
}

export interface ChartViewportProps {
  context?: ChartContext;
  candles?: CandlePoint[];
  showSignals?: boolean;
  showMovingAverage?: boolean;
  strategyLayers?: ChartLayer[];
  showStrategyLayers?: boolean;
  showCrosshair?: boolean;
  showGrid?: boolean;
  showVolume?: boolean;
  showPriceLabels?: boolean;
  showCurrentPriceLine?: boolean;
  displayMode?: ChartDisplayMode;
  resetViewKey?: number;
}

interface ChartScaleDomain {
  minPrice: number;
  maxPrice: number;
  maxVolume: number;
}

const defaultContext: ChartContext = {
  symbol: "AAPL",
  market: "US",
  timeframe: "1d",
};

function generateCandles(context: ChartContext): CandlePoint[] {
  const seed = context.symbol.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  let previousClose = 166 + (seed % 28);
  const intervalMs = context.timeframe === "1w" ? 7 * 24 * 60 * 60_000 : context.timeframe === "realtime" ? 60_000 : 24 * 60 * 60_000;
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
      signal: index === 14 || index === 38 ? "buy" : index === 27 || index === 52 ? "sell" : undefined,
    };
  });
}

function movingAverage(candles: CandlePoint[], windowSize: number) {
  return candles.map((candle, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = candles.slice(start, index + 1);
    return window.reduce((total, item) => total + item.close, 0) / window.length;
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

function createDefaultVisibleRange(candleCount: number): ChartVisibleRange {
  return {
    start: Math.max(0, candleCount - 96),
    end: candleCount,
  };
}

function calculateScaleDomain(candles: CandlePoint[], range: ChartVisibleRange): ChartScaleDomain {
  const safeRange = clampChartVisibleRange(range, candles.length);
  const domainCandles = candles.slice(safeRange.start, safeRange.end);
  const highs = domainCandles.map((candle) => candle.high).filter(isFiniteNumber);
  const lows = domainCandles.map((candle) => candle.low).filter(isFiniteNumber);
  const volumes = domainCandles.map((candle) => candle.volume).filter(isFiniteNumber);
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
    maxVolume: Math.max(1, ...volumes),
  };
}

export function ChartViewport({
  candles: providedCandles,
  context = defaultContext,
  showSignals = true,
  showMovingAverage = true,
  strategyLayers = [],
  showStrategyLayers = true,
  showCrosshair = true,
  showGrid = true,
  showVolume = true,
  showPriceLabels = true,
  showCurrentPriceLine = true,
  displayMode = "candlestick",
  resetViewKey = 0,
}: ChartViewportProps) {
  const generatedCandles = useMemo(() => generateCandles(context), [context.symbol, context.market, context.timeframe]);
  const candles = providedCandles ?? generatedCandles;
  const contextKey = `${context.market}:${context.symbol}:${context.timeframe}`;
  const [visibleRange, setVisibleRange] = useState<ChartVisibleRange>(() => createDefaultVisibleRange(candles.length));
  const [scaleDomain, setScaleDomain] = useState<ChartScaleDomain>(() => calculateScaleDomain(candles, createDefaultVisibleRange(candles.length)));
  const [hoverIndex, setHoverIndex] = useState<number | null>(candles.length - 1);
  const previousChartStateRef = useRef({
    candleCount: candles.length,
    contextKey,
    resetViewKey,
  });
  const dragStateRef = useRef<
    | { mode: "pan"; pointerId: number; startX: number; startRange: ChartVisibleRange }
    | { mode: "price-scale"; pointerId: number; startY: number; startScaleFactor: number }
    | null
  >(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isScalingPriceAxis, setIsScalingPriceAxis] = useState(false);
  const [priceScaleFactor, setPriceScaleFactor] = useState(1);

  const width = 980;
  const height = 520;
  const hasCandles = candles.length > 0;

  useEffect(() => {
    const previous = previousChartStateRef.current;
    const shouldResetScale = previous.contextKey !== contextKey || previous.resetViewKey !== resetViewKey;

    if (shouldResetScale || (previous.candleCount === 0 && candles.length > 0)) {
      const nextRange = createDefaultVisibleRange(candles.length);
      setVisibleRange(nextRange);
      setScaleDomain(calculateScaleDomain(candles, nextRange));
      setHoverIndex(candles.length > 0 ? candles.length - 1 : null);
      setPriceScaleFactor(1);
      previousChartStateRef.current = { candleCount: candles.length, contextKey, resetViewKey };
      return;
    }

    setVisibleRange((current) => syncChartVisibleRangeForDataUpdate(current, previous.candleCount, candles.length));
    setHoverIndex((current) => {
      if (candles.length === 0) {
        return null;
      }

      if (current === null) {
        return null;
      }

      return current >= previous.candleCount - 1 ? candles.length - 1 : Math.min(current, candles.length - 1);
    });
    previousChartStateRef.current = { candleCount: candles.length, contextKey, resetViewKey };
  }, [candles, contextKey, resetViewKey]);

  if (!hasCandles) {
    return (
      <section className="chart-viewport" aria-label={`${context.symbol} ${context.timeframe} K 线图`}>
        <div className="chart-legend">
          <strong>{context.symbol}</strong>
          <span>{context.market}</span>
          <span>{context.timeframe}</span>
        </div>
        <div className="chart-empty-state">暂无可用行情数据</div>
      </section>
    );
  }

  const chartTop = 34;
  const priceHeight = 338;
  const volumeTop = 410;
  const volumeHeight = 76;
  const paddingX = 54;
  const safeVisibleRange = clampChartVisibleRange(visibleRange, candles.length);
  const visibleCandles = candles.slice(safeVisibleRange.start, safeVisibleRange.end);
  const visibleCount = Math.max(1, visibleCandles.length);
  const candleGap = (width - paddingX * 2) / visibleCount;
  const candleWidth = Math.max(5, candleGap * 0.58);
  const scaledPriceRange = getScaledPriceRange(scaleDomain.minPrice, scaleDomain.maxPrice, priceScaleFactor);
  const maxPrice = scaledPriceRange.max;
  const minPrice = scaledPriceRange.min;
  const maxVolume = scaleDomain.maxVolume;
  const priceRange = Math.max(1, maxPrice - minPrice);
  const safeHoverIndex = hoverIndex === null ? null : Math.min(hoverIndex, candles.length - 1);
  const hoveredCandle = safeHoverIndex === null ? candles[candles.length - 1] : candles[safeHoverIndex];

  const priceToY = (price: number) => chartTop + ((maxPrice - price) / priceRange) * priceHeight;
  const volumeToY = (volume: number) => {
    const boundedVolume = Math.max(0, Math.min(volume, maxVolume));
    return volumeTop + volumeHeight - (boundedVolume / maxVolume) * volumeHeight;
  };
  const indexToX = (index: number) => paddingX + (index - safeVisibleRange.start) * candleGap + candleGap / 2;
  const timestampToX = (timestamp: number) => {
    const exactIndex = candles.findIndex((candle) => candle.timestamp === timestamp);

    if (exactIndex >= 0) {
      return exactIndex >= safeVisibleRange.start && exactIndex < safeVisibleRange.end ? indexToX(exactIndex) : null;
    }

    const nearestIndex = candles.reduce((nearest, candle, index) => {
      if (candle.timestamp === undefined) {
        return nearest;
      }

      const currentDistance = Math.abs(candle.timestamp - timestamp);
      const nearestTimestamp = candles[nearest]?.timestamp;
      const nearestDistance = nearestTimestamp === undefined ? Number.POSITIVE_INFINITY : Math.abs(nearestTimestamp - timestamp);
      return currentDistance < nearestDistance ? index : nearest;
    }, 0);

    return nearestIndex >= safeVisibleRange.start && nearestIndex < safeVisibleRange.end ? indexToX(nearestIndex) : null;
  };
  const maPoints = movingAverage(candles, 9)
    .slice(safeVisibleRange.start, safeVisibleRange.end)
    .map((price, offset) => ({ x: indexToX(safeVisibleRange.start + offset), y: priceToY(price) }));
  const maPath = createSmoothPath(maPoints);
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
  const isLatestVisible = candles.length - 1 >= safeVisibleRange.start && candles.length - 1 < safeVisibleRange.end;
  const priceTicks = Array.from({ length: 6 }, (_, index) => maxPrice - (priceRange / 5) * index);
  const timeTickOffsets = Array.from({ length: Math.min(6, visibleCount) }, (_, index) =>
    Math.round((Math.max(1, visibleCount) - 1) * (index / Math.max(1, Math.min(6, visibleCount) - 1))),
  );

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = width / rect.width;
    const x = (event.clientX - rect.left) * ratio;
    const nextIndex = safeVisibleRange.start + Math.round((x - paddingX - candleGap / 2) / candleGap);
    setHoverIndex(Math.min(candles.length - 1, Math.max(safeVisibleRange.start, nextIndex)));
  };
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const zoomFactor = event.deltaY < 0 ? 0.84 : 1.18;
    applyVisibleRangeWithScale((current) => zoomChartVisibleRange(current, candles.length, anchorRatio, zoomFactor));
  };
  const applyVisibleRangeWithScale = (resolveRange: (current: ChartVisibleRange) => ChartVisibleRange) => {
    setVisibleRange((current) => {
      const nextRange = resolveRange(current);
      setScaleDomain(calculateScaleDomain(candles, nextRange));
      return nextRange;
    });
  };
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = width / rect.width;
    const x = (event.clientX - rect.left) * ratio;

    event.currentTarget.setPointerCapture(event.pointerId);
    if (x >= width - paddingX) {
      dragStateRef.current = { mode: "price-scale", pointerId: event.pointerId, startY: event.clientY, startScaleFactor: priceScaleFactor };
      setIsScalingPriceAxis(true);
      return;
    }

    dragStateRef.current = { mode: "pan", pointerId: event.pointerId, startX: event.clientX, startRange: safeVisibleRange };
    setIsPanning(true);
  };
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.mode === "price-scale") {
      const deltaY = event.clientY - dragState.startY;
      const nextScaleFactor = Math.max(0.25, Math.min(4, dragState.startScaleFactor * Math.exp(deltaY / 220)));
      setPriceScaleFactor(nextScaleFactor);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const windowSize = Math.max(1, dragState.startRange.end - dragState.startRange.start);
    const deltaBars = -((event.clientX - dragState.startX) / Math.max(1, rect.width)) * windowSize;
    setVisibleRange(panChartVisibleRange(dragState.startRange, candles.length, deltaBars));
  };
  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      setIsPanning(false);
      setIsScalingPriceAxis(false);
    }
  };
  const resetInteractionView = () => {
    const nextRange = createDefaultVisibleRange(candles.length);
    setVisibleRange(nextRange);
    setScaleDomain(calculateScaleDomain(candles, nextRange));
    setHoverIndex(candles.length - 1);
    setPriceScaleFactor(1);
  };

  if (!isFiniteNumber(maxPrice) || !isFiniteNumber(minPrice)) {
    return (
      <section className="chart-viewport" aria-label={`${context.symbol} ${context.timeframe} K 线图`}>
        <div className="chart-legend">
          <strong>{context.symbol}</strong>
          <span>{context.market}</span>
          <span>{context.timeframe}</span>
        </div>
        <div className="chart-empty-state">行情或策略图层数据异常，无法渲染图表</div>
      </section>
    );
  }

  return (
    <section className="chart-viewport" aria-label={`${context.symbol} ${context.timeframe} K 线图`}>
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
        <span>{safeVisibleRange.start + 1}-{safeVisibleRange.end} / {candles.length}</span>
      </div>

      <div className="chart-interaction-toolbar" aria-label="图表缩放和平移">
        <button onClick={() => applyVisibleRangeWithScale((current) => zoomChartVisibleRange(current, candles.length, 0.5, 0.84))} type="button">
          放大
        </button>
        <button onClick={() => applyVisibleRangeWithScale((current) => zoomChartVisibleRange(current, candles.length, 0.5, 1.18))} type="button">
          缩小
        </button>
        <button onClick={() => setVisibleRange((current) => panChartVisibleRange(current, candles.length, -Math.max(1, Math.round((current.end - current.start) * 0.25))))} type="button">
          左移
        </button>
        <button onClick={() => setVisibleRange((current) => panChartVisibleRange(current, candles.length, Math.max(1, Math.round((current.end - current.start) * 0.25))))} type="button">
          右移
        </button>
        <button onClick={resetInteractionView} type="button">
          重置
        </button>
      </div>

      <svg
        className={`chart-canvas${isPanning ? " panning" : ""}${isScalingPriceAxis ? " scaling-price-axis" : ""}`}
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
        <rect
          className="price-axis-hit-area"
          height={volumeTop + volumeHeight - chartTop}
          width={paddingX}
          x={width - paddingX}
          y={chartTop}
        />
        {showGrid &&
          Array.from({ length: 8 }, (_, index) => {
            const y = chartTop + (priceHeight / 7) * index;
            return <line className="chart-grid-line" key={`h-${index}`} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />;
          })}
        {showGrid &&
          Array.from({ length: 10 }, (_, index) => {
            const x = paddingX + ((width - paddingX * 2) / 9) * index;
            return <line className="chart-grid-line" key={`v-${index}`} x1={x} x2={x} y1={chartTop} y2={volumeTop + volumeHeight} />;
          })}

        <path className="chart-depth" d={`${maPath} L ${width - paddingX} ${volumeTop - 26} L ${paddingX} ${volumeTop - 26} Z`} />

        {showStrategyLayers &&
          strategyLayers
            .filter((layer) => layer.enabled)
            .flatMap((layer) =>
              layer.elements.map((element) => {
                if (element.visible === false) {
                  return null;
                }

                if (element.kind === "band") {
                  if (!isFiniteNumber(element.fromPrice) || !isFiniteNumber(element.toPrice)) {
                    return null;
                  }

                  const y = priceToY(Math.max(element.fromPrice, element.toPrice));
                  const bandHeight = Math.max(2, Math.abs(priceToY(element.fromPrice) - priceToY(element.toPrice)));
                  const x = isFiniteNumber(element.fromTimestamp ?? Number.NaN) ? timestampToX(element.fromTimestamp ?? 0) : paddingX;
                  if (x === null) {
                    return null;
                  }
                  return (
                    <rect
                      className={`strategy-band ${element.tone}`}
                      height={bandHeight}
                      key={`${layer.strategyId}-${element.id}`}
                      width={Math.max(2, width - paddingX - x)}
                      x={x}
                      y={y}
                    />
                  );
                }

                if (element.kind === "price-line") {
                  if (!isFiniteNumber(element.price)) {
                    return null;
                  }

                  const y = priceToY(element.price);
                  const isProjected = isFiniteNumber(element.fromTimestamp ?? Number.NaN);
                  const lineStartX = isProjected ? timestampToX(element.fromTimestamp ?? 0) : paddingX;
                  if (lineStartX === null) {
                    return null;
                  }
                  const labelWidth = Math.max(86, element.label.length * 6.4 + 20);
                  const labelX = width - paddingX - labelWidth + 6;
                  const labelY = y - 20;

                  return (
                    <g
                      className={`strategy-price-line ${element.tone}${isProjected ? " projected" : ""}`}
                      key={`${layer.strategyId}-${element.id}`}
                    >
                      <line x1={lineStartX} x2={width - paddingX} y1={y} y2={y} />
                      {isProjected && <rect height={30} rx={4} width={labelWidth} x={labelX} y={labelY} />}
                      <text x={isProjected ? labelX + labelWidth - 10 : width - paddingX - 8} y={isProjected ? y + 5 : y - 6}>
                        {element.label}
                      </text>
                    </g>
                  );
                }

                if (element.kind === "trend-line") {
                  const trendPoints = element.points
                    .filter((point) => isFiniteNumber(point.timestamp) && isFiniteNumber(point.price))
                    .map((point) => ({ x: timestampToX(point.timestamp), y: priceToY(point.price) }));
                  const visibleTrendPoints = trendPoints.filter((point): point is { x: number; y: number } => point.x !== null);

                  if (visibleTrendPoints.length < 2) {
                    return null;
                  }

                  return (
                    <path
                      className={`strategy-trend-line ${element.tone}`}
                      d={createSmoothPath(visibleTrendPoints)}
                      key={`${layer.strategyId}-${element.id}`}
                    />
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

                return (
                  <g className={`strategy-signal-marker ${element.tone}`} key={`${layer.strategyId}-${element.id}`}>
                    <polygon points={points} />
                  </g>
                );
              }),
            )}

        {displayMode === "line" && (
          <path className="intraday-close-line" d={closeLinePath} />
        )}

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
          const volumeY = volumeToY(candle.volume);

          return (
            <g key={candle.time}>
              {displayMode === "candlestick" && (
                <>
                  <line className={isUp ? "candle-wick up" : "candle-wick down"} x1={x} x2={x} y1={highY} y2={lowY} />
                  <rect
                    className={isUp ? "candle-body up" : "candle-body down"}
                    height={bodyHeight}
                    rx="2"
                    width={candleWidth}
                    x={x - candleWidth / 2}
                    y={bodyY}
                  />
                </>
              )}
              {showVolume && (
                <rect
                  className={isUp ? "volume-bar up" : "volume-bar down"}
                  height={volumeTop + volumeHeight - volumeY}
                  rx="2"
                  width={candleWidth}
                  x={x - candleWidth / 2}
                  y={volumeY}
                />
              )}
              {showSignals && candle.signal === "buy" && (
                <g className="signal-marker buy">
                  <polygon points={`${x},${lowY + 24} ${x - 9},${lowY + 40} ${x + 9},${lowY + 40}`} />
                </g>
              )}
              {showSignals && candle.signal === "sell" && (
                <g className="signal-marker sell">
                  <polygon points={`${x},${highY - 24} ${x - 9},${highY - 40} ${x + 9},${highY - 40}`} />
                </g>
              )}
            </g>
          );
        })}

        {showMovingAverage && <path className="moving-average" d={maPath} />}

        {showCurrentPriceLine && isLatestVisible && (
          <g className={`current-price-line ${latestPriceTone}`}>
            <line x1={paddingX} x2={width - paddingX} y1={latestPriceY} y2={latestPriceY} />
            {showPriceLabels && (
              <>
                <rect height={24} rx={4} width={74} x={width - paddingX - 70} y={latestPriceY - 12} />
                <text x={width - paddingX - 33} y={latestPriceY + 4}>
                  {formatPrice(latestCandle.close)}
                </text>
              </>
            )}
          </g>
        )}

        {showPriceLabels && (
          <g className="price-axis-labels">
            <text className="price-axis-title" x={width - paddingX + 28} y={chartTop + 14}>
              价格
            </text>
            {priceTicks.map((price) => (
              <text key={price} x={width - paddingX + 44} y={priceToY(price) + 4}>
                {formatPrice(price)}
              </text>
            ))}
          </g>
        )}

        <g className="time-axis-labels">
          {timeTickOffsets.map((offset) => {
            const candle = visibleCandles[offset];
            const index = safeVisibleRange.start + offset;

            if (!candle) {
              return null;
            }

            return (
              <text key={`${candle.time}-${index}`} x={indexToX(index)} y={volumeTop + volumeHeight + 24}>
                {candle.time}
              </text>
            );
          })}
        </g>

        {showCrosshair && hoverX !== null && (
          <g className="crosshair">
            <line x1={hoverX} x2={hoverX} y1={chartTop} y2={showVolume ? volumeTop + volumeHeight : volumeTop - 26} />
            <line x1={paddingX} x2={width - paddingX} y1={priceToY(hoveredCandle.close)} y2={priceToY(hoveredCandle.close)} />
            {showPriceLabels && (
              <>
                <rect className="crosshair-price-label" height={22} rx={4} width={68} x={width - paddingX - 64} y={priceToY(hoveredCandle.close) - 11} />
                <text className="crosshair-price-text" x={width - paddingX - 30} y={priceToY(hoveredCandle.close) + 4}>
                  {formatPrice(hoveredCandle.close)}
                </text>
              </>
            )}
          </g>
        )}
      </svg>
    </section>
  );
}
