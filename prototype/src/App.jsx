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
  { code: "AAPL", name: "苹果公司", last: "192.79", change: "1.96", pct: "1.03%", up: true },
  { code: "MSFT", name: "微软", last: "415.10", change: "-0.42", pct: "-0.10%", up: false },
  { code: "NVDA", name: "英伟达", last: "135.98", change: "3.19", pct: "2.40%", up: true },
  { code: "AMZN", name: "亚马逊", last: "205.18", change: "1.21", pct: "0.59%", up: true },
  { code: "GOOG", name: "谷歌", last: "173.72", change: "-0.55", pct: "-0.32%", up: false },
  { code: "TSLA", name: "特斯拉", last: "350.09", change: "-3.19", pct: "-0.90%", up: false },
  { code: "9988.HK", name: "阿里巴巴港股", last: "122.60", change: "1.80", pct: "1.49%", up: true },
  { code: "600519.SS", name: "贵州茅台", last: "1541.83", change: "8.35", pct: "0.54%", up: true },
];

const strategies = [
  { id: "utorb", name: "终极开盘区间突破", active: true, starred: true },
  { id: "trend", name: "趋势目标", active: false, starred: false },
  { id: "ml", name: "机器学习价格目标信号", active: false, starred: false },
];

const candles = [
  16, 28, 34, 25, 41, 38, 48, 43, 51, 39, 46, 52, 57, 61, 55, 64, 73, 69, 58, 52,
  66, 79, 76, 83, 88, 72, 67, 71, 86, 93, 81, 78, 74, 69, 63, 58, 54, 62, 70, 76,
  88, 91, 84, 79, 86, 95, 101, 112, 107, 116, 123, 118, 129, 137, 132, 146,
];

const backtestRows = [
  ["净利润", "$ 28,450.00", "positive"],
  ["已平仓交易", "78", ""],
  ["盈利交易占比", "62.82%", "positive"],
  ["利润因子", "1.68", "positive"],
  ["最大回撤", "$ 7,320.00", "negative"],
  ["平均盈利交易", "$ 364.74", "positive"],
  ["平均亏损交易", "-$ 412.87", "negative"],
  ["期望收益", "$ 364.74", "positive"],
];

function IconButton({ icon: Icon, label, active = false }) {
  return (
    <button className={`icon-button ${active ? "is-active" : ""}`} title={label} aria-label={label}>
      <Icon size={17} strokeWidth={1.8} />
    </button>
  );
}

function TopBar() {
  const intervals = ["1分", "5分", "15分", "30分", "1小时", "2小时", "4小时", "日", "周", "月"];

  return (
    <header className="topbar">
      <div className="brand-mark">T</div>
      <label className="searchbox">
        <Search size={16} />
        <input value="AAPL" readOnly aria-label="搜索证券代码" />
      </label>
      <nav className="intervals" aria-label="周期">
        {intervals.map((item) => (
          <button key={item} className={item === "日" ? "active" : ""}>{item}</button>
        ))}
      </nav>
      <div className="top-actions">
        <button><CandlestickChart size={16} /> 指标</button>
        <button><Grid2X2 size={16} /> 布局</button>
        <button><Bell size={16} /> 提醒</button>
        <button><Play size={16} /> 回放</button>
      </div>
      <div className="spacer" />
      <button className="strategy-select">策略 <ChevronDown size={15} /></button>
      <button className="publish">发布</button>
      <IconButton icon={Settings} label="设置" />
    </header>
  );
}

function LeftToolbar() {
  const tools = [
    [Crosshair, "十字光标"],
    [MousePointer2, "光标"],
    [PenLine, "趋势线"],
    [GitBranch, "预测路径"],
    [Target, "价格目标"],
    [Triangle, "形态"],
    [Magnet, "磁吸"],
    [BoxSelect, "测量"],
    [Eye, "显示隐藏"],
    [Lock, "锁定"],
    [Minus, "删除"],
  ];

  return (
    <aside className="left-tools" aria-label="图表工具">
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
          <span>开 190.86</span>
          <span>高 193.34</span>
          <span>低 190.21</span>
          <span>收 192.79</span>
          <strong className="positive">+1.96 (+1.03%)</strong>
        </div>
      </div>

      <div className="trade-buttons">
        <button className="sell">192.79 <span>卖出</span></button>
        <button className="buy">192.80 <span>买入</span></button>
      </div>

      <div className="indicator-stack">
        <p>终极开盘区间突破 (UORB) 20 1.5 9:30-10:00</p>
        <p>趋势目标 (TT) 5 20 1.5 2.0</p>
        <p>20日均线 收盘价 <strong>184.52</strong></p>
        <p>50日均线 收盘价 <strong className="gold">179.41</strong></p>
        <p>成交量 <strong>52.34M</strong></p>
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
        <div className="signal long s1"><ArrowUp size={16} /> 买入<br />+1</div>
        <div className="signal short s2"><ArrowDown size={16} /> 卖出<br />-1</div>
        <div className="signal long s3"><ArrowUp size={16} /> 买入<br />+1</div>
        <div className="signal short s4"><ArrowDown size={16} /> 卖出<br />-1</div>
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
        {["1日", "5日", "1月", "3月", "6月", "今年", "1年", "5年", "全部"].map((item) => (
          <button key={item}>{item}</button>
        ))}
        <span className="chart-clock">15:59:42 (UTC-4)</span>
        <button>复权</button>
        <button>%</button>
        <button>对数</button>
        <button>自动</button>
      </div>
    </section>
  );
}

