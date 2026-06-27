import { ChartViewport } from "@quant/chart";
import { PlaceholderPage } from "../ui/PlaceholderPage";

export function ChartWorkspacePage() {
  return (
    <PlaceholderPage title="Chart Workspace" description="Chart shell placeholder; no market data is loaded.">
      <ChartViewport />
    </PlaceholderPage>
  );
}
