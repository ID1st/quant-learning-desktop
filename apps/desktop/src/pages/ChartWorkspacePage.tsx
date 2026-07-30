import { useEffect, useMemo, useRef, useState } from "react";
import { ChartViewport, type ChartDisplayMode, type ChartLayer, type ChartLayerElement } from "@quant/chart";
import type { Market, Timeframe } from "@quant/shared";
import {
  createEmptyStrategyRegistry,
  createPresetStrategyRegistry,
  createStrategyInput,
  createRunnableUserStrategyDefinition,
  type StrategyDefinition,
  type StrategyParameterDefinition,
  type StrategyRunResult,
} from "@quant/strategy-engine";
import { useUserStrategyDraftStore } from "../features/strategies/userStrategyDraftStore";
import { usePluginRuntimeStore } from "../features/plugins/pluginRuntimeStore";
import {
  buildChartStrategyLogItems,
  buildChartStrategySignalRows,
  getMlptChartNotice,
  getRealtimeStrategyHistoryRequirement,
  runChartStrategies,
  type ChartStrategyWorkspaceState,
} from "../features/strategies/chartStrategyRuntime";
import { createStrategySeriesByTimeframe } from "../features/strategies/strategySeries";
import { toChartLayerElement } from "../features/strategies/strategyVisualAdapter";
import {
  filterMarketBarsForChartContext,
  marketBarsToCandles,
  marketBarsToStrategyBars,
} from "../features/marketData/chartBarAdapter";
import { readMarketBarCache, readMarketBarCacheSummary, writeMarketBarCache, type MarketDataBar } from "../features/marketData/marketBarCacheService";
import { readMarketWatchlist, writeMarketWatchlist, type MarketQuoteSnapshot, type MarketWatchlistItem } from "../features/marketData/marketDataSyncService";
import {
  createQuotePollingBatches,
  createSnapshotCacheWriteGate,
  defaultRealtimePollIntervalMs,
  mergeQuoteSnapshots,
  realtimePollIntervalOptionsMs,
  sanitizeRealtimePollIntervalMs,
} from "../features/marketData/realtimeQuotePollingService";
import {
  analyzeRealtimeHistoryGap,
  aggregateRealtimePointBarsToMinuteCandles,
  mergeHistoricalRealtimeBarsWithLiveBars,
  mergeRealtimeSnapshotMinuteBar,
} from "../features/marketData/realtimeIntradayBarService";
import {
  alphaFeedMinuteBarsToRealtimeBars,
  getIntradayHistoryWindow,
  isMarketSessionOpen,
} from "../features/marketData/intradayHistoryService";
import { sampleIntradayBarsForRendering } from "../features/marketData/intradayRenderSamplingService";
import {
  createChartLoadState,
  hasRenderableChartData,
  type ChartLoadState,
} from "../features/marketData/chartDataReadinessService";
import {
  createChartWatchlistWarmupPlan,
  hasSufficientHistoricalChartCache,
  isChartWarmupCacheFresh,
} from "../features/marketData/chartWatchlistWarmupService";
import {
  createChartMarketDataAccess,
  gatewayBarsToAlphaFeedMarketDataBars,
  gatewayBarsToMarketDataBars,
  gatewayQuoteSnapshotsToMarketQuoteSnapshots,
  type ChartMarketDataAccess,
  type ChartBarsBatchResult,
  type ChartQuoteSnapshotBatchResult,
} from "../features/marketData/chartMarketDataGateway";
import { readMarketDataProviderSettings } from "../features/marketData/marketDataProviderSettings";
import {
  appendMarketDataRuntimeEvent,
  evaluateMarketCacheFreshness,
  formatMarketDataRuntimeEventKind,
  getMarketRuntimeSessionStatus,
  type MarketDataRuntimeEvent,
} from "../features/marketData/marketDataRuntimeStatus";
import {
  mergeMlptBarsByProviderPriority,
  mlptMinimumHistoryBars,
  mlptPreferredHistoryBars,
} from "../features/marketData/mlptHistoricalBackfillService";
import {
  builtInChartIndicatorDefinitions,
  createChartIndicatorEvaluations,
  getIndicatorInstance,
  getIndicatorParameters,
  resolveIndicatorConvention,
  setIndicatorEnabled,
  updateIndicatorParameter,
} from "../features/chartIndicators/chartIndicators";
import { useChartStudySettingsStore } from "../features/chartWorkspace/chartStudySettingsStore";
import { IndicatorQuickMenu } from "../features/chartWorkspace/IndicatorQuickMenu";
import {
  createStrategyQuickMenuItems,
  toggleStrategyFromQuickMenu,
} from "../features/chartWorkspace/strategyQuickMenu";
import { drawingsToLayer, readChartDrawings, writeChartDrawings, type ChartDrawing } from "../features/chartDrawings/chartDrawingStore";
import {
  createChartDrawingCommandState,
  executeChartDrawingCommand,
  redoChartDrawingCommand,
  undoChartDrawingCommand,
  type ChartDrawingCommand,
} from "../features/chartDrawings/chartDrawingCommands";
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
  CircleAlert,
  Crosshair,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Gauge,
  Layers3,
  LineChart,
  MousePointer2,
  PencilLine,
  RotateCcw,
  Ruler,
  ShieldCheck,
  SlidersHorizontal,
  Settings2,
  TerminalSquare,
  Activity,
  LoaderCircle,
  Plus,
  Power,
  Search,
  Trash2,
  X,
  Type,
  Undo2,
  Redo2,
} from "lucide-react";

const symbols: Array<{ symbol: string; dataSymbol: string; name: string; market: Market; price: string; change: string }> = [
  { symbol: "AAPL", dataSymbol: "AAPL.US", name: "Apple Inc.", market: "US", price: "219.48", change: "+1.03%" },
  { symbol: "09988.HK", dataSymbol: "09988.HK", name: "阿里巴巴", market: "HK", price: "83.20", change: "+1.49%" },
  { symbol: "600519", dataSymbol: "600519.SH", name: "贵州茅台", market: "CN", price: "1468.10", change: "+0.54%" },
  { symbol: "TSLA", dataSymbol: "TSLA.US", name: "Tesla", market: "US", price: "188.14", change: "-0.82%" },
];

type ChartWatchlistItem = (typeof symbols)[number];

function toChartWatchlistItem(item: MarketWatchlistItem): ChartWatchlistItem {
  const defaultItem = symbols.find((candidate) => candidate.dataSymbol === item.symbol && candidate.market === item.market);
  return defaultItem ?? {
    symbol: item.symbol.replace(/\.(US|HK|SH|SZ)$/u, ""),
    dataSymbol: item.symbol,
    name: item.name,
    market: item.market,
    price: "--",
    change: "--",
  };
}

function readChartWatchlist() {
  const items = readMarketWatchlist();
  return items.length > 0 ? items.map(toChartWatchlistItem) : symbols;
}

const timeframes: Timeframe[] = ["realtime", "1d", "1w"];
const realtimeRateLimitBackoffMs = 120_000;
const enableAlphaFeedHistoricalIntradayBackfill = false;
const longPortRealtimeDelayWarningMs = 5 * 60_000;
const strategyRegistry = createPresetStrategyRegistry();
const presetStrategies = strategyRegistry.list();
const WORKSPACE_PREFERENCES_KEY = "quant-learning.chart-workspace-preferences";

type StrategyWorkspaceState = ChartStrategyWorkspaceState;

interface ChartWorkspacePreferences {
  version: 6;
  showSignals: boolean;
  showStrategyLayers: boolean;
  showCrosshair: boolean;
  showGrid: boolean;
  secondaryPaneRatio: number;
  showPriceLabels: boolean;
  showCurrentPriceLine: boolean;
  intradayDisplayMode: ChartDisplayMode;
  realtimePollIntervalMs: number;
  strategies: Record<string, StrategyWorkspaceState>;
}

type ChartBottomTab = "layers" | "signals" | "logs";
type WatchlistDataStatus = "ready" | "syncing" | "cache" | "degraded" | "error";

function getWatchlistDataKey(item: Pick<ChartWatchlistItem, "market" | "dataSymbol">) {
  return `${item.market}:${item.dataSymbol}`;
}

function getChartCacheTimeframe(timeframe: Timeframe): Timeframe {
  return timeframe === "realtime" ? "realtime" : timeframe;
}

function formatWatchlistDataStatus(status: WatchlistDataStatus | undefined) {
  const labels: Record<WatchlistDataStatus, string> = {
    ready: "已就绪",
    syncing: "同步中",
    cache: "使用缓存",
    degraded: "数据源降级",
    error: "加载失败",
  };
  return labels[status ?? "syncing"];
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
    enabled: strategy.defaultEnabled ?? index === 0,
    showLayer: true,
    parameters: getDefaultParameters(strategy),
  };
}