function StrategyPanel() {
  return (
    <aside className="strategy-panel">
      <div className="panel-title">
        <strong>策略</strong>
        <IconButton icon={X} label="关闭策略面板" />
      </div>
      <div className="panel-row between">
        <span>预设</span>
        <button className="mini-action"><Plus size={14} /> 新建</button>
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
        <label>交易时段 <select value="09:30 - 10:00" readOnly><option>09:30 - 10:00</option></select></label>
        <label>回看天数 <input value="20" readOnly /></label>
        <label>区间倍数 <input value="1.50" readOnly /></label>
      </div>
      <div className="form-block">
        <h4>入场</h4>
        <label>方向 <select value="双向" readOnly><option>双向</option></select></label>
        <label className="check"><input type="checkbox" defaultChecked /> 向上突破</label>
        <label className="check"><input type="checkbox" defaultChecked /> 向下突破</label>
        <label>成交量过滤 <input value="1.20" readOnly /></label>
      </div>
      <div className="form-block">
        <h4>风险管理</h4>
        <label>止损 (ATR) <input value="1.50" readOnly /></label>
        <label>止盈 (盈亏比) <input value="2.00" readOnly /></label>
        <label>最大持仓 <input value="1" readOnly /></label>
      </div>
      <button className="apply">应用到图表</button>
    </aside>
  );
}

function Watchlist({ selectedSymbol, setSelectedSymbol }) {
  return (
    <aside className="watch-panel">
      <div className="panel-title">
        <strong>观察列表</strong>
        <div>
          <IconButton icon={Plus} label="添加证券" />
          <IconButton icon={Menu} label="观察列表菜单" />
        </div>
      </div>
      <div className="market-tabs">
        {["美股", "港股", "A股", "ETF", "期货"].map((item) => (
          <button className={item === "美股" ? "active" : ""} key={item}>{item}</button>
        ))}
      </div>
      <div className="watch-table">
        <div className="watch-head"><span>代码</span><span>最新价</span><span>涨跌</span><span>涨跌幅</span></div>
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
          <IconButton icon={Settings} label="标的设置" />
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
          <div><dt>成交量</dt><dd>52.34M</dd></div>
          <div><dt>30日平均成交量</dt><dd>58.67M</dd></div>
          <div><dt>市值</dt><dd>2.96T</dd></div>
          <div><dt>下次财报</dt><dd>2025-07-31</dd></div>
        </dl>
      </div>
    </aside>
  );
}

function BottomPanel() {
  const [tab, setTab] = useState("回测");
  const tabs = ["策略", "回测", "订单", "日志"];

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
          <div className="select-line">终极开盘区间突破 <ChevronDown size={14} /></div>
          <div className="date-row"><span>起始 2024-01-01</span><span>结束 2025-06-02</span></div>
          {backtestRows.map(([label, value, tone]) => (
            <div className="metric-row" key={label}>
              <span>{label}</span>
              <strong className={tone}>{value}</strong>
            </div>
          ))}
        </div>
        <div className="equity-card">
          <div className="subtabs">
            {["概览", "表现", "交易列表", "分布"].map((item) => (
              <button className={item === "概览" ? "active" : ""} key={item}>{item}</button>
            ))}
          </div>
          <div className="equity-chart">
            {Array.from({ length: 52 }).map((_, index) => (
              <span key={index} style={{ height: `${24 + index * 1.45 + (index % 7) * 4}px` }} />
            ))}
          </div>
        </div>
        <div className="trade-summary">
          <div><span>总交易数</span><strong>78</strong></div>
          <div><span>盈利交易</span><strong>49 (62.82%)</strong></div>
          <div><span>亏损交易</span><strong>29 (37.18%)</strong></div>
          <div><span>最佳交易</span><strong className="positive">$ 2,150.00</strong></div>
          <div><span>最差交易</span><strong className="negative">-$ 1,420.00</strong></div>
          <div><span>平均持仓时长</span><strong>1天3小时</strong></div>
        </div>
      </div>
      <div className="terminal-tabs">
        {[
          [Terminal, "Pine 编辑器"],
          [Gauge, "策略测试器"],
          [Database, "市场扫描器"],
          [Activity, "模拟交易"],
        ].map(([Icon, label], index) => (
          <button className={index === 1 ? "active" : ""} key={label}><Icon size={15} /> {label}</button>
        ))}
        <span className="connection">已连接 <CircleDot size={12} /></span>
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
              <PanelRight size={16} /> {strategyOpen ? "隐藏" : "显示"}策略面板
            </button>
            <button><Maximize2 size={16} /> 专注图表</button>
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
        <span><RefreshCcw size={14} /> 行情数据已于 24 秒前同步</span>
        <span><Zap size={14} /> UORB 正在模拟模式运行</span>
        <span><BookOpen size={14} /> 学习检查点：突破有效性验证</span>
        <span><AlertCircle size={14} /> 当前无实时订单</span>
        <button><Download size={14} /> 导出报告</button>
        <button><SlidersHorizontal size={14} /> 布局</button>
      </div>
    </main>
  );
}
