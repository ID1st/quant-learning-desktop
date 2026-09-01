import type { ChartDisplayMode } from "@quant/chart";
import type { Market, Timeframe } from "@quant/shared";
import {
  createPresetStrategyRegistry,
  type StrategyDefinition,
  type StrategyParameterDefinition,
  type StrategyRunResult,
} from "@quant/strategy-engine";
import type { ChartStrategyWorkspaceState } from "../features/strategies/chartStrategyRuntime";
import type { MarketDataBar } from "../features/marketData/marketBarCacheService";
import {
  readMarketWatchlist,
  type MarketQuoteSnapshot,
  type MarketWatchlistItem,
} from "../features/marketData/marketDataSyncService";
import {
  defaultRealtimePollIntervalMs,
  sanitizeRealtimePollIntervalMs,
} from "../features/marketData/realtimeQuotePollingService";
import { analyzeRealtimeHistoryGap } from "../features/marketData/realtimeIntradayBarService";
import type {
  ChartMarketDataAccess,
  ChartBarsBatchResult,
  ChartQuoteSnapshotBatchResult,
} from "../features/marketData/chartMarketDataGateway";
import {
  summarizeMarketDataProviderHealth,
  type MarketDataProviderDiagnosticSummary,
} from "../features/marketData/marketDataProviderDiagnostics";
import type {
  GatewayMarketDataProviderId,
  MarketDataProviderCapabilityKey,
  MarketDataProviderHealthView,
} from "../features/marketData/marketDataProviderGateway";

export const symbols: Array<{
  symbol: string;
  dataSymbol: string;
  name: string;
  market: Market;
  price: string;
  change: string;
}> = [
  {
    symbol: "AAPL",
    dataSymbol: "AAPL.US",
    name: "Apple Inc.",
    market: "US",
    price: "219.48",
    change: "+1.03%",
  },
  {
    symbol: "09988.HK",
    dataSymbol: "09988.HK",
    name: "阿里巴巴",
    market: "HK",
    price: "83.20",
    change: "+1.49%",
  },
  {
    symbol: "600519",
    dataSymbol: "600519.SH",
    name: "贵州茅台",
    market: "CN",
    price: "1468.10",
    change: "+0.54%",
  },
  {
    symbol: "TSLA",
    dataSymbol: "TSLA.US",
    name: "Tesla",
    market: "US",
    price: "188.14",
    change: "-0.82%",
  },
];

export type ChartWatchlistItem = (typeof symbols)[number];

export function toChartWatchlistItem(item: MarketWatchlistItem): ChartWatchlistItem {
  const defaultItem = symbols.find(
    (candidate) => candidate.dataSymbol === item.symbol && candidate.market === item.market,
  );
  return (
    defaultItem ?? {
      symbol: item.symbol.replace(/\.(US|HK|SH|SZ)$/u, ""),
      dataSymbol: item.symbol,
      name: item.name,
      market: item.market,
      price: "--",
      change: "--",
    }
  );
}

export function readChartWatchlist() {
  const items = readMarketWatchlist();
  return items.length > 0 ? items.map(toChartWatchlistItem) : symbols;
}

export const timeframes: Timeframe[] = ["realtime", "1d", "1w"];
export const realtimeRateLimitBackoffMs = 120_000;
export const enableAlphaFeedHistoricalIntradayBackfill = false;
export const longPortRealtimeDelayWarningMs = 5 * 60_000;
export const strategyRegistry = createPresetStrategyRegistry();
export const presetStrategies = strategyRegistry.list();
export const WORKSPACE_PREFERENCES_KEY = "quant-learning.chart-workspace-preferences";

export type StrategyWorkspaceState = ChartStrategyWorkspaceState;

