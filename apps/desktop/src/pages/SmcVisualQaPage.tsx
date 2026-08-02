import { ChartViewport, type ChartLayer } from "@quant/chart";
import {
  createPresetStrategyRegistry,
  createSmcVisualFixture,
  runRegisteredStrategy,
} from "@quant/strategy-engine";

import { toChartLayerElement } from "../features/strategies/strategyVisualAdapter";
import { formatStrategyDisplayName } from "../features/strategies/chartStrategyRuntime";

const fixtureBars = createSmcVisualFixture();
const fixtureOutput = runRegisteredStrategy(createPresetStrategyRegistry(), {
  strategyKey: "smart-money-concepts",
  symbol: "DXY",
  market: "US",
  timeframe: "realtime",
  bars: fixtureBars,
  runMode: "realtime",
  enabled: true,
  parameters: {
    swingLength: 10,
    showSwingPoints: false,
    showSwingOrderBlocks: true,
    showFairValueGaps: true,
    fairValueGapAutoThreshold: true,
    showPremiumDiscountZones: false,
    equalHighLowLength: 10,
    equalHighLowThreshold: 0.5,
  },
}).output;

const smcLayer: ChartLayer = {
  strategyId: fixtureOutput.render.strategyId,
  strategyName: formatStrategyDisplayName(fixtureOutput.render.strategyName),
  enabled: true,
  zIndex: fixtureOutput.render.zIndex,
  elements: fixtureOutput.render.elements.map(toChartLayerElement),
};

export function SmcVisualQaPage() {
  return (
    <main className="smc-visual-qa">
      <div className="smc-visual-qa-title">
        <strong>U.S. Dollar Index · SMC visual fixture</strong>
        <span>Smart Money Concepts</span>
      </div>
      <ChartViewport
        canvasHeight={842}
        canvasWidth={1984}
        candles={fixtureBars.map((bar) => ({
          ...bar,
          time: new Date(bar.timestamp).toISOString(),
        }))}
        context={{ symbol: "DXY", market: "US", timeframe: "realtime" }}
        displayMode="candlestick"
        initialVisibleBars={fixtureBars.length}
        showCrosshair={false}
        showCurrentPriceLine
        showGrid={false}
        showPriceLabels
        showSignals={false}
        showStrategyLayers
        strategyLayers={[smcLayer]}
      />
    </main>
  );
}
