import {
  realtimePollIntervalOptionsMs,
  sanitizeRealtimePollIntervalMs,
} from "../features/marketData/realtimeQuotePollingService";

import { IndicatorQuickMenu } from "../features/chartWorkspace/IndicatorQuickMenu";
import { toggleStrategyFromQuickMenu } from "../features/chartWorkspace/strategyQuickMenu";
import { useI18n } from "../i18n/I18nProvider";

import {
  ChevronDown,
  ChevronRight,
  Eye,
  Gauge,
  Layers3,
  SlidersHorizontal,
  Settings2,
  Power,
} from "lucide-react";

import { timeframes, sanitizeChartDisplayMode, formatTimeframeLabel } from "./chartWorkspaceModel";

import type { ChartWorkspaceController } from "./ChartWorkspacePage";

import { ChartWorkspaceStatusBar } from "./ChartWorkspaceStatusBar";

interface ChartWorkspaceToolbarProps {
  readonly controller: ChartWorkspaceController;
}

export function ChartWorkspaceToolbar({ controller }: ChartWorkspaceToolbarProps) {
  const { t } = useI18n();
  const {
    indicatorSettings,
    updateIndicatorSettings,
    strategyMenuRef,
    strategyMenuButtonRef,
    allIndicatorDefinitions,
    canShowStrategyLayers,
    enabledStrategyCount,
    strategyQuickMenuItems,
    updateStrategyState,
    activeSymbol,
    timeframe,
    setTimeframe,
    showSignals,
    setShowSignals,
    setShowStrategyLayers,
    isStrategyMenuOpen,
    setIsStrategyMenuOpen,
    setActiveIndicatorConfigId,
    intradayDisplayMode,
    setIntradayDisplayMode,
    realtimePollIntervalMs,
    setRealtimePollIntervalMs,
    setActiveConfigStrategyKey,
    isWatchlistCollapsed,
    setIsWatchlistCollapsed,
    isChartSettingsOpen,
    setIsChartSettingsOpen,
  } = controller;
  return (
    <header className="chart-topbar">
      <ChartWorkspaceStatusBar controller={controller} />

      <div className="timeframe-tabs" aria-label={t("周期选择")}>
        {timeframes.map((item) => (
          <button
            className={item === timeframe ? "active" : ""}
            key={item}
            onClick={() => setTimeframe(item)}
            type="button"
          >
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
            className={
              isStrategyMenuOpen
                ? "active strategy-quick-menu-trigger"
                : "strategy-quick-menu-trigger"
            }
            onClick={() => setIsStrategyMenuOpen((value) => !value)}
            ref={strategyMenuButtonRef}
            type="button"
          >
            <Layers3 size={16} />
            <span>{t("策略")}</span>
            <small>{enabledStrategyCount}</small>
            <ChevronDown className={isStrategyMenuOpen ? "expanded" : ""} size={13} />
          </button>

          {isStrategyMenuOpen && (
            <section
              aria-label={t("策略快捷菜单")}
              className="strategy-quick-menu-panel"
              id="chart-strategy-quick-menu"
              role="dialog"
            >
              <header>
                <span>
                  <strong>{t("可用策略")}</strong>
                  <small>
                    {t("{total} 个策略 · {enabled} 个已打开", {
                      total: strategyQuickMenuItems.length,
                      enabled: enabledStrategyCount,
                    })}
                  </small>
                </span>
              </header>

              <div className="strategy-quick-menu-list" role="list">
                {strategyQuickMenuItems.map((item) => (
                  <div
                    className={
                      item.enabled ? "strategy-quick-menu-item active" : "strategy-quick-menu-item"
                    }
                    key={item.key}
                    role="listitem"
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.sourceType === "preset"
                          ? t("内置策略")
                          : item.sourceType === "user"
                            ? t("用户策略")
                            : t("插件策略")}
                      </small>
                    </span>
                    <div>
                      <button
                        aria-label={t("{name} 打开", { name: item.name })}
                        aria-pressed={item.enabled}
                        className={item.enabled ? "active" : ""}
                        onClick={() => updateStrategyState(item.key, toggleStrategyFromQuickMenu)}
                        type="button"
                      >
                        <Power size={13} />
                        {item.enabled ? t("已打开") : t("打开")}
                      </button>
                      <button
                        aria-label={t("{name} 参数调整", { name: item.name })}
                        onClick={() => {
                          setIsStrategyMenuOpen(false);
                          setActiveConfigStrategyKey(item.key);
                        }}
                        title={item.hasParameters ? t("调整策略参数") : t("查看策略配置")}
                        type="button"
                      >
                        <SlidersHorizontal size={13} />
                        {t("参数")}
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
        <button
          className={showSignals ? "active" : ""}
          onClick={() => setShowSignals((value) => !value)}
          type="button"
        >
          <Gauge size={16} />
          <span>{t("策略事件")}</span>
        </button>
        <button
          className={canShowStrategyLayers ? "active" : ""}
          onClick={() => setShowStrategyLayers((value) => !value)}
          type="button"
        >
          <Layers3 size={16} />
          <span>{t("策略图层")}</span>
        </button>
        <button
          className={isChartSettingsOpen ? "active" : ""}
          onClick={() => setIsChartSettingsOpen((value) => !value)}
          type="button"
        >
          <Settings2 size={16} />
          <span>{t("图表设置")}</span>
        </button>
        <button
          aria-label={isWatchlistCollapsed ? t("显示观察列表") : t("隐藏观察列表")}
          className={!isWatchlistCollapsed ? "active" : ""}
          onClick={() => setIsWatchlistCollapsed((value) => !value)}
          type="button"
        >
          {isWatchlistCollapsed ? <ChevronRight size={16} /> : <Eye size={16} />}
          <span>{t("观察")}</span>
        </button>
        {timeframe === "realtime" && (
          <label className="polling-interval-control">
            <span>{t("分时形态")}</span>
            <select
              aria-label={t("分时图表形态")}
              onChange={(event) =>
                setIntradayDisplayMode(sanitizeChartDisplayMode(event.currentTarget.value))
              }
              value={intradayDisplayMode}
            >
              <option value="line">{t("折线")}</option>
              <option value="candlestick">{t("K线")}</option>
            </select>
          </label>
        )}
        <label className="polling-interval-control">
          <span>{t("轮询")}</span>
          <select
            aria-label={t("AlphaFeed REST 轮询频率")}
            onChange={(event) =>
              setRealtimePollIntervalMs(
                sanitizeRealtimePollIntervalMs(Number(event.currentTarget.value)),
              )
            }
            value={realtimePollIntervalMs}
          >
            {realtimePollIntervalOptionsMs.map((intervalMs) => (
              <option key={intervalMs} value={intervalMs}>
                {t("{seconds}秒", { seconds: intervalMs / 1000 })}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
