import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  DatabaseZap,
  ListChecks,
} from "lucide-react";
import { readAlphaFeedApiBinding, readLongPortApiBinding } from "../features/api/apiConfigService";
import { readMarketDataProviderSettings } from "../features/marketData/marketDataProviderSettings";
import {
  readMarketDataSyncState,
  readMarketQuoteSnapshotCache,
  readMarketWatchlistCache,
} from "../features/marketData/marketDataSyncService";
import { useAppStore } from "../state/appStore";
import { useI18n } from "../i18n/I18nProvider";

function formatPrice(value: number) {
  return value.toFixed(value >= 100 ? 2 : 3);
}

function formatChangePercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function DashboardPage() {
  const { t } = useI18n();
  const alphaFeedBinding = readAlphaFeedApiBinding();
  const longPortBinding = readLongPortApiBinding();
  const providerSettings = readMarketDataProviderSettings();
  const syncState = readMarketDataSyncState();
  const watchlist = readMarketWatchlistCache();
  const quoteSnapshots = readMarketQuoteSnapshotCache();
  const navigate = useAppStore((state) => state.navigate);
  const quoteBySymbol = new Map(quoteSnapshots.map((snapshot) => [snapshot.symbol, snapshot]));
  const hasMarketData = quoteSnapshots.length > 0;
  const primaryProvider = providerSettings.stockSdkPrimaryEnabled
    ? "Stock SDK"
    : alphaFeedBinding
      ? "AlphaFeed REST"
      : t("未配置");
  const syncCompleted = syncState?.status === "completed";
  const requiresSetup = !alphaFeedBinding && !hasMarketData;
  const tasks = [
    ...(requiresSetup
      ? [
          {
            title: t("连接行情数据源"),
            detail: t("配置主数据源或备用数据源后即可开始同步。"),
            action: t("前往数据源中心"),
          },
        ]
      : []),
    ...(!syncCompleted
      ? [
          {
            title: t("等待行情缓存准备"),
            detail: t("缓存完成后可在超级图表中运行策略。"),
            action: t("查看数据状态"),
          },
        ]
      : []),
  ];

  return (
    <section className="dashboard-page today-workspace">
      <header className="today-workspace-header">
        <div>
          <p>{t("今日工作台")}</p>
          <h1>{hasMarketData ? t("行情与研究已就绪") : t("先连接行情，再开始研究")}</h1>
          <span>
            {hasMarketData
              ? t("查看关注标的、进入超级图表并运行当前策略。")
              : t("完成数据源连接后，系统会准备自选行情与必要的 K 线缓存。")}
          </span>
        </div>
        <button
          className="today-primary-action"
          onClick={() => navigate(requiresSetup ? "apiConfig" : "chart")}
          type="button"
        >
          {requiresSetup ? t("连接数据源") : t("打开超级图表")}
          <ArrowRight size={16} />
        </button>
      </header>

      <section className="today-status-band" aria-label={t("市场数据状态")}>
        <article>
          <DatabaseZap size={18} />
          <span>
            <small>{t("主行情源")}</small>
            <strong>{primaryProvider}</strong>
          </span>
          <em className={hasMarketData ? "healthy" : "pending"}>
            {hasMarketData ? t("可用") : t("待连接")}
          </em>
        </article>
        <article>
          <ListChecks size={18} />
          <span>
            <small>{t("行情缓存")}</small>
            <strong>{syncCompleted ? t("已准备") : t("等待同步")}</strong>
          </span>
          <em className={syncCompleted ? "healthy" : "pending"}>
            {t("{count} 条快照", { count: quoteSnapshots.length })}
          </em>
        </article>
        <article>
          <Activity size={18} />
          <span>
            <small>{t("备用源")}</small>
            <strong>{longPortBinding ? t("LongBridge 已配置") : t("尚未配置")}</strong>
          </span>
          <em className={longPortBinding ? "healthy" : "neutral"}>
            {longPortBinding ? t("可回退") : t("可选")}
          </em>
        </article>
      </section>

      <div className="today-workspace-grid">
        <section className="today-watchlist-panel" aria-label={t("关注标的")}>
          <header className="today-panel-heading">
            <div>
              <p>{t("关注标的")}</p>
              <h2>
                {watchlist.length > 0
                  ? t("{count} 个标的", { count: watchlist.length })
                  : t("等待生成")}
              </h2>
            </div>
            {hasMarketData && (
              <span>{t("{count} 条实时快照", { count: quoteSnapshots.length })}</span>
            )}
          </header>
          {watchlist.length > 0 ? (
            <div className="today-watchlist-table">
              {watchlist.map((item) => {
                const quote = quoteBySymbol.get(item.symbol);

                return (
                  <div key={item.symbol}>
                    <span>
                      <strong>{item.symbol}</strong>
                      <small>{item.name}</small>
                    </span>
                    <span>{item.market}</span>
                    <strong>{quote ? formatPrice(quote.lastPrice) : "--"}</strong>
                    <em
                      className={
                        quote && quote.changePercent < 0 ? "negative" : quote ? "positive" : ""
                      }
                    >
                      {quote ? formatChangePercent(quote.changePercent) : t("等待报价")}
                    </em>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="today-empty-state">
              <BarChart3 size={22} />
              <span>{t("完成数据源验证后，默认关注列表会在这里出现。")}</span>
            </div>
          )}
        </section>

        <aside className="today-research-panel" aria-label={t("研究状态")}>
          <div className="today-panel-heading">
            <div>
              <p>{t("研究状态")}</p>
              <h2>{t("当前会话")}</h2>
            </div>
          </div>
          <div className="today-research-row">
            <CheckCircle2 size={17} />
            <span>{t("预制策略")}</span>
            <strong>{t("2 个可用")}</strong>
          </div>
          <div className="today-research-row">
            <BarChart3 size={17} />
            <span>{t("当前研究模式")}</span>
            <strong>{hasMarketData ? t("可进入图表") : t("等待行情")}</strong>
          </div>
          <div className="today-research-note">
            {t("策略、条件事件和日志会在超级图表的底部 Dock 中按需展开。")}
          </div>
        </aside>
      </div>

      <section className="today-task-panel" aria-label={t("待处理任务")}>
        <header className="today-panel-heading">
          <div>
            <p>{t("待处理任务")}</p>
            <h2>
              {tasks.length > 0
                ? t("{count} 项需要关注", { count: tasks.length })
                : t("当前没有阻塞任务")}
            </h2>
          </div>
        </header>
        {tasks.length > 0 ? (
          <div className="today-task-list">
            {tasks.map((task) => (
              <div key={task.title}>
                <AlertTriangle size={16} />
                <span>
                  <strong>{task.title}</strong>
                  <small>{task.detail}</small>
                </span>
                <button onClick={() => navigate("apiConfig")} type="button">
                  {task.action}
                  <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="today-clear-state">
            <CheckCircle2 size={17} />
            <span>{t("行情、缓存与研究入口均处于可用状态。")}</span>
          </div>
        )}
      </section>
    </section>
  );
}
