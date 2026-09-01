import { getRealtimeHealthBadgeClass, formatRealtimeHealthDetail } from "./chartWorkspaceModel";
import { useI18n } from "../i18n/I18nProvider";

import type { ChartWorkspaceController } from "./ChartWorkspacePage";

interface ChartWorkspaceStatusBarProps {
  readonly controller: ChartWorkspaceController;
}

export function ChartWorkspaceStatusBar({ controller }: ChartWorkspaceStatusBarProps) {
  const { formatTime, t } = useI18n();
  const { cachedCandles, activeSymbol, realtimeStatus, realtimeHealth } = controller;
  return (
    <div className="symbol-search">
      <span>{activeSymbol.market}</span>
      <strong>{activeSymbol.symbol}</strong>
      <small>{activeSymbol.name}</small>
      <em className={cachedCandles.length > 0 ? "data-source-badge live" : "data-source-badge"}>
        {cachedCandles.length > 0 ? t("本地缓存") : t("等待数据")}
      </em>
      <em
        aria-label={t(formatRealtimeHealthDetail(realtimeHealth, (value) => formatTime(value)))}
        className={`${getRealtimeHealthBadgeClass(realtimeHealth.status)} chart-provider-status`}
        title={t(realtimeStatus)}
      >
        {t(formatRealtimeHealthDetail(realtimeHealth, (value) => formatTime(value)))}
      </em>
    </div>
  );
}
