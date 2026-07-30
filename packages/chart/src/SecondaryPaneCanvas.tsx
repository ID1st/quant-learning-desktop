import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type { ChartPaneModel } from "./contracts.ts";
import { createSmoothPath, formatPrice } from "./chartPrimitives.ts";
import { getResponsiveSvgViewBoxHeight } from "./responsiveSvg.ts";

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

export function useResponsiveSvgViewBoxSize(fallbackWidth: number, fallbackHeight: number) {
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

export function SecondaryPaneCanvas({
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
