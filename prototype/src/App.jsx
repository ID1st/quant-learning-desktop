import { useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  BookOpen,
  BoxSelect,
  CandlestickChart,
  ChevronDown,
  CircleDot,
  Clock3,
  Crosshair,
  Database,
  Download,
  Eye,
  Gauge,
  GitBranch,
  Grid2X2,
  LineChart,
  Lock,
  Magnet,
  Maximize2,
  Menu,
  Minus,
  MousePointer2,
  PanelRight,
  PenLine,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Square,
  Star,
  Target,
  Terminal,
  TrendingUp,
  Triangle,
  Wand2,
  X,
  Zap,
} from "lucide-react";

const symbols = [
  { code: "AAPL", name: "Apple Inc.", last: "192.79", change: "1.96", pct: "1.03%", up: true },
  { code: "MSFT", name: "Microsoft", last: "415.10", change: "-0.42", pct: "-0.10%", up: false },
  { code: "NVDA", name: "NVIDIA", last: "135.98", change: "3.19", pct: "2.40%", up: true },
  { code: "AMZN", name: "Amazon", last: "205.18", change: "1.21", pct: "0.59%", up: true },
  { code: "GOOG", name: "Alphabet", last: "173.72", change: "-0.55", pct: "-0.32%", up: false },
  { code: "TSLA", name: "Tesla", last: "350.09", change: "-3.19", pct: "-0.90%", up: false },
  { code: "9988.HK", name: "Alibaba HK", last: "122.60", change: "1.80", pct: "1.49%", up: true },
  { code: "600519.SS", name: "Kweichow Moutai", last: "1541.83", change: "8.35", pct: "0.54%", up: true },
];

const strategies = [
  { id: "utorb", name: "Ultimate Opening Range Breakout", active: true, starred: true },
  { id: "trend", name: "Trend Targets", active: false, starred: false },
  { id: "ml", name: "ML Price Target Signals", active: false, starred: false },
];

const candles = [
  16, 28, 34, 25, 41, 38, 48, 43, 51, 39, 46, 52, 57, 61, 55, 64, 73, 69, 58, 52,
  66, 79, 76, 83, 88, 72, 67, 71, 86, 93, 81, 78, 74, 69, 63, 58, 54, 62, 70, 76,
  88, 91, 84, 79, 86, 95, 101, 112, 107, 116, 123, 118, 129, 137, 132, 146,
];

const backtestRows = [
  ["Net Profit", "$ 28,450.00", "positive"],
  ["Total Closed Trades", "78", ""],
  ["Percent Profitable", "62.82%", "positive"],
  ["Profit Factor", "1.68", "positive"],
  ["Max Drawdown", "$ 7,320.00", "negative"],
  ["Avg Winning Trade", "$ 364.74", "positive"],
  ["Avg Losing Trade", "-$ 412.87", "negative"],
  ["Expectancy", "$ 364.74", "positive"],
];

function IconButton({ icon: Icon, label, active = false }) {
  return (
    <button className={`icon-button ${active ? "is-active" : ""}`} title={label} aria-label={label}>
      <Icon size={17} strokeWidth={1.8} />
    </button>
  );
}

function TopBar() {
  const intervals = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "D", "W", "M"];

  return (
    <header className="topbar">
      <div className="brand-mark">T</div>
      <label className="searchbox">
        <Search size={16} />
        <input value="AAPL" readOnly aria-label="Search symbol" />
      </label>
      <nav className="intervals" aria-label="Timeframe">
        {intervals.map((item) => (
          <button key={item} className={item === "D" ? "active" : ""}>{item}</button>
        ))}
      </nav>
      <div className="top-actions">
        <button><CandlestickChart size={16} /> Indicators</button>
        <button><Grid2X2 size={16} /> Layout</button>
        <button><Bell size={16} /> Alert</button>
        <button><Play size={16} /> Replay</button>
      </div>
      <div className="spacer" />
      <button className="strategy-select">Strategies <ChevronDown size={15} /></button>
      <button className="publish">Publish</button>
      <IconButton icon={Settings} label="Settings" />
    </header>
  );
}