export interface ChartWorkspacePreferences {
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

export type ChartBottomTab = "layers" | "signals" | "logs";
export type WatchlistDataStatus = "ready" | "syncing" | "cache" | "degraded" | "error";

export function getWatchlistDataKey(item: Pick<ChartWatchlistItem, "market" | "dataSymbol">) {
  return `${item.market}:${item.dataSymbol}`;
}

export function getChartCacheTimeframe(timeframe: Timeframe): Timeframe {
  return timeframe === "realtime" ? "realtime" : timeframe;
}

export function formatWatchlistDataStatus(status: WatchlistDataStatus | undefined) {
  const labels: Record<WatchlistDataStatus, string> = {
    ready: "已就绪",
    syncing: "同步中",
    cache: "使用缓存",
    degraded: "数据源降级",
    error: "加载失败",
  };
  return labels[status ?? "syncing"];
}

export interface ChartContextMenuState {
  x: number;
  y: number;
}

export function getDefaultParameters(strategy: StrategyDefinition) {
  return strategy.parameterSchema.reduce<Record<string, unknown>>((parameters, parameter) => {
    parameters[parameter.key] = parameter.defaultValue;
    return parameters;
  }, {});
}

export function getDefaultStrategyState(
  strategy: StrategyDefinition,
  index: number,
): StrategyWorkspaceState {
  return {
    enabled: strategy.defaultEnabled ?? index === 0,
    showLayer: true,
    parameters: getDefaultParameters(strategy),
  };
}

export function createDefaultWorkspacePreferences(): ChartWorkspacePreferences {
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
    strategies: presetStrategies.reduce<Record<string, StrategyWorkspaceState>>(
      (settings, strategy, index) => {
        settings[strategy.key] = getDefaultStrategyState(strategy, index);
        return settings;
      },
      {},
    ),
  };
}

export function sanitizeParameterValue(parameter: StrategyParameterDefinition, value: unknown) {
  if (parameter.type === "boolean") {
    return typeof value === "boolean" ? value : parameter.defaultValue;
  }

  if (parameter.type === "select") {
    const optionValues = parameter.options?.map((option) => option.value) ?? [];
    return typeof value === "string" && optionValues.includes(value)
      ? value
      : parameter.defaultValue;
  }

  if (parameter.type === "color") {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value.toUpperCase()
      : parameter.defaultValue;
  }

  if (parameter.type === "number") {
    const numericValue =
      typeof value === "number" && Number.isFinite(value) ? value : Number(parameter.defaultValue);
    const minimumValue = Number(getNumberInputMinimum(parameter.key));
    const maximumValue = Number(getNumberInputMaximum(parameter.key));
    return Math.min(maximumValue, Math.max(minimumValue, numericValue));
  }

  return parameter.defaultValue;
}

export function isFractionalStrategyParameter(parameterKey: string) {
  return [
    "supertrendFactor",
    "bandwidth",
    "stopLossAtrMultiplier",
    "targetOneMultiplier",
    "targetTwoMultiplier",
    "targetThreeMultiplier",
    "trailingStopAtrMultiplier",
    "equalHighLowThreshold",
  ].includes(parameterKey);
}

export function getNumberInputMinimum(parameterKey: string) {
  if (parameterKey === "timezoneOffsetHours") return "-12";
  if (
    [
      "sessionStartHour",
      "sessionStartMinute",
      "manualEndHour",
      "manualEndMinute",
      "extensionMultiplierOne",
      "extensionMultiplierTwo",
      "extensionMultiplierThree",
    ].includes(parameterKey)
  )
    return "0";
  if (parameterKey === "volumeProfileRows") return "5";
  if (parameterKey === "fairValueGapExtend") return "0";
  if (parameterKey === "bandwidth") return "2";

  return isFractionalStrategyParameter(parameterKey) ? "0.1" : "1";
}

