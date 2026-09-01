import { ChartViewport, type ChartLayer } from "@quant/chart";
import { useI18n } from "../i18n/I18nProvider";
import {
  createMachineLearningPriceTargetsVisualFixture,
  createPresetStrategyRegistry,
  runRegisteredStrategy,
} from "@quant/strategy-engine";

import { toChartLayerElement } from "../features/strategies/strategyVisualAdapter";

const fixtureBars = createMachineLearningPriceTargetsVisualFixture();
const fixtureOutput = runRegisteredStrategy(createPresetStrategyRegistry(), {
  strategyKey: "machine-learning-price-targets",
  symbol: "BTC/USDT",
  market: "US",
  timeframe: "realtime",
  bars: fixtureBars,
  runMode: "realtime",
  enabled: true,
}).output;

const fixtureLayer: ChartLayer = {
  strategyId: fixtureOutput.render.strategyId,
  strategyName: fixtureOutput.render.strategyName,
  enabled: true,
  zIndex: fixtureOutput.render.zIndex,
  elements: fixtureOutput.render.elements.map(toChartLayerElement),
  hudPanels: fixtureOutput.render.hudPanels,
};

export function MlPriceTargetsVisualQaPage() {
  const { formatChartTime } = useI18n();
  return (
    <main className="ml-price-targets-visual-qa">
      <div className="ml-price-targets-visual-qa-title">
        <strong>Bitcoin / Tether · 1m · Visual fixture</strong>
        <span>Machine Learning Price Movement Study · EMA Cross (Fast Slow)</span>
      </div>
      <ChartViewport
        canvasHeight={806}
        canvasWidth={2026}
        candles={fixtureBars.map((bar) => ({
          ...bar,
          time: formatChartTime(bar.timestamp, "realtime", ""),
        }))}
        context={{ symbol: "BTC/USDT", market: "US", timeframe: "realtime" }}
        displayMode="candlestick"
        initialVisibleBars={160}
        showCrosshair={false}
        showCurrentPriceLine
        showGrid={false}
        showPriceLabels
        showSignals={false}
        showStrategyLayers
        strategyLayers={[fixtureLayer]}
      />
    </main>
  );
}
