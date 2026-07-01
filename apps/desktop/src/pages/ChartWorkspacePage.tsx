import { useEffect, useMemo, useState } from "react";
import { ChartViewport, type ChartLayer, type ChartLayerElement } from "@quant/chart";
import type { Market, Timeframe } from "@quant/shared";
import {
  createEmptyStrategyRegistry,
  createPresetStrategyRegistry,
  createRunnableUserStrategyDefinition,
  runRegisteredStrategy,
  type StrategyDefinition,
  type StrategyParameterDefinition,
  type StrategyRunResult,
} from "@quant/strategy-engine";
import { useUserStrategyDraftStore } from "../features/strategies/userStrategyDraftStore";
import { marketBarsToCandles, marketBarsToStrategyBars } from "../features/marketData/chartBarAdapter";
import { readSavedAlphaFeedCredentials } from "../features/api/apiConfigService";
import { readMarketBarCache, writeMarketBarCache, type MarketDataBar } from "../features/marketData/marketBarCacheService";
import type { MarketQuoteSnapshot } from "../features/marketData/marketDataSyncService";
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

const symbols: Array<{ symbol: string; dataSymbol: string; name: string; market: Market; price: string; change: string }> = [
  { symbol: "AAPL", dataSymbol: "AAPL.US", name: "Apple Inc.", market: "US", price: "219.48", change: "+1.03%" },
  { symbol: "09988.HK", dataSymbol: "09988.HK", name: "阿里巴巴", market: "HK", price: "83.20", change: "+1.49%" },
  { symbol: "600519", dataSymbol: "600519.SH", name: "贵州茅台", market: "CN", price: "1468.10", change: "+0.54%" },
  { symbol: "TSLA", dataSymbol: "TSLA.US", name: "Tesla", market: "US", price: "188.14", change: "-0.82%" },
];

const timeframes: Timeframe[] = ["1d", "1w"];
const realtimePollIntervalMs = 30_000;
const realtimeRateLimitBackoffMs = 120_000;
const strategyRegistry = createPresetStrategyRegistry();
const presetStrategies = strategyRegistry.list();
const WORKSPACE_PREFERENCES_KEY = "quant-learning.chart-workspace-preferences";

interface StrategyWorkspaceState {
  enabled: boolean;
  showLayer: boolean;
  parameters: Record<string, unknown>;
}

interface ChartWorkspacePreferences {
  version: 2;
  showSignals: boolean;
  showStrategyLayers: boolean;
  showMovingAverage: boolean;
  strategies: Record<string, StrategyWorkspaceState>;
}

function getDefaultParameters(strategy: StrategyDefinition) {
  return strategy.parameterSchema.reduce<Record<string, unknown>>((parameters, parameter) => {
    parameters[parameter.key] = parameter.defaultValue;
    return parameters;
  }, {});
}

function getDefaultStrategyState(strategy: StrategyDefinition, index: number): StrategyWorkspaceState {
  return {
    enabled: index === 0,
    showLayer: true,
    parameters: getDefaultParameters(strategy),
  };
}

function createDefaultWorkspacePreferences(): ChartWorkspacePreferences {
  return {
    version: 2,
    showSignals: true,
    showStrategyLayers: true,
    showMovingAverage: true,
    strategies: presetStrategies.reduce<Record<string, StrategyWorkspaceState>>((settings, strategy, index) => {
      settings[strategy.key] = getDefaultStrategyState(strategy, index);
      return settings;
    }, {}),
  };
}

function sanitizeParameterValue(parameter: StrategyParameterDefinition, value: unknown) {
  if (parameter.type === "boolean") {
    return typeof value === "boolean" ? value : parameter.defaultValue;
  }

  if (parameter.type === "select") {
    const optionValues = parameter.options?.map((option) => option.value) ?? [];
    return typeof value === "string" && optionValues.includes(value) ? value : parameter.defaultValue;
  }

  if (parameter.key === "openingRangeMinutes") {
    const numericValue = typeof value === "number" && Number.isFinite(value) ? value : Number(parameter.defaultValue);
    return Math.min(60, Math.max(15, numericValue));
  }

  if (parameter.type === "number") {
    const numericValue = typeof value === "number" && Number.isFinite(value) ? value : Number(parameter.defaultValue);
    const minimumValue = isFractionalStrategyParameter(parameter.key) ? 0.1 : 1;
    return Math.max(minimumValue, numericValue);
  }

  return parameter.defaultValue;
}

