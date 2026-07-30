export function shouldRenderChartLayer(
  layer: {
    readonly enabled: boolean;
    readonly visible: boolean;
    readonly source: "strategy" | "indicator" | "drawing";
  },
  showStrategyLayers: boolean,
): boolean {
  return layer.enabled && layer.visible && (layer.source !== "strategy" || showStrategyLayers);
}
