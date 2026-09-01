import { useEffect } from "react";

import type { Timeframe } from "@quant/shared";

import type { MarketDataBar } from "../features/marketData/marketBarCacheService";
import {
  type MarketQuoteSnapshot,
  type MarketWatchlistItem,
} from "../features/marketData/marketDataSyncService";
import {
  createQuotePollingBatches,
  mergeQuoteSnapshots,
} from "../features/marketData/realtimeQuotePollingService";
import { mergeHistoricalRealtimeBarsWithLiveBars } from "../features/marketData/realtimeIntradayBarService";
import {
  alphaFeedMinuteBarsToRealtimeBars,
  getIntradayHistoryWindow,
  isMarketSessionOpen,
} from "../features/marketData/intradayHistoryService";

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
} from "../features/marketData/chartMarketDataGateway";

import {
  evaluateMarketCacheFreshness,
  getMarketRuntimeSessionStatus,
  type MarketDataRuntimeEvent,
} from "../features/marketData/marketDataRuntimeStatus";
import {
  mergeMlptBarsByProviderPriority,
  mlptMinimumHistoryBars,
  mlptPreferredHistoryBars,
} from "../features/marketData/mlptHistoricalBackfillService";

import type {
  GatewayMarketDataProviderId,
  MarketDataProviderHealthView,
} from "../features/marketData/marketDataProviderGateway";

import {
  ChartWatchlistItem,
  realtimeRateLimitBackoffMs,
  enableAlphaFeedHistoricalIntradayBackfill,
  WatchlistDataStatus,
  getChartCacheTimeframe,
  getErrorMessage,
  RealtimeProviderHealthView,
  createRealtimeHealthView,
  createRealtimeHealthViewFromGateway,
  fetchQuoteSnapshotBatch,
  fetchChartBars,
  connectQuoteStreamForChart,
  readQuoteStreamSnapshotForChart,
  disconnectQuoteStreamForChart,
  formatTimeframeLabel,
  formatRealtimeGapStatus,
} from "./chartWorkspaceModel";

import type { Dispatch, SetStateAction } from "react";
import type { MarketBarCacheRepository } from "../features/marketData/marketBarCacheRepository";
import type { MarketDataProviderSettings } from "../features/marketData/marketDataProviderSettings";

interface UseChartMarketDataOptions {
  readonly activeSymbol: ChartWatchlistItem;
  readonly activeSymbolDataKey: string;
  readonly timeframe: Timeframe;
  readonly watchlist: readonly ChartWatchlistItem[];
  readonly marketBarCacheRepository: MarketBarCacheRepository;
  readonly marketDataProviderSettings: MarketDataProviderSettings;
  readonly isMlptEnabled: boolean;
  readonly realtimeHistoryRequirement: {
    readonly minimumBars: number;
    readonly preferredBars: number;
    readonly sessionCount: number;
  };
  readonly recordMarketEvent: (
    kind: MarketDataRuntimeEvent["kind"],
    message: string,
    detail?: string,
  ) => void;
  readonly setChartLoadState: Dispatch<SetStateAction<ChartLoadState>>;
  readonly setWatchlistDataStatusByKey: Dispatch<
    SetStateAction<Record<string, WatchlistDataStatus>>
  >;
  readonly setRealtimeHealth: Dispatch<SetStateAction<RealtimeProviderHealthView>>;
  readonly setRealtimeStatus: Dispatch<SetStateAction<string>>;
  readonly setCachedMarketBars: Dispatch<SetStateAction<MarketDataBar[]>>;
  readonly setMlptHistoryStatus: Dispatch<SetStateAction<string | null>>;
  readonly currentRealtimeWatchlist: MarketWatchlistItem[];
  readonly quoteSnapshotsByKeyRef: {
    current: Record<string, MarketQuoteSnapshot>;
  };
  readonly setQuoteSnapshotsByKey: Dispatch<SetStateAction<Record<string, MarketQuoteSnapshot>>>;
  readonly realtimePollIntervalMs: number;
  readonly mergeActiveSnapshotBars: (
    bars: MarketDataBar[],
    snapshot: MarketQuoteSnapshot,
  ) => MarketDataBar[];
  readonly writeActiveSnapshotBars: (bars: MarketDataBar[]) => void;
}

