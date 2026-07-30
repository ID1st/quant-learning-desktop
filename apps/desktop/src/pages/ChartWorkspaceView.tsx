import { ChartViewport } from "@quant/chart";

import {
  realtimePollIntervalOptionsMs,
  sanitizeRealtimePollIntervalMs,
} from "../features/marketData/realtimeQuotePollingService";

import { formatMarketDataRuntimeEventKind } from "../features/marketData/marketDataRuntimeStatus";

import {
  getIndicatorInstance,
  getIndicatorParameters,
  setIndicatorEnabled,
  updateIndicatorParameter,
} from "../features/chartIndicators/chartIndicators";

import {
  CircleAlert,
  Crosshair,
  ChevronRight,
  EyeOff,
  Layers3,
  LineChart,
  MousePointer2,
  PencilLine,
  RotateCcw,
  Ruler,
  Settings2,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  X,
  Type,
  Undo2,
  Redo2,
} from "lucide-react";

import {
  getWatchlistDataKey,
  formatWatchlistDataStatus,
  getNumberInputMinimum,
  getNumberInputMaximum,
  getNumberInputStep,
  sanitizeChartDisplayMode,
  formatStrategySource,
  getRealtimeHealthBadgeClass,
  formatRealtimeHealthDetail,
  formatStatusClock,
  formatQuotePrice,
  formatQuoteChange,
} from "./chartWorkspaceModel";

import type { ChartWorkspaceController } from "./ChartWorkspacePage";
import { ChartWorkspaceToolbar } from "./ChartWorkspaceToolbar";
import { ChartWorkspaceBottomPanel } from "./ChartWorkspaceBottomPanel";

interface ChartWorkspaceViewProps {
  readonly controller: ChartWorkspaceController;
}

