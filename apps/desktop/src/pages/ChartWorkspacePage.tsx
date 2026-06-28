import { ChartViewport } from "@quant/chart";
import { PlaceholderPage } from "../ui/PlaceholderPage";

export function ChartWorkspacePage() {
  return (
    <PlaceholderPage title="超级图表" description="图表外壳占位页，当前不加载真实行情数据。">
      <ChartViewport />
    </PlaceholderPage>
  );
}