function createDefaultWorkspacePreferences(): ChartWorkspacePreferences {
  return {
    version: 6,
    showSignals: true,
    showStrategyLayers: true,
    showCrosshair: true,
    showGrid: true,
    secondaryPaneRatio: 0.26,
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

  if (parameter.type === "color") {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : parameter.defaultValue;
  }

  if (parameter.type === "number") {
    const numericValue = typeof value === "number" && Number.isFinite(value) ? value : Number(parameter.defaultValue);
    const minimumValue = Number(getNumberInputMinimum(parameter.key));
    const maximumValue = Number(getNumberInputMaximum(parameter.key));
    return Math.min(maximumValue, Math.max(minimumValue, numericValue));
  }

  return parameter.defaultValue;
}

function isFractionalStrategyParameter(parameterKey: string) {
  return ["supertrendFactor", "bandwidth", "stopLossAtrMultiplier", "targetOneMultiplier", "targetTwoMultiplier", "targetThreeMultiplier", "trailingStopAtrMultiplier", "equalHighLowThreshold"].includes(
    parameterKey,
  );
}

function getNumberInputMinimum(parameterKey: string) {
  if (parameterKey === "timezoneOffsetHours") return "-12";
  if (["sessionStartHour", "sessionStartMinute", "manualEndHour", "manualEndMinute", "extensionMultiplierOne", "extensionMultiplierTwo", "extensionMultiplierThree"].includes(parameterKey)) return "0";
  if (parameterKey === "volumeProfileRows") return "5";
  if (parameterKey === "fairValueGapExtend") return "0";
  if (parameterKey === "bandwidth") return "2";

  return isFractionalStrategyParameter(parameterKey) ? "0.1" : "1";
}

function getNumberInputMaximum(parameterKey: string) {
  if (parameterKey === "timezoneOffsetHours") return "12";
  if (parameterKey === "sessionStartHour") return "23";
  if (["sessionStartMinute", "manualEndMinute"].includes(parameterKey)) return "59";
  if (parameterKey === "manualEndHour") return "23";
  if (parameterKey === "openingRangeMinutes") return "240";
  if (parameterKey === "volumeProfileRows") return "50";
  if (parameterKey === "volumeProfileWidthPercent") return "100";
  if (parameterKey === "equalHighLowThreshold") return "0.5";
  if (["internalOrderBlockCount", "swingOrderBlockCount"].includes(parameterKey)) return "20";
  return String(Number.MAX_SAFE_INTEGER);
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
        showCrosshair: defaultPreferences.showCrosshair,
        showGrid: defaultPreferences.showGrid,
        secondaryPaneRatio: defaultPreferences.secondaryPaneRatio,
        showPriceLabels: defaultPreferences.showPriceLabels,
        showCurrentPriceLine: defaultPreferences.showCurrentPriceLine,
        intradayDisplayMode: defaultPreferences.intradayDisplayMode,
        realtimePollIntervalMs: sanitizeRealtimePollIntervalMs(parsed.realtimePollIntervalMs),
        strategies: migratedStrategies,
      };
    }

    if (parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4 && parsed.version !== 5 && parsed.version !== 6) {
      return defaultPreferences;
    }

    return {
      version: 6,
      showSignals: typeof parsed.showSignals === "boolean" ? parsed.showSignals : defaultPreferences.showSignals,
      showStrategyLayers:
        typeof parsed.showStrategyLayers === "boolean" ? parsed.showStrategyLayers : defaultPreferences.showStrategyLayers,
      showCrosshair: typeof parsed.showCrosshair === "boolean" ? parsed.showCrosshair : defaultPreferences.showCrosshair,
      showGrid: typeof parsed.showGrid === "boolean" ? parsed.showGrid : defaultPreferences.showGrid,
      secondaryPaneRatio: typeof parsed.secondaryPaneRatio === "number"
        ? Math.min(0.45, Math.max(0.18, parsed.secondaryPaneRatio))
        : defaultPreferences.secondaryPaneRatio,
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

function formatLogTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
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

async function fetchQuoteSnapshotBatch(options: {
  readonly batch: readonly MarketWatchlistItem[];
  readonly marketDataAccess: ChartMarketDataAccess;
}): Promise<ChartQuoteSnapshotBatchResult> {
  return options.marketDataAccess.fetchQuoteSnapshotBatch(options.batch);
}

async function fetchChartBars(options: {
  readonly capability: "historicalBars" | "intradayBars";
  readonly request: {
    readonly symbol: string;
    readonly market: Market;
    readonly timeframe: Timeframe;
    readonly count?: number;
    readonly startTime?: number;
    readonly endTime?: number;
  };
  readonly mlptHistory?: {
    readonly targetBars: number;
    readonly confirmedThroughTimestamp: number;
    readonly knownTimestamps: readonly number[];
  };
  readonly marketDataAccess: ChartMarketDataAccess;
}): Promise<ChartBarsBatchResult> {
  return options.marketDataAccess.fetchBars({
    capability: options.capability,
    request: options.request,
    mlptHistory: options.mlptHistory,
  });
}

async function connectQuoteStreamForChart(options: {
  readonly items: readonly MarketWatchlistItem[];
  readonly marketDataAccess: ChartMarketDataAccess;
  readonly alphaFeedStreamMode?: "watchlist" | "all-symbols";
}): Promise<MarketDataProviderHealthView | null> {
  return options.marketDataAccess.connectQuoteStream(options.items, options.alphaFeedStreamMode);
}

async function readQuoteStreamSnapshotForChart(options: {
  readonly items: readonly MarketWatchlistItem[];
  readonly marketDataAccess: ChartMarketDataAccess;
}): Promise<
  | {
      readonly ok: true;
      readonly snapshots: readonly MarketQuoteSnapshot[];
      readonly health: MarketDataProviderHealthView;
    }
  | {
      readonly ok: false;
      readonly health: readonly MarketDataProviderHealthView[];
    }
> {
  return options.marketDataAccess.readQuoteStreamSnapshot(options.items);
}

async function disconnectQuoteStreamForChart(options: {
  readonly marketDataAccess: ChartMarketDataAccess;
}) {
  await options.marketDataAccess.disconnectQuoteStream();
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

function formatStatusClock(value: string | undefined) {
  if (!value) {
    return "--:--:--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
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
    ? `历史分时落后约 ${gapMinutes} 分钟，实时源已补齐最新走势`
    : `历史分时落后约 ${gapMinutes} 分钟，等待实时源补齐`;
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

  if (strategy.key === "smart-money-concepts") {
    if (result.output.metrics["Structure Ready"] === 0) {
      return { className: "active", label: `预热中 ${barCount}/51` };
    }
    if (result.output.metrics["ATR Ready"] === 0) {
      return { className: "active", label: `ATR 预热中 ${barCount}/200` };
    }
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
  const pluginStrategies = usePluginRuntimeStore((state) => state.strategies);
  const pluginIndicators = usePluginRuntimeStore((state) => state.indicators);
  const refreshPluginRuntime = usePluginRuntimeStore((state) => state.refresh);
  const runPluginStrategies = usePluginRuntimeStore((state) => state.runStrategies);
  const strategySettings = useChartStudySettingsStore((state) => state.strategies);
  const indicatorSettings = useChartStudySettingsStore((state) => state.indicators);
  const initializeStudyStrategies = useChartStudySettingsStore((state) => state.initializeStrategies);
  const updateStudyStrategy = useChartStudySettingsStore((state) => state.updateStrategy);
  const updateIndicatorSettings = useChartStudySettingsStore((state) => state.updateIndicators);
  useEffect(() => {
    void refreshPluginRuntime();
  }, [refreshPluginRuntime]);
  const runnableUserStrategies = useMemo(
    () =>
      importedDrafts.flatMap((draft) => {
        const result = createRunnableUserStrategyDefinition(draft.definition);
        return result.ok ? [result.strategy] : [];
      }),
    [importedDrafts],
  );
  const chartStrategies = useMemo(
    () => [...presetStrategies, ...runnableUserStrategies, ...pluginStrategies],
    [pluginStrategies, runnableUserStrategies],
  );
  const chartStrategyRegistry = useMemo(() => {
    const registry = createEmptyStrategyRegistry();
    chartStrategies.forEach((strategy) => registry.register(strategy));
    return registry;
  }, [chartStrategies]);
  const realtimeHistoryRequirement = useMemo(
    () => getRealtimeStrategyHistoryRequirement(chartStrategies, strategySettings),
    [chartStrategies, strategySettings],
  );
  const isMlptEnabled = strategySettings["machine-learning-price-targets"]?.enabled === true;
  useEffect(() => {
    initializeStudyStrategies(chartStrategies);
  }, [chartStrategies, initializeStudyStrategies]);
  const [watchlist, setWatchlist] = useState<ChartWatchlistItem[]>(readChartWatchlist);
  const [activeSymbol, setActiveSymbol] = useState<ChartWatchlistItem>(() => readChartWatchlist()[0] ?? symbols[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [cachedMarketBars, setCachedMarketBars] = useState<MarketDataBar[]>(() =>
    readMarketBarCache({ symbol: readChartWatchlist()[0]?.dataSymbol ?? symbols[0].dataSymbol, market: readChartWatchlist()[0]?.market ?? symbols[0].market, timeframe: "1d" }),
  );
  const snapshotCacheWriteGateRef = useRef(createSnapshotCacheWriteGate());
  const [chartLoadState, setChartLoadState] = useState<ChartLoadState>(() => {
    const item = readChartWatchlist()[0] ?? symbols[0];
    const bars = readMarketBarCache({ symbol: item.dataSymbol, market: item.market, timeframe: "1d" });
    return createChartLoadState(hasRenderableChartData("1d", bars.length) ? "ready" : "cache", item.symbol, "1d", bars.length);
  });
  const [watchlistDataStatusByKey, setWatchlistDataStatusByKey] = useState<Record<string, WatchlistDataStatus>>({});
  const [realtimeStatus, setRealtimeStatus] = useState("REST 轮询待命");
  const [mlptHistoryStatus, setMlptHistoryStatus] = useState<string | null>(null);
  const [realtimeHealth, setRealtimeHealth] = useState<RealtimeProviderHealthView>(() =>
    createRealtimeHealthView("idle", "REST 轮询待命"),
  );
  const [quoteSnapshotsByKey, setQuoteSnapshotsByKey] = useState<Record<string, MarketQuoteSnapshot>>({});
  const quoteSnapshotsByKeyRef = useRef<Record<string, MarketQuoteSnapshot>>({});
  const [showSignals, setShowSignals] = useState(workspacePreferences.showSignals);
  const [showStrategyLayers, setShowStrategyLayers] = useState(workspacePreferences.showStrategyLayers);
  const [isStrategyMenuOpen, setIsStrategyMenuOpen] = useState(false);
  const [activeIndicatorConfigId, setActiveIndicatorConfigId] = useState<string | null>(null);
  const [showCrosshair, setShowCrosshair] = useState(workspacePreferences.showCrosshair);
  const [showGrid, setShowGrid] = useState(workspacePreferences.showGrid);
  const [secondaryPaneRatio, setSecondaryPaneRatio] = useState(workspacePreferences.secondaryPaneRatio);
  const [showPriceLabels, setShowPriceLabels] = useState(workspacePreferences.showPriceLabels);
  const [showCurrentPriceLine, setShowCurrentPriceLine] = useState(workspacePreferences.showCurrentPriceLine);
  const [intradayDisplayMode, setIntradayDisplayMode] = useState<ChartDisplayMode>(workspacePreferences.intradayDisplayMode);
  const [realtimePollIntervalMs, setRealtimePollIntervalMs] = useState(workspacePreferences.realtimePollIntervalMs);
  const [activeConfigStrategyKey, setActiveConfigStrategyKey] = useState<string | null>(null);
  const [isWatchlistCollapsed, setIsWatchlistCollapsed] = useState(false);
  const [isInstrumentSearchOpen, setIsInstrumentSearchOpen] = useState(false);
  const [instrumentSearchQuery, setInstrumentSearchQuery] = useState("");
  const [instrumentSearchState, setInstrumentSearchState] = useState<"idle" | "loading" | "error" | "empty">("idle");
  const [instrumentSearchMessage, setInstrumentSearchMessage] = useState("");
  const [instrumentSearchResults, setInstrumentSearchResults] = useState<readonly { symbol: string; name: string; market: Market }[]>([]);
  const [bottomTab, setBottomTab] = useState<ChartBottomTab>("layers");
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [isBottomDockExpanded, setIsBottomDockExpanded] = useState(false);
  const [isChartSettingsOpen, setIsChartSettingsOpen] = useState(false);
  const [chartContextMenu, setChartContextMenu] = useState<ChartContextMenuState | null>(null);
  const [chartResetViewKey, setChartResetViewKey] = useState(0);
  const [chartFocusLatestKey, setChartFocusLatestKey] = useState(0);
  const [isPriceScaleLocked, setIsPriceScaleLocked] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [providerDiagnostics, setProviderDiagnostics] = useState<readonly MarketDataProviderHealthView[]>([]);
  const [diagnosticTimeline, setDiagnosticTimeline] = useState<readonly MarketDataRuntimeEvent[]>([]);
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  const [drawings, setDrawings] = useState<ChartDrawing[]>(() => readChartDrawings({ market: activeSymbol.market, symbol: activeSymbol.dataSymbol, timeframe }));
  const [drawingCommandState, setDrawingCommandState] = useState(() => createChartDrawingCommandState(readChartDrawings({ market: activeSymbol.market, symbol: activeSymbol.dataSymbol, timeframe })));
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [activeDrawingTool, setActiveDrawingTool] = useState<ChartDrawing["type"] | null>(null);
  const [pendingTrendPoint, setPendingTrendPoint] = useState<{ timestamp: number; price: number } | null>(null);
  const strategyMenuRef = useRef<HTMLDivElement>(null);
  const strategyMenuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isStrategyMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !strategyMenuRef.current?.contains(event.target)) {
        setIsStrategyMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsStrategyMenuOpen(false);
        strategyMenuButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isStrategyMenuOpen]);
  const recordMarketEvent = (kind: MarketDataRuntimeEvent["kind"], message: string, detail?: string) => {
    setDiagnosticTimeline((current) => appendMarketDataRuntimeEvent(current, { kind, timestamp: new Date().toISOString(), message, detail }));
  };
  const activeContextMarketBars = useMemo(
    () =>
      filterMarketBarsForChartContext(cachedMarketBars, {
        symbol: activeSymbol.dataSymbol,
        market: activeSymbol.market,
        timeframe: getChartCacheTimeframe(timeframe),
      }),
    [activeSymbol.dataSymbol, activeSymbol.market, cachedMarketBars, timeframe],
  );
  const displayedMarketBars = useMemo(
    () =>
      timeframe === "realtime" && intradayDisplayMode === "candlestick"
        ? aggregateRealtimePointBarsToMinuteCandles(activeContextMarketBars)
        : activeContextMarketBars,
    [activeContextMarketBars, intradayDisplayMode, timeframe],
  );
  const strategyMarketBars = useMemo(
    () => timeframe === "realtime" ? aggregateRealtimePointBarsToMinuteCandles(activeContextMarketBars) : activeContextMarketBars,
    [activeContextMarketBars, timeframe],
  );
  const chartRenderBars = useMemo(
    () => timeframe === "realtime" ? sampleIntradayBarsForRendering(displayedMarketBars) : displayedMarketBars,
    [displayedMarketBars, timeframe],
  );
  const chartHasRenderableData = hasRenderableChartData(timeframe, chartRenderBars.length, {
    allowSparseIntraday: isMlptEnabled,
  });
  const chartViewportLoadingState = !chartHasRenderableData
    ? {
        stage: chartLoadState.stage,
        message: chartLoadState.message,
        isError: chartLoadState.stage === "error",
      }
    : undefined;
  const currentRealtimeWatchlist = useMemo<MarketWatchlistItem[]>(
    () => watchlist.map((item) => ({ symbol: item.dataSymbol, name: item.name, market: item.market, source: "user" })),
    [watchlist],
  );
  const cachedCandles = useMemo(() => marketBarsToCandles(chartRenderBars), [chartRenderBars]);
  const allIndicatorDefinitions = useMemo(
    () => [...builtInChartIndicatorDefinitions, ...pluginIndicators],
    [pluginIndicators],
  );
  const indicatorConvention = resolveIndicatorConvention(indicatorSettings.conventionMode, activeSymbol.market);
  const indicatorEvaluations = useMemo(
    () => createChartIndicatorEvaluations(
      cachedCandles,
      indicatorSettings,
      indicatorConvention,
      allIndicatorDefinitions,
    ),
    [allIndicatorDefinitions, cachedCandles, indicatorConvention, indicatorSettings],
  );
  const overlayIndicatorEvaluations = useMemo(
    () => indicatorEvaluations.filter(
      (evaluation): evaluation is Extract<(typeof indicatorEvaluations)[number], { placement: "overlay" }> =>
        evaluation.placement === "overlay",
    ),
    [indicatorEvaluations],
  );
  const indicatorLayers = useMemo(() => overlayIndicatorEvaluations.map((evaluation) => evaluation.layer), [overlayIndicatorEvaluations]);
  const secondaryIndicatorEvaluation = indicatorEvaluations.find(
    (evaluation): evaluation is Extract<(typeof indicatorEvaluations)[number], { placement: "pane" }> =>
      evaluation.placement === "pane" && evaluation.visible,
  );
  const drawingLayer = useMemo(() => drawingsToLayer(drawings), [drawings]);
  const cachedStrategyBars = useMemo(() => marketBarsToStrategyBars(strategyMarketBars), [strategyMarketBars]);
  const renderedCandles = cachedCandles;
  const strategyInputBars = cachedStrategyBars;
  const strategySeriesByTimeframe = useMemo(() => {
    const dailyBars = marketBarsToStrategyBars(
      readMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: "1d" }),
    );
    const weeklyBars = marketBarsToStrategyBars(
      readMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: "1w" }),
    );
    return createStrategySeriesByTimeframe({
      primaryBars: strategyInputBars,
      primaryTimeframe: timeframe,
      market: activeSymbol.market,
      asOfTimestamp: Date.now(),
      dailyBars,
      weeklyBars,
    });
  }, [activeSymbol.dataSymbol, activeSymbol.market, cachedMarketBars, strategyInputBars, timeframe]);
  const strategyRuns = useMemo(
    () =>
      runChartStrategies({
        strategies: chartStrategies,
        registry: chartStrategyRegistry,
        settingsByStrategyKey: strategySettings,
        resolveDefaultSettings: getDefaultStrategyState,
        symbol: activeSymbol.dataSymbol,
        market: activeSymbol.market,
        timeframe,
        bars: chartHasRenderableData ? strategyInputBars : [],
        seriesByTimeframe: strategySeriesByTimeframe,
        confirmedThroughTimestamp:
          timeframe === "realtime" && isMarketSessionOpen(activeSymbol.market)
            ? Math.floor(Date.now() / 60_000) * 60_000 - 60_000
            : undefined,
      }),
    [activeSymbol.dataSymbol, activeSymbol.market, chartHasRenderableData, chartStrategies, chartStrategyRegistry, strategyInputBars, strategySeriesByTimeframe, strategySettings, timeframe],
  );
  const mlptChartNotice = getMlptChartNotice(strategyRuns);
  const pluginStrategyRunSignature = useMemo(() => {
    const lastBar = strategyInputBars.at(-1);
    return JSON.stringify({
      symbol: activeSymbol.dataSymbol,
      market: activeSymbol.market,
      timeframe,
      barCount: chartHasRenderableData ? strategyInputBars.length : 0,
      lastBar,
      strategies: chartStrategies.filter((strategy) => strategy.sourceType === "plugin").map((strategy) => ({
        key: strategy.key,
        enabled: strategySettings[strategy.key]?.enabled ?? false,
        parameters: strategySettings[strategy.key]?.parameters ?? {},
      })),
    });
  }, [activeSymbol.dataSymbol, activeSymbol.market, chartHasRenderableData, chartStrategies, strategyInputBars, strategySettings, timeframe]);
  const lastPluginStrategyRunSignatureRef = useRef("");
  useEffect(() => {
    if (pluginStrategyRunSignature === lastPluginStrategyRunSignatureRef.current || !chartHasRenderableData) return;
    lastPluginStrategyRunSignatureRef.current = pluginStrategyRunSignature;
    const requests = chartStrategies
      .filter((strategy) => strategy.sourceType === "plugin" && strategy.supportedTimeframes.includes(timeframe))
      .map((strategy) => ({
        strategy,
        input: createStrategyInput(strategy, {
          strategyKey: strategy.key,
          symbol: activeSymbol.dataSymbol,
          market: activeSymbol.market,
          timeframe,
          bars: strategyInputBars,
          seriesByTimeframe: strategySeriesByTimeframe,
          runMode: "realtime",
          enabled: strategySettings[strategy.key]?.enabled ?? false,
          parameters: strategySettings[strategy.key]?.parameters,
        }),
      }));
    void runPluginStrategies(requests);
  }, [activeSymbol.dataSymbol, activeSymbol.market, chartHasRenderableData, chartStrategies, pluginStrategyRunSignature, runPluginStrategies, strategyInputBars, strategySeriesByTimeframe, strategySettings, timeframe]);
  const strategyLayers = useMemo<ChartLayer[]>(
    () =>
      strategyRuns.map(({ result, settings }) => ({
        ...result.output.render,
        enabled: result.output.render.enabled && settings.enabled && settings.showLayer,
        elements: result.output.render.elements.map(toChartLayerElement),
      })),
    [strategyRuns],
  );
  const availableLayerIds = useMemo(() => [...strategyLayers.map((layer) => layer.strategyId), ...indicatorLayers.map((layer) => layer.id), drawingLayer.id], [drawingLayer.id, indicatorLayers, strategyLayers]);
  const effectiveLayerOrder = useMemo(() => [...layerOrder.filter((id) => availableLayerIds.includes(id)), ...availableLayerIds.filter((id) => !layerOrder.includes(id))], [availableLayerIds, layerOrder]);
  const orderedStrategyLayers = useMemo(() => strategyLayers.map((layer) => ({ ...layer, zIndex: (effectiveLayerOrder.indexOf(layer.strategyId) + 1) * 10 })), [effectiveLayerOrder, strategyLayers]);
  const orderedExtraLayers = useMemo(() => [drawingLayer, ...indicatorLayers].map((layer) => ({ ...layer, zIndex: (effectiveLayerOrder.indexOf(layer.id) + 1) * 10 })), [drawingLayer, effectiveLayerOrder, indicatorLayers]);
  const canShowStrategyLayers = showStrategyLayers;
  const strategyLayerElementCount = strategyLayers.reduce((total, layer) => total + (layer.enabled ? layer.elements.length : 0), 0);
  const enabledStrategyCount = strategyRuns.filter(({ settings }) => settings.enabled).length;
  const totalSignalCount = strategyRuns.reduce((total, { result }) => total + result.output.signals.length, 0);
  const activeConfigStrategyRun = strategyRuns.find(({ strategy }) => strategy.key === activeConfigStrategyKey);
  const strategyQuickMenuItems = useMemo(
    () => createStrategyQuickMenuItems(chartStrategies, strategySettings),
    [chartStrategies, strategySettings],
  );
  const strategyLogTime = formatLogTime(Date.now());
  const strategyLogItems = buildChartStrategyLogItems(strategyRuns, { symbol: activeSymbol.symbol, timeframe });
  const signalRows = buildChartStrategySignalRows(strategyRuns);
  const selectedSignal = signalRows.find((signal) => signal.id === selectedSignalId) ?? null;
  const selectedSignalRun = selectedSignal ? strategyRuns.find(({ strategy }) => strategy.key === selectedSignal.strategyKey) ?? null : null;
  const updateStrategyState = (strategyKey: string, updater: (state: StrategyWorkspaceState) => StrategyWorkspaceState) => {
    updateStudyStrategy(strategyKey, updater);
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
    setShowPriceLabels(true);
    setShowCurrentPriceLine(true);
    setChartResetViewKey((value) => value + 1);
    setChartContextMenu(null);
  };
  const selectActiveSymbol = (item: ChartWatchlistItem) => {
    const bars = readMarketBarCache({ symbol: item.dataSymbol, market: item.market, timeframe: getChartCacheTimeframe(timeframe) });
    setCachedMarketBars(bars);
    setChartLoadState(
      createChartLoadState(
        hasRenderableChartData(timeframe, bars.length) ? "ready" : "cache",
        item.symbol,
        timeframe,
        bars.length,
      ),
    );
    setActiveSymbol(item);
  };
  const mergeActiveSnapshotBars = (currentBars: MarketDataBar[], snapshot: MarketQuoteSnapshot) => {
    if (timeframe === "realtime") {
      return mergeRealtimeSnapshotMinuteBar(
        currentBars,
        { symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: "realtime" },
        snapshot,
        realtimeHistoryRequirement.sessionCount,
      );
    }

    return mergeRealtimeDailyBar(currentBars, { symbol: activeSymbol.dataSymbol, market: activeSymbol.market }, snapshot);
  };
  const writeActiveSnapshotBars = (bars: MarketDataBar[]) => {
    const contextKey = `${activeSymbol.market}:${activeSymbol.dataSymbol}:${timeframe}`;
    if (!snapshotCacheWriteGateRef.current.shouldWrite(contextKey)) {
      return;
    }

    writeMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe }, bars);
  };

  useEffect(() => {
    const cacheTimeframe = getChartCacheTimeframe(timeframe);
    const bars = readMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: cacheTimeframe });
    setCachedMarketBars(bars);
    setChartLoadState(
      createChartLoadState(
        hasRenderableChartData(timeframe, bars.length) ? "ready" : "cache",
        activeSymbol.symbol,
        timeframe,
        bars.length,
      ),
    );
    setWatchlistDataStatusByKey((current) => ({
      ...current,
      [getWatchlistDataKey(activeSymbol)]: hasRenderableChartData(timeframe, bars.length) ? "cache" : "syncing",
    }));
  }, [activeSymbol.dataSymbol, activeSymbol.market, marketDataProviderSettings.stockSdkPrimaryEnabled, timeframe]);

  useEffect(() => {
    const nextDrawings = readChartDrawings({ market: activeSymbol.market, symbol: activeSymbol.dataSymbol, timeframe });
    setDrawings(nextDrawings);
    setDrawingCommandState(createChartDrawingCommandState(nextDrawings));
    setSelectedDrawingId(null);
  }, [activeSymbol.dataSymbol, activeSymbol.market, timeframe]);

  useEffect(() => {
    const kind = realtimeHealth.status === "rate_limited"
      ? "rate-limited"
      : realtimeHealth.status === "ok" || realtimeHealth.status === "idle" || realtimeHealth.status === "paused"
        ? "sync-completed"
        : "error";
    setDiagnosticTimeline((current) => appendMarketDataRuntimeEvent(current, {
      kind,
      timestamp: realtimeHealth.checkedAt ?? new Date().toISOString(),
      message: formatRealtimeHealthDetail(realtimeHealth),
    }));
  }, [realtimeHealth]);

  useEffect(() => {
    let cancelled = false;

    const loadMarketDataHistory = async () => {
      const isRealtimeHistory = timeframe === "realtime";
      const windowRange = isRealtimeHistory
        ? getIntradayHistoryWindow(activeSymbol.market, Date.now(), realtimeHistoryRequirement.sessionCount)
        : null;
      const cacheTimeframe = getChartCacheTimeframe(timeframe);
      const initialCachedBars = readMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: cacheTimeframe });
      const confirmedThroughTimestamp = Math.floor(Date.now() / 60_000) * 60_000 - 1;
      const knownConfirmedTimestamps = initialCachedBars
        .filter((bar) => bar.timestamp <= confirmedThroughTimestamp)
        .map((bar) => bar.timestamp);
      const needsMlptMinimumBackfill =
        isRealtimeHistory &&
        isMlptEnabled &&
        knownConfirmedTimestamps.length < mlptMinimumHistoryBars;
      const cacheMetadata = readMarketBarCacheSummary().entries.find((entry) =>
        entry.symbol === activeSymbol.dataSymbol && entry.market === activeSymbol.market && entry.timeframe === cacheTimeframe,
      );
      const cacheFreshness = evaluateMarketCacheFreshness(cacheTimeframe, cacheMetadata?.updatedAt);
      const sessionStatus = getMarketRuntimeSessionStatus(activeSymbol.market);
      recordMarketEvent(
        initialCachedBars.length > 0 && cacheFreshness.state === "fresh" ? "cache-hit" : cacheFreshness.state === "stale" ? "cache-stale" : "sync-started",
        initialCachedBars.length > 0 ? `${activeSymbol.symbol} ${formatTimeframeLabel(timeframe)} 缓存 ${cacheFreshness.state === "fresh" ? "命中" : "已过期"}，共 ${initialCachedBars.length} 根` : `${activeSymbol.symbol} ${formatTimeframeLabel(timeframe)} 开始同步`,
      );
      setChartLoadState(
        createChartLoadState(
          "history",
          activeSymbol.symbol,
          timeframe,
          initialCachedBars.length,
        ),
      );
      setWatchlistDataStatusByKey((current) => ({ ...current, [getWatchlistDataKey(activeSymbol)]: "syncing" }));

      if (
        !isRealtimeHistory &&
        !sessionStatus.isOpen &&
        cacheFreshness.state === "fresh" &&
        hasRenderableChartData(timeframe, initialCachedBars.length) &&
        hasSufficientHistoricalChartCache(timeframe, initialCachedBars.length)
      ) {
        setChartLoadState(createChartLoadState("ready", activeSymbol.symbol, timeframe, initialCachedBars.length, `${activeSymbol.symbol} ${formatTimeframeLabel(timeframe)} 市场已收盘，使用有效本地缓存。`));
        setWatchlistDataStatusByKey((current) => ({ ...current, [getWatchlistDataKey(activeSymbol)]: "cache" }));
        recordMarketEvent("market-closed", `${activeSymbol.symbol} 市场已收盘，历史缓存仍有效，跳过远端刷新`);
        return;
      }

      try {
        const marketDataAccess = await createChartMarketDataAccess({
          bridge: window.quantDesktop,
          enableStockSdkPrimary: marketDataProviderSettings.stockSdkPrimaryEnabled,
        });

        if (cancelled) {
          return;
        }

        if (isRealtimeHistory ? !marketDataAccess.hasIntradaySource : !marketDataAccess.hasHistoricalSource) {
          const waitingHealth = createRealtimeHealthView(
            "waiting",
            isRealtimeHistory ? "等待主行情源或备用源以加载历史分时" : "等待主行情源或备用源以加载历史 K 线",
          );
          setRealtimeHealth(waitingHealth);
          setRealtimeStatus(waitingHealth.message);
          setChartLoadState(createChartLoadState("error", activeSymbol.symbol, timeframe, initialCachedBars.length, waitingHealth.message));
          setWatchlistDataStatusByKey((current) => ({ ...current, [getWatchlistDataKey(activeSymbol)]: "error" }));
          return;
        }

        const barRequest = {
          symbol: activeSymbol.dataSymbol,
          market: activeSymbol.market,
          timeframe: isRealtimeHistory ? ("1m" as const) : timeframe,
          startTime: windowRange?.startTime,
          endTime: windowRange?.endTime,
          count: isRealtimeHistory ? realtimeHistoryRequirement.preferredBars : timeframe === "1w" ? 260 : 600,
        };
        const providerCapability = isRealtimeHistory ? "intradayBars" : "historicalBars";
        const result = await fetchChartBars({
          capability: providerCapability,
          request: barRequest,
          mlptHistory: needsMlptMinimumBackfill
            ? {
                targetBars: mlptMinimumHistoryBars,
                confirmedThroughTimestamp,
                knownTimestamps: knownConfirmedTimestamps,
              }
            : undefined,
          marketDataAccess,
        });

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          const cacheTimeframe: Timeframe = isRealtimeHistory ? "realtime" : timeframe;
          const cachedBars = readMarketBarCache({
            symbol: activeSymbol.dataSymbol,
            market: activeSymbol.market,
            timeframe: cacheTimeframe,
          });
          const failureMessage = cachedBars.length > 0
            ? `${result.error.message}；已保留本地缓存 ${cachedBars.length} 条，后台将继续重试。`
            : result.error.message;
          const errorHealth =
            result.health[0] !== undefined
              ? createRealtimeHealthViewFromGateway(result.health[0], failureMessage, {
                  capability: providerCapability,
                  triedProviders: result.triedProviders,
                })
              : createRealtimeHealthView("error", failureMessage);
          setRealtimeHealth(errorHealth);
          setRealtimeStatus(errorHealth.message);
          recordMarketEvent(result.health[0]?.status === "rateLimited" ? "rate-limited" : hasRenderableChartData(timeframe, cachedBars.length) ? "cache-retained" : "error", failureMessage);
          const hasCache = hasRenderableChartData(timeframe, cachedBars.length);
          setChartLoadState(createChartLoadState(hasCache ? "degraded" : "error", activeSymbol.symbol, timeframe, cachedBars.length, errorHealth.message));
          setWatchlistDataStatusByKey((current) => ({ ...current, [getWatchlistDataKey(activeSymbol)]: hasCache ? "degraded" : "error" }));
          return;
        }

        const resultBars = gatewayBarsToMarketDataBars(result.data, isRealtimeHistory ? "realtime" : undefined);

        if (resultBars.length < result.data.length) {
          recordMarketEvent("data-invalid", `${activeSymbol.symbol} ${formatTimeframeLabel(timeframe)} 已拒绝 ${result.data.length - resultBars.length} 条异常行情数据`);
        }

        if (resultBars.length === 0) {
          const emptyHealth = createRealtimeHealthView(
            "error",
            isRealtimeHistory
              ? "已连接的数据源未返回可用历史分时数据。请检查数据源状态或切换标的后重试。"
              : "已连接的数据源未返回可用历史 K 线。请检查数据源状态或切换标的后重试。",
          );
          setRealtimeHealth(emptyHealth);
          setRealtimeStatus(emptyHealth.message);
          recordMarketEvent("error", emptyHealth.message);
          setChartLoadState(createChartLoadState("error", activeSymbol.symbol, timeframe, initialCachedBars.length, emptyHealth.message));
          setWatchlistDataStatusByKey((current) => ({ ...current, [getWatchlistDataKey(activeSymbol)]: "error" }));
          return;
        }

        const cacheTimeframe: Timeframe = isRealtimeHistory ? "realtime" : timeframe;
        const cacheKey = { symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: cacheTimeframe };
        const currentCachedBars = readMarketBarCache(cacheKey);
        const prioritizedHistoryBars =
          isRealtimeHistory && isMlptEnabled
            ? mergeMlptBarsByProviderPriority([...currentCachedBars, ...resultBars])
            : resultBars;
        const mergedBars = isRealtimeHistory
          ? mergeHistoricalRealtimeBarsWithLiveBars(prioritizedHistoryBars, currentCachedBars, {
            symbol: activeSymbol.dataSymbol,
            market: activeSymbol.market,
            timeframe: "realtime",
            }, realtimeHistoryRequirement.sessionCount)
          : resultBars;
        const written = writeMarketBarCache(cacheKey, mergedBars, {
          mergeExisting: !isRealtimeHistory,
          historicalCompletion: result.historicalCompletion
            ? {
                targetBars: result.historicalCompletion.targetBars,
                confirmedBars: result.historicalCompletion.confirmedBars,
                targetSatisfied: result.historicalCompletion.targetSatisfied,
                stopReason: result.historicalCompletion.stopReason,
              }
            : undefined,
        });
        setCachedMarketBars(written);
        setChartLoadState(createChartLoadState("layers", activeSymbol.symbol, timeframe, written.length));
        setWatchlistDataStatusByKey((current) => ({ ...current, [getWatchlistDataKey(activeSymbol)]: "ready" }));
        const gapStatus =
          isRealtimeHistory && windowRange?.isMarketOpen
            ? formatRealtimeGapStatus(written, {
                symbol: activeSymbol.dataSymbol,
                market: activeSymbol.market,
                timeframe: "realtime",
              })
            : null;
        recordMarketEvent("sync-completed", `${activeSymbol.symbol} ${formatTimeframeLabel(timeframe)} 同步完成，共 ${written.length} 根`);
        if (gapStatus) recordMarketEvent("delayed-gap", gapStatus);

        const historicalMessage = gapStatus
          ? gapStatus
          : isRealtimeHistory && windowRange
          ? windowRange.isMarketOpen
            ? `历史分时已加载 ${written.length} 点，实时源继续补充走势`
            : `历史分时已加载 ${written.length} 点，收盘后停止追加`
          : `历史 K 线已加载 ${written.length} 根`;
        const healthView = createRealtimeHealthViewFromGateway(result.health, historicalMessage, {
          capability: providerCapability,
          triedProviders: result.triedProviders,
        });
        setRealtimeHealth(healthView);
        setRealtimeStatus(formatRealtimeHealthDetail(healthView));
        if (isRealtimeHistory && isMlptEnabled) {
          const confirmedBars = written.filter((bar) => bar.timestamp <= confirmedThroughTimestamp).length;
          const contributionText = result.historicalCompletion?.contributions
            .map((item) => `${item.provider} ${item.bars}`)
            .join(" + ");
          setMlptHistoryStatus(
            contributionText
              ? `${contributionText}，MLPT 已有 ${confirmedBars} 根已确认分钟线`
              : `MLPT 已有 ${confirmedBars} 根已确认分钟线`,
          );

          if (confirmedBars < mlptPreferredHistoryBars) {
            const minimumCoverageStatus =
              confirmedBars >= mlptMinimumHistoryBars
                ? "MLPT 历史最低要求已满足"
                : `MLPT 历史仍不足 ${confirmedBars}/${mlptMinimumHistoryBars}`;
            setMlptHistoryStatus(`${minimumCoverageStatus}，后台补全 ${confirmedBars}/${mlptPreferredHistoryBars}`);
            void fetchChartBars({
              capability: "intradayBars",
              request: {
                ...barRequest,
                timeframe: "1m",
                count: mlptPreferredHistoryBars,
              },
              mlptHistory: {
                targetBars: mlptPreferredHistoryBars,
                confirmedThroughTimestamp,
                knownTimestamps: written
                  .filter((bar) => bar.timestamp <= confirmedThroughTimestamp)
                  .map((bar) => bar.timestamp),
              },
              marketDataAccess,
            }).then((backfillResult) => {
              if (cancelled || !backfillResult.ok) return;
              const backfillBars = gatewayBarsToMarketDataBars(backfillResult.data, "realtime");
              const latestCachedBars = readMarketBarCache(cacheKey);
              const prioritizedBars = mergeMlptBarsByProviderPriority([
                ...latestCachedBars,
                ...backfillBars,
              ]);
              const completedBars = mergeHistoricalRealtimeBarsWithLiveBars(
                prioritizedBars,
                latestCachedBars,
                {
                  symbol: activeSymbol.dataSymbol,
                  market: activeSymbol.market,
                  timeframe: "realtime",
                },
                realtimeHistoryRequirement.sessionCount,
              );
              const completed = writeMarketBarCache(cacheKey, completedBars, {
                historicalCompletion: backfillResult.historicalCompletion
                  ? {
                      targetBars: backfillResult.historicalCompletion.targetBars,
                      confirmedBars: backfillResult.historicalCompletion.confirmedBars,
                      targetSatisfied: backfillResult.historicalCompletion.targetSatisfied,
                      stopReason: backfillResult.historicalCompletion.stopReason,
                    }
                  : undefined,
              });
              setCachedMarketBars(completed);
              const completedConfirmedBars = completed.filter(
                (bar) => bar.timestamp <= confirmedThroughTimestamp,
              ).length;
              const completedContributions = backfillResult.historicalCompletion?.contributions
                .map((item) => `${item.provider} ${item.bars}`)
                .join(" + ");
              setMlptHistoryStatus(
                `${completedContributions ? `${completedContributions}，` : ""}MLPT 历史 ${completedConfirmedBars}/${mlptPreferredHistoryBars}`,
              );
              recordMarketEvent(
                "sync-completed",
                `${activeSymbol.symbol} MLPT 历史补全至 ${completedConfirmedBars} 根`,
              );
            }).catch(() => {
              if (!cancelled) {
                setMlptHistoryStatus(
                  confirmedBars >= mlptMinimumHistoryBars
                    ? `MLPT 历史最低要求已满足，暂未补全至 ${mlptPreferredHistoryBars} 根`
                    : `MLPT 历史仍不足 ${confirmedBars}/${mlptMinimumHistoryBars}`,
                );
              }
            });
          }
        } else {
          setMlptHistoryStatus(null);
        }
        window.requestAnimationFrame(() => {
          if (!cancelled) {
            setChartLoadState(createChartLoadState("ready", activeSymbol.symbol, timeframe, written.length));
          }
        });
      } catch (error) {
        const errorHealth = createRealtimeHealthView("error", getErrorMessage(error));
        setRealtimeHealth(errorHealth);
        setRealtimeStatus(errorHealth.message);
        recordMarketEvent("error", errorHealth.message);
        const cachedBars = readMarketBarCache({ symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: cacheTimeframe });
        const hasCache = hasRenderableChartData(timeframe, cachedBars.length);
        setChartLoadState(createChartLoadState(hasCache ? "degraded" : "error", activeSymbol.symbol, timeframe, cachedBars.length, errorHealth.message));
        setWatchlistDataStatusByKey((current) => ({ ...current, [getWatchlistDataKey(activeSymbol)]: hasCache ? "degraded" : "error" }));
      }
    };

    void loadMarketDataHistory();

    return () => {
      cancelled = true;
    };
  }, [
    activeSymbol.dataSymbol,
    activeSymbol.market,
    marketDataProviderSettings.stockSdkPrimaryEnabled,
    isMlptEnabled,
    realtimeHistoryRequirement.preferredBars,
    realtimeHistoryRequirement.sessionCount,
    timeframe,
  ]);

  useEffect(() => {
    let cancelled = false;

    const warmWatchlistCaches = async () => {
      const marketDataAccess = await createChartMarketDataAccess({
        bridge: window.quantDesktop,
        enableStockSdkPrimary: marketDataProviderSettings.stockSdkPrimaryEnabled,
      });
      const plan = createChartWatchlistWarmupPlan(
        watchlist.map((item) => ({ market: item.market, symbol: item.dataSymbol })),
        { market: activeSymbol.market, symbol: activeSymbol.dataSymbol },
      ).filter((task) => task.priority === "background" || task.timeframe !== timeframe);

      for (const task of plan) {
        if (cancelled) return;

        const cacheTimeframe = getChartCacheTimeframe(task.timeframe);
        const cacheKey = { symbol: task.symbol, market: task.market, timeframe: cacheTimeframe };
        const cachedBars = readMarketBarCache(cacheKey);
        const metadata = readMarketBarCacheSummary().entries.find(
          (entry) => entry.symbol === cacheKey.symbol && entry.market === cacheKey.market && entry.timeframe === cacheKey.timeframe,
        );
        const isFresh = isChartWarmupCacheFresh(cacheTimeframe, metadata?.updatedAt);

        if (isFresh && hasRenderableChartData(task.timeframe, cachedBars.length) && hasSufficientHistoricalChartCache(task.timeframe, cachedBars.length)) {
          setWatchlistDataStatusByKey((current) => ({ ...current, [`${task.market}:${task.symbol}`]: "cache" }));
          continue;
        }

        setWatchlistDataStatusByKey((current) => ({ ...current, [`${task.market}:${task.symbol}`]: "syncing" }));
        const isIntraday = task.timeframe === "realtime";
        const historyWindow = isIntraday
          ? getIntradayHistoryWindow(task.market, Date.now(), realtimeHistoryRequirement.sessionCount)
          : null;

        if (isIntraday ? !marketDataAccess.hasIntradaySource : !marketDataAccess.hasHistoricalSource) {
          setWatchlistDataStatusByKey((current) => ({
            ...current,
            [`${task.market}:${task.symbol}`]: hasRenderableChartData(task.timeframe, cachedBars.length) ? "degraded" : "error",
          }));
          continue;
        }

        const result = await fetchChartBars({
          capability: isIntraday ? "intradayBars" : "historicalBars",
          marketDataAccess,
          request: {
            symbol: task.symbol,
            market: task.market,
            timeframe: isIntraday ? "1m" : task.timeframe,
            startTime: historyWindow?.startTime,
            endTime: historyWindow?.endTime,
            count: isIntraday ? realtimeHistoryRequirement.preferredBars : task.timeframe === "1w" ? 260 : 600,
          },
        });

        if (cancelled) return;

        if (!result.ok) {
          setWatchlistDataStatusByKey((current) => ({
            ...current,
            [`${task.market}:${task.symbol}`]: hasRenderableChartData(task.timeframe, cachedBars.length) ? "degraded" : "error",
          }));
          continue;
        }

        const resultBars = gatewayBarsToMarketDataBars(result.data, isIntraday ? "realtime" : undefined);
        const nextBars = isIntraday
          ? mergeHistoricalRealtimeBarsWithLiveBars(resultBars, cachedBars, cacheKey, realtimeHistoryRequirement.sessionCount)
          : resultBars;
        const written = writeMarketBarCache(cacheKey, nextBars, { mergeExisting: !isIntraday });
        setWatchlistDataStatusByKey((current) => ({
          ...current,
          [`${task.market}:${task.symbol}`]: hasRenderableChartData(task.timeframe, written.length) ? "ready" : "error",
        }));
      }
    };

    void warmWatchlistCaches().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    activeSymbol.dataSymbol,
    activeSymbol.market,
    marketDataProviderSettings.stockSdkPrimaryEnabled,
    realtimeHistoryRequirement.preferredBars,
    realtimeHistoryRequirement.sessionCount,
    watchlist,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!enableAlphaFeedHistoricalIntradayBackfill || timeframe !== "realtime") {
      return () => undefined;
    }

    const loadIntradayHistory = async () => {
      const windowRange = getIntradayHistoryWindow(activeSymbol.market, Date.now(), realtimeHistoryRequirement.sessionCount);

      try {
        const marketDataAccess = await createChartMarketDataAccess({
          bridge: window.quantDesktop,
          enableStockSdkPrimary: marketDataProviderSettings.stockSdkPrimaryEnabled,
        });

        if (cancelled) {
          return;
        }

        if (!marketDataAccess.hasIntradaySource) {
          const waitingHealth = createRealtimeHealthView("waiting", "等待备用源凭据以加载历史分时");
          setRealtimeHealth(waitingHealth);
          setRealtimeStatus(waitingHealth.message);
          return;
        }

        const result = await fetchChartBars({
          capability: "intradayBars",
          request: {
            symbol: activeSymbol.dataSymbol,
            market: activeSymbol.market,
            timeframe: "1m",
            startTime: windowRange.startTime,
            endTime: windowRange.endTime,
            count: realtimeHistoryRequirement.preferredBars,
          },
          marketDataAccess,
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
          const emptyHealth = createRealtimeHealthView("waiting", "备用源暂无历史分时数据");
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
  }, [
    activeSymbol.dataSymbol,
    activeSymbol.market,
    realtimeHistoryRequirement.preferredBars,
    realtimeHistoryRequirement.sessionCount,
    timeframe,
  ]);

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
        const streamMode = window.quantDesktop?.marketData ? "watchlist" : undefined;
        const marketDataAccess = await createChartMarketDataAccess({
          bridge: window.quantDesktop,
          enableStockSdkPrimary: marketDataProviderSettings.stockSdkPrimaryEnabled,
        });
        disconnectQuoteStream = () =>
          disconnectQuoteStreamForChart({
            marketDataAccess,
          });

        if (cancelled) {
          return;
        }

        if (!marketDataAccess.hasQuoteSource && !marketDataAccess.hasStreamSource) {
          const waitingHealth = createRealtimeHealthView("waiting", "等待主行情源或备用实时源");
          setRealtimeHealth(waitingHealth);
          setRealtimeStatus(waitingHealth.message);
          timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
          return;
        }

        if (marketDataAccess.hasStreamSource) {
          const connectHealth = await connectQuoteStreamForChart({
            items: currentRealtimeWatchlist,
            marketDataAccess,
            alphaFeedStreamMode: streamMode,
          });

          if (cancelled) {
            return;
          }

          const streamResult = await readQuoteStreamSnapshotForChart({
            items: currentRealtimeWatchlist,
            marketDataAccess,
          });

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

          if (!marketDataAccess.hasQuoteSource) {
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

        if (!marketDataAccess.hasQuoteSource) {
          const waitingHealth = createRealtimeHealthView("waiting", "等待主行情源或备用 REST 实时源");
          setRealtimeHealth(waitingHealth);
          setRealtimeStatus(waitingHealth.message);
          timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
          return;
        }

        const batches = createQuotePollingBatches(currentRealtimeWatchlist);
        const snapshots: MarketQuoteSnapshot[] = [];
        let latestHealth: MarketDataProviderHealthView | null = null;
        let latestTriedProviders: readonly GatewayMarketDataProviderId[] = [];

        for (const batch of batches) {
          const result = await fetchQuoteSnapshotBatch({
            batch,
            marketDataAccess,
          });

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
    currentRealtimeWatchlist,
    marketDataProviderSettings.stockSdkPrimaryEnabled,
    realtimeHistoryRequirement.sessionCount,
    realtimePollIntervalMs,
    timeframe,
  ]);

  useEffect(() => {
    const preferences: ChartWorkspacePreferences = {
      version: 6,
      showSignals,
      showStrategyLayers,
      showCrosshair,
      showGrid,
      secondaryPaneRatio,
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
    secondaryPaneRatio,
    showPriceLabels,
    showSignals,
    showStrategyLayers,
    strategySettings,
  ]);

  const runInstrumentSearch = async () => {
    const query = instrumentSearchQuery.trim();
    if (!query) {
      setInstrumentSearchResults([]);
      setInstrumentSearchState("empty");
      setInstrumentSearchMessage("请输入股票代码、名称或拼音。");
      return;
    }

    setInstrumentSearchState("loading");
    setInstrumentSearchMessage("");
    try {
      const marketDataAccess = await createChartMarketDataAccess({
        bridge: window.quantDesktop,
        enableStockSdkPrimary: marketDataProviderSettings.stockSdkPrimaryEnabled,
      });
      const result = await marketDataAccess.searchInstruments(query, ["US", "HK", "CN"]);
      if (!result.ok) {
        setInstrumentSearchResults([]);
        setInstrumentSearchState("error");
        setInstrumentSearchMessage(result.error.message);
        return;
      }
      setInstrumentSearchResults(result.data);
      setInstrumentSearchState(result.data.length > 0 ? "idle" : "empty");
      setInstrumentSearchMessage(result.data.length > 0 ? "" : "未找到可加入观察列表的证券。");
    } catch (error) {
      setInstrumentSearchResults([]);
      setInstrumentSearchState("error");
      setInstrumentSearchMessage(getErrorMessage(error));
    }
  };

  const addInstrumentToWatchlist = (item: { symbol: string; name: string; market: Market }) => {
    const nextItem = toChartWatchlistItem({ ...item, source: "user" });
    const nextWatchlist = watchlist.some((candidate) => candidate.market === nextItem.market && candidate.dataSymbol === nextItem.dataSymbol)
      ? watchlist
      : [...watchlist, nextItem];
    writeMarketWatchlist(nextWatchlist.map((candidate) => ({ symbol: candidate.dataSymbol, name: candidate.name, market: candidate.market, source: "user" })));
    setWatchlist(nextWatchlist);
    setActiveSymbol(nextItem);
    setIsInstrumentSearchOpen(false);
  };

  const removeWatchlistItem = (item: ChartWatchlistItem) => {
    if (watchlist.length <= 1) {
      return;
    }
    const nextWatchlist = watchlist.filter((candidate) => candidate.market !== item.market || candidate.dataSymbol !== item.dataSymbol);
    writeMarketWatchlist(nextWatchlist.map((candidate) => ({ symbol: candidate.dataSymbol, name: candidate.name, market: candidate.market, source: "user" })));
    setWatchlist(nextWatchlist);
    if (activeSymbol.market === item.market && activeSymbol.dataSymbol === item.dataSymbol) {
      setActiveSymbol(nextWatchlist[0]!);
    }
  };

  const updateDrawings = (nextDrawings: ChartDrawing[]) => {
    writeChartDrawings({ market: activeSymbol.market, symbol: activeSymbol.dataSymbol, timeframe }, nextDrawings);
    setDrawings(nextDrawings);
  };
  const executeDrawingCommand = (command: ChartDrawingCommand) => {
    const next = executeChartDrawingCommand(drawingCommandState, command);
    if (next === drawingCommandState) return;
    updateDrawings([...next.drawings]);
    setDrawingCommandState(next);
  };
  const undoDrawingCommand = () => {
    const next = undoChartDrawingCommand(drawingCommandState);
    if (next === drawingCommandState) return;
    updateDrawings([...next.drawings]);
    setDrawingCommandState(next);
  };
  const redoDrawingCommand = () => {
    const next = redoChartDrawingCommand(drawingCommandState);
    if (next === drawingCommandState) return;
    updateDrawings([...next.drawings]);
    setDrawingCommandState(next);
  };
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDrawingTool(null);
        setPendingTrendPoint(null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedDrawingId && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        deleteDrawing(selectedDrawingId);
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoDrawingCommand(); else undoDrawingCommand();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoDrawingCommand();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawingCommandState, selectedDrawingId]);

  const createDrawing = (type: ChartDrawing["type"]) => {
    const last = cachedCandles[cachedCandles.length - 1];
    const previous = cachedCandles[Math.max(0, cachedCandles.length - 6)] ?? last;
    if (!last || !previous) return;
    const createdAt = new Date().toISOString();
    const id = `drawing-${Date.now()}`;
    const drawing: ChartDrawing = type === "trend-line"
      ? { id, type, visible: true, createdAt, points: [{ timestamp: previous.timestamp ?? 0, price: previous.close }, { timestamp: last.timestamp ?? 0, price: last.close }] }
      : type === "horizontal-line"
        ? { id, type, visible: true, createdAt, price: last.close, label: "参考线" }
        : { id, type, visible: true, createdAt, timestamp: last.timestamp ?? 0, price: last.close, text: "标注" };
    executeDrawingCommand({ type: "add", drawing });
    setSelectedDrawingId(id);
  };
  const placeDrawingPoint = (point: { timestamp: number; price: number }) => {
    if (!activeDrawingTool) return;
    const createdAt = new Date().toISOString();
    if (activeDrawingTool === "trend-line") {
      if (!pendingTrendPoint) {
        setPendingTrendPoint(point);
        return;
      }
      const drawing: ChartDrawing = { id: `drawing-${Date.now()}`, type: "trend-line", visible: true, createdAt, points: [pendingTrendPoint, point] };
      executeDrawingCommand({ type: "add", drawing });
      setSelectedDrawingId(drawing.id);
      setPendingTrendPoint(null);
      setActiveDrawingTool(null);
      return;
    }
    const drawing: ChartDrawing = activeDrawingTool === "horizontal-line"
      ? { id: `drawing-${Date.now()}`, type: "horizontal-line", visible: true, createdAt, price: point.price, label: "参考线" }
      : { id: `drawing-${Date.now()}`, type: "text", visible: true, createdAt, timestamp: point.timestamp, price: point.price, text: "标注" };
    executeDrawingCommand({ type: "add", drawing });
    setSelectedDrawingId(drawing.id);
    setActiveDrawingTool(null);
  };
  const moveDrawing = (drawingId: string, pointIndex: number | null, point: { timestamp: number; price: number }) => {
    const drawing = drawings.find((item) => item.id === drawingId);
    if (!drawing) return;
    if (drawing.type === "trend-line" && pointIndex !== null) {
      const points = [...drawing.points] as [{ timestamp: number; price: number }, { timestamp: number; price: number }];
      points[pointIndex] = point;
      updateDrawings(drawings.map((item) => item.id === drawingId ? { ...drawing, points } : item));
      return;
    }
    if (drawing.type === "horizontal-line") updateDrawings(drawings.map((item) => item.id === drawingId ? { ...drawing, price: point.price } : item));
    if (drawing.type === "text") updateDrawings(drawings.map((item) => item.id === drawingId ? { ...drawing, timestamp: point.timestamp, price: point.price } : item));
  };

  const toggleDrawingVisibility = (drawingId: string) => {
    const drawing = drawings.find((item) => item.id === drawingId);
    if (drawing) executeDrawingCommand({ type: "update", drawingId, drawing: { ...drawing, visible: !drawing.visible } });
  };
  const deleteDrawing = (drawingId: string) => {
    executeDrawingCommand({ type: "delete", drawingId });
    setSelectedDrawingId((current) => current === drawingId ? null : current);
  };

  const editDrawing = (drawingId: string) => {
    const drawing = drawings.find((item) => item.id === drawingId);
    if (!drawing) return;
    if (drawing.type === "text") {
      const text = window.prompt("标注文字", drawing.text)?.trim();
      if (text) executeDrawingCommand({ type: "update", drawingId, drawing: { ...drawing, text } });
      return;
    }
    if (drawing.type === "horizontal-line") {
      const price = Number(window.prompt("参考线价格", String(drawing.price)));
      if (Number.isFinite(price) && price > 0) executeDrawingCommand({ type: "update", drawingId, drawing: { ...drawing, price } });
      return;
    }
    const endpoint = Number(window.prompt("趋势线终点价格", String(drawing.points[1].price)));
    if (Number.isFinite(endpoint) && endpoint > 0) executeDrawingCommand({ type: "update", drawingId, drawing: { ...drawing, points: [drawing.points[0], { ...drawing.points[1], price: endpoint }] } });
  };

  const openDiagnostics = async () => {
    setIsDiagnosticsOpen(true);
    const bridge = window.quantDesktop?.marketData;
    if (!bridge) {
      setProviderDiagnostics([]);
      return;
    }
    const result = await bridge.getProviderStatus({ source: "diagnostics" });
    setProviderDiagnostics(result.ok ? result.data.providers : result.error.health);
  };

  const moveLayer = (layerId: string, direction: -1 | 1) => {
    setLayerOrder((current) => {
      const ordered = [...current.filter((id) => availableLayerIds.includes(id)), ...availableLayerIds.filter((id) => !current.includes(id))];
      const index = ordered.indexOf(layerId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return ordered;
      [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
      return ordered;
    });
  };

  return (
    <section className={isBottomDockExpanded ? "chart-workspace-page bottom-dock-expanded" : "chart-workspace-page"}>
      <header className="chart-topbar">
        <div className="symbol-search">
          <span>{activeSymbol.market}</span>
          <strong>{activeSymbol.symbol}</strong>
          <small>{activeSymbol.name}</small>
          <em className={cachedCandles.length > 0 ? "data-source-badge live" : "data-source-badge"}>{cachedCandles.length > 0 ? "本地缓存" : "等待数据"}</em>
          <em
            aria-label={formatRealtimeHealthDetail(realtimeHealth)}
            className={`${getRealtimeHealthBadgeClass(realtimeHealth.status)} chart-provider-status`}
            title={realtimeStatus}
          >
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
          <div className="strategy-quick-menu" ref={strategyMenuRef}>
            <button
              aria-controls="chart-strategy-quick-menu"
              aria-expanded={isStrategyMenuOpen}
              aria-haspopup="dialog"
              className={isStrategyMenuOpen ? "active strategy-quick-menu-trigger" : "strategy-quick-menu-trigger"}
              onClick={() => setIsStrategyMenuOpen((value) => !value)}
              ref={strategyMenuButtonRef}
              type="button"
            >
              <Layers3 size={16} />
              <span>策略</span>
              <small>{enabledStrategyCount}</small>
              <ChevronDown className={isStrategyMenuOpen ? "expanded" : ""} size={13} />
            </button>

            {isStrategyMenuOpen && (
              <section
                aria-label="策略快捷菜单"
                className="strategy-quick-menu-panel"
                id="chart-strategy-quick-menu"
                role="dialog"
              >
                <header>
                  <span>
                    <strong>可用策略</strong>
                    <small>{strategyQuickMenuItems.length} 个策略 · {enabledStrategyCount} 个已打开</small>
                  </span>
                </header>

                <div className="strategy-quick-menu-list" role="list">
                  {strategyQuickMenuItems.map((item) => (
                    <div className={item.enabled ? "strategy-quick-menu-item active" : "strategy-quick-menu-item"} key={item.key} role="listitem">
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.sourceType === "preset" ? "内置策略" : item.sourceType === "user" ? "用户策略" : "插件策略"}</small>
                      </span>
                      <div>
                        <button
                          aria-label={`${item.name} 打开`}
                          aria-pressed={item.enabled}
                          className={item.enabled ? "active" : ""}
                          onClick={() => updateStrategyState(item.key, toggleStrategyFromQuickMenu)}
                          type="button"
                        >
                          <Power size={13} />
                          {item.enabled ? "已打开" : "打开"}
                        </button>
                        <button
                          aria-label={`${item.name} 参数调整`}
                          onClick={() => {
                            setIsStrategyMenuOpen(false);
                            setActiveConfigStrategyKey(item.key);
                          }}
                          title={item.hasParameters ? "调整策略参数" : "查看策略配置"}
                          type="button"
                        >
                          <SlidersHorizontal size={13} />
                          参数
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
          <IndicatorQuickMenu
            definitions={allIndicatorDefinitions}
            market={activeSymbol.market}
            onOpenParameters={setActiveIndicatorConfigId}
            settings={indicatorSettings}
            updateSettings={updateIndicatorSettings}
          />
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
          <button
            aria-label={isWatchlistCollapsed ? "show watchlist" : "hide watchlist"}
            className={!isWatchlistCollapsed ? "active" : ""}
            onClick={() => setIsWatchlistCollapsed((value) => !value)}
            type="button"
          >
            {isWatchlistCollapsed ? <ChevronRight size={16} /> : <Eye size={16} />}
            <span>观察</span>
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

      <div className={isWatchlistCollapsed ? "chart-workspace-grid watchlist-collapsed" : "chart-workspace-grid"}>
        <aside className="chart-tool-rail" aria-label="画线工具">
          <button className="active" type="button" title="光标">
            <MousePointer2 size={18} />
          </button>
          <button type="button" title="十字光标">
            <Crosshair size={18} />
          </button>
          <button className={activeDrawingTool === "trend-line" ? "active" : ""} onClick={() => { setActiveDrawingTool("trend-line"); setPendingTrendPoint(null); }} type="button" title="绘制趋势线">
            <PencilLine size={18} />
          </button>
          <button className={activeDrawingTool === "horizontal-line" ? "active" : ""} onClick={() => { setActiveDrawingTool("horizontal-line"); setPendingTrendPoint(null); }} type="button" title="绘制水平线">
            <Ruler size={18} />
          </button>
          <button className={activeDrawingTool === "text" ? "active" : ""} onClick={() => { setActiveDrawingTool("text"); setPendingTrendPoint(null); }} type="button" title="添加文字标注"><Type size={18} /></button>
          <button disabled={!activeDrawingTool} onClick={() => { setActiveDrawingTool(null); setPendingTrendPoint(null); }} type="button" title="取消当前绘图工具"><X size={18} /></button>
          <button onClick={() => setChartFocusLatestKey((value) => value + 1)} type="button" title="回到最新数据"><RotateCcw size={18} /></button>
          <button className={isPriceScaleLocked ? "active" : ""} onClick={() => setIsPriceScaleLocked((value) => !value)} type="button" title={isPriceScaleLocked ? "解锁价格比例" : "锁定价格比例"}><Ruler size={18} /></button>
          <button disabled={drawingCommandState.undoStack.length === 0} onClick={undoDrawingCommand} type="button" title="撤销绘图"><Undo2 size={18} /></button>
          <button disabled={drawingCommandState.redoStack.length === 0} onClick={redoDrawingCommand} type="button" title="重做绘图"><Redo2 size={18} /></button>
          <button disabled={drawings.length === 0} onClick={() => { executeDrawingCommand({ type: "clear" }); setSelectedDrawingId(null); }} type="button" title="清空当前标的和周期的绘图"><Trash2 size={18} /></button>
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
            showPriceLabels={showPriceLabels}
            showSignals={showSignals}
            showStrategyLayers={canShowStrategyLayers}
            secondaryPane={secondaryIndicatorEvaluation?.pane}
            secondaryPaneRatio={secondaryPaneRatio}
            onSecondaryPaneRatioChange={setSecondaryPaneRatio}
            onSecondaryPaneClose={() => {
              if (secondaryIndicatorEvaluation) {
                updateIndicatorSettings((current) => setIndicatorEnabled(current, secondaryIndicatorEvaluation.id, false, allIndicatorDefinitions));
              }
            }}
            onSecondaryPaneSettings={() => {
              if (secondaryIndicatorEvaluation) setActiveIndicatorConfigId(secondaryIndicatorEvaluation.id);
            }}
            resetViewKey={chartResetViewKey}
            focusLatestKey={chartFocusLatestKey}
            lockPriceScale={isPriceScaleLocked}
            drawingTool={activeDrawingTool}
            onDrawingPoint={placeDrawingPoint}
            onDrawingElementSelect={setSelectedDrawingId}
            onDrawingElementMove={moveDrawing}
            strategyLayers={orderedStrategyLayers}
            layers={orderedExtraLayers}
            loadingState={chartViewportLoadingState}
          />
          {mlptChartNotice && chartHasRenderableData && (
            <div aria-live="polite" className="mlpt-chart-notice" role="status">
              <CircleAlert aria-hidden="true" size={14} />
              <span>{mlptChartNotice}</span>
            </div>
          )}
          {activeIndicatorConfigId && (() => {
            const definition = allIndicatorDefinitions.find((item) => item.id === activeIndicatorConfigId);
            if (!definition) return null;
            const instance = getIndicatorInstance(indicatorSettings, definition.id, definition);
            const parameters = getIndicatorParameters(instance, indicatorConvention);
            return (
              <section className="chart-settings-popover indicator-settings-popover" aria-label={`${definition.name} 参数`}>
                <div className="chart-settings-heading">
                  <span><strong>{definition.name} 参数</strong><small>{indicatorConvention === "a-share" ? "A 股口径" : "跨市场口径"}</small></span>
                  <button onClick={() => setActiveIndicatorConfigId(null)} type="button">关闭</button>
                </div>
                {definition.parameters.map((parameter) => (
                  <label key={parameter.key}>
                    <span>{parameter.label}</span>
                    <input
                      max={parameter.maximum}
                      min={parameter.minimum}
                      onChange={(event) => updateIndicatorSettings((current) =>
                        updateIndicatorParameter(current, definition.id, indicatorConvention, parameter.key, Number(event.currentTarget.value), definition))}
                      step={parameter.step}
                      type="number"
                      value={Number(parameters[parameter.key])}
                    />
                  </label>
                ))}
                <label className="parameter-toggle">
                  <span><strong>指标状态</strong><small>{definition.placement === "pane" ? "副图单选" : "主图可多选"}</small></span>
                  <input
                    checked={instance.enabled}
                    onChange={(event) => updateIndicatorSettings((current) => setIndicatorEnabled(current, definition.id, event.currentTarget.checked, allIndicatorDefinitions))}
                    type="checkbox"
                  />
                </label>
              </section>
            );
          })()}
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
              {timeframe === "realtime" && (
                <label className="chart-settings-select">
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
              <label className="chart-settings-select">
                <span>刷新频率</span>
                <select
                  aria-label="实时行情刷新频率"
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

        <aside className={isWatchlistCollapsed ? "watchlist-panel collapsed" : "watchlist-panel"}>
          <div className="panel-heading">
            <div>
              <p>观察列表</p>
              <h2>多市场</h2>
            </div>
            <button
              aria-label="搜索并添加证券"
              onClick={() => {
                setIsInstrumentSearchOpen(true);
                setInstrumentSearchState("idle");
                setInstrumentSearchMessage("");
              }}
              type="button"
              title="搜索并添加证券"
            >
              <Plus size={17} />
            </button>
            <button
              aria-label={isWatchlistCollapsed ? "show watchlist" : "hide watchlist"}
              onClick={() => setIsWatchlistCollapsed((value) => !value)}
              type="button"
              title={isWatchlistCollapsed ? "展开观察列表" : "折叠观察列表"}
            >
              {isWatchlistCollapsed ? <ChevronRight size={17} /> : <EyeOff size={17} />}
            </button>
          </div>

          <div className="watchlist-items">
            {watchlist.map((item) => {
              const snapshot = quoteSnapshotsByKey[`${item.market}:${item.dataSymbol}`];
              const change = formatQuoteChange(snapshot, item.change);
              const dataStatus = watchlistDataStatusByKey[getWatchlistDataKey(item)];

              return (
                <div
                  className={item.symbol === activeSymbol.symbol ? "active" : ""}
                  key={item.symbol}
                >
                  <button className="watchlist-item-select" onClick={() => selectActiveSymbol(item)} type="button">
                    <span>
                      <strong>{item.symbol}</strong>
                      <small>{item.name}</small>
                      <em className={`watchlist-data-status ${dataStatus ?? "syncing"}`}>{formatWatchlistDataStatus(dataStatus)}</em>
                    </span>
                    <span>
                      <strong>{formatQuotePrice(snapshot, item.price)}</strong>
                      <small className={change.startsWith("+") ? "positive" : "negative"}>{change}</small>
                    </span>
                  </button>
                  <button
                    aria-label={`移除 ${item.symbol}`}
                    className="watchlist-item-remove"
                    disabled={watchlist.length <= 1}
                    onClick={() => removeWatchlistItem(item)}
                    title="移除观察"
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {isInstrumentSearchOpen && (
        <div className="strategy-config-backdrop instrument-search-backdrop" role="presentation" onClick={() => setIsInstrumentSearchOpen(false)}>
          <section aria-label="搜索证券" className="instrument-search-dialog" role="dialog" onClick={(event) => event.stopPropagation()}>
            <div className="strategy-config-heading">
              <div>
                <p>证券搜索</p>
                <strong>添加到观察列表</strong>
              </div>
              <button aria-label="关闭搜索" onClick={() => setIsInstrumentSearchOpen(false)} type="button"><X size={16} /></button>
            </div>
            <form className="instrument-search-form" onSubmit={(event) => { event.preventDefault(); void runInstrumentSearch(); }}>
              <input autoFocus onChange={(event) => setInstrumentSearchQuery(event.currentTarget.value)} placeholder="代码、名称或拼音" value={instrumentSearchQuery} />
              <button type="submit"><Search size={16} />搜索</button>
            </form>
            {instrumentSearchState === "loading" && <p className="instrument-search-state"><LoaderCircle className="spin" size={16} /> 正在查询主行情源</p>}
            {instrumentSearchMessage && <p className={`instrument-search-state ${instrumentSearchState}`}>{instrumentSearchMessage}</p>}
            <div className="instrument-search-results">
              {instrumentSearchResults.map((item) => {
                const added = watchlist.some((candidate) => candidate.market === item.market && candidate.dataSymbol === item.symbol);
                return (
                  <div key={`${item.market}:${item.symbol}`}>
                    <span><strong>{item.symbol.replace(/\.(US|HK|SH|SZ)$/u, "")}</strong><small>{item.name} · {item.market}</small></span>
                    <button disabled={added} onClick={() => addInstrumentToWatchlist(item)} type="button">{added ? "已添加" : "添加"}</button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

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

                if (parameter.type === "color") {
                  return (
                    <label className="parameter-control parameter-color-control" htmlFor={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`} key={parameter.key}>
                      <span>{parameter.label}</span>
                      <span className="parameter-color-field">
                        <input
                          id={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                          onChange={(event) => updateStrategyParameter(activeConfigStrategyRun.strategy, parameter, event.currentTarget.value)}
                          type="color"
                          value={String(value)}
                        />
                        <code>{String(value).toUpperCase()}</code>
                      </span>
                    </label>
                  );
                }

                return (
                  <label className="parameter-control" htmlFor={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`} key={parameter.key}>
                    <span>{parameter.label}</span>
                    <input
                      id={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                      max={getNumberInputMaximum(parameter.key)}
                      min={getNumberInputMinimum(parameter.key)}
                      onChange={(event) => updateStrategyParameter(activeConfigStrategyRun.strategy, parameter, event.currentTarget.valueAsNumber)}
                      step={getNumberInputStep(parameter.key)}
                      type="number"
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

      <footer className={isBottomDockExpanded ? "chart-bottom-panel expanded" : "chart-bottom-panel"}>
        <div className="bottom-status-strip" aria-label="行情状态">
          <span className={getRealtimeHealthBadgeClass(realtimeHealth.status)}>{realtimeHealth.status}</span>
          <strong>{cachedCandles.length > 0 ? `${cachedCandles.length} 根K线` : "等待行情数据"}</strong>
          <em>{formatRealtimeHealthDetail(realtimeHealth)}</em>
          {mlptHistoryStatus && !mlptChartNotice && <small role="status">{mlptHistoryStatus}</small>}
          <small>更新 {formatStatusClock(realtimeHealth.checkedAt)}</small>
          <button aria-label="打开数据诊断" onClick={() => void openDiagnostics()} title="数据诊断" type="button"><Activity size={14} />诊断</button>
        </div>

        <div className="bottom-tabbar" role="tablist" aria-label="图表底部面板">
          <button
            className={bottomTab === "layers" ? "active" : ""}
            onClick={() => {
              setBottomTab("layers");
              setIsBottomDockExpanded(true);
            }}
            role="tab"
            type="button"
          >
            <Layers3 size={14} />
            图层
          </button>
          <button
            className={bottomTab === "signals" ? "active" : ""}
            onClick={() => {
              setBottomTab("signals");
              setIsBottomDockExpanded(true);
            }}
            role="tab"
            type="button"
          >
            <ShieldCheck size={14} />
            信号
          </button>
          <button
            className={bottomTab === "logs" ? "active" : ""}
            onClick={() => {
              setBottomTab("logs");
              setIsBottomDockExpanded(true);
            }}
            role="tab"
            type="button"
          >
            <TerminalSquare size={14} />
            日志
          </button>
          <button
            aria-label={isBottomDockExpanded ? "收起底部面板" : "展开底部面板"}
            className="bottom-dock-toggle"
            onClick={() => setIsBottomDockExpanded((value) => !value)}
            title={isBottomDockExpanded ? "收起底部面板" : "展开底部面板"}
            type="button"
          >
            <ChevronUp size={14} />
          </button>
        </div>

        <div className="bottom-panel-body">
          {bottomTab === "layers" && (
            <div className="bottom-strategy-panel">
              <div className="bottom-panel-heading">
                <strong>{enabledStrategyCount} 个策略启用</strong>
                <span>{canShowStrategyLayers ? `${totalSignalCount} 个信号，${strategyLayerElementCount} 个图层元素` : "策略图层已隐藏"}</span>
                <button
                  aria-label={showStrategyLayers ? "隐藏策略图层" : "显示策略图层"}
                  onClick={() => setShowStrategyLayers((value) => !value)}
                  type="button"
                >
                  {showStrategyLayers ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </div>
              <div className="bottom-layer-list">
                <div className="layer-item active">
                  <span><strong>K 线 / 价格<em className="strategy-source-badge system">基础图层</em></strong><small>主图价格序列</small></span>
                  <div className="layer-actions"><button className="active" disabled type="button">显示</button></div>
                </div>
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
                        <small>{`${result.output.render.elements.length} 个元素 · z${result.output.render.zIndex}`}</small>
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
                          <SlidersHorizontal size={13} />
                          参数
                        </button>
                        <button aria-label={`${strategy.name} 上移图层`} onClick={() => moveLayer(strategy.key, -1)} title="上移图层" type="button">上移</button>
                        <button aria-label={`${strategy.name} 下移图层`} onClick={() => moveLayer(strategy.key, 1)} title="下移图层" type="button">下移</button>
                      </div>
                    </div>
                  );
                })}
                {overlayIndicatorEvaluations.map((evaluation) => (
                  <div className="layer-item active" key={evaluation.layer.id}>
                    <span><strong>{evaluation.layer.name}<em className="strategy-source-badge plugin">指标</em></strong><small>{evaluation.layer.elements.length} 个渲染元素</small></span>
                    <div className="layer-actions">
                      {allIndicatorDefinitions.some((definition) => definition.id === evaluation.id && definition.parameters.length > 0) && (
                        <button onClick={() => setActiveIndicatorConfigId(evaluation.id)} type="button"><SlidersHorizontal size={13} />参数</button>
                      )}
                      <button onClick={() => updateIndicatorSettings((current) => setIndicatorEnabled(current, evaluation.id, false, allIndicatorDefinitions))} type="button">关闭</button>
                      <button onClick={() => moveLayer(evaluation.layer.id, -1)} title="上移图层" type="button">上移</button>
                      <button onClick={() => moveLayer(evaluation.layer.id, 1)} title="下移图层" type="button">下移</button>
                    </div>
                  </div>
                ))}
                {secondaryIndicatorEvaluation && (
                  <div className="layer-item active">
                    <span>
                      <strong>{secondaryIndicatorEvaluation.pane.name}<em className="strategy-source-badge plugin">副图指标</em></strong>
                      <small>{secondaryIndicatorEvaluation.pane.parameterSummary} · 独立纵轴</small>
                    </span>
                    <div className="layer-actions">
                      <button onClick={() => setActiveIndicatorConfigId(secondaryIndicatorEvaluation.id)} type="button"><SlidersHorizontal size={13} />参数</button>
                      <button onClick={() => updateIndicatorSettings((current) => setIndicatorEnabled(current, secondaryIndicatorEvaluation.id, false, allIndicatorDefinitions))} type="button">关闭</button>
                    </div>
                  </div>
                )}
                {drawings.map((drawing) => (
                  <div className={selectedDrawingId === drawing.id ? "layer-item active" : "layer-item"} key={drawing.id} onClick={() => setSelectedDrawingId((current) => current === drawing.id ? null : drawing.id)}>
                    <span><strong>{drawing.type === "trend-line" ? "趋势线" : drawing.type === "horizontal-line" ? "水平线" : "文字标注"}<em className="strategy-source-badge user">绘图</em></strong><small>{drawing.visible ? "显示中" : "已隐藏"}</small></span>
                    <div className="layer-actions"><button onClick={() => toggleDrawingVisibility(drawing.id)} type="button">{drawing.visible ? "隐藏" : "显示"}</button><button onClick={() => editDrawing(drawing.id)} type="button">编辑</button><button onClick={() => moveLayer(drawingLayer.id, -1)} title="上移图层" type="button">上移</button><button onClick={() => moveLayer(drawingLayer.id, 1)} title="下移图层" type="button">下移</button><button onClick={() => deleteDrawing(drawing.id)} type="button">删除</button></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bottomTab === "signals" && (
            <div className="bottom-single-panel">
              <div className="bottom-panel-heading">
                <strong>{signalRows.length > 0 ? `${signalRows.length} 个策略信号` : "暂无策略信号"}</strong>
                <span>仅展示当前标的和周期下的策略输出</span>
              </div>
              {signalRows.length > 0 ? (
                <div className="signal-detail-list" aria-label="策略信号明细">
                  {signalRows.map((signal) => (
                    <button aria-pressed={selectedSignal?.id === signal.id} className={`signal-detail-row ${signal.tone}${selectedSignal?.id === signal.id ? " active" : ""}`} key={signal.id} onClick={() => setSelectedSignalId(signal.id)} type="button">
                      <ShieldCheck size={14} />
                      <span>{signal.time}</span>
                      <strong>{signal.direction}</strong>
                      <small>{signal.price}</small>
                      <em>{signal.strategyName} / {signal.label}</em>
                    </button>
                  ))}
                </div>
              ) : (
                <span>当前参数下没有触发买卖信号。</span>
              )}
              {selectedSignal && selectedSignalRun && (
                <aside className="signal-research-inspector" aria-label="策略信号研究详情">
                  <div><strong>{selectedSignal.strategyName}</strong><button onClick={() => setSelectedSignalId(null)} type="button">关闭</button></div>
                  <span>{selectedSignal.direction} · {selectedSignal.price} · {selectedSignal.time}</span>
                  <small>{selectedSignal.label}</small>
                  <dl><dt>参数</dt><dd>{Object.entries(selectedSignalRun.settings.parameters).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "默认参数"}</dd><dt>日志</dt><dd>{selectedSignalRun.result.output.logs.at(-1) ?? "当前运行未产生额外日志"}</dd></dl>
                  <button onClick={() => { setActiveConfigStrategyKey(selectedSignal.strategyKey); setBottomTab("layers"); }} type="button">查看策略配置</button>
                </aside>
              )}
            </div>
          )}

          {bottomTab === "logs" && (
            <div className="bottom-single-panel">
              <div className="bottom-panel-heading">
                <strong>策略运行日志</strong>
                <span>{strategyLogItems.length} 条记录</span>
              </div>
              <div className="chart-log-list" role="log" aria-label="策略运行日志">
                {strategyLogItems.map((item, index) => {
                  const isAlert = item.toLowerCase().includes("alert");
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
          )}
        </div>
      </footer>

      {isDiagnosticsOpen && (
        <aside className="chart-diagnostics-drawer" aria-label="数据诊断">
          <div className="chart-settings-heading"><strong>数据诊断</strong><button onClick={() => setIsDiagnosticsOpen(false)} type="button">关闭</button></div>
          <section><p>当前状态</p><strong className={getRealtimeHealthBadgeClass(realtimeHealth.status)}>{realtimeHealth.status}</strong><small>{formatRealtimeHealthDetail(realtimeHealth)}</small></section>
          <section><p>供应商健康</p>{providerDiagnostics.length > 0 ? providerDiagnostics.map((health) => <div className="diagnostic-provider-row" key={health.provider}><span><strong>{health.provider}</strong><small>{health.message}</small></span><em className={getRealtimeHealthBadgeClass(health.status === "healthy" || health.status === "delayed" || health.status === "degraded" ? "ok" : health.status === "rateLimited" ? "rate_limited" : "network_error")}>{health.status}</em></div>) : <small>当前运行环境未暴露桌面诊断桥。图表仍会显示实时状态。</small>}</section>
          <section><p>最近事件</p>{diagnosticTimeline.map((entry) => <div className={`diagnostic-timeline-row ${entry.kind}`} key={`${entry.timestamp}-${entry.kind}-${entry.message}`}><time>{formatStatusClock(entry.timestamp)}</time><span><strong>{formatMarketDataRuntimeEventKind(entry.kind)}</strong>{entry.message}{entry.detail ? ` · ${entry.detail}` : ""}</span></div>)}</section>
        </aside>
      )}
    </section>
  );
}
