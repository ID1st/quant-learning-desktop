import { getRealtimeHealthBadgeClass, formatRealtimeHealthDetail } from "./chartWorkspaceModel";

import type { ChartWorkspaceController } from "./ChartWorkspacePage";

interface ChartWorkspaceStatusBarProps {
  readonly controller: ChartWorkspaceController;
}

export function ChartWorkspaceStatusBar({ controller }: ChartWorkspaceStatusBarProps) {
  const { cachedCandles, activeSymbol, realtimeStatus, realtimeHealth } = controller;
  return (
    <div className="symbol-search">
      <span>{activeSymbol.market}</span>
      <strong>{activeSymbol.symbol}</strong>
      <small>{activeSymbol.name}</small>
      <em className={cachedCandles.length > 0 ? "data-source-badge live" : "data-source-badge"}>
        {cachedCandles.length > 0 ? "本地缓存" : "等待数据"}
      </em>
      <em
        aria-label={formatRealtimeHealthDetail(realtimeHealth)}
        className={`${getRealtimeHealthBadgeClass(realtimeHealth.status)} chart-provider-status`}
        title={realtimeStatus}
      >
        {formatRealtimeHealthDetail(realtimeHealth)}
      </em>
    </div>
  );
}
