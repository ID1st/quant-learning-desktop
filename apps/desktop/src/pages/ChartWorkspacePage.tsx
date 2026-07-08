import { useEffect, useMemo, useRef, useState } from "react";
import { ChartViewport, type ChartDisplayMode, type ChartLayer, type ChartLayerElement } from "@quant/chart";
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
import {
  readAlphaFeedStreamBinding,
  readSavedAlphaFeedCredentials,
  readSavedAlphaFeedStreamCredentials,
  readSavedLongPortCredentials,
} from "../features/api/apiConfigService";
import { readMarketBarCache, writeMarketBarCache, type MarketDataBar } from "../features/marketData/marketBarCacheService";
import type { MarketQuoteSnapshot, MarketWatchlistItem } from "../features/marketData/marketDataSyncService";
import {
  createQuotePollingBatches,
  defaultRealtimePollIntervalMs,
  mergeQuoteSnapshots,
  realtimePollIntervalOptionsMs,
  sanitizeRealtimePollIntervalMs,
} from "../features/marketData/realtimeQuotePollingService";
import {
  analyzeRealtimeHistoryGap,
  aggregateRealtimePointBarsToMinuteCandles,
  mergeHistoricalRealtimeBarsWithLiveBars,
  mergeRealtimeSnapshotPointBars,
} from "../features/marketData/realtimeIntradayBarService";
import {
  alphaFeedMinuteBarsToRealtimeBars,
  getIntradayHistoryWindow,
  isMarketSessionOpen,
} from "../features/marketData/intradayHistoryService";
import {
  createChartMarketDataGateways,
  gatewayBarsToAlphaFeedMarketDataBars,
  gatewayBarsToMarketDataBars,
  gatewayQuoteSnapshotsToMarketQuoteSnapshots,
} from "../features/marketData/chartMarketDataGateway";
import { readMarketDataProviderSettings } from "../features/marketData/marketDataProviderSettings";
import {
  summarizeMarketDataProviderHealth,
  type MarketDataProviderDiagnosticSummary,
} from "../features/marketData/marketDataProviderDiagnostics";
import type {
  GatewayMarketDataProviderId,
  MarketDataProviderCapabilityKey,
  MarketDataProviderHealthView,
} from "../features/marketData/marketDataProviderGateway";
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
  RotateCcw,
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

const realtimeWatchlist: MarketWatchlistItem[] = symbols.map((item) => ({
  symbol: item.dataSymbol,
  name: item.name,
  market: item.market,
  source: "preset",
}));

const timeframes: Timeframe[] = ["realtime", "1d", "1w"];
const realtimeRateLimitBackoffMs = 120_000;
const enableAlphaFeedHistoricalIntradayBackfill = false;
const longPortRealtimeHistoryCount = 1_000;
const longPortRealtimeDelayWarningMs = 5 * 60_000;
const strategyRegistry = createPresetStrategyRegistry();
const presetStrategies = strategyRegistry.list();
const WORKSPACE_PREFERENCES_KEY = "quant-learning.chart-workspace-preferences";

interface StrategyWorkspaceState {
  enabled: boolean;
  showLayer: boolean;
  parameters: Record<string, unknown>;
}

interface ChartWorkspacePreferences {
  version: 4;
  showSignals: boolean;
  showStrategyLayers: boolean;
  showMovingAverage: boolean;
  showCrosshair: boolean;
  showGrid: boolean;
  showVolume: boolean;
  showPriceLabels: boolean;
  showCurrentPriceLine: boolean;
  intradayDisplayMode: ChartDisplayMode;
  realtimePollIntervalMs: number;
  strategies: Record<string, StrategyWorkspaceState>;
}

