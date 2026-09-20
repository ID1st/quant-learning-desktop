import { useEffect, useMemo, useRef } from "react";
import type { ChartLayer } from "@quant/chart";
import type { Market, Timeframe } from "@quant/shared";
import {
  createStrategyInput,
  type Bar,
  type StrategyDefinition,
  type StrategyRegistry,
} from "@quant/strategy-engine";
import { usePluginRuntimeStore } from "../features/plugins/pluginRuntimeStore";
import {
  formatStrategyDisplayName,
  getMlptChartNotice,
  runChartStrategies,
  type ChartStrategyWorkspaceState,
} from "../features/strategies/chartStrategyRuntime";
import { createStrategySeriesByTimeframe } from "../features/strategies/strategySeries";
import { toChartLayerElement } from "../features/strategies/strategyVisualAdapter";
import { isMarketSessionOpen } from "../features/marketData/intradayHistoryService";
import { getDefaultStrategyState } from "./chartWorkspaceModel";
import { useI18n } from "../i18n/I18nProvider";

interface UseChartStrategyRunsOptions {
  readonly chartStrategies: readonly StrategyDefinition[];
  readonly chartStrategyRegistry: StrategyRegistry;
  readonly strategySettings: Record<string, ChartStrategyWorkspaceState>;
  readonly activeSymbol: {
    readonly dataSymbol: string;
    readonly market: Market;
  };
  readonly timeframe: Timeframe;
  readonly chartHasRenderableData: boolean;
  readonly strategyInputBars: Bar[];
  readonly dailyStrategyBars: Bar[];
  readonly weeklyStrategyBars: Bar[];
}

export function useChartStrategyRuns({
  chartStrategies,
  chartStrategyRegistry,
  strategySettings,
  activeSymbol,
  timeframe,
  chartHasRenderableData,
  strategyInputBars,
  dailyStrategyBars,
  weeklyStrategyBars,
}: UseChartStrategyRunsOptions) {
  const { language } = useI18n();
  const runPluginStrategies = usePluginRuntimeStore((state) => state.runStrategies);
  const strategySeriesByTimeframe = useMemo(() => {
    return createStrategySeriesByTimeframe({
      primaryBars: strategyInputBars,
      primaryTimeframe: timeframe,
      market: activeSymbol.market,
      asOfTimestamp: Date.now(),
      dailyBars: dailyStrategyBars,
      weeklyBars: weeklyStrategyBars,
    });
  }, [activeSymbol.market, dailyStrategyBars, strategyInputBars, timeframe, weeklyStrategyBars]);
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
    [
      activeSymbol.dataSymbol,
      activeSymbol.market,
      chartHasRenderableData,
      chartStrategies,
      chartStrategyRegistry,
      strategyInputBars,
      strategySeriesByTimeframe,
      strategySettings,
      timeframe,
    ],
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
      strategies: chartStrategies
        .filter((strategy) => strategy.sourceType === "plugin")
        .map((strategy) => ({
          key: strategy.key,
          enabled: strategySettings[strategy.key]?.enabled ?? false,
          parameters: strategySettings[strategy.key]?.parameters ?? {},
        })),
    });
  }, [
    activeSymbol.dataSymbol,
    activeSymbol.market,
    chartHasRenderableData,
    chartStrategies,
    strategyInputBars,
    strategySettings,
    timeframe,
  ]);
  const lastPluginStrategyRunSignatureRef = useRef("");
  useEffect(() => {
    if (
      pluginStrategyRunSignature === lastPluginStrategyRunSignatureRef.current ||
      !chartHasRenderableData
    )
      return;
    lastPluginStrategyRunSignatureRef.current = pluginStrategyRunSignature;
    const requests = chartStrategies
      .filter(
        (strategy) =>
          strategy.sourceType === "plugin" && strategy.supportedTimeframes.includes(timeframe),
      )
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
  }, [
    activeSymbol.dataSymbol,
    activeSymbol.market,
    chartHasRenderableData,
    chartStrategies,
    pluginStrategyRunSignature,
    runPluginStrategies,
    strategyInputBars,
    strategySeriesByTimeframe,
    strategySettings,
    timeframe,
  ]);
  const strategyLayers = useMemo<ChartLayer[]>(
    () =>
      strategyRuns.map(({ result, settings }) => ({
        ...result.output.render,
        strategyName: formatStrategyDisplayName(result.strategy, language),
        enabled: result.output.render.enabled && settings.enabled && settings.showLayer,
        elements: result.output.render.elements.map(toChartLayerElement),
      })),
    [language, strategyRuns],
  );
  return {
    strategyRuns,
    mlptChartNotice,
    strategyLayers,
  };
}
