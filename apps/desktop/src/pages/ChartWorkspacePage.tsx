import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartDisplayMode } from "@quant/chart";
import type { Market, Timeframe } from "@quant/shared";
import {
  createEmptyStrategyRegistry,
  createRunnableUserStrategyDefinition,
  type StrategyDefinition,
  type StrategyParameterDefinition,
} from "@quant/strategy-engine";
import { useUserStrategyDraftStore } from "../features/strategies/userStrategyDraftStore";
import { usePluginRuntimeStore } from "../features/plugins/pluginRuntimeStore";
import {
  buildChartStrategyLogItems,
  buildChartStrategySignalRows,
  getRealtimeStrategyHistoryRequirement,
} from "../features/strategies/chartStrategyRuntime";
import {
  filterMarketBarsForChartContext,
  marketBarsToCandles,
  marketBarsToStrategyBars,
} from "../features/marketData/chartBarAdapter";
import { getMarketBarCacheRepository } from "../features/marketData/marketBarCacheClient";
import type { MarketDataBar } from "../features/marketData/marketBarCacheService";
import {
  writeMarketWatchlist,
  type MarketQuoteSnapshot,
  type MarketWatchlistItem,
} from "../features/marketData/marketDataSyncService";
import { createSnapshotCacheWriteGate } from "../features/marketData/realtimeQuotePollingService";
import {
  aggregateRealtimePointBarsToMinuteCandles,
  mergeRealtimeSnapshotMinuteBar,
} from "../features/marketData/realtimeIntradayBarService";
import { sampleIntradayBarsForRendering } from "../features/marketData/intradayRenderSamplingService";
import {
  createChartLoadState,
  hasRenderableChartData,
  type ChartLoadState,
} from "../features/marketData/chartDataReadinessService";

import { createChartMarketDataAccess } from "../features/marketData/chartMarketDataGateway";
import { readMarketDataProviderSettings } from "../features/marketData/marketDataProviderSettings";
import {
  appendMarketDataRuntimeEvent,
  type MarketDataRuntimeEvent,
} from "../features/marketData/marketDataRuntimeStatus";

import {
  builtInChartIndicatorDefinitions,
  createChartIndicatorEvaluations,
  resolveIndicatorConvention,
} from "../features/chartIndicators/chartIndicators";
import { useChartStudySettingsStore } from "../features/chartWorkspace/chartStudySettingsStore";

import { createStrategyQuickMenuItems } from "../features/chartWorkspace/strategyQuickMenu";
import {
  drawingsToLayer,
  readChartDrawings,
  writeChartDrawings,
  type ChartDrawing,
} from "../features/chartDrawings/chartDrawingStore";
import {
  createChartDrawingCommandState,
  executeChartDrawingCommand,
  redoChartDrawingCommand,
  undoChartDrawingCommand,
  type ChartDrawingCommand,
} from "../features/chartDrawings/chartDrawingCommands";

import type { MarketDataProviderHealthView } from "../features/marketData/marketDataProviderGateway";

import {
  symbols,
  ChartWatchlistItem,
  toChartWatchlistItem,
  readChartWatchlist,
  presetStrategies,
  StrategyWorkspaceState,
  ChartWorkspacePreferences,
  ChartBottomTab,
  WatchlistDataStatus,
  getWatchlistDataKey,
  getChartCacheTimeframe,
  ChartContextMenuState,
  sanitizeParameterValue,
  readWorkspacePreferences,
  saveWorkspacePreferences,
  formatLogTime,
  getErrorMessage,
  mergeRealtimeDailyBar,
  RealtimeProviderHealthView,
  createRealtimeHealthView,
  formatRealtimeHealthDetail,
} from "./chartWorkspaceModel";

import { ChartWorkspaceView } from "./ChartWorkspaceView";
import { useChartMarketData } from "./useChartMarketData";
import { useChartStrategyRuns } from "./useChartStrategyRuns";