interface ChartContextMenuState {
  x: number;
  y: number;
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
    version: 4,
    showSignals: true,
    showStrategyLayers: true,
    showMovingAverage: true,
    showCrosshair: true,
    showGrid: true,
    showVolume: true,
    showPriceLabels: true,
    showCurrentPriceLine: true,
    intradayDisplayMode: "line",
    realtimePollIntervalMs: defaultRealtimePollIntervalMs,
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

function sanitizeChartDisplayMode(value: unknown): ChartDisplayMode {
  return value === "candlestick" ? "candlestick" : "line";
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
        showCrosshair: defaultPreferences.showCrosshair,
        showGrid: defaultPreferences.showGrid,
        showVolume: defaultPreferences.showVolume,
        showPriceLabels: defaultPreferences.showPriceLabels,
        showCurrentPriceLine: defaultPreferences.showCurrentPriceLine,
        intradayDisplayMode: defaultPreferences.intradayDisplayMode,
        realtimePollIntervalMs: sanitizeRealtimePollIntervalMs(parsed.realtimePollIntervalMs),
        strategies: migratedStrategies,
      };
    }

    if (parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4) {
      return defaultPreferences;
    }

    return {
      version: 4,
      showSignals: typeof parsed.showSignals === "boolean" ? parsed.showSignals : defaultPreferences.showSignals,
      showStrategyLayers:
        typeof parsed.showStrategyLayers === "boolean" ? parsed.showStrategyLayers : defaultPreferences.showStrategyLayers,
      showMovingAverage: typeof parsed.showMovingAverage === "boolean" ? parsed.showMovingAverage : defaultPreferences.showMovingAverage,
      showCrosshair: typeof parsed.showCrosshair === "boolean" ? parsed.showCrosshair : defaultPreferences.showCrosshair,
      showGrid: typeof parsed.showGrid === "boolean" ? parsed.showGrid : defaultPreferences.showGrid,
      showVolume: typeof parsed.showVolume === "boolean" ? parsed.showVolume : defaultPreferences.showVolume,
      showPriceLabels: typeof parsed.showPriceLabels === "boolean" ? parsed.showPriceLabels : defaultPreferences.showPriceLabels,
      showCurrentPriceLine:
        typeof parsed.showCurrentPriceLine === "boolean" ? parsed.showCurrentPriceLine : defaultPreferences.showCurrentPriceLine,
      intradayDisplayMode: sanitizeChartDisplayMode(parsed.intradayDisplayMode),
      realtimePollIntervalMs: sanitizeRealtimePollIntervalMs(parsed.realtimePollIntervalMs),
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

function getUnsupportedTimeframeMessage(strategy: StrategyDefinition, timeframe: Timeframe) {
  const supported = strategy.supportedTimeframes.join(" / ");
  const dataLimitNote =
    strategy.key === "utorb"
      ? "UTORB 属于开盘区间突破策略，需要分钟级 K 线计算开盘高低点；当前 AlphaFeed 套餐下超级图表仅开放 1d / 1w 真实 K 线。"
      : "当前图表周期不在该策略声明的支持范围内。";

  return `${dataLimitNote} 当前周期：${timeframe}；策略支持周期：${supported}。`;
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

interface RealtimeProviderHealthView {
  status: AlphaFeedProviderHealth["status"] | "idle" | "waiting" | "paused";
  message: string;
  checkedAt?: string;
  latencyMs?: number;
  nextRetryAt?: string;
}

function createRealtimeHealthView(status: RealtimeProviderHealthView["status"], message: string): RealtimeProviderHealthView {
  return {
    status,
    message,
    checkedAt: new Date().toISOString(),
  };
}

function createRealtimeHealthViewFromGateway(
  health: MarketDataProviderHealthView,
  message = health.message,
  options: {
    capability?: MarketDataProviderCapabilityKey;
    triedProviders?: readonly GatewayMarketDataProviderId[];
    fallbackFrom?: GatewayMarketDataProviderId;
  } = {},
): RealtimeProviderHealthView {
  const statusMap: Record<MarketDataProviderHealthView["status"], RealtimeProviderHealthView["status"]> = {
    healthy: "ok",
    delayed: "ok",
    degraded: "ok",
    rateLimited: "rate_limited",
    unauthorized: "auth_failed",
    unavailable: "network_error",
    unconfigured: "waiting",
  };

  const summary: MarketDataProviderDiagnosticSummary = summarizeMarketDataProviderHealth(health, {
    ...options,
    message,
  });

  return {
    status: statusMap[health.status],
    message: summary.message,
    checkedAt: health.checkedAt,
    latencyMs: health.latencyMs,
    nextRetryAt: health.nextRetryAt,
  };
}

function getRealtimeHealthBadgeClass(status: RealtimeProviderHealthView["status"]) {
  if (status === "ok") {
    return "data-source-badge live";
  }

  if (status === "rate_limited" || status === "permission_denied" || status === "auth_failed") {
    return "data-source-badge warning";
  }

  if (status === "network_error" || status === "invalid_response" || status === "error") {
    return "data-source-badge danger";
  }

  return "data-source-badge";
}

function formatRealtimeHealthDetail(health: RealtimeProviderHealthView) {
  const parts = [health.message];

  if (typeof health.latencyMs === "number") {
    parts.push(`${health.latencyMs}ms`);
  }

  if (health.checkedAt) {
    parts.push(new Date(health.checkedAt).toLocaleTimeString("zh-CN", { hour12: false }));
  }

  return parts.join(" · ");
}

function formatQuotePrice(snapshot: MarketQuoteSnapshot | undefined, fallback: string) {
  return snapshot ? snapshot.lastPrice.toFixed(snapshot.lastPrice >= 1000 ? 2 : 2) : fallback;
}

function formatQuoteChange(snapshot: MarketQuoteSnapshot | undefined, fallback: string) {
  if (!snapshot) {
    return fallback;
  }

  const prefix = snapshot.changePercent >= 0 ? "+" : "";
  return `${prefix}${snapshot.changePercent.toFixed(2)}%`;
}

function formatTimeframeLabel(timeframe: Timeframe) {
  return timeframe === "realtime" ? "分时" : timeframe;
}

function formatRealtimeGapStatus(bars: MarketDataBar[], key: { symbol: string; market: Market; timeframe: "realtime" }) {
  const gap = analyzeRealtimeHistoryGap(bars, key, Date.now(), longPortRealtimeDelayWarningMs);

  if (!gap.hasGap) {
    return null;
  }

  const gapMinutes = Math.round(gap.gapMs / 60_000);
  return gap.isBridgedByLiveData
    ? `长桥历史分时落后约 ${gapMinutes} 分钟，AlphaFeed 实时点已补齐最新走势`
    : `长桥历史分时落后约 ${gapMinutes} 分钟，等待 AlphaFeed 实时点补齐`;
}

function getStrategyLayerStatus(
  strategy: StrategyDefinition,
  settings: StrategyWorkspaceState,
  result: StrategyRunResult,
  timeframe: Timeframe,
  barCount: number,
) {
  if (!settings.enabled) {
    return { className: "disabled", label: "已停用" };
  }

  if (!strategy.supportedTimeframes.includes(timeframe)) {
    return { className: "unsupported", label: "周期不支持" };
  }

  if (barCount === 0) {
    return { className: "empty", label: "无数据" };
  }

  if (!settings.showLayer) {
    return { className: "hidden", label: "已隐藏" };
  }

  if (result.output.render.elements.length === 0) {
    return { className: "empty", label: "无图层" };
  }

  return { className: "active", label: "运行中" };
}

export function ChartWorkspacePage() {
  const workspacePreferences = useMemo(() => readWorkspacePreferences(), []);
  const marketDataProviderSettings = useMemo(() => readMarketDataProviderSettings(), []);
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
  const [realtimeHealth, setRealtimeHealth] = useState<RealtimeProviderHealthView>(() =>
    createRealtimeHealthView("idle", "REST 轮询待命"),
  );
  const [quoteSnapshotsByKey, setQuoteSnapshotsByKey] = useState<Record<string, MarketQuoteSnapshot>>({});
  const quoteSnapshotsByKeyRef = useRef<Record<string, MarketQuoteSnapshot>>({});
  const [showSignals, setShowSignals] = useState(workspacePreferences.showSignals);
  const [showStrategyLayers, setShowStrategyLayers] = useState(workspacePreferences.showStrategyLayers);
  const [showMovingAverage, setShowMovingAverage] = useState(workspacePreferences.showMovingAverage);
  const [showCrosshair, setShowCrosshair] = useState(workspacePreferences.showCrosshair);
  const [showGrid, setShowGrid] = useState(workspacePreferences.showGrid);
  const [showVolume, setShowVolume] = useState(workspacePreferences.showVolume);
  const [showPriceLabels, setShowPriceLabels] = useState(workspacePreferences.showPriceLabels);
  const [showCurrentPriceLine, setShowCurrentPriceLine] = useState(workspacePreferences.showCurrentPriceLine);
  const [intradayDisplayMode, setIntradayDisplayMode] = useState<ChartDisplayMode>(workspacePreferences.intradayDisplayMode);
  const [realtimePollIntervalMs, setRealtimePollIntervalMs] = useState(workspacePreferences.realtimePollIntervalMs);
  const [strategySettings, setStrategySettings] = useState(workspacePreferences.strategies);
  const [activeConfigStrategyKey, setActiveConfigStrategyKey] = useState<string | null>(null);
  const [isChartSettingsOpen, setIsChartSettingsOpen] = useState(false);
  const [chartContextMenu, setChartContextMenu] = useState<ChartContextMenuState | null>(null);
  const [chartResetViewKey, setChartResetViewKey] = useState(0);
  const displayedMarketBars = useMemo(
    () => (timeframe === "realtime" && intradayDisplayMode === "candlestick" ? aggregateRealtimePointBarsToMinuteCandles(cachedMarketBars) : cachedMarketBars),
    [cachedMarketBars, intradayDisplayMode, timeframe],
  );
  const cachedCandles = useMemo(() => marketBarsToCandles(displayedMarketBars), [displayedMarketBars]);
  const cachedStrategyBars = useMemo(() => marketBarsToStrategyBars(displayedMarketBars), [displayedMarketBars]);
  const renderedCandles = cachedCandles;
  const strategyInputBars = cachedStrategyBars;
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
            : createFailedStrategyRunResult(
                strategy,
                settings,
                activeSymbol.dataSymbol,
                activeSymbol.market,
                timeframe,
                getUnsupportedTimeframeMessage(strategy, timeframe),
              );
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
  const resetChartView = () => {
    setShowCrosshair(true);
    setShowGrid(true);
    setShowVolume(true);
    setShowPriceLabels(true);
    setShowCurrentPriceLine(true);
    setChartResetViewKey((value) => value + 1);
    setChartContextMenu(null);
  };
  const mergeActiveSnapshotBars = (currentBars: MarketDataBar[], snapshot: MarketQuoteSnapshot) => {
    if (timeframe === "realtime") {
      return mergeRealtimeSnapshotPointBars(
        currentBars,
        { symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: "realtime" },
        snapshot,
      );
    }

    return mergeRealtimeDailyBar(currentBars, { symbol: activeSymbol.dataSymbol, market: activeSymbol.market }, snapshot);
  };
  const writeActiveSnapshotBars = (bars: MarketDataBar[]) => {
    writeMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe }, bars);
  };

  useEffect(() => {
    setCachedMarketBars(readMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe }));
  }, [activeSymbol.dataSymbol, activeSymbol.market, marketDataProviderSettings.stockSdkPrimaryEnabled, timeframe]);

  useEffect(() => {
    let cancelled = false;

    const loadLongPortHistory = async () => {
      const isRealtimeHistory = timeframe === "realtime";
      const windowRange = isRealtimeHistory ? getIntradayHistoryWindow(activeSymbol.market) : null;

      try {
        const credentials = await readSavedLongPortCredentials();

        if (cancelled) {
          return;
        }

        const marketDataGateways = createChartMarketDataGateways({
          bridge: window.quantDesktop,
          longPortCredentials: credentials,
          enableStockSdkPrimary: marketDataProviderSettings.stockSdkPrimaryEnabled,
        });

        if (!credentials && !marketDataProviderSettings.stockSdkPrimaryEnabled) {
          const waitingHealth = createRealtimeHealthView("waiting", "等待长桥凭据以加载历史 K 线");
          setRealtimeHealth(waitingHealth);
          setRealtimeStatus(waitingHealth.message);
          return;
        }

        const result = await marketDataGateways.historicalBars.fetchHistoricalBars({
          symbol: activeSymbol.dataSymbol,
          market: activeSymbol.market,
          timeframe: isRealtimeHistory ? "1m" : timeframe,
          startTime: windowRange?.startTime,
          endTime: windowRange?.endTime,
          count: isRealtimeHistory ? longPortRealtimeHistoryCount : timeframe === "1w" ? 260 : 600,
        });

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          const errorHealth =
            result.health[0] !== undefined
              ? createRealtimeHealthViewFromGateway(result.health[0], result.error.message, {
                  capability: "historicalBars",
                  triedProviders: result.triedProviders,
                })
              : createRealtimeHealthView("error", result.error.message);
          setRealtimeHealth(errorHealth);
          setRealtimeStatus(errorHealth.message);
          return;
        }

        const resultBars = gatewayBarsToMarketDataBars(result.data);

        if (resultBars.length === 0) {
          const emptyHealth = createRealtimeHealthView("waiting", "长桥暂无可用历史 K 线数据");
          setRealtimeHealth(emptyHealth);
          setRealtimeStatus(emptyHealth.message);
          return;
        }

        const cacheTimeframe: Timeframe = isRealtimeHistory ? "realtime" : timeframe;
        const cacheKey = { symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: cacheTimeframe };
        const currentCachedBars = readMarketBarCache(cacheKey);
        const mergedBars = isRealtimeHistory
          ? mergeHistoricalRealtimeBarsWithLiveBars(resultBars, currentCachedBars, {
              symbol: activeSymbol.dataSymbol,
              market: activeSymbol.market,
              timeframe: "realtime",
            })
          : resultBars;
        const written = writeMarketBarCache(cacheKey, mergedBars);
        setCachedMarketBars(written);
        const gapStatus =
          isRealtimeHistory && windowRange?.isMarketOpen
            ? formatRealtimeGapStatus(written, {
                symbol: activeSymbol.dataSymbol,
                market: activeSymbol.market,
                timeframe: "realtime",
              })
            : null;

        const historicalMessage = gapStatus
          ? gapStatus
          : isRealtimeHistory && windowRange
          ? windowRange.isMarketOpen
            ? `历史分时已加载 ${written.length} 点，实时源继续补充走势`
            : `历史分时已加载 ${written.length} 点，收盘后停止追加`
          : `历史 K 线已加载 ${written.length} 根`;
        const healthView = createRealtimeHealthViewFromGateway(result.health, historicalMessage, {
          capability: "historicalBars",
          triedProviders: result.triedProviders,
        });
        setRealtimeHealth(healthView);
        setRealtimeStatus(formatRealtimeHealthDetail(healthView));
      } catch (error) {
        const errorHealth = createRealtimeHealthView("error", getErrorMessage(error));
        setRealtimeHealth(errorHealth);
        setRealtimeStatus(errorHealth.message);
      }
    };

    void loadLongPortHistory();

    return () => {
      cancelled = true;
    };
  }, [activeSymbol.dataSymbol, activeSymbol.market, marketDataProviderSettings.stockSdkPrimaryEnabled, timeframe]);

  useEffect(() => {
    let cancelled = false;

    if (!enableAlphaFeedHistoricalIntradayBackfill || timeframe !== "realtime") {
      return () => undefined;
    }

    const loadIntradayHistory = async () => {
      const windowRange = getIntradayHistoryWindow(activeSymbol.market);

      try {
        const credentials = await readSavedAlphaFeedCredentials();

        if (cancelled) {
          return;
        }

        const marketDataGateways = createChartMarketDataGateways({
          bridge: window.quantDesktop,
          alphaFeedCredentials: credentials,
          enableStockSdkPrimary: marketDataProviderSettings.stockSdkPrimaryEnabled,
        });

        if (!credentials && !marketDataProviderSettings.stockSdkPrimaryEnabled) {
          const waitingHealth = createRealtimeHealthView("waiting", "等待 AlphaFeed 凭据以加载历史分时");
          setRealtimeHealth(waitingHealth);
          setRealtimeStatus(waitingHealth.message);
          return;
        }

        const result = await marketDataGateways.intradayBars.fetchIntradayBars({
          symbol: activeSymbol.dataSymbol,
          market: activeSymbol.market,
          timeframe: "1m",
          startTime: windowRange.startTime,
          endTime: windowRange.endTime,
          count: 10_000,
        });

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          const gatewayHealth = result.health[0];
          const healthView = gatewayHealth
            ? createRealtimeHealthViewFromGateway(
                gatewayHealth,
                gatewayHealth.status === "unauthorized" ? "AlphaFeed 当前套餐无 1m 历史分时权限" : result.error.message,
                {
                  capability: "intradayBars",
                  triedProviders: result.triedProviders,
                },
              )
            : createRealtimeHealthView("error", result.error.message);
          setRealtimeHealth(healthView);
          setRealtimeStatus(formatRealtimeHealthDetail(healthView));
          return;
        }

        const realtimeBars = alphaFeedMinuteBarsToRealtimeBars(
          gatewayBarsToAlphaFeedMarketDataBars(result.data),
          { symbol: activeSymbol.dataSymbol, market: activeSymbol.market },
          windowRange,
        );

        if (realtimeBars.length === 0) {
          const emptyHealth = createRealtimeHealthView("waiting", "AlphaFeed 暂无历史分时数据");
          setRealtimeHealth(emptyHealth);
          setRealtimeStatus(emptyHealth.message);
          return;
        }

        const written = writeMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: "realtime" }, realtimeBars);
        setCachedMarketBars(written);
        const healthView = createRealtimeHealthViewFromGateway(
          result.health,
          windowRange.isMarketOpen
            ? `历史分时已加载 ${written.length} 点，交易中继续更新`
            : `历史分时已加载 ${written.length} 点，收盘后停止更新`,
          {
            capability: "intradayBars",
            triedProviders: result.triedProviders,
          },
        );
        setRealtimeHealth(healthView);
        setRealtimeStatus(formatRealtimeHealthDetail(healthView));
      } catch (error) {
        const errorHealth = createRealtimeHealthView("error", getErrorMessage(error));
        setRealtimeHealth(errorHealth);
        setRealtimeStatus(errorHealth.message);
      }
    };

    void loadIntradayHistory();

    return () => {
      cancelled = true;
    };
  }, [activeSymbol.dataSymbol, activeSymbol.market, timeframe]);

  useEffect(() => {
    let timeoutId: number | undefined;
    let cancelled = false;
    let disconnectQuoteStream: () => Promise<void> = async () => undefined;

    if (timeframe !== "1d" && timeframe !== "realtime") {
      const pausedHealth = createRealtimeHealthView("paused", "当前周期不启用实时轮询");
      setRealtimeHealth(pausedHealth);
      setRealtimeStatus(pausedHealth.message);
      return () => undefined;
    }

    if (timeframe === "realtime" && !isMarketSessionOpen(activeSymbol.market)) {
      const pausedHealth = createRealtimeHealthView("paused", "市场已收盘，仅显示历史分时");
      setRealtimeHealth(pausedHealth);
      setRealtimeStatus(pausedHealth.message);
      return () => undefined;
    }

    const poll = async () => {
      if (cancelled) {
        return;
      }

      if (document.visibilityState !== "visible") {
        const pausedHealth = createRealtimeHealthView("paused", "页面后台，轮询暂停");
        setRealtimeHealth(pausedHealth);
        setRealtimeStatus(pausedHealth.message);
        timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
        return;
      }

      try {
        const credentials = await readSavedAlphaFeedCredentials();
        const streamCredentials = await readSavedAlphaFeedStreamCredentials();
        const streamBinding = readAlphaFeedStreamBinding();
        const marketDataGateways = createChartMarketDataGateways({
          bridge: window.quantDesktop,
          alphaFeedCredentials: credentials,
          alphaFeedStreamCredentials: streamCredentials,
          alphaFeedStreamBinding: streamBinding,
          enableStockSdkPrimary: marketDataProviderSettings.stockSdkPrimaryEnabled,
        });
        disconnectQuoteStream = marketDataGateways.disconnectQuoteStream;

        if (cancelled) {
          return;
        }

        if (!credentials && !streamCredentials && !marketDataProviderSettings.stockSdkPrimaryEnabled) {
          const waitingHealth = createRealtimeHealthView("waiting", "等待 AlphaFeed 凭据");
          setRealtimeHealth(waitingHealth);
          setRealtimeStatus(waitingHealth.message);
          timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
          return;
        }

        if (streamCredentials && streamBinding) {
          const connectHealth = await marketDataGateways.connectQuoteStream(realtimeWatchlist);

          if (cancelled) {
            return;
          }

          const streamResult = await marketDataGateways.readQuoteStreamSnapshot(realtimeWatchlist);

          if (cancelled) {
            return;
          }

          if (streamResult.ok && streamResult.snapshots.length > 0) {
            const nextQuoteSnapshotsByKey = mergeQuoteSnapshots(quoteSnapshotsByKeyRef.current, Array.from(streamResult.snapshots));
            const snapshot = nextQuoteSnapshotsByKey[`${activeSymbol.market}:${activeSymbol.dataSymbol}`];
            quoteSnapshotsByKeyRef.current = nextQuoteSnapshotsByKey;
            setQuoteSnapshotsByKey(nextQuoteSnapshotsByKey);

            if (snapshot) {
              setCachedMarketBars((currentBars) => {
                const nextBars = mergeActiveSnapshotBars(currentBars, snapshot);
                writeActiveSnapshotBars(nextBars);
                return nextBars;
              });
            }

            const healthView = createRealtimeHealthViewFromGateway(
              streamResult.health,
              `WebSocket 流式更新 ${streamResult.snapshots.length} 只 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`,
            );
            setRealtimeHealth(healthView);
            setRealtimeStatus(formatRealtimeHealthDetail(healthView));
            timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
            return;
          }

          if (!credentials && !marketDataProviderSettings.stockSdkPrimaryEnabled) {
            const streamGatewayHealth = streamResult.ok ? streamResult.health : streamResult.health[0] ?? connectHealth;
            const streamHealth = streamGatewayHealth
              ? createRealtimeHealthViewFromGateway(streamGatewayHealth, streamResult.ok ? "WebSocket 正在连接，等待首批快照" : streamGatewayHealth.message)
              : createRealtimeHealthView("waiting", "WebSocket 正在连接，等待首批快照");
            setRealtimeHealth(streamHealth);
            setRealtimeStatus(formatRealtimeHealthDetail(streamHealth));
            timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
            return;
          }
        }

        if (!credentials && !marketDataProviderSettings.stockSdkPrimaryEnabled) {
          const waitingHealth = createRealtimeHealthView("waiting", "等待 AlphaFeed REST 凭据");
          setRealtimeHealth(waitingHealth);
          setRealtimeStatus(waitingHealth.message);
          timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
          return;
        }

        const batches = createQuotePollingBatches(realtimeWatchlist);
        const snapshots: MarketQuoteSnapshot[] = [];
        let latestHealth: MarketDataProviderHealthView | null = null;
        let latestTriedProviders: readonly GatewayMarketDataProviderId[] = [];

        for (const batch of batches) {
          const result = await marketDataGateways.quoteSnapshots.fetchQuoteSnapshot(batch);

          if (cancelled) {
            return;
          }

          if (!result.ok) {
            const health = result.health[0];
            const isRateLimited = health?.status === "rateLimited";
            const nextRetryAt = health?.nextRetryAt ? new Date(health.nextRetryAt).getTime() : Date.now() + realtimeRateLimitBackoffMs;
            const nextDelay = isRateLimited ? Math.max(realtimePollIntervalMs, nextRetryAt - Date.now()) : realtimePollIntervalMs;
            const healthView = health
              ? createRealtimeHealthViewFromGateway(health, isRateLimited ? "AlphaFeed 限频，已自动退避" : result.error.message, {
                  capability: "realtimeQuote",
                  triedProviders: result.triedProviders,
                })
              : createRealtimeHealthView("error", result.error.message);
            setRealtimeHealth(healthView);
            setRealtimeStatus(formatRealtimeHealthDetail(healthView));
            timeoutId = window.setTimeout(() => void poll(), nextDelay);
            return;
          }

          snapshots.push(...gatewayQuoteSnapshotsToMarketQuoteSnapshots(result.data));
          latestHealth = result.health;
          latestTriedProviders = result.triedProviders;
        }

        if (cancelled) {
          return;
        }

        const nextQuoteSnapshotsByKey = mergeQuoteSnapshots(quoteSnapshotsByKeyRef.current, snapshots);
        const snapshot = nextQuoteSnapshotsByKey[`${activeSymbol.market}:${activeSymbol.dataSymbol}`];
        quoteSnapshotsByKeyRef.current = nextQuoteSnapshotsByKey;
        setQuoteSnapshotsByKey(nextQuoteSnapshotsByKey);

        if (snapshot) {
          setCachedMarketBars((currentBars) => {
            const nextBars = mergeActiveSnapshotBars(currentBars, snapshot);
            writeActiveSnapshotBars(nextBars);
            return nextBars;
          });
          const baseHealth = latestHealth
            ? createRealtimeHealthViewFromGateway(latestHealth, "批量轮询成功", {
                capability: "realtimeQuote",
                triedProviders: latestTriedProviders,
              })
            : createRealtimeHealthView("ok", "AlphaFeed 批量轮询成功");
          const healthView: RealtimeProviderHealthView = {
            ...baseHealth,
            message: `${baseHealth.message} · 更新 ${snapshots.length} 只 · ${new Date(snapshot.receivedAt).toLocaleTimeString("zh-CN", { hour12: false })}`,
          };
          setRealtimeHealth(healthView);
          setRealtimeStatus(formatRealtimeHealthDetail(healthView));
        } else {
          const baseHealth = latestHealth
            ? createRealtimeHealthViewFromGateway(latestHealth, "批量轮询成功", {
                capability: "realtimeQuote",
                triedProviders: latestTriedProviders,
              })
            : createRealtimeHealthView("ok", "AlphaFeed 批量轮询成功");
          const healthView: RealtimeProviderHealthView = {
            ...baseHealth,
            message: snapshots.length > 0 ? `${baseHealth.message} · 当前标的暂无快照，已保留上一轮缓存` : `${baseHealth.message} · 暂无快照`,
          };
          setRealtimeHealth(healthView);
          setRealtimeStatus(formatRealtimeHealthDetail(healthView));
        }

        timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
      } catch (error) {
        const errorHealth = createRealtimeHealthView("error", getErrorMessage(error));
        setRealtimeHealth(errorHealth);
        setRealtimeStatus(errorHealth.message);
        timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      void disconnectQuoteStream();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    activeSymbol.dataSymbol,
    activeSymbol.market,
    activeSymbol.name,
    marketDataProviderSettings.stockSdkPrimaryEnabled,
    realtimePollIntervalMs,
    timeframe,
  ]);

  useEffect(() => {
    const preferences: ChartWorkspacePreferences = {
      version: 4,
      showSignals,
      showStrategyLayers,
      showMovingAverage,
      showCrosshair,
      showGrid,
      showVolume,
      showPriceLabels,
      showCurrentPriceLine,
      intradayDisplayMode,
      realtimePollIntervalMs,
      strategies: strategySettings,
    };

    saveWorkspacePreferences(preferences);
  }, [
    realtimePollIntervalMs,
    intradayDisplayMode,
    showCrosshair,
    showCurrentPriceLine,
    showGrid,
    showMovingAverage,
    showPriceLabels,
    showSignals,
    showStrategyLayers,
    showVolume,
    strategySettings,
  ]);

  return (
    <section className="chart-workspace-page">
      <header className="chart-topbar">
        <div className="symbol-search">
          <span>{activeSymbol.market}</span>
          <strong>{activeSymbol.symbol}</strong>
          <small>{activeSymbol.name}</small>
          <em className={cachedCandles.length > 0 ? "data-source-badge live" : "data-source-badge"}>{cachedCandles.length > 0 ? "本地缓存" : "等待数据"}</em>
          <em className={getRealtimeHealthBadgeClass(realtimeHealth.status)} title={realtimeStatus}>
            {formatRealtimeHealthDetail(realtimeHealth)}
          </em>
        </div>

        <div className="timeframe-tabs" aria-label="周期选择">
          {timeframes.map((item) => (
            <button className={item === timeframe ? "active" : ""} key={item} onClick={() => setTimeframe(item)} type="button">
              {formatTimeframeLabel(item)}
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
          <button className={isChartSettingsOpen ? "active" : ""} onClick={() => setIsChartSettingsOpen((value) => !value)} type="button">
            <Settings2 size={16} />
            <span>图表设置</span>
          </button>
          {timeframe === "realtime" && (
            <label className="polling-interval-control">
              <span>分时形态</span>
              <select
                aria-label="分时图表形态"
                onChange={(event) => setIntradayDisplayMode(sanitizeChartDisplayMode(event.currentTarget.value))}
                value={intradayDisplayMode}
              >
                <option value="line">折线</option>
                <option value="candlestick">K线</option>
              </select>
            </label>
          )}
          <label className="polling-interval-control">
            <span>轮询</span>
            <select
              aria-label="AlphaFeed REST 轮询频率"
              onChange={(event) => setRealtimePollIntervalMs(sanitizeRealtimePollIntervalMs(Number(event.currentTarget.value)))}
              value={realtimePollIntervalMs}
            >
              {realtimePollIntervalOptionsMs.map((intervalMs) => (
                <option key={intervalMs} value={intervalMs}>
                  {intervalMs / 1000}秒
                </option>
              ))}
            </select>
          </label>
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
          <button
            className={isChartSettingsOpen ? "active" : ""}
            onClick={() => setIsChartSettingsOpen((value) => !value)}
            type="button"
            title="图表设置"
          >
            <Settings2 size={18} />
          </button>
        </aside>

        <main
          className="chart-main-panel"
          onClick={() => setChartContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setChartContextMenu({
              x: Math.max(8, Math.min(event.clientX, window.innerWidth - 184)),
              y: Math.max(8, Math.min(event.clientY, window.innerHeight - 156)),
            });
          }}
        >
          <ChartViewport
            candles={renderedCandles}
            context={{ symbol: activeSymbol.symbol, market: activeSymbol.market, timeframe }}
            displayMode={timeframe === "realtime" ? intradayDisplayMode : "candlestick"}
            showCrosshair={showCrosshair}
            showCurrentPriceLine={showCurrentPriceLine}
            showGrid={showGrid}
            showMovingAverage={showMovingAverage}
            showPriceLabels={showPriceLabels}
            showSignals={showSignals}
            showStrategyLayers={canShowStrategyLayers}
            showVolume={showVolume}
            resetViewKey={chartResetViewKey}
            strategyLayers={strategyLayers}
          />
          {isChartSettingsOpen && (
            <section className="chart-settings-popover" aria-label="图表设置">
              <div className="chart-settings-heading">
                <strong>图表设置</strong>
                <button onClick={() => setIsChartSettingsOpen(false)} type="button">
                  关闭
                </button>
              </div>
              <label>
                <span>网格</span>
                <input checked={showGrid} onChange={(event) => setShowGrid(event.currentTarget.checked)} type="checkbox" />
              </label>
              <label>
                <span>成交量</span>
                <input checked={showVolume} onChange={(event) => setShowVolume(event.currentTarget.checked)} type="checkbox" />
              </label>
              <label>
                <span>十字光标</span>
                <input checked={showCrosshair} onChange={(event) => setShowCrosshair(event.currentTarget.checked)} type="checkbox" />
              </label>
              <label>
                <span>价格标签</span>
                <input checked={showPriceLabels} onChange={(event) => setShowPriceLabels(event.currentTarget.checked)} type="checkbox" />
              </label>
              <label>
                <span>当前价线</span>
                <input
                  checked={showCurrentPriceLine}
                  onChange={(event) => setShowCurrentPriceLine(event.currentTarget.checked)}
                  type="checkbox"
                />
              </label>
              <button className="chart-settings-reset" onClick={resetChartView} type="button">
                <RotateCcw size={14} />
                重置视图
              </button>
            </section>
          )}
          {chartContextMenu && (
            <div
              className="chart-context-menu"
              role="menu"
              style={{ left: chartContextMenu.x, top: chartContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button onClick={resetChartView} role="menuitem" type="button">
                <RotateCcw size={14} />
                重置视图
              </button>
              <button
                onClick={() => {
                  setIsChartSettingsOpen(true);
                  setChartContextMenu(null);
                }}
                role="menuitem"
                type="button"
              >
                <Settings2 size={14} />
                图表设置
              </button>
              <button
                onClick={() => {
                  setShowStrategyLayers((value) => !value);
                  setChartContextMenu(null);
                }}
                role="menuitem"
                type="button"
              >
                <Layers3 size={14} />
                {showStrategyLayers ? "隐藏策略图层" : "显示策略图层"}
              </button>
              <button
                onClick={() => {
                  setShowCurrentPriceLine((value) => !value);
                  setChartContextMenu(null);
                }}
                role="menuitem"
                type="button"
              >
                <LineChart size={14} />
                {showCurrentPriceLine ? "隐藏当前价线" : "显示当前价线"}
              </button>
            </div>
          )}
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
            {symbols.map((item) => {
              const snapshot = quoteSnapshotsByKey[`${item.market}:${item.dataSymbol}`];
              const change = formatQuoteChange(snapshot, item.change);

              return (
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
                    <strong>{formatQuotePrice(snapshot, item.price)}</strong>
                    <small className={change.startsWith("+") ? "positive" : "negative"}>{change}</small>
                  </span>
                </button>
              );
            })}
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
            {strategyRuns.map(({ strategy, settings, result }) => {
              const layerStatus = getStrategyLayerStatus(strategy, settings, result, timeframe, strategyInputBars.length);
              const isLayerVisible = settings.enabled && canShowStrategyLayers && settings.showLayer && layerStatus.className === "active";

              return (
                <div className={isLayerVisible ? "layer-item active" : `layer-item ${layerStatus.className}`} key={strategy.key}>
                  <span>
                    <strong>
                      {strategy.name}
                      <em className={`strategy-source-badge ${strategy.sourceType}`}>{formatStrategySource(strategy)}</em>
                      <em className={`layer-status-badge ${layerStatus.className}`}>{layerStatus.label}</em>
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
              );
            })}
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
