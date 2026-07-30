import { useMemo, useState } from "react";
import { ChartViewport, type CandlePoint } from "@quant/chart";
import {
  builtInChartIndicatorDefinitions,
  createChartIndicatorEvaluations,
  defaultChartIndicatorSettings,
  setIndicatorEnabled,
} from "../features/chartIndicators/chartIndicators.ts";
import { IndicatorQuickMenu } from "../features/chartWorkspace/IndicatorQuickMenu.tsx";

const candles: CandlePoint[] = Array.from({ length: 120 }, (_, index) => {
  const base = 100 + index * 0.12 + Math.sin(index / 5) * 3;
  const open = base + Math.sin(index / 3) * 0.8;
  const close = base + Math.cos(index / 4) * 0.9;
  return {
    time: `07-${String((index % 28) + 1).padStart(2, "0")}`,
    timestamp: 1_720_000_000_000 + index * 86_400_000,
    open,
    high: Math.max(open, close) + 1.1,
    low: Math.min(open, close) - 1.1,
    close,
    volume: 500_000 + Math.round(Math.abs(Math.sin(index / 7)) * 900_000),
  };
});

export function IndicatorPaneVisualQaPage() {
  const [settings, setSettings] = useState(defaultChartIndicatorSettings);
  const [ratio, setRatio] = useState(0.26);
  const evaluations = useMemo(
    () =>
      createChartIndicatorEvaluations(
        candles,
        settings,
        "cross-market",
        builtInChartIndicatorDefinitions,
      ),
    [settings],
  );
  const overlays = evaluations.flatMap((evaluation) =>
    evaluation.placement === "overlay" ? [evaluation.layer] : [],
  );
  const secondary = evaluations.find(
    (evaluation): evaluation is Extract<(typeof evaluations)[number], { placement: "pane" }> =>
      evaluation.placement === "pane",
  );

  return (
    <main className="indicator-pane-visual-qa">
      <div className="indicator-pane-visual-qa-toolbar">
        <strong>技术指标单副图 Visual QA</strong>
        <div className="chart-toggle-group">
          <IndicatorQuickMenu
            market="US"
            onOpenParameters={() => undefined}
            settings={settings}
            updateSettings={(update) => setSettings(update)}
          />
        </div>
        <button
          onClick={() =>
            setSettings((current) =>
              setIndicatorEnabled(current, "ma", !current.instances.ma?.enabled),
            )
          }
          type="button"
        >
          切换 MA
        </button>
        <button
          onClick={() =>
            setSettings((current) =>
              setIndicatorEnabled(current, "boll", !current.instances.boll?.enabled),
            )
          }
          type="button"
        >
          切换 BOLL
        </button>
        <button
          onClick={() =>
            setSettings((current) =>
              setIndicatorEnabled(current, "macd", !current.instances.macd?.enabled),
            )
          }
          type="button"
        >
          切换 MACD
        </button>
        <button
          onClick={() =>
            setSettings((current) =>
              setIndicatorEnabled(current, "rsi", !current.instances.rsi?.enabled),
            )
          }
          type="button"
        >
          切换 RSI
        </button>
      </div>
      <ChartViewport
        candles={candles}
        context={{ symbol: "QA", market: "US", timeframe: "1d" }}
        layers={overlays}
        onSecondaryPaneClose={() =>
          secondary && setSettings((current) => setIndicatorEnabled(current, secondary.id, false))
        }
        onSecondaryPaneRatioChange={setRatio}
        secondaryPane={secondary?.pane}
        secondaryPaneRatio={ratio}
        showSignals={false}
        strategyLayers={[]}
      />
    </main>
  );
}