export function useChartWorkspaceController() {
  const workspacePreferences = useMemo(() => readWorkspacePreferences(), []);
  const marketDataProviderSettings = useMemo(() => readMarketDataProviderSettings(), []);
  const importedDrafts = useUserStrategyDraftStore((state) => state.drafts);
  const pluginStrategies = usePluginRuntimeStore((state) => state.strategies);
  const pluginIndicators = usePluginRuntimeStore((state) => state.indicators);
  const refreshPluginRuntime = usePluginRuntimeStore((state) => state.refresh);
  const strategySettings = useChartStudySettingsStore((state) => state.strategies);
  const indicatorSettings = useChartStudySettingsStore((state) => state.indicators);
  const initializeStudyStrategies = useChartStudySettingsStore(
    (state) => state.initializeStrategies,
  );
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
  const [activeSymbol, setActiveSymbol] = useState<ChartWatchlistItem>(
    () => readChartWatchlist()[0] ?? symbols[0],
  );
  const activeSymbolDataKey = getWatchlistDataKey(activeSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const marketBarCacheRepository = useMemo(() => getMarketBarCacheRepository(), []);
  const [cachedMarketBars, setCachedMarketBars] = useState<MarketDataBar[]>([]);
  const [dailyStrategyBars, setDailyStrategyBars] = useState<
    ReturnType<typeof marketBarsToStrategyBars>
  >([]);
  const [weeklyStrategyBars, setWeeklyStrategyBars] = useState<
    ReturnType<typeof marketBarsToStrategyBars>
  >([]);
  const snapshotCacheWriteGateRef = useRef(createSnapshotCacheWriteGate());
  const [chartLoadState, setChartLoadState] = useState<ChartLoadState>(() => {
    const item = readChartWatchlist()[0] ?? symbols[0];
    return createChartLoadState("cache", item.symbol, "1d", 0);
  });
  const [watchlistDataStatusByKey, setWatchlistDataStatusByKey] = useState<
    Record<string, WatchlistDataStatus>
  >({});
  const [realtimeStatus, setRealtimeStatus] = useState("REST 轮询待命");
  const [mlptHistoryStatus, setMlptHistoryStatus] = useState<string | null>(null);
  const [realtimeHealth, setRealtimeHealth] = useState<RealtimeProviderHealthView>(() =>
    createRealtimeHealthView("idle", "REST 轮询待命"),
  );
  const [quoteSnapshotsByKey, setQuoteSnapshotsByKey] = useState<
    Record<string, MarketQuoteSnapshot>
  >({});
  const quoteSnapshotsByKeyRef = useRef<Record<string, MarketQuoteSnapshot>>({});
  const [showSignals, setShowSignals] = useState(workspacePreferences.showSignals);
  const [showStrategyLayers, setShowStrategyLayers] = useState(
    workspacePreferences.showStrategyLayers,
  );
  const [isStrategyMenuOpen, setIsStrategyMenuOpen] = useState(false);
  const [activeIndicatorConfigId, setActiveIndicatorConfigId] = useState<string | null>(null);
  const [showCrosshair, setShowCrosshair] = useState(workspacePreferences.showCrosshair);
  const [showGrid, setShowGrid] = useState(workspacePreferences.showGrid);
  const [secondaryPaneRatio, setSecondaryPaneRatio] = useState(
    workspacePreferences.secondaryPaneRatio,
  );
  const [showPriceLabels, setShowPriceLabels] = useState(workspacePreferences.showPriceLabels);
  const [showCurrentPriceLine, setShowCurrentPriceLine] = useState(
    workspacePreferences.showCurrentPriceLine,
  );
  const [intradayDisplayMode, setIntradayDisplayMode] = useState<ChartDisplayMode>(
    workspacePreferences.intradayDisplayMode,
  );
  const [realtimePollIntervalMs, setRealtimePollIntervalMs] = useState(
    workspacePreferences.realtimePollIntervalMs,
  );
  const [activeConfigStrategyKey, setActiveConfigStrategyKey] = useState<string | null>(null);
  const [isWatchlistCollapsed, setIsWatchlistCollapsed] = useState(false);
  const [isInstrumentSearchOpen, setIsInstrumentSearchOpen] = useState(false);
  const [instrumentSearchQuery, setInstrumentSearchQuery] = useState("");
  const [instrumentSearchState, setInstrumentSearchState] = useState<
    "idle" | "loading" | "error" | "empty"
  >("idle");
  const [instrumentSearchMessage, setInstrumentSearchMessage] = useState("");
  const [instrumentSearchResults, setInstrumentSearchResults] = useState<
    readonly { symbol: string; name: string; market: Market }[]
  >([]);
  const [bottomTab, setBottomTab] = useState<ChartBottomTab>("layers");
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [isBottomDockExpanded, setIsBottomDockExpanded] = useState(false);
  const [isChartSettingsOpen, setIsChartSettingsOpen] = useState(false);
  const [chartContextMenu, setChartContextMenu] = useState<ChartContextMenuState | null>(null);
  const [chartResetViewKey, setChartResetViewKey] = useState(0);
  const [chartFocusLatestKey, setChartFocusLatestKey] = useState(0);
  const [isPriceScaleLocked, setIsPriceScaleLocked] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [providerDiagnostics, setProviderDiagnostics] = useState<
    readonly MarketDataProviderHealthView[]
  >([]);
  const [diagnosticTimeline, setDiagnosticTimeline] = useState<readonly MarketDataRuntimeEvent[]>(
    [],
  );
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  const [drawings, setDrawings] = useState<ChartDrawing[]>(() =>
    readChartDrawings({ market: activeSymbol.market, symbol: activeSymbol.dataSymbol, timeframe }),
  );
  const [drawingCommandState, setDrawingCommandState] = useState(() =>
    createChartDrawingCommandState(
      readChartDrawings({
        market: activeSymbol.market,
        symbol: activeSymbol.dataSymbol,
        timeframe,
      }),
    ),
  );
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [activeDrawingTool, setActiveDrawingTool] = useState<ChartDrawing["type"] | null>(null);
  const [pendingTrendPoint, setPendingTrendPoint] = useState<{
    timestamp: number;
    price: number;
  } | null>(null);
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
  const recordMarketEvent = useCallback(
    (kind: MarketDataRuntimeEvent["kind"], message: string, detail?: string) => {
      setDiagnosticTimeline((current) =>
        appendMarketDataRuntimeEvent(current, {
          kind,
          timestamp: new Date().toISOString(),
          message,
          detail,
        }),
      );
    },
    [],
  );
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
    () =>
      timeframe === "realtime"
        ? aggregateRealtimePointBarsToMinuteCandles(activeContextMarketBars)
        : activeContextMarketBars,
    [activeContextMarketBars, timeframe],
  );
  const chartRenderBars = useMemo(
    () =>
      timeframe === "realtime"
        ? sampleIntradayBarsForRendering(displayedMarketBars)
        : displayedMarketBars,
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
    () =>
      watchlist.map((item) => ({
        symbol: item.dataSymbol,
        name: item.name,
        market: item.market,
        source: "user",
      })),
    [watchlist],
  );
  const cachedCandles = useMemo(() => marketBarsToCandles(chartRenderBars), [chartRenderBars]);
  const allIndicatorDefinitions = useMemo(
    () => [...builtInChartIndicatorDefinitions, ...pluginIndicators],
    [pluginIndicators],
  );
  const indicatorConvention = resolveIndicatorConvention(
    indicatorSettings.conventionMode,
    activeSymbol.market,
  );
  const indicatorEvaluations = useMemo(
    () =>
      createChartIndicatorEvaluations(
        cachedCandles,
        indicatorSettings,
        indicatorConvention,
        allIndicatorDefinitions,
      ),
    [allIndicatorDefinitions, cachedCandles, indicatorConvention, indicatorSettings],
  );
  const overlayIndicatorEvaluations = useMemo(
    () =>
      indicatorEvaluations.filter(
        (
          evaluation,
        ): evaluation is Extract<(typeof indicatorEvaluations)[number], { placement: "overlay" }> =>
          evaluation.placement === "overlay",
      ),
    [indicatorEvaluations],
  );
  const indicatorLayers = useMemo(
    () => overlayIndicatorEvaluations.map((evaluation) => evaluation.layer),
    [overlayIndicatorEvaluations],
  );
  const secondaryIndicatorEvaluation = indicatorEvaluations.find(
    (
      evaluation,
    ): evaluation is Extract<(typeof indicatorEvaluations)[number], { placement: "pane" }> =>
      evaluation.placement === "pane" && evaluation.visible,
  );
  const drawingLayer = useMemo(() => drawingsToLayer(drawings), [drawings]);
  const cachedStrategyBars = useMemo(
    () => marketBarsToStrategyBars(strategyMarketBars),
    [strategyMarketBars],
  );
  const renderedCandles = cachedCandles;
  const strategyInputBars = cachedStrategyBars;
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      marketBarCacheRepository.read({
        symbol: activeSymbol.dataSymbol,
        market: activeSymbol.market,
        timeframe: "1d",
      }),
      marketBarCacheRepository.read({
        symbol: activeSymbol.dataSymbol,
        market: activeSymbol.market,
        timeframe: "1w",
      }),
    ])
      .then(([dailyBars, weeklyBars]) => {
        if (!cancelled) {
          setDailyStrategyBars(marketBarsToStrategyBars(dailyBars));
          setWeeklyStrategyBars(marketBarsToStrategyBars(weeklyBars));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDailyStrategyBars([]);
          setWeeklyStrategyBars([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSymbol.dataSymbol, activeSymbol.market, marketBarCacheRepository]);
  const { strategyRuns, mlptChartNotice, strategyLayers } = useChartStrategyRuns({
    chartStrategies,
    chartStrategyRegistry,
    strategySettings,
    activeSymbol,
    timeframe,
    chartHasRenderableData,
    strategyInputBars,
    dailyStrategyBars,
    weeklyStrategyBars,
  });
  const availableLayerIds = useMemo(
    () => [
      ...strategyLayers.map((layer) => layer.strategyId),
      ...indicatorLayers.map((layer) => layer.id),
      drawingLayer.id,
    ],
    [drawingLayer.id, indicatorLayers, strategyLayers],
  );
  const effectiveLayerOrder = useMemo(
    () => [
      ...layerOrder.filter((id) => availableLayerIds.includes(id)),
      ...availableLayerIds.filter((id) => !layerOrder.includes(id)),
    ],
    [availableLayerIds, layerOrder],
  );
  const orderedStrategyLayers = useMemo(
    () =>
      strategyLayers.map((layer) => ({
        ...layer,
        zIndex: (effectiveLayerOrder.indexOf(layer.strategyId) + 1) * 10,
      })),
    [effectiveLayerOrder, strategyLayers],
  );
  const orderedExtraLayers = useMemo(
    () =>
      [drawingLayer, ...indicatorLayers].map((layer) => ({
        ...layer,
        zIndex: (effectiveLayerOrder.indexOf(layer.id) + 1) * 10,
      })),
    [drawingLayer, effectiveLayerOrder, indicatorLayers],
  );
  const canShowStrategyLayers = showStrategyLayers;
  const strategyLayerElementCount = strategyLayers.reduce(
    (total, layer) => total + (layer.enabled ? layer.elements.length : 0),
    0,
  );
  const enabledStrategyCount = strategyRuns.filter(({ settings }) => settings.enabled).length;
  const totalSignalCount = strategyRuns.reduce(
    (total, { result }) => total + result.output.signals.length,
    0,
  );
  const activeConfigStrategyRun = strategyRuns.find(
    ({ strategy }) => strategy.key === activeConfigStrategyKey,
  );
  const strategyQuickMenuItems = useMemo(
    () => createStrategyQuickMenuItems(chartStrategies, strategySettings),
    [chartStrategies, strategySettings],
  );
  const strategyLogTime = formatLogTime(Date.now());
  const strategyLogItems = buildChartStrategyLogItems(strategyRuns, {
    symbol: activeSymbol.symbol,
    timeframe,
  });
  const signalRows = buildChartStrategySignalRows(strategyRuns);
  const selectedSignal = signalRows.find((signal) => signal.id === selectedSignalId) ?? null;
  const selectedSignalRun = selectedSignal
    ? (strategyRuns.find(({ strategy }) => strategy.key === selectedSignal.strategyKey) ?? null)
    : null;
  const updateStrategyState = (
    strategyKey: string,
    updater: (state: StrategyWorkspaceState) => StrategyWorkspaceState,
  ) => {
    updateStudyStrategy(strategyKey, updater);
  };
  const updateStrategyParameter = (
    strategy: StrategyDefinition,
    parameter: StrategyParameterDefinition,
    value: unknown,
  ) => {
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
  const selectActiveSymbol = async (item: ChartWatchlistItem) => {
    const bars = await marketBarCacheRepository.read({
      symbol: item.dataSymbol,
      market: item.market,
      timeframe: getChartCacheTimeframe(timeframe),
    });
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
  const mergeActiveSnapshotBars = useCallback(
    (currentBars: MarketDataBar[], snapshot: MarketQuoteSnapshot) => {
      if (timeframe === "realtime") {
        return mergeRealtimeSnapshotMinuteBar(
          currentBars,
          { symbol: activeSymbol.dataSymbol, market: activeSymbol.market, timeframe: "realtime" },
          snapshot,
          realtimeHistoryRequirement.sessionCount,
        );
      }

      return mergeRealtimeDailyBar(
        currentBars,
        { symbol: activeSymbol.dataSymbol, market: activeSymbol.market },
        snapshot,
      );
    },
    [
      activeSymbol.dataSymbol,
      activeSymbol.market,
      realtimeHistoryRequirement.sessionCount,
      timeframe,
    ],
  );
  const writeActiveSnapshotBars = useCallback(
    (bars: MarketDataBar[]) => {
      const contextKey = `${activeSymbol.market}:${activeSymbol.dataSymbol}:${timeframe}`;
      if (!snapshotCacheWriteGateRef.current.shouldWrite(contextKey)) {
        return;
      }

      void marketBarCacheRepository.write(
        {
          symbol: activeSymbol.dataSymbol,
          market: activeSymbol.market,
          timeframe,
        },
        bars,
      );
    },
    [activeSymbol.dataSymbol, activeSymbol.market, marketBarCacheRepository, timeframe],
  );

  useEffect(() => {
    let cancelled = false;
    const cacheTimeframe = getChartCacheTimeframe(timeframe);
    void marketBarCacheRepository
      .read({
        symbol: activeSymbol.dataSymbol,
        market: activeSymbol.market,
        timeframe: cacheTimeframe,
      })
      .then((bars) => {
        if (cancelled) return;
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
          [getWatchlistDataKey({
            dataSymbol: activeSymbol.dataSymbol,
            market: activeSymbol.market,
          })]: hasRenderableChartData(timeframe, bars.length) ? "cache" : "syncing",
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setCachedMarketBars([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeSymbol.dataSymbol,
    activeSymbol.market,
    activeSymbol.symbol,
    marketBarCacheRepository,
    marketDataProviderSettings.stockSdkPrimaryEnabled,
    timeframe,
  ]);

  useEffect(() => {
    const nextDrawings = readChartDrawings({
      market: activeSymbol.market,
      symbol: activeSymbol.dataSymbol,
      timeframe,
    });
    setDrawings(nextDrawings);
    setDrawingCommandState(createChartDrawingCommandState(nextDrawings));
    setSelectedDrawingId(null);
  }, [activeSymbol.dataSymbol, activeSymbol.market, timeframe]);

  useEffect(() => {
    const kind =
      realtimeHealth.status === "rate_limited"
        ? "rate-limited"
        : realtimeHealth.status === "ok" ||
            realtimeHealth.status === "idle" ||
            realtimeHealth.status === "paused"
          ? "sync-completed"
          : "error";
    setDiagnosticTimeline((current) =>
      appendMarketDataRuntimeEvent(current, {
        kind,
        timestamp: realtimeHealth.checkedAt ?? new Date().toISOString(),
        message: formatRealtimeHealthDetail(realtimeHealth),
      }),
    );
  }, [realtimeHealth]);

  useChartMarketData({
    activeSymbol,
    activeSymbolDataKey,
    timeframe,
    watchlist,
    marketBarCacheRepository,
    marketDataProviderSettings,
    isMlptEnabled,
    realtimeHistoryRequirement,
    recordMarketEvent,
    setChartLoadState,
    setWatchlistDataStatusByKey,
    setRealtimeHealth,
    setRealtimeStatus,
    setCachedMarketBars,
    setMlptHistoryStatus,
    currentRealtimeWatchlist,
    quoteSnapshotsByKeyRef,
    setQuoteSnapshotsByKey,
    realtimePollIntervalMs,
    mergeActiveSnapshotBars,
    writeActiveSnapshotBars,
  });

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
    const nextWatchlist = watchlist.some(
      (candidate) =>
        candidate.market === nextItem.market && candidate.dataSymbol === nextItem.dataSymbol,
    )
      ? watchlist
      : [...watchlist, nextItem];
    writeMarketWatchlist(
      nextWatchlist.map((candidate) => ({
        symbol: candidate.dataSymbol,
        name: candidate.name,
        market: candidate.market,
        source: "user",
      })),
    );
    setWatchlist(nextWatchlist);
    setActiveSymbol(nextItem);
    setIsInstrumentSearchOpen(false);
  };

  const removeWatchlistItem = (item: ChartWatchlistItem) => {
    if (watchlist.length <= 1) {
      return;
    }
    const nextWatchlist = watchlist.filter(
      (candidate) => candidate.market !== item.market || candidate.dataSymbol !== item.dataSymbol,
    );
    writeMarketWatchlist(
      nextWatchlist.map((candidate) => ({
        symbol: candidate.dataSymbol,
        name: candidate.name,
        market: candidate.market,
        source: "user",
      })),
    );
    setWatchlist(nextWatchlist);
    if (activeSymbol.market === item.market && activeSymbol.dataSymbol === item.dataSymbol) {
      setActiveSymbol(nextWatchlist[0]!);
    }
  };

  const updateDrawings = useCallback(
    (nextDrawings: ChartDrawing[]) => {
      writeChartDrawings(
        { market: activeSymbol.market, symbol: activeSymbol.dataSymbol, timeframe },
        nextDrawings,
      );
      setDrawings(nextDrawings);
    },
    [activeSymbol.dataSymbol, activeSymbol.market, timeframe],
  );
  const executeDrawingCommand = useCallback(
    (command: ChartDrawingCommand) => {
      const next = executeChartDrawingCommand(drawingCommandState, command);
      if (next === drawingCommandState) return;
      updateDrawings([...next.drawings]);
      setDrawingCommandState(next);
    },
    [drawingCommandState, updateDrawings],
  );
  const undoDrawingCommand = useCallback(() => {
    const next = undoChartDrawingCommand(drawingCommandState);
    if (next === drawingCommandState) return;
    updateDrawings([...next.drawings]);
    setDrawingCommandState(next);
  }, [drawingCommandState, updateDrawings]);
  const redoDrawingCommand = useCallback(() => {
    const next = redoChartDrawingCommand(drawingCommandState);
    if (next === drawingCommandState) return;
    updateDrawings([...next.drawings]);
    setDrawingCommandState(next);
  }, [drawingCommandState, updateDrawings]);
  const deleteDrawing = useCallback(
    (drawingId: string) => {
      executeDrawingCommand({ type: "delete", drawingId });
      setSelectedDrawingId((current) => (current === drawingId ? null : current));
    },
    [executeDrawingCommand],
  );
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDrawingTool(null);
        setPendingTrendPoint(null);
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedDrawingId &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        event.preventDefault();
        deleteDrawing(selectedDrawingId);
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoDrawingCommand();
        else undoDrawingCommand();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoDrawingCommand();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    deleteDrawing,
    drawingCommandState,
    redoDrawingCommand,
    selectedDrawingId,
    undoDrawingCommand,
  ]);

  const placeDrawingPoint = (point: { timestamp: number; price: number }) => {
    if (!activeDrawingTool) return;
    const createdAt = new Date().toISOString();
    if (activeDrawingTool === "trend-line") {
      if (!pendingTrendPoint) {
        setPendingTrendPoint(point);
        return;
      }
      const drawing: ChartDrawing = {
        id: `drawing-${Date.now()}`,
        type: "trend-line",
        visible: true,
        createdAt,
        points: [pendingTrendPoint, point],
      };
      executeDrawingCommand({ type: "add", drawing });
      setSelectedDrawingId(drawing.id);
      setPendingTrendPoint(null);
      setActiveDrawingTool(null);
      return;
    }
    const drawing: ChartDrawing =
      activeDrawingTool === "horizontal-line"
        ? {
            id: `drawing-${Date.now()}`,
            type: "horizontal-line",
            visible: true,
            createdAt,
            price: point.price,
            label: "参考线",
          }
        : {
            id: `drawing-${Date.now()}`,
            type: "text",
            visible: true,
            createdAt,
            timestamp: point.timestamp,
            price: point.price,
            text: "标注",
          };
    executeDrawingCommand({ type: "add", drawing });
    setSelectedDrawingId(drawing.id);
    setActiveDrawingTool(null);
  };
  const moveDrawing = (
    drawingId: string,
    pointIndex: number | null,
    point: { timestamp: number; price: number },
  ) => {
    const drawing = drawings.find((item) => item.id === drawingId);
    if (!drawing) return;
    if (drawing.type === "trend-line" && pointIndex !== null) {
      const points = [...drawing.points] as [
        { timestamp: number; price: number },
        { timestamp: number; price: number },
      ];
      points[pointIndex] = point;
      updateDrawings(
        drawings.map((item) => (item.id === drawingId ? { ...drawing, points } : item)),
      );
      return;
    }
    if (drawing.type === "horizontal-line")
      updateDrawings(
        drawings.map((item) => (item.id === drawingId ? { ...drawing, price: point.price } : item)),
      );
    if (drawing.type === "text")
      updateDrawings(
        drawings.map((item) =>
          item.id === drawingId
            ? { ...drawing, timestamp: point.timestamp, price: point.price }
            : item,
        ),
      );
  };

  const toggleDrawingVisibility = (drawingId: string) => {
    const drawing = drawings.find((item) => item.id === drawingId);
    if (drawing)
      executeDrawingCommand({
        type: "update",
        drawingId,
        drawing: { ...drawing, visible: !drawing.visible },
      });
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
      if (Number.isFinite(price) && price > 0)
        executeDrawingCommand({ type: "update", drawingId, drawing: { ...drawing, price } });
      return;
    }
    const endpoint = Number(window.prompt("趋势线终点价格", String(drawing.points[1].price)));
    if (Number.isFinite(endpoint) && endpoint > 0)
      executeDrawingCommand({
        type: "update",
        drawingId,
        drawing: {
          ...drawing,
          points: [drawing.points[0], { ...drawing.points[1], price: endpoint }],
        },
      });
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
      const ordered = [
        ...current.filter((id) => availableLayerIds.includes(id)),
        ...availableLayerIds.filter((id) => !current.includes(id)),
      ];
      const index = ordered.indexOf(layerId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return ordered;
      [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
      return ordered;
    });
  };

  return {
    indicatorSettings,
    updateIndicatorSettings,
    strategyMenuRef,
    strategyMenuButtonRef,
    chartHasRenderableData,
    chartViewportLoadingState,
    cachedCandles,
    allIndicatorDefinitions,
    indicatorConvention,
    overlayIndicatorEvaluations,
    secondaryIndicatorEvaluation,
    drawingLayer,
    renderedCandles,
    strategyInputBars,
    strategyRuns,
    mlptChartNotice,
    orderedStrategyLayers,
    orderedExtraLayers,
    canShowStrategyLayers,
    strategyLayerElementCount,
    enabledStrategyCount,
    totalSignalCount,
    activeConfigStrategyRun,
    strategyQuickMenuItems,
    strategyLogTime,
    strategyLogItems,
    signalRows,
    selectedSignal,
    selectedSignalRun,
    updateStrategyState,
    updateStrategyParameter,
    resetChartView,
    selectActiveSymbol,
    runInstrumentSearch,
    addInstrumentToWatchlist,
    removeWatchlistItem,
    executeDrawingCommand,
    undoDrawingCommand,
    redoDrawingCommand,
    deleteDrawing,
    placeDrawingPoint,
    moveDrawing,
    toggleDrawingVisibility,
    editDrawing,
    openDiagnostics,
    moveLayer,
    watchlist,
    activeSymbol,
    timeframe,
    setTimeframe,
    watchlistDataStatusByKey,
    realtimeStatus,
    mlptHistoryStatus,
    realtimeHealth,
    quoteSnapshotsByKey,
    showSignals,
    setShowSignals,
    showStrategyLayers,
    setShowStrategyLayers,
    isStrategyMenuOpen,
    setIsStrategyMenuOpen,
    activeIndicatorConfigId,
    setActiveIndicatorConfigId,
    showCrosshair,
    setShowCrosshair,
    showGrid,
    setShowGrid,
    secondaryPaneRatio,
    setSecondaryPaneRatio,
    showPriceLabels,
    setShowPriceLabels,
    showCurrentPriceLine,
    setShowCurrentPriceLine,
    intradayDisplayMode,
    setIntradayDisplayMode,
    realtimePollIntervalMs,
    setRealtimePollIntervalMs,
    setActiveConfigStrategyKey,
    isWatchlistCollapsed,
    setIsWatchlistCollapsed,
    isInstrumentSearchOpen,
    setIsInstrumentSearchOpen,
    instrumentSearchQuery,
    setInstrumentSearchQuery,
    instrumentSearchState,
    setInstrumentSearchState,
    instrumentSearchMessage,
    setInstrumentSearchMessage,
    instrumentSearchResults,
    bottomTab,
    setBottomTab,
    setSelectedSignalId,
    isBottomDockExpanded,
    setIsBottomDockExpanded,
    isChartSettingsOpen,
    setIsChartSettingsOpen,
    chartContextMenu,
    setChartContextMenu,
    chartResetViewKey,
    chartFocusLatestKey,
    setChartFocusLatestKey,
    isPriceScaleLocked,
    setIsPriceScaleLocked,
    isDiagnosticsOpen,
    setIsDiagnosticsOpen,
    providerDiagnostics,
    diagnosticTimeline,
    drawings,
    drawingCommandState,
    selectedDrawingId,
    setSelectedDrawingId,
    activeDrawingTool,
    setActiveDrawingTool,
    setPendingTrendPoint,
  };
}

export type ChartWorkspaceController = ReturnType<typeof useChartWorkspaceController>;

export function ChartWorkspacePage() {
  const controller = useChartWorkspaceController();
  return <ChartWorkspaceView controller={controller} />;
}
