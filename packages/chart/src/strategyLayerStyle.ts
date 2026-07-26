export type ChartLineStyle = "solid" | "dashed" | "dotted";
export type ChartLabelAnchor = "above" | "below" | "center" | "right";

const PRICE_AXIS_WIDTH_PERCENT = "8.7755%";
const HUD_PLOT_GAP = "32px";

export function getChartHudRightOffset() {
  return `calc(${PRICE_AXIS_WIDTH_PERCENT} + ${HUD_PLOT_GAP})`;
}

export function getSignalMarkerLabelWidth(text: string) {
  return Math.min(220, Math.max(34, Array.from(text).length * 12 + 18));
}

export function getChartLineDasharray(style: ChartLineStyle | undefined) {
  if (style === "dashed") {
    return "8 7";
  }
  if (style === "dotted") {
    return "2 5";
  }
  return undefined;
}

export function getChartLabelPosition(
  anchor: ChartLabelAnchor | undefined,
  bounds: { x1: number; x2: number },
  priceY: number,
): { x: number; y: number; textAnchor: "start" | "middle" | "end" } {
  const midpoint = (bounds.x1 + bounds.x2) / 2;
  if (anchor === "below") {
    return { x: midpoint, y: priceY + 14, textAnchor: "middle" };
  }
  if (anchor === "center") {
    return { x: midpoint, y: priceY + 4, textAnchor: "middle" };
  }
  if (anchor === "right") {
    return { x: bounds.x2 - 6, y: priceY - 4, textAnchor: "end" };
  }
  return { x: midpoint, y: priceY - 8, textAnchor: "middle" };
}