export function ChartWorkspaceView({ controller }: ChartWorkspaceViewProps) {
  const {
    indicatorSettings,
    updateIndicatorSettings,
    chartHasRenderableData,
    chartViewportLoadingState,
    allIndicatorDefinitions,
    indicatorConvention,
    secondaryIndicatorEvaluation,
    renderedCandles,
    mlptChartNotice,
    orderedStrategyLayers,
    orderedExtraLayers,
    canShowStrategyLayers,
    activeConfigStrategyRun,
    updateStrategyParameter,
    resetChartView,
    selectActiveSymbol,
    runInstrumentSearch,
    addInstrumentToWatchlist,
    removeWatchlistItem,
    executeDrawingCommand,
    undoDrawingCommand,
    redoDrawingCommand,
    placeDrawingPoint,
    moveDrawing,
    watchlist,
    activeSymbol,
    timeframe,
    watchlistDataStatusByKey,
    realtimeHealth,
    quoteSnapshotsByKey,
    showSignals,
    showStrategyLayers,
    setShowStrategyLayers,
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
    isBottomDockExpanded,
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
    setSelectedDrawingId,
    activeDrawingTool,
    setActiveDrawingTool,
    setPendingTrendPoint,
  } = controller;
  return (
    <section
      className={
        isBottomDockExpanded ? "chart-workspace-page bottom-dock-expanded" : "chart-workspace-page"
      }
    >
      <ChartWorkspaceToolbar controller={controller} />

      <div
        className={
          isWatchlistCollapsed ? "chart-workspace-grid watchlist-collapsed" : "chart-workspace-grid"
        }
      >
        <aside className="chart-tool-rail" aria-label="画线工具">
          <button className="active" type="button" title="光标">
            <MousePointer2 size={18} />
          </button>
          <button type="button" title="十字光标">
            <Crosshair size={18} />
          </button>
          <button
            className={activeDrawingTool === "trend-line" ? "active" : ""}
            onClick={() => {
              setActiveDrawingTool("trend-line");
              setPendingTrendPoint(null);
            }}
            type="button"
            title="绘制趋势线"
          >
            <PencilLine size={18} />
          </button>
          <button
            className={activeDrawingTool === "horizontal-line" ? "active" : ""}
            onClick={() => {
              setActiveDrawingTool("horizontal-line");
              setPendingTrendPoint(null);
            }}
            type="button"
            title="绘制水平线"
          >
            <Ruler size={18} />
          </button>
          <button
            className={activeDrawingTool === "text" ? "active" : ""}
            onClick={() => {
              setActiveDrawingTool("text");
              setPendingTrendPoint(null);
            }}
            type="button"
            title="添加文字标注"
          >
            <Type size={18} />
          </button>
          <button
            disabled={!activeDrawingTool}
            onClick={() => {
              setActiveDrawingTool(null);
              setPendingTrendPoint(null);
            }}
            type="button"
            title="取消当前绘图工具"
          >
            <X size={18} />
          </button>
          <button
            onClick={() => setChartFocusLatestKey((value) => value + 1)}
            type="button"
            title="回到最新数据"
          >
            <RotateCcw size={18} />
          </button>
          <button
            className={isPriceScaleLocked ? "active" : ""}
            onClick={() => setIsPriceScaleLocked((value) => !value)}
            type="button"
            title={isPriceScaleLocked ? "解锁价格比例" : "锁定价格比例"}
          >
            <Ruler size={18} />
          </button>
          <button
            disabled={drawingCommandState.undoStack.length === 0}
            onClick={undoDrawingCommand}
            type="button"
            title="撤销绘图"
          >
            <Undo2 size={18} />
          </button>
          <button
            disabled={drawingCommandState.redoStack.length === 0}
            onClick={redoDrawingCommand}
            type="button"
            title="重做绘图"
          >
            <Redo2 size={18} />
          </button>
          <button
            disabled={drawings.length === 0}
            onClick={() => {
              executeDrawingCommand({ type: "clear" });
              setSelectedDrawingId(null);
            }}
            type="button"
            title="清空当前标的和周期的绘图"
          >
            <Trash2 size={18} />
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
            showPriceLabels={showPriceLabels}
            showSignals={showSignals}
            showStrategyLayers={canShowStrategyLayers}
            secondaryPane={secondaryIndicatorEvaluation?.pane}
            secondaryPaneRatio={secondaryPaneRatio}
            onSecondaryPaneRatioChange={setSecondaryPaneRatio}
            onSecondaryPaneClose={() => {
              if (secondaryIndicatorEvaluation) {
                updateIndicatorSettings((current) =>
                  setIndicatorEnabled(
                    current,
                    secondaryIndicatorEvaluation.id,
                    false,
                    allIndicatorDefinitions,
                  ),
                );
              }
            }}
            onSecondaryPaneSettings={() => {
              if (secondaryIndicatorEvaluation)
                setActiveIndicatorConfigId(secondaryIndicatorEvaluation.id);
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
          {activeIndicatorConfigId &&
            (() => {
              const definition = allIndicatorDefinitions.find(
                (item) => item.id === activeIndicatorConfigId,
              );
              if (!definition) return null;
              const instance = getIndicatorInstance(indicatorSettings, definition.id, definition);
              const parameters = getIndicatorParameters(instance, indicatorConvention);
              return (
                <section
                  className="chart-settings-popover indicator-settings-popover"
                  aria-label={`${definition.name} 参数`}
                >
                  <div className="chart-settings-heading">
                    <span>
                      <strong>{definition.name} 参数</strong>
                      <small>{indicatorConvention === "a-share" ? "A 股口径" : "跨市场口径"}</small>
                    </span>
                    <button onClick={() => setActiveIndicatorConfigId(null)} type="button">
                      关闭
                    </button>
                  </div>
                  {definition.parameters.map((parameter) => (
                    <label key={parameter.key}>
                      <span>{parameter.label}</span>
                      <input
                        max={parameter.maximum}
                        min={parameter.minimum}
                        onChange={(event) =>
                          updateIndicatorSettings((current) =>
                            updateIndicatorParameter(
                              current,
                              definition.id,
                              indicatorConvention,
                              parameter.key,
                              Number(event.currentTarget.value),
                              definition,
                            ),
                          )
                        }
                        step={parameter.step}
                        type="number"
                        value={Number(parameters[parameter.key])}
                      />
                    </label>
                  ))}
                  <label className="parameter-toggle">
                    <span>
                      <strong>指标状态</strong>
                      <small>{definition.placement === "pane" ? "副图单选" : "主图可多选"}</small>
                    </span>
                    <input
                      checked={instance.enabled}
                      onChange={(event) =>
                        updateIndicatorSettings((current) =>
                          setIndicatorEnabled(
                            current,
                            definition.id,
                            event.currentTarget.checked,
                            allIndicatorDefinitions,
                          ),
                        )
                      }
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
                <input
                  checked={showGrid}
                  onChange={(event) => setShowGrid(event.currentTarget.checked)}
                  type="checkbox"
                />
              </label>
              <label>
                <span>十字光标</span>
                <input
                  checked={showCrosshair}
                  onChange={(event) => setShowCrosshair(event.currentTarget.checked)}
                  type="checkbox"
                />
              </label>
              <label>
                <span>价格标签</span>
                <input
                  checked={showPriceLabels}
                  onChange={(event) => setShowPriceLabels(event.currentTarget.checked)}
                  type="checkbox"
                />
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
                    onChange={(event) =>
                      setIntradayDisplayMode(sanitizeChartDisplayMode(event.currentTarget.value))
                    }
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
                  onChange={(event) =>
                    setRealtimePollIntervalMs(
                      sanitizeRealtimePollIntervalMs(Number(event.currentTarget.value)),
                    )
                  }
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
                  <button
                    className="watchlist-item-select"
                    onClick={() => selectActiveSymbol(item)}
                    type="button"
                  >
                    <span>
                      <strong>{item.symbol}</strong>
                      <small>{item.name}</small>
                      <em className={`watchlist-data-status ${dataStatus ?? "syncing"}`}>
                        {formatWatchlistDataStatus(dataStatus)}
                      </em>
                    </span>
                    <span>
                      <strong>{formatQuotePrice(snapshot, item.price)}</strong>
                      <small className={change.startsWith("+") ? "positive" : "negative"}>
                        {change}
                      </small>
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
        <div
          className="strategy-config-backdrop instrument-search-backdrop"
          role="presentation"
          onClick={() => setIsInstrumentSearchOpen(false)}
        >
          <section
            aria-label="搜索证券"
            className="instrument-search-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="strategy-config-heading">
              <div>
                <p>证券搜索</p>
                <strong>添加到观察列表</strong>
              </div>
              <button
                aria-label="关闭搜索"
                onClick={() => setIsInstrumentSearchOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <form
              className="instrument-search-form"
              onSubmit={(event) => {
                event.preventDefault();
                void runInstrumentSearch();
              }}
            >
              <input
                autoFocus
                onChange={(event) => setInstrumentSearchQuery(event.currentTarget.value)}
                placeholder="代码、名称或拼音"
                value={instrumentSearchQuery}
              />
              <button type="submit">
                <Search size={16} />
                搜索
              </button>
            </form>
            {instrumentSearchState === "loading" && (
              <p className="instrument-search-state">
                <LoaderCircle className="spin" size={16} /> 正在查询主行情源
              </p>
            )}
            {instrumentSearchMessage && (
              <p className={`instrument-search-state ${instrumentSearchState}`}>
                {instrumentSearchMessage}
              </p>
            )}
            <div className="instrument-search-results">
              {instrumentSearchResults.map((item) => {
                const added = watchlist.some(
                  (candidate) =>
                    candidate.market === item.market && candidate.dataSymbol === item.symbol,
                );
                return (
                  <div key={`${item.market}:${item.symbol}`}>
                    <span>
                      <strong>{item.symbol.replace(/\.(US|HK|SH|SZ)$/u, "")}</strong>
                      <small>
                        {item.name} · {item.market}
                      </small>
                    </span>
                    <button
                      disabled={added}
                      onClick={() => addInstrumentToWatchlist(item)}
                      type="button"
                    >
                      {added ? "已添加" : "添加"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {activeConfigStrategyRun && (
        <div
          className="strategy-config-backdrop"
          role="presentation"
          onClick={() => setActiveConfigStrategyKey(null)}
        >
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
                  const value =
                    activeConfigStrategyRun.settings.parameters[parameter.key] ??
                    parameter.defaultValue;

                  if (parameter.type === "boolean") {
                    return (
                      <label
                        className="parameter-toggle"
                        htmlFor={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                        key={parameter.key}
                      >
                        <span>
                          <strong>{parameter.label}</strong>
                          <small>{value ? "已开启" : "已关闭"}</small>
                        </span>
                        <input
                          checked={Boolean(value)}
                          id={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                          onChange={(event) =>
                            updateStrategyParameter(
                              activeConfigStrategyRun.strategy,
                              parameter,
                              event.currentTarget.checked,
                            )
                          }
                          type="checkbox"
                        />
                      </label>
                    );
                  }

                  if (parameter.type === "select") {
                    return (
                      <label
                        className="parameter-control"
                        htmlFor={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                        key={parameter.key}
                      >
                        <span>{parameter.label}</span>
                        <select
                          id={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                          onChange={(event) =>
                            updateStrategyParameter(
                              activeConfigStrategyRun.strategy,
                              parameter,
                              event.currentTarget.value,
                            )
                          }
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
                      <label
                        className="parameter-control parameter-color-control"
                        htmlFor={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                        key={parameter.key}
                      >
                        <span>{parameter.label}</span>
                        <span className="parameter-color-field">
                          <input
                            id={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                            onChange={(event) =>
                              updateStrategyParameter(
                                activeConfigStrategyRun.strategy,
                                parameter,
                                event.currentTarget.value,
                              )
                            }
                            type="color"
                            value={String(value)}
                          />
                          <code>{String(value).toUpperCase()}</code>
                        </span>
                      </label>
                    );
                  }

                  return (
                    <label
                      className="parameter-control"
                      htmlFor={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                      key={parameter.key}
                    >
                      <span>{parameter.label}</span>
                      <input
                        id={`${activeConfigStrategyRun.strategy.key}-${parameter.key}`}
                        max={getNumberInputMaximum(parameter.key)}
                        min={getNumberInputMinimum(parameter.key)}
                        onChange={(event) =>
                          updateStrategyParameter(
                            activeConfigStrategyRun.strategy,
                            parameter,
                            event.currentTarget.valueAsNumber,
                          )
                        }
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
                  <span>
                    该策略当前使用 Pine 最小子集生成的默认运行定义，后续可在策略管理中扩展参数
                    Schema。
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <ChartWorkspaceBottomPanel controller={controller} />

      {isDiagnosticsOpen && (
        <aside className="chart-diagnostics-drawer" aria-label="数据诊断">
          <div className="chart-settings-heading">
            <strong>数据诊断</strong>
            <button onClick={() => setIsDiagnosticsOpen(false)} type="button">
              关闭
            </button>
          </div>
          <section>
            <p>当前状态</p>
            <strong className={getRealtimeHealthBadgeClass(realtimeHealth.status)}>
              {realtimeHealth.status}
            </strong>
            <small>{formatRealtimeHealthDetail(realtimeHealth)}</small>
          </section>
          <section>
            <p>供应商健康</p>
            {providerDiagnostics.length > 0 ? (
              providerDiagnostics.map((health) => (
                <div className="diagnostic-provider-row" key={health.provider}>
                  <span>
                    <strong>{health.provider}</strong>
                    <small>{health.message}</small>
                  </span>
                  <em
                    className={getRealtimeHealthBadgeClass(
                      health.status === "healthy" ||
                        health.status === "delayed" ||
                        health.status === "degraded"
                        ? "ok"
                        : health.status === "rateLimited"
                          ? "rate_limited"
                          : "network_error",
                    )}
                  >
                    {health.status}
                  </em>
                </div>
              ))
            ) : (
              <small>当前运行环境未暴露桌面诊断桥。图表仍会显示实时状态。</small>
            )}
          </section>
          <section>
            <p>最近事件</p>
            {diagnosticTimeline.map((entry) => (
              <div
                className={`diagnostic-timeline-row ${entry.kind}`}
                key={`${entry.timestamp}-${entry.kind}-${entry.message}`}
              >
                <time>{formatStatusClock(entry.timestamp)}</time>
                <span>
                  <strong>{formatMarketDataRuntimeEventKind(entry.kind)}</strong>
                  {entry.message}
                  {entry.detail ? ` · ${entry.detail}` : ""}
                </span>
              </div>
            ))}
          </section>
        </aside>
      )}
    </section>
  );
}