function isFractionalStrategyParameter(parameterKey: string) {
  return ["supertrendFactor", "stopLossAtrMultiplier", "targetOneMultiplier", "targetTwoMultiplier", "targetThreeMultiplier"].includes(
    parameterKey,
  );
}

function getNumberInputMinimum(parameterKey: string) {
  if (parameterKey === "openingRangeMinutes") {
    return "15";
  }

  return isFractionalStrategyParameter(parameterKey) ? "0.1" : "1";
}

function getNumberInputStep(parameterKey: string) {
  return isFractionalStrategyParameter(parameterKey) ? "0.1" : "1";
}

function normalizeStrategyState(strategy: StrategyDefinition, index: number, state?: Partial<StrategyWorkspaceState>): StrategyWorkspaceState {
  const defaultState = getDefaultStrategyState(strategy, index);
  const incomingParameters = state?.parameters ?? {};

  return {
    enabled: typeof state?.enabled === "boolean" ? state.enabled : defaultState.enabled,
    showLayer: typeof state?.showLayer === "boolean" ? state.showLayer : defaultState.showLayer,
    parameters: strategy.parameterSchema.reduce<Record<string, unknown>>((parameters, parameter) => {
      parameters[parameter.key] = sanitizeParameterValue(parameter, incomingParameters[parameter.key]);
      return parameters;
    }, {}),
  };
}

function readWorkspacePreferences(): ChartWorkspacePreferences {
  const defaultPreferences = createDefaultWorkspacePreferences();

  try {
    const value = window.localStorage.getItem(WORKSPACE_PREFERENCES_KEY);
    const parsed = value ? JSON.parse(value) : null;

    if (!parsed) {
      return defaultPreferences;
    }

    if (parsed.version === 1) {
      const migratedStrategies = { ...defaultPreferences.strategies };
      const utorbIndex = presetStrategies.findIndex((strategy) => strategy.key === "utorb");
      const utorbStrategy = presetStrategies[utorbIndex];
      const utorbState = migratedStrategies.utorb;

      if (utorbState && utorbStrategy) {
        migratedStrategies.utorb = normalizeStrategyState(utorbStrategy, utorbIndex, {
          ...utorbState,
          parameters: {
            ...utorbState.parameters,
            openingRangeMinutes: parsed.openingRangeMinutes,
            showTargets: parsed.showTargets,
          },
        });
      }

      return {
        ...defaultPreferences,
        showSignals: typeof parsed.showSignals === "boolean" ? parsed.showSignals : defaultPreferences.showSignals,
        showStrategyLayers:
          typeof parsed.showStrategyLayers === "boolean" ? parsed.showStrategyLayers : defaultPreferences.showStrategyLayers,
        showMovingAverage: typeof parsed.showMovingAverage === "boolean" ? parsed.showMovingAverage : defaultPreferences.showMovingAverage,
        strategies: migratedStrategies,
      };
    }

    if (parsed.version !== 2) {
      return defaultPreferences;
    }

    return {
      version: 2,
      showSignals: typeof parsed.showSignals === "boolean" ? parsed.showSignals : defaultPreferences.showSignals,
      showStrategyLayers:
        typeof parsed.showStrategyLayers === "boolean" ? parsed.showStrategyLayers : defaultPreferences.showStrategyLayers,
      showMovingAverage: typeof parsed.showMovingAverage === "boolean" ? parsed.showMovingAverage : defaultPreferences.showMovingAverage,
      strategies: presetStrategies.reduce<Record<string, StrategyWorkspaceState>>((settings, strategy, index) => {
        settings[strategy.key] = normalizeStrategyState(strategy, index, parsed.strategies?.[strategy.key]);
        return settings;
      }, {}),
    };
  } catch {
    return defaultPreferences;
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
  if (element.kind === "signal-marker" || element.kind === "price-line" || element.kind === "trend-line" || element.kind === "band") {
    return element;
  }

  return null;
}

function createFailedStrategyRunResult(
  strategy: StrategyDefinition,
  settings: StrategyWorkspaceState,
  symbol: string,
  market: Market,
  timeframe: Timeframe,
  message: string,
): StrategyRunResult {
  return {
    strategy,
    input: {
      symbol,
      market,
      timeframe,
      bars: [],
      parameters: settings.parameters,
      runMode: "backtest",
      enabled: settings.enabled,
    },
    output: {
      signals: [],
      overlays: [],
      render: {
        strategyId: strategy.key,
        strategyName: strategy.name,
        enabled: false,
        zIndex: 10,
        elements: [],
      },
      metrics: {},
      logs: [`${strategy.name} 运行失败：${message}`],
      alerts: [],
    },
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
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

function formatStrategySource(strategy: StrategyDefinition) {
  if (strategy.sourceType === "user") {
    return "用户策略";
  }

  if (strategy.sourceType === "plugin") {
    return "插件策略";
  }

  return "预制策略";
}

function getMarketTimeZone(market: Market) {
  if (market === "US") {
    return "America/New_York";
  }

  if (market === "HK") {
    return "Asia/Hong_Kong";
  }

  return "Asia/Shanghai";
}

function getUtcDateKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const zonedAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));

  return zonedAsUtc - date.getTime();
}

