import { CheckCircle2, DatabaseZap, ListChecks } from "lucide-react";
import { readAlphaFeedApiBinding, readLongPortApiBinding } from "../features/api/apiConfigService";
import {
  readMarketDataSyncState,
  readMarketQuoteSnapshotCache,
  readMarketWatchlistCache,
} from "../features/marketData/marketDataSyncService";

function formatPrice(value: number) {
  return value.toFixed(value >= 100 ? 2 : 3);
}

function formatChangePercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatProvider(provider: string) {
  const providerLabels: Record<string, string> = {
    alphafeed: "AlphaFeed",
    longport: "LongBridge",
    "stock-sdk": "Stock SDK",
    "alphafeed-rest": "AlphaFeed REST",
    "alphafeed-websocket": "AlphaFeed WebSocket",
    longbridge: "LongBridge",
  };

  return providerLabels[provider] ?? provider;
}

export function DashboardPage() {
  const alphaFeedBinding = readAlphaFeedApiBinding();
  const longPortBinding = readLongPortApiBinding();
  const syncState = readMarketDataSyncState();
  const watchlist = readMarketWatchlistCache();
  const quoteSnapshots = readMarketQuoteSnapshotCache();
  const quoteBySymbol = new Map(quoteSnapshots.map((snapshot) => [snapshot.symbol, snapshot]));

  return (
    <section className="dashboard-page">
      <header className="module-header">
        <p>仪表盘</p>
        <h1>市场数据准备状态</h1>
        <span>系统优先使用 AlphaFeed 获取实时行情；当备用长桥已绑定时，可作为行情兜底和后续交易接口入口。</span>
      </header>

      <div className="module-grid">
        <article className="module-card">
          <div className="module-card-header">
            <DatabaseZap size={20} />
            <div>
              <h2>数据源连接</h2>
              <p>{alphaFeedBinding ? "AlphaFeed 主数据源已完成验证" : "等待绑定 AlphaFeed 主数据源"}</p>
            </div>
          </div>
          <div className="binding-summary">
            <span>主数据源</span>
            <strong>{alphaFeedBinding ? "AlphaFeed 已绑定" : "未绑定"}</strong>
            {alphaFeedBinding && <small>API Key：{alphaFeedBinding.apiKeyPreview}</small>}
          </div>
          <div className="binding-summary">
            <span>备用源</span>
            <strong>{longPortBinding ? "长桥已绑定" : "未启用"}</strong>
            {longPortBinding && <small>App Key：{longPortBinding.appKeyPreview}</small>}
            {longPortBinding?.accountId && <small>账户：{longPortBinding.accountId}</small>}
          </div>
        </article>

        <article className="module-card">
          <div className="module-card-header">
            <ListChecks size={20} />
            <div>
              <h2>行情同步入口</h2>
              <p>{syncState?.status === "completed" ? "基础缓存已准备" : "尚未准备行情缓存"}</p>
            </div>
          </div>
          {syncState && (
            <div className="binding-summary">
              <span>当前供应商</span>
              <strong>{formatProvider(syncState.provider)}</strong>
              {syncState.fallbackProvider && <small>备用：{formatProvider(syncState.fallbackProvider)}</small>}
              <small>
                快照：{syncState.quoteSnapshotCount} 个 / K 线：{syncState.historicalBarCount} 根
              </small>
            </div>
          )}
          <ol className="sync-step-list">
            {(syncState?.steps ?? []).map((step) => (
              <li className={step.status === "completed" ? "completed" : step.status === "running" ? "running" : ""} key={step.id}>
                <CheckCircle2 size={17} />
                <span>{step.label}</span>
              </li>
            ))}
            {!syncState && (
              <li>
                <CheckCircle2 size={17} />
                <span>完成数据源绑定后开始准备</span>
              </li>
            )}
          </ol>
        </article>

        <article className="module-card">
          <div className="module-card-header">
            <ListChecks size={20} />
            <div>
              <h2>默认观察列表</h2>
              <p>{watchlist.length > 0 ? `${watchlist.length} 个标的，${quoteSnapshots.length} 个报价快照` : "等待同步生成"}</p>
            </div>
          </div>
          <div className="watchlist-items compact">
            {watchlist.map((item) => {
              const quote = quoteBySymbol.get(item.symbol);

              return (
                <button key={item.symbol} type="button">
                  <span>
                    <strong>{item.symbol}</strong>
                    <small>{item.name}</small>
                  </span>
                  <span>
                    <strong>{quote ? formatPrice(quote.lastPrice) : item.market}</strong>
                    <small className={quote && quote.changePercent < 0 ? "negative" : quote ? "positive" : ""}>
                      {quote ? formatChangePercent(quote.changePercent) : "预置"}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