function LeftToolbar() {
  const tools = [
    [Crosshair, "Crosshair"],
    [MousePointer2, "Cursor"],
    [PenLine, "Trend line"],
    [GitBranch, "Projection"],
    [Target, "Price target"],
    [Triangle, "Pattern"],
    [Magnet, "Magnet"],
    [BoxSelect, "Measure"],
    [Eye, "Visibility"],
    [Lock, "Lock"],
    [Minus, "Remove"],
  ];

  return (
    <aside className="left-tools" aria-label="Chart tools">
      {tools.map(([Icon, label], index) => (
        <IconButton key={label} icon={Icon} label={label} active={index === 0} />
      ))}
    </aside>
  );
}

function ChartArea({ selectedSymbol }) {
  const bars = useMemo(() => candles.map((value, index) => ({
    value,
    open: Math.max(8, value - (index % 7) * 3),
    close: Math.max(8, value - ((index + 3) % 6) * 3),
  })), []);

  return (
    <section className="chart-shell">
      <div className="instrument-strip">
        <div>
          <strong>{selectedSymbol.code}</strong>
          <span>{selectedSymbol.name} · 1D · NASDAQ</span>
        </div>
        <div className="quote-line">
          <span>O 190.86</span>
          <span>H 193.34</span>
          <span>L 190.21</span>
          <span>C 192.79</span>
          <strong className="positive">+1.96 (+1.03%)</strong>
        </div>
      </div>

      <div className="trade-buttons">
        <button className="sell">192.79 <span>SELL</span></button>
        <button className="buy">192.80 <span>BUY</span></button>
      </div>

      <div className="indicator-stack">
        <p>Ultimate Opening Range Breakout (UORB) 20 1.5 9:30-10:00</p>
        <p>Trend Targets (TT) 5 20 1.5 2.0</p>
        <p>MA 20 close <strong>184.52</strong></p>
        <p>MA 50 close <strong className="gold">179.41</strong></p>
        <p>Vol <strong>52.34M</strong></p>
      </div>

      <div className="chart-grid">
        <div className="price-scale">
          {["200.00", "196.00", "192.79", "188.00", "184.52", "179.41", "172.00", "164.08"].map((p) => (
            <span key={p} className={p.includes(".79") ? "price-now" : ""}>{p}</span>
          ))}
        </div>
        <svg className="smooth-lines" viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true">
          <path
            className="smooth-line blue"
            d="M 0 270 C 95 250, 145 238, 220 246 S 360 272, 450 230 S 580 178, 680 202 S 810 232, 1000 155"
          />
          <path
            className="smooth-line yellow"
            d="M 0 314 C 115 292, 215 276, 330 280 S 510 292, 610 255 S 760 235, 1000 218"
          />
          <path
            className="smooth-line signal-trail"
            d="M 210 285 C 315 230, 420 185, 530 232 S 710 318, 790 232 S 920 155, 1000 120"
          />
        </svg>
        <div className="price-marker">192.79</div>
        <div className="signal long s1"><ArrowUp size={16} /> Buy<br />+1</div>
        <div className="signal short s2"><ArrowDown size={16} /> Sell<br />-1</div>
        <div className="signal long s3"><ArrowUp size={16} /> Buy<br />+1</div>
        <div className="signal short s4"><ArrowDown size={16} /> Sell<br />-1</div>
        <div className="candles">
          {bars.map((bar, index) => {
            const up = bar.close >= bar.open;
            return (
              <span
                className={`candle ${up ? "up" : "down"}`}
                key={`${bar.value}-${index}`}
                style={{
                  height: `${bar.value}px`,
                  "--wick": `${Math.min(148, bar.value + 18)}px`,
                }}
              />
            );
          })}
        </div>
        <div className="volume">
          {bars.map((bar, index) => (
            <span
              key={`v-${index}`}
              className={index % 3 === 0 ? "down" : "up"}
              style={{ height: `${Math.max(18, bar.value * 0.52)}px` }}
            />
          ))}
        </div>
      </div>

      <div className="chart-footer">
        {["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "All"].map((item) => (
          <button key={item}>{item}</button>
        ))}
        <span className="chart-clock">15:59:42 (UTC-4)</span>
        <button>adj</button>
        <button>%</button>
        <button>log</button>
        <button>auto</button>
      </div>
    </section>
  );
}

