import { useEffect, useMemo, useState } from "react";
import { ChartViewport, type CandlePoint, type ChartLayer, type ChartLayerElement } from "@quant/chart";
import type { Market, Timeframe } from "@quant/shared";
import { createPresetStrategyRegistry, runRegisteredStrategy, type Bar } from "@quant/strategy-engine";
import {
  Bell,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  Gauge,
  Layers3,
  LineChart,
  MousePointer2,
  PencilLine,
  Plus,
  Ruler,
  ShieldCheck,
  Settings2,
  TerminalSquare,
} from "lucide-react";

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
const WORKSPACE_PREFERENCES_KEY = "quant-learning.chart-workspace-preferences";

interface ChartWorkspacePreferences {
  version: 1;
  showSignals: boolean;
  showStrategyLayers: boolean;
  showMovingAverage: boolean;
  openingRangeMinutes: number;
  showTargets: boolean;
}

const defaultWorkspacePreferences: ChartWorkspacePreferences = {
  version: 1,
  showSignals: true,
  showStrategyLayers: true,
  showMovingAverage: true,
  openingRangeMinutes: 30,
  showTargets: true,
};

function normalizeOpeningRangeMinutes(value: unknown) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : defaultWorkspacePreferences.openingRangeMinutes;
  return Math.min(60, Math.max(15, numericValue));
}

function readWorkspacePreferences() {
  try {
    const value = window.localStorage.getItem(WORKSPACE_PREFERENCES_KEY);
    const parsed = value ? (JSON.parse(value) as Partial<ChartWorkspacePreferences>) : null;

    if (!parsed || parsed.version !== 1) {
      return defaultWorkspacePreferences;
    }

    return {
      version: 1,
      showSignals: typeof parsed.showSignals === "boolean" ? parsed.showSignals : defaultWorkspacePreferences.showSignals,
      showStrategyLayers:
        typeof parsed.showStrategyLayers === "boolean" ? parsed.showStrategyLayers : defaultWorkspacePreferences.showStrategyLayers,
      showMovingAverage: typeof parsed.showMovingAverage === "boolean" ? parsed.showMovingAverage : defaultWorkspacePreferences.showMovingAverage,
      openingRangeMinutes: normalizeOpeningRangeMinutes(parsed.openingRangeMinutes),
      showTargets: typeof parsed.showTargets === "boolean" ? parsed.showTargets : defaultWorkspacePreferences.showTargets,
    };
  } catch {
    return defaultWorkspacePreferences;
  }
}

function saveWorkspacePreferences(preferences: ChartWorkspacePreferences) {
  try {
    window.localStorage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // 本地偏好保存失败不应影响图表工作台的主要交互。
  }
}

function toChartLayerElement(element: ReturnType<typeof runRegisteredStrategy>["output"]["render"]["elements"][number]): ChartLayerElement | null {
  if (element.kind === "signal-marker" || element.kind === "price-line" || element.kind === "band") {
    return element;
  }

  return null;
}

function formatLogTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function formatSignalTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function ChartWorkspacePage() {
  const workspacePreferences = useMemo(() => readWorkspacePreferences(), []);
  const [activeSymbol, setActiveSymbol] = useState(symbols[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const [showSignals, setShowSignals] = useState(workspacePreferences.showSignals);
  const [showStrategyLayers, setShowStrategyLayers] = useState(workspacePreferences.showStrategyLayers);
  const [showMovingAverage, setShowMovingAverage] = useState(workspacePreferences.showMovingAverage);
  const [openingRangeMinutes, setOpeningRangeMinutes] = useState(workspacePreferences.openingRangeMinutes);
  const [showTargets, setShowTargets] = useState(workspacePreferences.showTargets);
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
          openingRangeMinutes,
          showTargets,
        },
      }),
    [activeSymbol.market, activeSymbol.symbol, openingRangeMinutes, showTargets],
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
  const canShowStrategyLayers = showStrategyLayers && timeframe === "15m";
  const strategyLayerElementCount = strategyLayers.reduce((total, layer) => total + layer.elements.length, 0);
  const strategyLogTime = formatLogTime(sampleStart + openingRangeMinutes * sampleMinute);
  const strategyLogItems = [
    `运行 ${utorbRun.strategy.name}，标的 ${activeSymbol.symbol}，周期 15m。`,
    ...utorbRun.output.logs,
    ...utorbRun.output.alerts.map((alert) => `提醒：${alert}`),
  ];
  const signalRows = utorbRun.output.signals.map((signal, index) => ({
    id: `${signal.type}-${signal.timestamp}-${index}`,
    time: formatSignalTime(signal.timestamp),
    direction: signal.type === "buy" ? "买入" : signal.type === "sell" ? "卖出" : "提醒",
    tone: signal.type,
    price: signal.price === undefined ? "-" : signal.price.toFixed(2),
    label: signal.label ?? "策略信号",
  }));
  const handleOpeningRangeChange = (value: number) => {
    setOpeningRangeMinutes(normalizeOpeningRangeMinutes(value));
  };

  useEffect(() => {
    const preferences: ChartWorkspacePreferences = {
      version: 1,
      showSignals,
      showStrategyLayers,
      showMovingAverage,
      openingRangeMinutes,
      showTargets,
    };

    saveWorkspacePreferences(preferences);
  }, [openingRangeMinutes, showMovingAverage, showSignals, showStrategyLayers, showTargets]);

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
          <button
            className={canShowStrategyLayers ? "active" : ""}
            onClick={() => setShowStrategyLayers((value) => !value)}
            type="button"
          >
            <Layers3 size={16} />
            <span>策略图层</span>
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
            showStrategyLayers={canShowStrategyLayers}
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

          <div className="layer-list">
            <div className="layer-list-heading">
              <span>策略图层</span>
              <button
                aria-label={showStrategyLayers ? "隐藏策略图层" : "显示策略图层"}
                onClick={() => setShowStrategyLayers((value) => !value)}
                type="button"
              >
                {showStrategyLayers ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>

            {strategyLayers.map((layer) => (
              <div className={canShowStrategyLayers ? "layer-item active" : "layer-item"} key={layer.strategyId}>
                <span>
                  <strong>{layer.strategyName}</strong>
                  <small>{timeframe === "15m" ? `${layer.elements.length} 个元素` : "仅 15m 样例可用"}</small>
                </span>
                <small>{canShowStrategyLayers ? "显示中" : "已隐藏"}</small>
              </div>
            ))}

            <div className="strategy-parameter-panel">
              <div className="parameter-heading">
                <span>UTORB 参数</span>
                <small>{openingRangeMinutes} 分钟</small>
              </div>

              <label className="parameter-control" htmlFor="opening-range-minutes">
                <span>开盘区间</span>
                <input
                  id="opening-range-minutes"
                  max="60"
                  min="15"
                  onChange={(event) => handleOpeningRangeChange(event.currentTarget.valueAsNumber)}
                  step="15"
                  type="range"
                  value={openingRangeMinutes}
                />
              </label>

              <label className="parameter-toggle" htmlFor="show-targets">
                <span>
                  <strong>显示目标位</strong>
                  <small>{showTargets ? "上/下目标线参与渲染" : "仅显示区间与信号箭头"}</small>
                </span>
                <input id="show-targets" checked={showTargets} onChange={(event) => setShowTargets(event.currentTarget.checked)} type="checkbox" />
              </label>
            </div>
          </div>
        </aside>
      </div>

      <footer className="chart-bottom-panel">
        <div>
          <p>策略面板</p>
          <strong>UTORB 图层已接入</strong>
          <span>
            {canShowStrategyLayers
              ? `开盘区间 ${openingRangeMinutes} 分钟，信号 ${utorbRun.output.signals.length} 个，图层元素 ${strategyLayerElementCount} 个。`
              : timeframe === "15m"
                ? "策略图层已隐藏，可在右侧图层面板重新显示。"
                : "切换到 15m 周期可查看 UTORB 图层样例。"}
          </span>
        </div>
        <div>
          <p>信号明细</p>
          <strong>{signalRows.length > 0 ? `${signalRows.length} 个策略信号` : "暂无策略信号"}</strong>
          {signalRows.length > 0 ? (
            <div className="signal-detail-list" aria-label="策略信号明细">
              {signalRows.map((signal) => (
                <div className={`signal-detail-row ${signal.tone}`} key={signal.id}>
                  <ShieldCheck size={14} />
                  <span>{signal.time}</span>
                  <strong>{signal.direction}</strong>
                  <small>{signal.price}</small>
                  <em>{signal.label}</em>
                </div>
              ))}
            </div>
          ) : (
            <span>当前参数下没有触发买卖信号。</span>
          )}
        </div>
        <div>
          <p>日志窗口</p>
          <strong>策略运行日志</strong>
          <div className="chart-log-list" role="log" aria-label="策略运行日志">
            {strategyLogItems.map((item, index) => {
              const isAlert = item.startsWith("提醒：");
              const Icon = isAlert ? Bell : index === 0 ? TerminalSquare : CheckCircle2;

              return (
                <div className={isAlert ? "alert" : ""} key={`${item}-${index}`}>
                  <Icon size={14} />
                  <span>{strategyLogTime}</span>
                  <small>{item}</small>
                </div>
              );
            })}
          </div>
        </div>
      </footer>
    </section>
  );
}
