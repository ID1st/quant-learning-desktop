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

export function ChartViewport() {
  return (
    <section className="chart-placeholder" aria-label="图表视图占位区域">
      图表适配器占位区域
    </section>
  );
}
