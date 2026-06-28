import { useMemo, useState } from "react";
import { ChartViewport, type CandlePoint, type ChartLayer, type ChartLayerElement } from "@quant/chart";
import type { Market, Timeframe } from "@quant/shared";
import { createPresetStrategyRegistry, runRegisteredStrategy, type Bar } from "@quant/strategy-engine";
import { Crosshair, Gauge, LineChart, MousePointer2, PencilLine, Plus, Ruler, Settings2 } from "lucide-react";

const symbols: Array<{ symbol: string; name: string; market: Market; price: string; change: string }> = [
  { symbol: "AAPL", name: "Apple Inc.", market: "US", price: "219.48", change: "+1.03%" },
  { symbol: "9988.HK", name: "阿里巴巴", market: "HK", price: "83.20", change: "+1.49%" },
  { symbol: "600519", name: "贵州茅台", market: "CN", price: "1468.10", change: "+0.54%" },
  { symbol: "TSLA", name: "Tesla", market: "US", price: "188.14", change: "-0.82%" },
];

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1h", "1d", "1w"];
const sampleStart = Date.UTC(2026, 0, 2, 14, 30);
const sampleMinute = 60 * 1000;
const chartBars: Bar[] = [
  { timestamp: sampleStart, open: 100, high: 103, low: 99, close: 101, volume: 100000 },
  { timestamp: sampleStart + 15 * sampleMinute, open: 101, high: 104, low: 100, close: 102, volume: 110000 },
  { timestamp: sampleStart + 30 * sampleMinute, open: 102, high: 105, low: 101, close: 105, volume: 125000 },
  { timestamp: sampleStart + 45 * sampleMinute, open: 105, high: 106, low: 97, close: 98, volume: 135000 },
  { timestamp: sampleStart + 60 * sampleMinute, open: 98, high: 101, low: 96, close: 100, volume: 118000 },
  { timestamp: sampleStart + 75 * sampleMinute, open: 100, high: 103, low: 98, close: 102, volume: 122000 },
];
const chartCandles: CandlePoint[] = chartBars.map((bar, index) => ({
  ...bar,
  time: `15m #${index + 1}`,
}));
const strategyRegistry = createPresetStrategyRegistry();

function toChartLayerElement(element: ReturnType<typeof runRegisteredStrategy>["output"]["render"]["elements"][number]): ChartLayerElement | null {
  if (element.kind === "signal-marker" || element.kind === "price-line" || element.kind === "band") {
    return element;
  }

  return null;
}

export function ChartWorkspacePage() {
  const [activeSymbol, setActiveSymbol] = useState(symbols[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [showSignals, setShowSignals] = useState(true);
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const utorbRun = useMemo(
    () =>
      runRegisteredStrategy(strategyRegistry, {
        strategyKey: "utorb",
        symbol: activeSymbol.symbol,
        market: activeSymbol.market,
        timeframe: "15m",
        bars: chartBars,
        runMode: "backtest",
        parameters: {
          openingRangeMinutes: 30,
          showTargets: true,
        },
      }),
    [activeSymbol.market, activeSymbol.symbol],
  );
  const strategyLayers = useMemo<ChartLayer[]>(
    () => [
      {
        ...utorbRun.output.render,
        elements: utorbRun.output.render.elements.map(toChartLayerElement).filter((element): element is ChartLayerElement => element !== null),
      },
    ],
    [utorbRun],
  );

  return (
    <section className="chart-workspace-page">
      <header className="chart-topbar">
        <div className="symbol-search">
          <span>{activeSymbol.market}</span>
          <strong>{activeSymbol.symbol}</strong>
          <small>{activeSymbol.name}</small>
        </div>

        <div className="timeframe-tabs" aria-label="周期选择">
          {timeframes.map((item) => (
            <button className={item === timeframe ? "active" : ""} key={item} onClick={() => setTimeframe(item)} type="button">
              {item}
            </button>
          ))}
        </div>

        <div className="chart-toggle-group">
          <button className={showMovingAverage ? "active" : ""} onClick={() => setShowMovingAverage((value) => !value)} type="button">
            <LineChart size={16} />
            <span>均线</span>
          </button>
          <button className={showSignals ? "active" : ""} onClick={() => setShowSignals((value) => !value)} type="button">
            <Gauge size={16} />
            <span>信号</span>
          </button>
        </div>
      </header>

      <div className="chart-workspace-grid">
        <aside className="chart-tool-rail" aria-label="画线工具">
          <button className="active" type="button" title="光标">
            <MousePointer2 size={18} />
          </button>
          <button type="button" title="十字光标">
            <Crosshair size={18} />
          </button>
          <button type="button" title="趋势线">
            <PencilLine size={18} />
          </button>
          <button type="button" title="测距">
            <Ruler size={18} />
          </button>
          <button type="button" title="图表设置">
            <Settings2 size={18} />
          </button>
        </aside>

        <main className="chart-main-panel">
          <ChartViewport
            candles={timeframe === "15m" ? chartCandles : undefined}
            context={{ symbol: activeSymbol.symbol, market: activeSymbol.market, timeframe }}
            showMovingAverage={showMovingAverage}
            showSignals={showSignals}
            showStrategyLayers={showSignals && timeframe === "15m"}
            strategyLayers={strategyLayers}
          />
        </main>

        <aside className="watchlist-panel">
          <div className="panel-heading">
            <div>
              <p>观察列表</p>
              <h2>多市场</h2>
            </div>
            <button type="button" title="添加标的">
              <Plus size={17} />
            </button>
          </div>

          <div className="watchlist-items">
            {symbols.map((item) => (
              <button
                className={item.symbol === activeSymbol.symbol ? "active" : ""}
                key={item.symbol}
                onClick={() => setActiveSymbol(item)}
                type="button"
              >
                <span>
                  <strong>{item.symbol}</strong>
                  <small>{item.name}</small>
                </span>
                <span>
                  <strong>{item.price}</strong>
                  <small className={item.change.startsWith("+") ? "positive" : "negative"}>{item.change}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <footer className="chart-bottom-panel">
        <div>
          <p>策略面板</p>
          <strong>UTORB 图层已接入</strong>
          <span>
            {timeframe === "15m"
              ? `信号 ${utorbRun.output.signals.length} 个，图层元素 ${strategyLayers[0]?.elements.length ?? 0} 个。`
              : "切换到 15m 周期可查看 UTORB 图层样例。"}
          </span>
        </div>
        <div>
          <p>订单信息</p>
          <strong>无活动订单</strong>
          <span>真实交易接口将在后续交易模块开放。</span>
        </div>
        <div>
          <p>日志窗口</p>
          <strong>图表工作台已就绪</strong>
          <span>等待真实行情同步模块接入。</span>
        </div>
      </footer>
    </section>
  );
}
