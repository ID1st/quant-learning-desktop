import { useState } from "react";
import { ChartViewport } from "@quant/chart";
import type { Market, Timeframe } from "@quant/shared";
import { Crosshair, Gauge, LineChart, MousePointer2, PencilLine, Plus, Ruler, Settings2 } from "lucide-react";

const symbols: Array<{ symbol: string; name: string; market: Market; price: string; change: string }> = [
  { symbol: "AAPL", name: "Apple Inc.", market: "US", price: "219.48", change: "+1.03%" },
  { symbol: "9988.HK", name: "阿里巴巴", market: "HK", price: "83.20", change: "+1.49%" },
  { symbol: "600519", name: "贵州茅台", market: "CN", price: "1468.10", change: "+0.54%" },
  { symbol: "TSLA", name: "Tesla", market: "US", price: "188.14", change: "-0.82%" },
];

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1h", "1d", "1w"];

export function ChartWorkspacePage() {
  const [activeSymbol, setActiveSymbol] = useState(symbols[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [showSignals, setShowSignals] = useState(true);
  const [showMovingAverage, setShowMovingAverage] = useState(true);

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
            context={{ symbol: activeSymbol.symbol, market: activeSymbol.market, timeframe }}
            showMovingAverage={showMovingAverage}
            showSignals={showSignals}
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
          <strong>UTORB / Trend Targets 信号预览</strong>
          <span>当前仅展示图表信号标记，策略执行将在策略模块中接入。</span>
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