function StrategyPanel() {
  return (
    <aside className="strategy-panel">
      <div className="panel-title">
        <strong>Strategy</strong>
        <IconButton icon={X} label="Close strategy panel" />
      </div>
      <div className="panel-row between">
        <span>Presets</span>
        <button className="mini-action"><Plus size={14} /> New</button>
      </div>
      <div className="strategy-list">
        {strategies.map((item) => (
          <button className={item.active ? "selected" : ""} key={item.id}>
            <span>{item.name}</span>
            <Star size={14} className={item.starred ? "starred" : ""} />
          </button>
        ))}
      </div>

      <div className="form-block">
        <label>Session <select value="09:30 - 10:00" readOnly><option>09:30 - 10:00</option></select></label>
        <label>Lookback Days <input value="20" readOnly /></label>
        <label>Range Multiplier <input value="1.50" readOnly /></label>
      </div>
      <div className="form-block">
        <h4>Entry</h4>
        <label>Direction <select value="Both" readOnly><option>Both</option></select></label>
        <label className="check"><input type="checkbox" defaultChecked /> Long Breakout</label>
        <label className="check"><input type="checkbox" defaultChecked /> Short Breakout</label>
        <label>Volume Filter <input value="1.20" readOnly /></label>
      </div>
      <div className="form-block">
        <h4>Risk Management</h4>
        <label>Stop Loss (ATR) <input value="1.50" readOnly /></label>
        <label>Take Profit (R:R) <input value="2.00" readOnly /></label>
        <label>Max Positions <input value="1" readOnly /></label>
      </div>
      <button className="apply">Apply to Chart</button>
    </aside>
  );
}

function Watchlist({ selectedSymbol, setSelectedSymbol }) {
  return (
    <aside className="watch-panel">
      <div className="panel-title">
        <strong>Watchlist</strong>
        <div>
          <IconButton icon={Plus} label="Add symbol" />
          <IconButton icon={Menu} label="Watchlist menu" />
        </div>
      </div>
      <div className="market-tabs">
        {["US", "HK", "A-Share", "ETF", "Futures"].map((item) => (
          <button className={item === "US" ? "active" : ""} key={item}>{item}</button>
        ))}
      </div>
      <div className="watch-table">
        <div className="watch-head"><span>Symbol</span><span>Last</span><span>Chg</span><span>Chg%</span></div>
        {symbols.map((item) => (
          <button
            className={selectedSymbol.code === item.code ? "selected" : ""}
            key={item.code}
            onClick={() => setSelectedSymbol(item)}
          >
            <span>{item.code}</span>
            <span>{item.last}</span>
            <span className={item.up ? "positive" : "negative"}>{item.change}</span>
            <span className={item.up ? "positive" : "negative"}>{item.pct}</span>
          </button>
        ))}
      </div>

      <div className="symbol-card">
        <div className="symbol-card-head">
          <div className="apple-mark">A</div>
          <div>
            <h3>{selectedSymbol.code}</h3>
            <p>{selectedSymbol.name} · NASDAQ</p>
          </div>
          <IconButton icon={Settings} label="Symbol settings" />
        </div>
        <div className="big-price">
          {selectedSymbol.last}
          <span className={selectedSymbol.up ? "positive" : "negative"}>
            {selectedSymbol.change} ({selectedSymbol.pct})
          </span>
        </div>
        <div className="range-bar">
          <span />
          <i />
        </div>
        <dl>
          <div><dt>Volume</dt><dd>52.34M</dd></div>
          <div><dt>Average Volume (30D)</dt><dd>58.67M</dd></div>
          <div><dt>Market Cap</dt><dd>2.96T</dd></div>
          <div><dt>Next Earnings</dt><dd>Jul 31, 2025</dd></div>
        </dl>
      </div>
    </aside>
  );
}

