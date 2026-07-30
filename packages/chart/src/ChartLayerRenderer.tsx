import type { PointerEvent } from "react";
import type { ChartRenderLayer } from "./contracts.ts";
import { createSmoothPath, isFiniteNumber } from "./chartPrimitives.ts";
import { getProjectedPriceLabelLayout } from "./priceLabelLayout.ts";
import {
  getChartLabelPosition,
  getChartLineDasharray,
  getChartTextSize,
  getSignalMarkerLabelWidth,
} from "./strategyLayerStyle.ts";

interface ChartLayerRendererProps {
  readonly placement: "under-candles" | "over-candles";
  readonly renderLayers: readonly ChartRenderLayer[];
  readonly priceToY: (price: number) => number;
  readonly timestampToX: (timestamp: number) => number | null;
  readonly timedElementBounds: (
    fromTimestamp?: number,
    toTimestamp?: number,
    extendRight?: boolean,
  ) => { readonly x1: number; readonly x2: number } | null;
  readonly paddingX: number;
  readonly plotRight: number;
  readonly beginDrawingDrag: (
    event: PointerEvent<SVGElement>,
    drawingId: string,
    pointIndex: number | null,
  ) => void;
}

export function renderChartLayerElements({
  placement,
  renderLayers,
  priceToY,
  timestampToX,
  timedElementBounds,
  paddingX,
  plotRight,
  beginDrawingDrag,
}: ChartLayerRendererProps) {
  return renderLayers.flatMap((layer) =>
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
                    anchoredLabel?.y ?? (projectedLabelLayout ? projectedLabelLayout.y + 14 : y - 5)
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
}
