import { useMemo, useState, type MouseEvent } from "react";
import type { Market, Timeframe } from "@quant/shared";

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

export type ChartLayerTone = "buy" | "sell" | "range" | "risk" | "target" | "stop" | "neutral";

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
      visible?: boolean;
    }
  | {
      id: string;
      kind: "band";
      fromPrice: number;
      toPrice: number;
      label?: string;
      tone: Extract<ChartLayerTone, "range" | "risk" | "target" | "stop">;
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
}

const defaultContext: ChartContext = {
  symbol: "AAPL",
  market: "US",
  timeframe: "1d",
};

function generateCandles(context: ChartContext): CandlePoint[] {
  const seed = context.symbol.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  let previousClose = 166 + (seed % 28);

  return Array.from({ length: 64 }, (_, index) => {
    const wave = Math.sin((index + seed) / 4.2) * 3.8 + Math.cos(index / 7) * 2.4;
    const open = previousClose + Math.sin(index / 3) * 1.1;
    const close = open + wave * 0.42 + (index % 5 === 0 ? 1.2 : -0.3);
    const high = Math.max(open, close) + 1.4 + Math.abs(Math.sin(index)) * 2.1;
    const low = Math.min(open, close) - 1.2 - Math.abs(Math.cos(index)) * 1.8;
    const volume = 580000 + Math.round(Math.abs(wave) * 130000 + (index % 9) * 42000);
    previousClose = close;

    return {
      time: `${context.timeframe} #${index + 1}`,
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

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function getLayerPriceRange(strategyLayers: ChartLayer[]) {
  return strategyLayers.flatMap((layer) =>
    layer.enabled
      ? layer.elements.flatMap((element) => {
          if (element.visible === false) {
            return [];
          }

          if (element.kind === "band") {
            return [element.fromPrice, element.toPrice].filter(isFiniteNumber);
          }

          return isFiniteNumber(element.price) ? [element.price] : [];
        })
      : [],
  );
}

export function ChartViewport({
  candles: providedCandles,
  context = defaultContext,
  showSignals = true,
  showMovingAverage = true,
  strategyLayers = [],
  showStrategyLayers = true,
}: ChartViewportProps) {
  const generatedCandles = useMemo(() => generateCandles(context), [context]);
  const candles = providedCandles ?? generatedCandles;
  const [hoverIndex, setHoverIndex] = useState<number | null>(candles.length - 1);

  const width = 980;
  const height = 520;
  const hasCandles = candles.length > 0;

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
  const candleGap = (width - paddingX * 2) / candles.length;
  const candleWidth = Math.max(5, candleGap * 0.58);
  const layerPrices = showStrategyLayers ? getLayerPriceRange(strategyLayers) : [];
  const candleHighs = candles.map((candle) => candle.high).filter(isFiniteNumber);
  const candleLows = candles.map((candle) => candle.low).filter(isFiniteNumber);
  const candleVolumes = candles.map((candle) => candle.volume).filter(isFiniteNumber);
  const priceCandidates = [...candleHighs, ...candleLows, ...layerPrices];
  const maxPrice = Math.max(...priceCandidates);
  const minPrice = Math.min(...priceCandidates);
  const maxVolume = Math.max(1, ...candleVolumes);
  const priceRange = Math.max(1, maxPrice - minPrice);
  const safeHoverIndex = hoverIndex === null ? null : Math.min(hoverIndex, candles.length - 1);
  const hoveredCandle = safeHoverIndex === null ? candles[candles.length - 1] : candles[safeHoverIndex];

  const priceToY = (price: number) => chartTop + ((maxPrice - price) / priceRange) * priceHeight;
  const volumeToY = (volume: number) => volumeTop + volumeHeight - (volume / maxVolume) * volumeHeight;
  const indexToX = (index: number) => paddingX + index * candleGap + candleGap / 2;
  const timestampToX = (timestamp: number) => {
    const exactIndex = candles.findIndex((candle) => candle.timestamp === timestamp);

    if (exactIndex >= 0) {
      return indexToX(exactIndex);
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

    return indexToX(nearestIndex);
  };
  const maPoints = movingAverage(candles, 9).map((price, index) => ({ x: indexToX(index), y: priceToY(price) }));
  const maPath = createSmoothPath(maPoints);
  const hoverX = safeHoverIndex === null ? null : indexToX(safeHoverIndex);

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = width / rect.width;
    const x = (event.clientX - rect.left) * ratio;
    const nextIndex = Math.round((x - paddingX - candleGap / 2) / candleGap);
    setHoverIndex(Math.min(candles.length - 1, Math.max(0, nextIndex)));
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
      </div>

      <svg
        className="chart-canvas"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={handleMouseMove}
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
        {Array.from({ length: 8 }, (_, index) => {
          const y = chartTop + (priceHeight / 7) * index;
          return <line className="chart-grid-line" key={`h-${index}`} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />;
        })}
        {Array.from({ length: 10 }, (_, index) => {
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
                  return (
                    <rect
                      className={`strategy-band ${element.tone}`}
                      height={bandHeight}
                      key={`${layer.strategyId}-${element.id}`}
                      width={width - paddingX * 2}
                      x={paddingX}
                      y={y}
                    />
                  );
                }

                if (element.kind === "price-line") {
                  if (!isFiniteNumber(element.price)) {
                    return null;
                  }

                  const y = priceToY(element.price);
                  return (
                    <g className={`strategy-price-line ${element.tone}`} key={`${layer.strategyId}-${element.id}`}>
                      <line x1={paddingX} x2={width - paddingX} y1={y} y2={y} />
                      <text x={width - paddingX - 8} y={y - 6}>
                        {element.label}
                      </text>
                    </g>
                  );
                }

                if (!isFiniteNumber(element.timestamp) || !isFiniteNumber(element.price)) {
                  return null;
                }

                const x = timestampToX(element.timestamp);
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

        {candles.map((candle, index) => {
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
              <line className={isUp ? "candle-wick up" : "candle-wick down"} x1={x} x2={x} y1={highY} y2={lowY} />
              <rect
                className={isUp ? "candle-body up" : "candle-body down"}
                height={bodyHeight}
                rx="2"
                width={candleWidth}
                x={x - candleWidth / 2}
                y={bodyY}
              />
              <rect
                className={isUp ? "volume-bar up" : "volume-bar down"}
                height={volumeTop + volumeHeight - volumeY}
                rx="2"
                width={candleWidth}
                x={x - candleWidth / 2}
                y={volumeY}
              />
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

        {hoverX !== null && (
          <g className="crosshair">
            <line x1={hoverX} x2={hoverX} y1={chartTop} y2={volumeTop + volumeHeight} />
            <line x1={paddingX} x2={width - paddingX} y1={priceToY(hoveredCandle.close)} y2={priceToY(hoveredCandle.close)} />
          </g>
        )}
      </svg>
    </section>
  );
}