function BottomPanel() {
  const [tab, setTab] = useState("Backtest");
  const tabs = ["Strategy", "Backtest", "Orders", "Logs"];

  return (
    <section className="bottom-panel">
      <div className="bottom-tabs">
        {tabs.map((item) => (
          <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>
        ))}
        <button className="collapse"><ChevronDown size={16} /></button>
      </div>
      <div className="tester-grid">
        <div className="metrics-card">
          <div className="select-line">Ultimate Opening Range Breakout <ChevronDown size={14} /></div>
          <div className="date-row"><span>From 2024-01-01</span><span>To 2025-06-02</span></div>
          {backtestRows.map(([label, value, tone]) => (
            <div className="metric-row" key={label}>
              <span>{label}</span>
              <strong className={tone}>{value}</strong>
            </div>
          ))}
        </div>
        <div className="equity-card">
          <div className="subtabs">
            {["Overview", "Performance", "Trades List", "Distribution"].map((item) => (
              <button className={item === "Overview" ? "active" : ""} key={item}>{item}</button>
            ))}
          </div>
          <div className="equity-chart">
            {Array.from({ length: 52 }).map((_, index) => (
              <span key={index} style={{ height: `${24 + index * 1.45 + (index % 7) * 4}px` }} />
            ))}
          </div>
        </div>
        <div className="trade-summary">
          <div><span>Total Trades</span><strong>78</strong></div>
          <div><span>Winning Trades</span><strong>49 (62.82%)</strong></div>
          <div><span>Losing Trades</span><strong>29 (37.18%)</strong></div>
          <div><span>Best Trade</span><strong className="positive">$ 2,150.00</strong></div>
          <div><span>Worst Trade</span><strong className="negative">-$ 1,420.00</strong></div>
          <div><span>Avg Duration</span><strong>1d 3h</strong></div>
        </div>
      </div>
      <div className="terminal-tabs">
        {[
          [Terminal, "Pine Editor"],
          [Gauge, "Strategy Tester"],
          [Database, "Market Scanner"],
          [Activity, "Paper Trading"],
        ].map(([Icon, label], index) => (
          <button className={index === 1 ? "active" : ""} key={label}><Icon size={15} /> {label}</button>
        ))}
        <span className="connection">Connected <CircleDot size={12} /></span>
      </div>
    </section>
  );
}

export function App() {
  const [selectedSymbol, setSelectedSymbol] = useState(symbols[0]);
  const [strategyOpen, setStrategyOpen] = useState(true);

  return (
    <main className="workbench">
      <TopBar />
      <div className="workspace">
        <LeftToolbar />
        <div className="center-stack">
          <div className="mobile-switch">
            <button onClick={() => setStrategyOpen((value) => !value)}>
              <PanelRight size={16} /> {strategyOpen ? "Hide" : "Show"} Strategy Panel
            </button>
            <button><Maximize2 size={16} /> Focus Chart</button>
          </div>
          <div className="main-grid" data-strategy-open={strategyOpen}>
            <ChartArea selectedSymbol={selectedSymbol} />
            {strategyOpen && <StrategyPanel />}
            <Watchlist selectedSymbol={selectedSymbol} setSelectedSymbol={setSelectedSymbol} />
          </div>
          <BottomPanel />
        </div>
      </div>
      <div className="statusbar">
        <span><Clock3 size={14} /> 15:59:42 (UTC-4)</span>
        <span><RefreshCcw size={14} /> Market data synced 24s ago</span>
        <span><Zap size={14} /> UORB running in paper mode</span>
        <span><BookOpen size={14} /> Learning checkpoint: Breakout validation</span>
        <span><AlertCircle size={14} /> No live orders</span>
        <button><Download size={14} /> Export Report</button>
        <button><SlidersHorizontal size={14} /> Layout</button>
      </div>
    </main>
  );
}