function getMarketSessionOpenTimestamp(market: Market, quoteTime: Date) {
  const timeZone = getMarketTimeZone(market);
  const parts = getZonedDateParts(quoteTime, timeZone);
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, 9, 30);
  const firstPass = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone);

  return utcGuess - getTimeZoneOffsetMs(new Date(firstPass), timeZone);
}

function mergeRealtimeDailyBar(bars: MarketDataBar[], key: { symbol: string; market: Market }, snapshot: MarketQuoteSnapshot): MarketDataBar[] {
  const quoteTime = new Date(snapshot.quoteTime);
  const timestamp = getMarketSessionOpenTimestamp(key.market, quoteTime);
  const dateKey = getUtcDateKey(timestamp);
  const existingBar = bars.find((bar) => bar.timeframe === "1d" && getUtcDateKey(bar.timestamp) === dateKey);
  const open = snapshot.openPrice ?? existingBar?.open ?? snapshot.lastPrice;
  const close = snapshot.lastPrice;
  const high = Math.max(snapshot.highPrice ?? close, existingBar?.high ?? close, open, close);
  const low = Math.min(snapshot.lowPrice ?? close, existingBar?.low ?? close, open, close);
  const realtimeBar: MarketDataBar = {
    symbol: key.symbol,
    market: key.market,
    timeframe: "1d",
    timestamp,
    open,
    high,
    low,
    close,
    volume: snapshot.volume,
    amount: snapshot.amount,
    provider: snapshot.provider,
  };

  return [...bars.filter((bar) => !(bar.timeframe === "1d" && getUtcDateKey(bar.timestamp) === dateKey)), realtimeBar].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
}

