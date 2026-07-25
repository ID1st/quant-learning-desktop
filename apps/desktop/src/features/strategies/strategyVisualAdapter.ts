import type { ChartLayerElement } from "@quant/chart";
import type { StrategyVisualElement } from "@quant/strategy-engine";

export function toChartLayerElement(element: StrategyVisualElement): ChartLayerElement {
  if (element.kind === "label") {
    return {
      ...element,
      kind: "text",
      text: element.text,
    };
  }

  return element;
}
