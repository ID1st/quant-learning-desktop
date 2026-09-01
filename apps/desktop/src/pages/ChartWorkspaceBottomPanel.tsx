import { setIndicatorEnabled } from "../features/chartIndicators/chartIndicators";
import { formatStrategyDisplayName } from "../features/strategies/chartStrategyRuntime";
import { useI18n } from "../i18n/I18nProvider";

import {
  Bell,
  CheckCircle2,
  ChevronUp,
  Eye,
  EyeOff,
  Layers3,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  Activity,
} from "lucide-react";

import {
  formatStrategySource,
  getRealtimeHealthBadgeClass,
  formatRealtimeHealthDetail,
  formatStatusClock,
  getStrategyLayerStatus,
} from "./chartWorkspaceModel";

import type { ChartWorkspaceController } from "./ChartWorkspacePage";

interface ChartWorkspaceBottomPanelProps {
  readonly controller: ChartWorkspaceController;
}

export function ChartWorkspaceBottomPanel({ controller }: ChartWorkspaceBottomPanelProps) {
  const { formatTime, t } = useI18n();
  const {
    updateIndicatorSettings,
    cachedCandles,
    allIndicatorDefinitions,
    overlayIndicatorEvaluations,
    secondaryIndicatorEvaluation,
    drawingLayer,
    strategyInputBars,
    strategyRuns,
    mlptChartNotice,
    canShowStrategyLayers,
    strategyLayerElementCount,
    enabledStrategyCount,
    totalSignalCount,
    strategyLogTime,
    strategyLogItems,
    signalRows,
    selectedSignal,
    selectedSignalRun,
    updateStrategyState,
    deleteDrawing,
    toggleDrawingVisibility,
    editDrawing,
    openDiagnostics,
    moveLayer,
    timeframe,
    mlptHistoryStatus,
    realtimeHealth,
    showStrategyLayers,
    setShowStrategyLayers,
    setActiveIndicatorConfigId,
    setActiveConfigStrategyKey,
    bottomTab,
    setBottomTab,
    setSelectedSignalId,
    isBottomDockExpanded,
    setIsBottomDockExpanded,
    drawings,
    selectedDrawingId,
    setSelectedDrawingId,
  } = controller;
  return (
    <footer className={isBottomDockExpanded ? "chart-bottom-panel expanded" : "chart-bottom-panel"}>
      <div className="bottom-status-strip" aria-label={t("行情状态")}>
        <span className={getRealtimeHealthBadgeClass(realtimeHealth.status)}>
          {realtimeHealth.status}
        </span>
        <strong>
          {cachedCandles.length > 0
            ? t("{count} 根K线", { count: cachedCandles.length })
            : t("等待行情数据")}
        </strong>
        <em>{t(formatRealtimeHealthDetail(realtimeHealth, (value) => formatTime(value)))}</em>
        {mlptHistoryStatus && !mlptChartNotice && (
          <small role="status">{t(mlptHistoryStatus)}</small>
        )}
        <small>
          {t("更新 {time}", {
            time: formatStatusClock(realtimeHealth.checkedAt, (value) => formatTime(value)),
          })}
        </small>
        <button
          aria-label={t("打开数据诊断")}
          onClick={() => void openDiagnostics()}
          title={t("数据诊断")}
          type="button"
        >
          <Activity size={14} />
          {t("诊断")}
        </button>
      </div>

      <div className="bottom-tabbar" role="tablist" aria-label={t("图表底部面板")}>
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
          {t("图层")}
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
          {t("条件事件")}
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
          {t("日志")}
        </button>
        <button
          aria-label={isBottomDockExpanded ? t("收起底部面板") : t("展开底部面板")}
          className="bottom-dock-toggle"
          onClick={() => setIsBottomDockExpanded((value) => !value)}
          title={isBottomDockExpanded ? t("收起底部面板") : t("展开底部面板")}
          type="button"
        >
          <ChevronUp size={14} />
        </button>
      </div>

      <div className="bottom-panel-body">
        {bottomTab === "layers" && (
          <div className="bottom-strategy-panel">
            <div className="bottom-panel-heading">
              <strong>{t("{count} 个策略启用", { count: enabledStrategyCount })}</strong>
              <span>
                {canShowStrategyLayers
                  ? t("{signals} 个条件事件，{layers} 个图层元素", {
                      signals: totalSignalCount,
                      layers: strategyLayerElementCount,
                    })
                  : t("策略图层已隐藏")}
              </span>
              <button
                aria-label={showStrategyLayers ? t("隐藏策略图层") : t("显示策略图层")}
                onClick={() => setShowStrategyLayers((value) => !value)}
                type="button"
              >
                {showStrategyLayers ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
            <div className="bottom-layer-list">
              <div className="layer-item active">
                <span>
                  <strong>
                    {t("K 线 / 价格")}
                    <em className="strategy-source-badge system">{t("基础图层")}</em>
                  </strong>
                  <small>{t("主图价格序列")}</small>
                </span>
                <div className="layer-actions">
                  <button className="active" disabled type="button">
                    {t("显示")}
                  </button>
                </div>
              </div>
              {strategyRuns.map(({ strategy, settings, result }) => {
                const layerStatus = getStrategyLayerStatus(
                  strategy,
                  settings,
                  result,
                  timeframe,
                  strategyInputBars.length,
                );
                const isLayerVisible =
                  settings.enabled &&
                  canShowStrategyLayers &&
                  settings.showLayer &&
                  layerStatus.className === "active";

                return (
                  <div
                    className={
                      isLayerVisible ? "layer-item active" : `layer-item ${layerStatus.className}`
                    }
                    key={strategy.key}
                  >
                    <span>
                      <strong>
                        {formatStrategyDisplayName(strategy.name)}
                        <em className={`strategy-source-badge ${strategy.sourceType}`}>
                          {formatStrategySource(strategy)}
                        </em>
                        <em className={`layer-status-badge ${layerStatus.className}`}>
                          {t(layerStatus.label)}
                        </em>
                      </strong>
                      <small>
                        {t("{count} 个元素 · z{index}", {
                          count: result.output.render.elements.length,
                          index: result.output.render.zIndex,
                        })}
                      </small>
                    </span>
                    <div className="layer-actions">
                      <button
                        aria-pressed={settings.enabled}
                        className={settings.enabled ? "active" : ""}
                        onClick={() =>
                          updateStrategyState(strategy.key, (state) => ({
                            ...state,
                            enabled: !state.enabled,
                            showLayer: !state.enabled,
                          }))
                        }
                        type="button"
                      >
                        {t("启用")}
                      </button>
                      <button
                        aria-pressed={settings.showLayer}
                        className={settings.showLayer ? "active" : ""}
                        disabled={!settings.enabled}
                        onClick={() =>
                          updateStrategyState(strategy.key, (state) => ({
                            ...state,
                            showLayer: !state.showLayer,
                          }))
                        }
                        type="button"
                      >
                        {t("图层")}
                      </button>
                      <button
                        onClick={() => setActiveConfigStrategyKey(strategy.key)}
                        type="button"
                      >
                        <SlidersHorizontal size={13} />
                        {t("参数")}
                      </button>
                      <button
                        aria-label={t("{name} 上移图层", {
                          name: formatStrategyDisplayName(strategy.name),
                        })}
                        onClick={() => moveLayer(strategy.key, -1)}
                        title={t("上移图层")}
                        type="button"
                      >
                        {t("上移")}
                      </button>
                      <button
                        aria-label={t("{name} 下移图层", {
                          name: formatStrategyDisplayName(strategy.name),
                        })}
                        onClick={() => moveLayer(strategy.key, 1)}
                        title={t("下移图层")}
                        type="button"
                      >
                        {t("下移")}
                      </button>
                    </div>
                  </div>
                );
              })}
              {overlayIndicatorEvaluations.map((evaluation) => (
                <div className="layer-item active" key={evaluation.layer.id}>
                  <span>
                    <strong>
                      {evaluation.layer.name}
                      <em className="strategy-source-badge plugin">{t("指标")}</em>
                    </strong>
                    <small>
                      {t("{count} 个渲染元素", { count: evaluation.layer.elements.length })}
                    </small>
                  </span>
                  <div className="layer-actions">
                    {allIndicatorDefinitions.some(
                      (definition) =>
                        definition.id === evaluation.id && definition.parameters.length > 0,
                    ) && (
                      <button
                        onClick={() => setActiveIndicatorConfigId(evaluation.id)}
                        type="button"
                      >
                        <SlidersHorizontal size={13} />
                        {t("参数")}
                      </button>
                    )}
                    <button
                      onClick={() =>
                        updateIndicatorSettings((current) =>
                          setIndicatorEnabled(
                            current,
                            evaluation.id,
                            false,
                            allIndicatorDefinitions,
                          ),
                        )
                      }
                      type="button"
                    >
                      {t("关闭")}
                    </button>
                    <button
                      onClick={() => moveLayer(evaluation.layer.id, -1)}
                      title={t("上移图层")}
                      type="button"
                    >
                      {t("上移")}
                    </button>
                    <button
                      onClick={() => moveLayer(evaluation.layer.id, 1)}
                      title={t("下移图层")}
                      type="button"
                    >
                      {t("下移")}
                    </button>
                  </div>
                </div>
              ))}
              {secondaryIndicatorEvaluation && (
                <div className="layer-item active">
                  <span>
                    <strong>
                      {secondaryIndicatorEvaluation.pane.name}
                      <em className="strategy-source-badge plugin">{t("副图指标")}</em>
                    </strong>
                    <small>
                      {t("{summary} · 独立纵轴", {
                        summary: secondaryIndicatorEvaluation.pane.parameterSummary,
                      })}
                    </small>
                  </span>
                  <div className="layer-actions">
                    <button
                      onClick={() => setActiveIndicatorConfigId(secondaryIndicatorEvaluation.id)}
                      type="button"
                    >
                      <SlidersHorizontal size={13} />
                      {t("参数")}
                    </button>
                    <button
                      onClick={() =>
                        updateIndicatorSettings((current) =>
                          setIndicatorEnabled(
                            current,
                            secondaryIndicatorEvaluation.id,
                            false,
                            allIndicatorDefinitions,
                          ),
                        )
                      }
                      type="button"
                    >
                      {t("关闭")}
                    </button>
                  </div>
                </div>
              )}
              {drawings.map((drawing) => (
                <div
                  className={selectedDrawingId === drawing.id ? "layer-item active" : "layer-item"}
                  key={drawing.id}
                  onClick={() =>
                    setSelectedDrawingId((current) => (current === drawing.id ? null : drawing.id))
                  }
                >
                  <span>
                    <strong>
                      {drawing.type === "trend-line"
                        ? t("趋势线")
                        : drawing.type === "horizontal-line"
                          ? t("水平线")
                          : t("文字标注")}
                      <em className="strategy-source-badge user">{t("绘图")}</em>
                    </strong>
                    <small>{drawing.visible ? t("显示中") : t("已隐藏")}</small>
                  </span>
                  <div className="layer-actions">
                    <button onClick={() => toggleDrawingVisibility(drawing.id)} type="button">
                      {drawing.visible ? t("隐藏") : t("显示")}
                    </button>
                    <button onClick={() => editDrawing(drawing.id)} type="button">
                      {t("编辑")}
                    </button>
                    <button
                      onClick={() => moveLayer(drawingLayer.id, -1)}
                      title={t("上移图层")}
                      type="button"
                    >
                      {t("上移")}
                    </button>
                    <button
                      onClick={() => moveLayer(drawingLayer.id, 1)}
                      title={t("下移图层")}
                      type="button"
                    >
                      {t("下移")}
                    </button>
                    <button onClick={() => deleteDrawing(drawing.id)} type="button">
                      {t("删除")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {bottomTab === "signals" && (
          <div className="bottom-single-panel">
            <div className="bottom-panel-heading">
              <strong>
                {signalRows.length > 0
                  ? t("{count} 个策略条件事件", { count: signalRows.length })
                  : t("暂无策略条件事件")}
              </strong>
              <span>{t("仅展示当前标的和周期下的策略输出")}</span>
            </div>
            {signalRows.length > 0 ? (
              <div className="signal-detail-list" aria-label={t("策略条件事件明细")}>
                {signalRows.map((signal) => (
                  <button
                    aria-pressed={selectedSignal?.id === signal.id}
                    className={`signal-detail-row ${signal.tone}${selectedSignal?.id === signal.id ? " active" : ""}`}
                    key={signal.id}
                    onClick={() => setSelectedSignalId(signal.id)}
                    type="button"
                  >
                    <ShieldCheck size={14} />
                    <span>{signal.time}</span>
                    <strong>{signal.direction}</strong>
                    <small>{signal.price}</small>
                    <em>
                      {signal.strategyName} / {signal.label}
                    </em>
                  </button>
                ))}
              </div>
            ) : (
              <span>{t("当前参数下没有触发策略条件事件。")}</span>
            )}
            {selectedSignal && selectedSignalRun && (
              <aside className="signal-research-inspector" aria-label={t("策略条件事件研究详情")}>
                <div>
                  <strong>{selectedSignal.strategyName}</strong>
                  <button onClick={() => setSelectedSignalId(null)} type="button">
                    {t("关闭")}
                  </button>
                </div>
                <span>
                  {selectedSignal.direction} · {selectedSignal.price} · {selectedSignal.time}
                </span>
                <small>{selectedSignal.label}</small>
                <dl>
                  <dt>{t("参数")}</dt>
                  <dd>
                    {Object.entries(selectedSignalRun.settings.parameters)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(" · ") || t("默认参数")}
                  </dd>
                  <dt>{t("日志")}</dt>
                  <dd>
                    {selectedSignalRun.result.output.logs.at(-1) ?? t("当前运行未产生额外日志")}
                  </dd>
                </dl>
                <button
                  onClick={() => {
                    setActiveConfigStrategyKey(selectedSignal.strategyKey);
                    setBottomTab("layers");
                  }}
                  type="button"
                >
                  {t("查看策略配置")}
                </button>
              </aside>
            )}
          </div>
        )}

        {bottomTab === "logs" && (
          <div className="bottom-single-panel">
            <div className="bottom-panel-heading">
              <strong>{t("策略运行日志")}</strong>
              <span>{t("{count} 条记录", { count: strategyLogItems.length })}</span>
            </div>
            <div className="chart-log-list" role="log" aria-label={t("策略运行日志")}>
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
  );
}