export function ChartWorkspacePage() {
  const workspacePreferences = useMemo(() => readWorkspacePreferences(), []);
  const importedDrafts = useUserStrategyDraftStore((state) => state.drafts);
  const runnableUserStrategies = useMemo(
    () =>
      importedDrafts.flatMap((draft) => {
        const result = createRunnableUserStrategyDefinition(draft.definition);
        return result.ok ? [result.strategy] : [];
      }),
    [importedDrafts],
  );
  const chartStrategies = useMemo(() => [...presetStrategies, ...runnableUserStrategies], [runnableUserStrategies]);
  const chartStrategyRegistry = useMemo(() => {
    const registry = createEmptyStrategyRegistry();
    chartStrategies.forEach((strategy) => registry.register(strategy));
    return registry;
  }, [chartStrategies]);
  const [activeSymbol, setActiveSymbol] = useState(symbols[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [cachedMarketBars, setCachedMarketBars] = useState<MarketDataBar[]>(() =>
    readMarketBarCache({ symbol: symbols[0].dataSymbol, market: symbols[0].market, timeframe: "1d" }),
  );
  const [realtimeStatus, setRealtimeStatus] = useState("REST 轮询待命");
  const cachedCandles = useMemo(() => marketBarsToCandles(cachedMarketBars), [cachedMarketBars]);
  const cachedStrategyBars = useMemo(() => marketBarsToStrategyBars(cachedMarketBars), [cachedMarketBars]);
  const renderedCandles = cachedCandles.length > 0 ? cachedCandles : undefined;
  const strategyInputBars = cachedStrategyBars;
  const [showSignals, setShowSignals] = useState(workspacePreferences.showSignals);
  const [showStrategyLayers, setShowStrategyLayers] = useState(workspacePreferences.showStrategyLayers);
  const [showMovingAverage, setShowMovingAverage] = useState(workspacePreferences.showMovingAverage);
  const [strategySettings, setStrategySettings] = useState(workspacePreferences.strategies);
  const [activeConfigStrategyKey, setActiveConfigStrategyKey] = useState<string | null>(null);
  const strategyRuns = useMemo(
    () =>
      chartStrategies.map((strategy, index) => {
        const settings = strategySettings[strategy.key] ?? getDefaultStrategyState(strategy, index);
        let result: StrategyRunResult;
        const isTimeframeSupported = strategy.supportedTimeframes.includes(timeframe);

        try {
          result = isTimeframeSupported
            ? runRegisteredStrategy(chartStrategyRegistry, {
                strategyKey: strategy.key,
                symbol: activeSymbol.dataSymbol,
                market: activeSymbol.market,
                timeframe,
                bars: strategyInputBars,
                runMode: "backtest",
                enabled: settings.enabled,
                parameters: settings.parameters,
              })
            : createFailedStrategyRunResult(strategy, settings, activeSymbol.dataSymbol, activeSymbol.market, timeframe, "当前周期不支持");
        } catch (error) {
          result = createFailedStrategyRunResult(strategy, settings, activeSymbol.dataSymbol, activeSymbol.market, timeframe, getErrorMessage(error));
        }

        return {
          strategy,
          settings,
          result,
        };
      }),
    [activeSymbol.dataSymbol, activeSymbol.market, chartStrategies, chartStrategyRegistry, strategyInputBars, strategySettings, timeframe],
  );
  const strategyLayers = useMemo<ChartLayer[]>(
    () =>
      strategyRuns.map(({ result, settings }) => ({
        ...result.output.render,
        enabled: result.output.render.enabled && settings.enabled && settings.showLayer,
        elements: result.output.render.elements.map(toChartLayerElement).filter((element): element is ChartLayerElement => element !== null),
      })),
    [strategyRuns],
  );
  const canShowStrategyLayers = showStrategyLayers;
  const strategyLayerElementCount = strategyLayers.reduce((total, layer) => total + (layer.enabled ? layer.elements.length : 0), 0);
  const enabledStrategyCount = strategyRuns.filter(({ settings }) => settings.enabled).length;
  const totalSignalCount = strategyRuns.reduce((total, { result }) => total + result.output.signals.length, 0);
  const activeConfigStrategyRun = strategyRuns.find(({ strategy }) => strategy.key === activeConfigStrategyKey);
  const strategyLogTime = formatLogTime(Date.now());
  const strategyLogItems = strategyRuns.flatMap(({ result, settings }) =>
    settings.enabled
      ? [
          `运行 ${result.strategy.name}，标的 ${activeSymbol.symbol}，周期 ${timeframe}。`,
          ...result.output.logs,
          ...result.output.alerts.map((alert) => `提醒：${alert}`),
        ]
      : [`${result.strategy.name} 当前已停用。`],
  );
  const signalRows = strategyRuns.flatMap(({ result }) =>
    result.output.signals.map((signal, index) => ({
      id: `${result.strategy.key}-${signal.type}-${signal.timestamp}-${index}`,
      strategyName: result.strategy.name,
      time: formatSignalTime(signal.timestamp),
      direction: signal.type === "buy" ? "买入" : signal.type === "sell" ? "卖出" : "提醒",
      tone: signal.type,
      price: signal.price === undefined ? "-" : signal.price.toFixed(2),
      label: signal.label ?? "策略信号",
    })),
  );
  const updateStrategyState = (strategyKey: string, updater: (state: StrategyWorkspaceState) => StrategyWorkspaceState) => {
    setStrategySettings((current) => {
      const strategyIndex = chartStrategies.findIndex((strategy) => strategy.key === strategyKey);
      const strategy = chartStrategies[strategyIndex];

      if (!strategy) {
        return current;
      }

      return {
        ...current,
        [strategyKey]: updater(current[strategyKey] ?? getDefaultStrategyState(strategy, strategyIndex)),
      };
    });
  };
  const updateStrategyParameter = (strategy: StrategyDefinition, parameter: StrategyParameterDefinition, value: unknown) => {
    updateStrategyState(strategy.key, (state) => ({
      ...state,
      parameters: {
        ...state.parameters,
        [parameter.key]: sanitizeParameterValue(parameter, value),
      },
    }));
  };

  useEffect(() => {
    setCachedMarketBars(readMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe }));
  }, [activeSymbol.dataSymbol, activeSymbol.market, timeframe]);

  useEffect(() => {
    let timeoutId: number | undefined;
    let cancelled = false;

    if (timeframe !== "1d") {
      setRealtimeStatus("周线不启用 REST 轮询");
      return () => undefined;
    }

    const poll = async () => {
      if (cancelled) {
        return;
      }

      if (document.visibilityState !== "visible") {
        setRealtimeStatus("页面后台，轮询暂停");
        timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
        return;
      }

      try {
        const credentials = await readSavedAlphaFeedCredentials();

        if (!credentials || !window.quantDesktop?.alphaFeed) {
          setRealtimeStatus("等待 AlphaFeed 凭据");
          timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
          return;
        }

        const result = await window.quantDesktop.alphaFeed.fetchQuoteSnapshot(credentials, [
          {
            symbol: activeSymbol.dataSymbol,
            name: activeSymbol.name,
            market: activeSymbol.market,
            source: "preset",
          },
        ]);

        if (!result.ok) {
          const isRateLimited = result.error.message.includes("频率") || result.error.message.includes("429");
          const nextDelay = isRateLimited ? realtimeRateLimitBackoffMs : realtimePollIntervalMs;
          setRealtimeStatus(isRateLimited ? "触发限频，2 分钟后重试" : result.error.message);
          timeoutId = window.setTimeout(() => void poll(), nextDelay);
          return;
        }

        const snapshot = result.snapshots[0];

        if (snapshot) {
          setCachedMarketBars((currentBars) => {
            const nextBars = mergeRealtimeDailyBar(currentBars, { symbol: activeSymbol.dataSymbol, market: activeSymbol.market }, snapshot);
            writeMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: "1d" }, nextBars);
            return nextBars;
          });
          setRealtimeStatus(`REST 轮询更新 ${new Date(snapshot.receivedAt).toLocaleTimeString("zh-CN", { hour12: false })}`);
        } else {
          setRealtimeStatus("AlphaFeed 暂无快照");
        }

        timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
      } catch (error) {
        setRealtimeStatus(getErrorMessage(error));
        timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeSymbol.dataSymbol, activeSymbol.market, activeSymbol.name, timeframe]);

  useEffect(() => {
    const preferences: ChartWorkspacePreferences = {
      version: 2,
      showSignals,
      showStrategyLayers,
      showMovingAverage,
      strategies: strategySettings,
    };

    saveWorkspacePreferences(preferences);
  }, [showMovingAverage, showSignals, showStrategyLayers, strategySettings]);

  return (
    <section className="chart-workspace-page">
      <header className="chart-topbar">
        <div className="symbol-search">
          <span>{activeSymbol.market}</span>
          <strong>{activeSymbol.symbol}</strong>
          <small>{activeSymbol.name}</small>
          <em className={cachedCandles.length > 0 ? "data-source-badge live" : "data-source-badge"}>{cachedCandles.length > 0 ? "本地缓存" : "等待数据"}</em>
          <em className={timeframe === "1d" ? "data-source-badge live" : "data-source-badge"}>{realtimeStatus}</em>
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
            candles={renderedCandles}
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
        </aside>
      </div>

      {activeConfigStrategyRun && (
        <div className="strategy-config-backdrop" role="presentation" onClick={() => setActiveConfigStrategyKey(null)}>
          <section
            aria-label={`${activeConfigStrategyRun.strategy.name} 参数配置`}
            className="strategy-config-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="strategy-config-heading">
              <div>
                <p>策略参数</p>
                <strong>{activeConfigStrategyRun.strategy.name}</strong>
              </div>
              <button onClick={() => setActiveConfigStrategyKey(null)} type="button">
                关闭
              </button>
            </div>

            <div className="strategy-config-meta">
              <span>{formatStrategySource(activeConfigStrategyRun.strategy)}</span>
              <span>{activeConfigStrategyRun.strategy.version}</span>
              <span>{activeConfigStrategyRun.strategy.sourceFile ?? "本地运行定义"}</span>
              <span>{activeConfigStrategyRun.strategy.supportedTimeframes.join(" / ")}</span>
            </div>

            <div className="strategy-config-grid">
              {activeConfigStrategyRun.strategy.parameterSchema.length > 0 ? (
                activeConfigStrategyRun.strategy.parameterSchema.map((parameter) => {
                const value = activeConfigStrategyRun.settings.parameters[parameter.key] ?? parameter.defaultValue;

                if (parameter.type === "boolean") {
                  return (
                    <label className="parameter-toggle" htmlFor={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`} key={parameter.key}>
                      <span>
                        <strong>{parameter.label}</strong>
                        <small>{value ? "已开启" : "已关闭"}</small>
                      </span>
                      <input
                        checked={Boolean(value)}
                        id={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                        onChange={(event) => updateStrategyParameter(activeConfigStrategyRun.strategy, parameter, event.currentTarget.checked)}
                        type="checkbox"
                      />
                    </label>
                  );
                }

                if (parameter.type === "select") {
                  return (
                    <label className="parameter-control" htmlFor={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`} key={parameter.key}>
                      <span>{parameter.label}</span>
                      <select
                        id={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                        onChange={(event) => updateStrategyParameter(activeConfigStrategyRun.strategy, parameter, event.currentTarget.value)}
                        value={String(value)}
                      >
                        {parameter.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }

                return (
                  <label className="parameter-control" htmlFor={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`} key={parameter.key}>
                    <span>{parameter.label}</span>
                    <input
                      id={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                      max={parameter.key === "openingRangeMinutes" ? "60" : undefined}
                      min={getNumberInputMinimum(parameter.key)}
                      onChange={(event) => updateStrategyParameter(activeConfigStrategyRun.strategy, parameter, event.currentTarget.valueAsNumber)}
                      step={getNumberInputStep(parameter.key)}
                      type={parameter.key === "openingRangeMinutes" ? "range" : "number"}
                      value={Number(value)}
                    />
                  </label>
                );
                })
              ) : (
                <div className="strategy-config-empty-state">
                  <strong>暂无可配置参数</strong>
                  <span>该策略当前使用 Pine 最小子集生成的默认运行定义，后续可在策略管理中扩展参数 Schema。</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <footer className="chart-bottom-panel">
        <div className="bottom-strategy-panel">
          <p>策略面板</p>
          <div className="bottom-panel-heading">
            <strong>{enabledStrategyCount} 个策略启用</strong>
            <span>
              {canShowStrategyLayers
                ? `${totalSignalCount} 个信号，${strategyLayerElementCount} 个图层元素`
                : "策略图层已隐藏"}
            </span>
            <button
              aria-label={showStrategyLayers ? "隐藏策略图层" : "显示策略图层"}
              onClick={() => setShowStrategyLayers((value) => !value)}
              type="button"
            >
              {showStrategyLayers ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
          <div className="bottom-layer-list">
            {strategyRuns.map(({ strategy, settings, result }) => (
              <div className={settings.enabled && canShowStrategyLayers && settings.showLayer ? "layer-item active" : "layer-item"} key={strategy.key}>
                <span>
                  <strong>
                    {strategy.name}
                    <em className={`strategy-source-badge ${strategy.sourceType}`}>{formatStrategySource(strategy)}</em>
                  </strong>
                  <small>{`${result.output.render.elements.length} 个元素`}</small>
                </span>
                <div className="layer-actions">
                  <button
                    aria-pressed={settings.enabled}
                    className={settings.enabled ? "active" : ""}
                    onClick={() => updateStrategyState(strategy.key, (state) => ({ ...state, enabled: !state.enabled, showLayer: !state.enabled }))}
                    type="button"
                  >
                    启用
                  </button>
                  <button
                    aria-pressed={settings.showLayer}
                    className={settings.showLayer ? "active" : ""}
                    disabled={!settings.enabled}
                    onClick={() => updateStrategyState(strategy.key, (state) => ({ ...state, showLayer: !state.showLayer }))}
                    type="button"
                  >
                    图层
                  </button>
                  <button onClick={() => setActiveConfigStrategyKey(strategy.key)} type="button">
                    <Settings2 size={13} />
                    参数
                  </button>
                </div>
              </div>
            ))}
          </div>
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
                  <em>{signal.strategyName} / {signal.label}</em>
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