export function getNumberInputMaximum(parameterKey: string) {
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

export function getNumberInputStep(parameterKey: string) {
  return isFractionalStrategyParameter(parameterKey) ? "0.1" : "1";
}

export function normalizeStrategyState(
  strategy: StrategyDefinition,
  index: number,
  state?: Partial<StrategyWorkspaceState>,
): StrategyWorkspaceState {
  const defaultState = getDefaultStrategyState(strategy, index);
  const incomingParameters = state?.parameters ?? {};

  return {
    enabled: typeof state?.enabled === "boolean" ? state.enabled : defaultState.enabled,
    showLayer: typeof state?.showLayer === "boolean" ? state.showLayer : defaultState.showLayer,
    parameters: strategy.parameterSchema.reduce<Record<string, unknown>>(
      (parameters, parameter) => {
        parameters[parameter.key] = sanitizeParameterValue(
          parameter,
          incomingParameters[parameter.key],
        );
        return parameters;
      },
      {},
    ),
  };
}

export function sanitizeChartDisplayMode(value: unknown): ChartDisplayMode {
  return value === "candlestick" ? "candlestick" : "line";
}

export function readWorkspacePreferences(): ChartWorkspacePreferences {
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
        showSignals:
          typeof parsed.showSignals === "boolean"
            ? parsed.showSignals
            : defaultPreferences.showSignals,
        showStrategyLayers:
          typeof parsed.showStrategyLayers === "boolean"
            ? parsed.showStrategyLayers
            : defaultPreferences.showStrategyLayers,
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

    if (
      parsed.version !== 2 &&
      parsed.version !== 3 &&
      parsed.version !== 4 &&
      parsed.version !== 5 &&
      parsed.version !== 6
    ) {
      return defaultPreferences;
    }

    return {
      version: 6,
      showSignals:
        typeof parsed.showSignals === "boolean"
          ? parsed.showSignals
          : defaultPreferences.showSignals,
      showStrategyLayers:
        typeof parsed.showStrategyLayers === "boolean"
          ? parsed.showStrategyLayers
          : defaultPreferences.showStrategyLayers,
      showCrosshair:
        typeof parsed.showCrosshair === "boolean"
          ? parsed.showCrosshair
          : defaultPreferences.showCrosshair,
      showGrid:
        typeof parsed.showGrid === "boolean" ? parsed.showGrid : defaultPreferences.showGrid,
      secondaryPaneRatio:
        typeof parsed.secondaryPaneRatio === "number"
          ? Math.min(0.45, Math.max(0.18, parsed.secondaryPaneRatio))
          : defaultPreferences.secondaryPaneRatio,
      showPriceLabels:
        typeof parsed.showPriceLabels === "boolean"
          ? parsed.showPriceLabels
          : defaultPreferences.showPriceLabels,
      showCurrentPriceLine:
        typeof parsed.showCurrentPriceLine === "boolean"
          ? parsed.showCurrentPriceLine
          : defaultPreferences.showCurrentPriceLine,
      intradayDisplayMode: sanitizeChartDisplayMode(parsed.intradayDisplayMode),
      realtimePollIntervalMs: sanitizeRealtimePollIntervalMs(parsed.realtimePollIntervalMs),
      strategies: presetStrategies.reduce<Record<string, StrategyWorkspaceState>>(
        (settings, strategy, index) => {
          settings[strategy.key] = normalizeStrategyState(
            strategy,
            index,
            parsed.strategies?.[strategy.key],
          );
          return settings;
        },
        {},
      ),
    };
  } catch {
    return defaultPreferences;
  }
}

export function saveWorkspacePreferences(preferences: ChartWorkspacePreferences) {
  try {
    window.localStorage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // 本地偏好保存失败不应影响图表工作台的主要交互。
  }
}

export function formatLogTime(timestamp: number, formatter: (value: number) => string) {
  return formatter(timestamp);
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

export function formatStrategySource(strategy: StrategyDefinition) {
  if (strategy.sourceType === "user") {
    return "用户策略";
  }

  if (strategy.sourceType === "plugin") {
    return "插件策略";
  }

  return "预制策略";
}

export function getMarketTimeZone(market: Market) {
  if (market === "US") {
    return "America/New_York";
  }

  if (market === "HK") {
    return "Asia/Hong_Kong";
  }

  return "Asia/Shanghai";
}

export function getUtcDateKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function getZonedDateParts(date: Date, timeZone: string) {
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

export function getTimeZoneOffsetMs(date: Date, timeZone: string) {
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
  const zonedAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );

  return zonedAsUtc - date.getTime();
}

export function getMarketSessionOpenTimestamp(market: Market, quoteTime: Date) {
  const timeZone = getMarketTimeZone(market);
  const parts = getZonedDateParts(quoteTime, timeZone);
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, 9, 30);
  const firstPass = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone);

  return utcGuess - getTimeZoneOffsetMs(new Date(firstPass), timeZone);
}

export function mergeRealtimeDailyBar(
  bars: MarketDataBar[],
  key: { symbol: string; market: Market },
  snapshot: MarketQuoteSnapshot,
): MarketDataBar[] {
  const quoteTime = new Date(snapshot.quoteTime);
  const timestamp = getMarketSessionOpenTimestamp(key.market, quoteTime);
  const dateKey = getUtcDateKey(timestamp);
  const existingBar = bars.find(
    (bar) => bar.timeframe === "1d" && getUtcDateKey(bar.timestamp) === dateKey,
  );
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

  return [
    ...bars.filter((bar) => !(bar.timeframe === "1d" && getUtcDateKey(bar.timestamp) === dateKey)),
    realtimeBar,
  ].sort((left, right) => left.timestamp - right.timestamp);
}