export function useChartMarketData({
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
}: UseChartMarketDataOptions) {
  useEffect(() => {
    let cancelled = false;

    const loadMarketDataHistory = async () => {
      const isRealtimeHistory = timeframe === "realtime";
      const windowRange = isRealtimeHistory
        ? getIntradayHistoryWindow(
            activeSymbol.market,
            Date.now(),
            realtimeHistoryRequirement.sessionCount,
          )
        : null;
      const cacheTimeframe = getChartCacheTimeframe(timeframe);
      const initialCachedBars = await marketBarCacheRepository.read({
        symbol: activeSymbol.dataSymbol,
        market: activeSymbol.market,
        timeframe: cacheTimeframe,
      });
      const confirmedThroughTimestamp = Math.floor(Date.now() / 60_000) * 60_000 - 1;
      const knownConfirmedTimestamps = initialCachedBars
        .filter((bar) => bar.timestamp <= confirmedThroughTimestamp)
        .map((bar) => bar.timestamp);
      const needsMlptMinimumBackfill =
        isRealtimeHistory &&
        isMlptEnabled &&
        knownConfirmedTimestamps.length < mlptMinimumHistoryBars;
      const cacheMetadata = (await marketBarCacheRepository.summary()).entries.find(
        (entry) =>
          entry.symbol === activeSymbol.dataSymbol &&
          entry.market === activeSymbol.market &&
          entry.timeframe === cacheTimeframe,
      );
      const cacheFreshness = evaluateMarketCacheFreshness(cacheTimeframe, cacheMetadata?.updatedAt);
      const sessionStatus = getMarketRuntimeSessionStatus(activeSymbol.market);
      recordMarketEvent(
        initialCachedBars.length > 0 && cacheFreshness.state === "fresh"
          ? "cache-hit"
          : cacheFreshness.state === "stale"
            ? "cache-stale"
            : "sync-started",
        initialCachedBars.length > 0
          ? `${activeSymbol.symbol} ${formatTimeframeLabel(timeframe)} 缓存 ${cacheFreshness.state === "fresh" ? "命中" : "已过期"}，共 ${initialCachedBars.length} 根`
          : `${activeSymbol.symbol} ${formatTimeframeLabel(timeframe)} 开始同步`,
      );
      setChartLoadState(
        createChartLoadState("history", activeSymbol.symbol, timeframe, initialCachedBars.length),
      );
      setWatchlistDataStatusByKey((current) => ({
        ...current,
        [activeSymbolDataKey]: "syncing",
      }));

      if (
        !isRealtimeHistory &&
        !sessionStatus.isOpen &&
        cacheFreshness.state === "fresh" &&
        hasRenderableChartData(timeframe, initialCachedBars.length) &&
        hasSufficientHistoricalChartCache(timeframe, initialCachedBars.length)
      ) {
        setChartLoadState(
          createChartLoadState(
            "ready",
            activeSymbol.symbol,
            timeframe,
            initialCachedBars.length,
            `${activeSymbol.symbol} ${formatTimeframeLabel(timeframe)} 市场已收盘，使用有效本地缓存。`,
          ),
        );
        setWatchlistDataStatusByKey((current) => ({
          ...current,
          [activeSymbolDataKey]: "cache",
        }));
        recordMarketEvent(
          "market-closed",
          `${activeSymbol.symbol} 市场已收盘，历史缓存仍有效，跳过远端刷新`,
        );
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

        if (
          isRealtimeHistory
            ? !marketDataAccess.hasIntradaySource
            : !marketDataAccess.hasHistoricalSource
        ) {
          const waitingHealth = createRealtimeHealthView(
            "waiting",
            isRealtimeHistory
              ? "等待主行情源或备用源以加载历史分时"
              : "等待主行情源或备用源以加载历史 K 线",
          );
          setRealtimeHealth(waitingHealth);
          setRealtimeStatus(waitingHealth.message);
          setChartLoadState(
            createChartLoadState(
              "error",
              activeSymbol.symbol,
              timeframe,
              initialCachedBars.length,
              waitingHealth.message,
            ),
          );
          setWatchlistDataStatusByKey((current) => ({
            ...current,
            [activeSymbolDataKey]: "error",
          }));
          return;
        }

        const barRequest = {
          symbol: activeSymbol.dataSymbol,
          market: activeSymbol.market,
          timeframe: isRealtimeHistory ? ("1m" as const) : timeframe,
          startTime: windowRange?.startTime,
          endTime: windowRange?.endTime,
          count: isRealtimeHistory
            ? realtimeHistoryRequirement.preferredBars
            : timeframe === "1w"
              ? 260
              : 600,
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
          const cachedBars = await marketBarCacheRepository.read({
            symbol: activeSymbol.dataSymbol,
            market: activeSymbol.market,
            timeframe: cacheTimeframe,
          });
          const failureMessage =
            cachedBars.length > 0
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
          recordMarketEvent(
            result.health[0]?.status === "rateLimited"
              ? "rate-limited"
              : hasRenderableChartData(timeframe, cachedBars.length)
                ? "cache-retained"
                : "error",
            failureMessage,
          );
          const hasCache = hasRenderableChartData(timeframe, cachedBars.length);
          setChartLoadState(
            createChartLoadState(
              hasCache ? "degraded" : "error",
              activeSymbol.symbol,
              timeframe,
              cachedBars.length,
              errorHealth.message,
            ),
          );
          setWatchlistDataStatusByKey((current) => ({
            ...current,
            [activeSymbolDataKey]: hasCache ? "degraded" : "error",
          }));
          return;
        }

        const resultBars = gatewayBarsToMarketDataBars(
          result.data,
          isRealtimeHistory ? "realtime" : undefined,
        );

        if (resultBars.length < result.data.length) {
          recordMarketEvent(
            "data-invalid",
            `${activeSymbol.symbol} ${formatTimeframeLabel(timeframe)} 已拒绝 ${result.data.length - resultBars.length} 条异常行情数据`,
          );
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
          setChartLoadState(
            createChartLoadState(
              "error",
              activeSymbol.symbol,
              timeframe,
              initialCachedBars.length,
              emptyHealth.message,
            ),
          );
          setWatchlistDataStatusByKey((current) => ({
            ...current,
            [activeSymbolDataKey]: "error",
          }));
          return;
        }

        const cacheTimeframe: Timeframe = isRealtimeHistory ? "realtime" : timeframe;
        const cacheKey = {
          symbol: activeSymbol.dataSymbol,
          market: activeSymbol.market,
          timeframe: cacheTimeframe,
        };
        const currentCachedBars = await marketBarCacheRepository.read(cacheKey);
        const prioritizedHistoryBars =
          isRealtimeHistory && isMlptEnabled
            ? mergeMlptBarsByProviderPriority([...currentCachedBars, ...resultBars])
            : resultBars;
        const mergedBars = isRealtimeHistory
          ? mergeHistoricalRealtimeBarsWithLiveBars(
              prioritizedHistoryBars,
              currentCachedBars,
              {
                symbol: activeSymbol.dataSymbol,
                market: activeSymbol.market,
                timeframe: "realtime",
              },
              realtimeHistoryRequirement.sessionCount,
            )
          : resultBars;
        const written = await marketBarCacheRepository.write(cacheKey, mergedBars, {
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
        setChartLoadState(
          createChartLoadState("layers", activeSymbol.symbol, timeframe, written.length),
        );
        setWatchlistDataStatusByKey((current) => ({
          ...current,
          [activeSymbolDataKey]: "ready",
        }));
        const gapStatus =
          isRealtimeHistory && windowRange?.isMarketOpen
            ? formatRealtimeGapStatus(written, {
                symbol: activeSymbol.dataSymbol,
                market: activeSymbol.market,
                timeframe: "realtime",
              })
            : null;
        recordMarketEvent(
          "sync-completed",
          `${activeSymbol.symbol} ${formatTimeframeLabel(timeframe)} 同步完成，共 ${written.length} 根`,
        );
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
        setRealtimeStatus(healthView.message);
        if (isRealtimeHistory && isMlptEnabled) {
          const confirmedBars = written.filter(
            (bar) => bar.timestamp <= confirmedThroughTimestamp,
          ).length;
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
            setMlptHistoryStatus(
              `${minimumCoverageStatus}，后台补全 ${confirmedBars}/${mlptPreferredHistoryBars}`,
            );
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
            })
              .then(async (backfillResult) => {
                if (cancelled || !backfillResult.ok) return;
                const backfillBars = gatewayBarsToMarketDataBars(backfillResult.data, "realtime");
                const latestCachedBars = await marketBarCacheRepository.read(cacheKey);
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
                const completed = await marketBarCacheRepository.write(cacheKey, completedBars, {
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
              })
              .catch(() => {
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
            setChartLoadState(
              createChartLoadState("ready", activeSymbol.symbol, timeframe, written.length),
            );
          }
        });
      } catch (error) {
        const errorHealth = createRealtimeHealthView("error", getErrorMessage(error));
        setRealtimeHealth(errorHealth);
        setRealtimeStatus(errorHealth.message);
        recordMarketEvent("error", errorHealth.message);
        const cachedBars = await marketBarCacheRepository.read({
          symbol: activeSymbol.dataSymbol,
          market: activeSymbol.market,
          timeframe: cacheTimeframe,
        });
        const hasCache = hasRenderableChartData(timeframe, cachedBars.length);
        setChartLoadState(
          createChartLoadState(
            hasCache ? "degraded" : "error",
            activeSymbol.symbol,
            timeframe,
            cachedBars.length,
            errorHealth.message,
          ),
        );
        setWatchlistDataStatusByKey((current) => ({
          ...current,
          [activeSymbolDataKey]: hasCache ? "degraded" : "error",
        }));
      }
    };

    void loadMarketDataHistory();

    return () => {
      cancelled = true;
    };
  }, [
    activeSymbol.dataSymbol,
    activeSymbol.market,
    activeSymbol.symbol,
    activeSymbolDataKey,
    marketBarCacheRepository,
    marketDataProviderSettings.stockSdkPrimaryEnabled,
    isMlptEnabled,
    realtimeHistoryRequirement.preferredBars,
    realtimeHistoryRequirement.sessionCount,
    recordMarketEvent,
    setCachedMarketBars,
    setChartLoadState,
    setMlptHistoryStatus,
    setRealtimeHealth,
    setRealtimeStatus,
    setWatchlistDataStatusByKey,
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
        const [cachedBars, cacheSummary] = await Promise.all([
          marketBarCacheRepository.read(cacheKey),
          marketBarCacheRepository.summary(),
        ]);
        const metadata = cacheSummary.entries.find(
          (entry) =>
            entry.symbol === cacheKey.symbol &&
            entry.market === cacheKey.market &&
            entry.timeframe === cacheKey.timeframe,
        );
        const isFresh = isChartWarmupCacheFresh(cacheTimeframe, metadata?.updatedAt);

        if (
          isFresh &&
          hasRenderableChartData(task.timeframe, cachedBars.length) &&
          hasSufficientHistoricalChartCache(task.timeframe, cachedBars.length)
        ) {
          setWatchlistDataStatusByKey((current) => ({
            ...current,
            [`${task.market}:${task.symbol}`]: "cache",
          }));
          continue;
        }

        setWatchlistDataStatusByKey((current) => ({
          ...current,
          [`${task.market}:${task.symbol}`]: "syncing",
        }));
        const isIntraday = task.timeframe === "realtime";
        const historyWindow = isIntraday
          ? getIntradayHistoryWindow(
              task.market,
              Date.now(),
              realtimeHistoryRequirement.sessionCount,
            )
          : null;

        if (
          isIntraday ? !marketDataAccess.hasIntradaySource : !marketDataAccess.hasHistoricalSource
        ) {
          setWatchlistDataStatusByKey((current) => ({
            ...current,
            [`${task.market}:${task.symbol}`]: hasRenderableChartData(
              task.timeframe,
              cachedBars.length,
            )
              ? "degraded"
              : "error",
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
            count: isIntraday
              ? realtimeHistoryRequirement.preferredBars
              : task.timeframe === "1w"
                ? 260
                : 600,
          },
        });

        if (cancelled) return;

        if (!result.ok) {
          setWatchlistDataStatusByKey((current) => ({
            ...current,
            [`${task.market}:${task.symbol}`]: hasRenderableChartData(
              task.timeframe,
              cachedBars.length,
            )
              ? "degraded"
              : "error",
          }));
          continue;
        }

        const resultBars = gatewayBarsToMarketDataBars(
          result.data,
          isIntraday ? "realtime" : undefined,
        );
        const nextBars = isIntraday
          ? mergeHistoricalRealtimeBarsWithLiveBars(
              resultBars,
              cachedBars,
              cacheKey,
              realtimeHistoryRequirement.sessionCount,
            )
          : resultBars;
        const written = await marketBarCacheRepository.write(cacheKey, nextBars, {
          mergeExisting: !isIntraday,
        });
        setWatchlistDataStatusByKey((current) => ({
          ...current,
          [`${task.market}:${task.symbol}`]: hasRenderableChartData(task.timeframe, written.length)
            ? "ready"
            : "error",
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
    marketBarCacheRepository,
    marketDataProviderSettings.stockSdkPrimaryEnabled,
    realtimeHistoryRequirement.preferredBars,
    realtimeHistoryRequirement.sessionCount,
    setWatchlistDataStatusByKey,
    timeframe,
    watchlist,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!enableAlphaFeedHistoricalIntradayBackfill || timeframe !== "realtime") {
      return () => undefined;
    }

    const loadIntradayHistory = async () => {
      const windowRange = getIntradayHistoryWindow(
        activeSymbol.market,
        Date.now(),
        realtimeHistoryRequirement.sessionCount,
      );

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
                gatewayHealth.status === "unauthorized"
                  ? "AlphaFeed 当前套餐无 1m 历史分时权限"
                  : result.error.message,
                {
                  capability: "intradayBars",
                  triedProviders: result.triedProviders,
                },
              )
            : createRealtimeHealthView("error", result.error.message);
          setRealtimeHealth(healthView);
          setRealtimeStatus(healthView.message);
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

        const written = await marketBarCacheRepository.write(
          {
            symbol: activeSymbol.dataSymbol,
            market: activeSymbol.market,
            timeframe: "realtime",
          },
          realtimeBars,
        );
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
        setRealtimeStatus(healthView.message);
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
    marketBarCacheRepository,
    marketDataProviderSettings.stockSdkPrimaryEnabled,
    realtimeHistoryRequirement.preferredBars,
    realtimeHistoryRequirement.sessionCount,
    setCachedMarketBars,
    setRealtimeHealth,
    setRealtimeStatus,
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
            const nextQuoteSnapshotsByKey = mergeQuoteSnapshots(
              quoteSnapshotsByKeyRef.current,
              Array.from(streamResult.snapshots),
            );
            const snapshot =
              nextQuoteSnapshotsByKey[`${activeSymbol.market}:${activeSymbol.dataSymbol}`];
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
              `WebSocket 流式更新 ${streamResult.snapshots.length} 只`,
            );
            setRealtimeHealth(healthView);
            setRealtimeStatus(healthView.message);
            timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
            return;
          }

          if (!marketDataAccess.hasQuoteSource) {
            const streamGatewayHealth = streamResult.ok
              ? streamResult.health
              : (streamResult.health[0] ?? connectHealth);
            const streamHealth = streamGatewayHealth
              ? createRealtimeHealthViewFromGateway(
                  streamGatewayHealth,
                  streamResult.ok
                    ? "WebSocket 正在连接，等待首批快照"
                    : streamGatewayHealth.message,
                )
              : createRealtimeHealthView("waiting", "WebSocket 正在连接，等待首批快照");
            setRealtimeHealth(streamHealth);
            setRealtimeStatus(streamHealth.message);
            timeoutId = window.setTimeout(() => void poll(), realtimePollIntervalMs);
            return;
          }
        }

        if (!marketDataAccess.hasQuoteSource) {
          const waitingHealth = createRealtimeHealthView(
            "waiting",
            "等待主行情源或备用 REST 实时源",
          );
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
            const nextRetryAt = health?.nextRetryAt
              ? new Date(health.nextRetryAt).getTime()
              : Date.now() + realtimeRateLimitBackoffMs;
            const nextDelay = isRateLimited
              ? Math.max(realtimePollIntervalMs, nextRetryAt - Date.now())
              : realtimePollIntervalMs;
            const healthView = health
              ? createRealtimeHealthViewFromGateway(
                  health,
                  isRateLimited ? "AlphaFeed 限频，已自动退避" : result.error.message,
                  {
                    capability: "realtimeQuote",
                    triedProviders: result.triedProviders,
                  },
                )
              : createRealtimeHealthView("error", result.error.message);
            setRealtimeHealth(healthView);
            setRealtimeStatus(healthView.message);
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

        const nextQuoteSnapshotsByKey = mergeQuoteSnapshots(
          quoteSnapshotsByKeyRef.current,
          snapshots,
        );
        const snapshot =
          nextQuoteSnapshotsByKey[`${activeSymbol.market}:${activeSymbol.dataSymbol}`];
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
            message: `${baseHealth.message} · 更新 ${snapshots.length} 只`,
            checkedAt: new Date(snapshot.receivedAt).toISOString(),
          };
          setRealtimeHealth(healthView);
          setRealtimeStatus(healthView.message);
        } else {
          const baseHealth = latestHealth
            ? createRealtimeHealthViewFromGateway(latestHealth, "批量轮询成功", {
                capability: "realtimeQuote",
                triedProviders: latestTriedProviders,
              })
            : createRealtimeHealthView("ok", "AlphaFeed 批量轮询成功");
          const healthView: RealtimeProviderHealthView = {
            ...baseHealth,
            message:
              snapshots.length > 0
                ? `${baseHealth.message} · 当前标的暂无快照，已保留上一轮缓存`
                : `${baseHealth.message} · 暂无快照`,
          };
          setRealtimeHealth(healthView);
          setRealtimeStatus(healthView.message);
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
    quoteSnapshotsByKeyRef,
    setCachedMarketBars,
    setQuoteSnapshotsByKey,
    setRealtimeHealth,
    setRealtimeStatus,
    timeframe,
    mergeActiveSnapshotBars,
    writeActiveSnapshotBars,
  ]);
}