export interface RealtimeProviderHealthView {
  status: AlphaFeedProviderHealth["status"] | "idle" | "waiting" | "paused";
  message: string;
  checkedAt?: string;
  latencyMs?: number;
  nextRetryAt?: string;
}

export function createRealtimeHealthView(
  status: RealtimeProviderHealthView["status"],
  message: string,
): RealtimeProviderHealthView {
  return {
    status,
    message,
    checkedAt: new Date().toISOString(),
  };
}

export function createRealtimeHealthViewFromGateway(
  health: MarketDataProviderHealthView,
  message = health.message,
  options: {
    capability?: MarketDataProviderCapabilityKey;
    triedProviders?: readonly GatewayMarketDataProviderId[];
    fallbackFrom?: GatewayMarketDataProviderId;
  } = {},
): RealtimeProviderHealthView {
  const statusMap: Record<
    MarketDataProviderHealthView["status"],
    RealtimeProviderHealthView["status"]
  > = {
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

export async function fetchQuoteSnapshotBatch(options: {
  readonly batch: readonly MarketWatchlistItem[];
  readonly marketDataAccess: ChartMarketDataAccess;
}): Promise<ChartQuoteSnapshotBatchResult> {
  return options.marketDataAccess.fetchQuoteSnapshotBatch(options.batch);
}

export async function fetchChartBars(options: {
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

export async function connectQuoteStreamForChart(options: {
  readonly items: readonly MarketWatchlistItem[];
  readonly marketDataAccess: ChartMarketDataAccess;
  readonly alphaFeedStreamMode?: "watchlist" | "all-symbols";
}): Promise<MarketDataProviderHealthView | null> {
  return options.marketDataAccess.connectQuoteStream(options.items, options.alphaFeedStreamMode);
}

export async function readQuoteStreamSnapshotForChart(options: {
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

export async function disconnectQuoteStreamForChart(options: {
  readonly marketDataAccess: ChartMarketDataAccess;
}) {
  await options.marketDataAccess.disconnectQuoteStream();
}

export function getRealtimeHealthBadgeClass(status: RealtimeProviderHealthView["status"]) {
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

export function formatRealtimeHealthDetail(
  health: RealtimeProviderHealthView,
  formatter: (value: string) => string,
) {
  const parts = [health.message];

  if (typeof health.latencyMs === "number") {
    parts.push(`${health.latencyMs}ms`);
  }

  if (health.checkedAt) {
    parts.push(formatter(health.checkedAt));
  }

  return parts.join(" · ");
}

export function formatStatusClock(value: string | undefined, formatter: (value: string) => string) {
  if (!value) {
    return "--:--:--";
  }

  return formatter(value);
}

export function formatQuotePrice(snapshot: MarketQuoteSnapshot | undefined, fallback: string) {
  return snapshot ? snapshot.lastPrice.toFixed(snapshot.lastPrice >= 1000 ? 2 : 2) : fallback;
}

export function formatQuoteChange(snapshot: MarketQuoteSnapshot | undefined, fallback: string) {
  if (!snapshot) {
    return fallback;
  }

  const prefix = snapshot.changePercent >= 0 ? "+" : "";
  return `${prefix}${snapshot.changePercent.toFixed(2)}%`;
}

export function formatTimeframeLabel(timeframe: Timeframe) {
  return timeframe === "realtime" ? "分时" : timeframe;
}

export function formatRealtimeGapStatus(
  bars: MarketDataBar[],
  key: { symbol: string; market: Market; timeframe: "realtime" },
) {
  const gap = analyzeRealtimeHistoryGap(bars, key, Date.now(), longPortRealtimeDelayWarningMs);

  if (!gap.hasGap) {
    return null;
  }

  const gapMinutes = Math.round(gap.gapMs / 60_000);
  return gap.isBridgedByLiveData
    ? `历史分时落后约 ${gapMinutes} 分钟，实时源已补齐最新走势`
    : `历史分时落后约 ${gapMinutes} 分钟，等待实时源补齐`;
}

export function getStrategyLayerStatus(
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
