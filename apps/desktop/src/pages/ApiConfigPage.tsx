import { useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  CircleDot,
  DatabaseZap,
  KeyRound,
  Link2,
  RadioTower,
  RefreshCw,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import type { Timeframe } from "@quant/shared";
import {
  ALPHAFEED_DEFAULT_STREAM_URL,
  ALPHAFEED_DEFAULT_API_URL,
  LONGPORT_DEFAULT_HTTP_URL,
  readAlphaFeedApiBinding,
  readAlphaFeedStreamBinding,
  readLongPortApiBinding,
  readSavedLongPortCredentials,
  resolveAlphaFeedCredentials,
  resolveLongPortCredentials,
  saveAlphaFeedStreamConfig,
  verifyAlphaFeedApiConfig,
  verifyLongPortApiConfig,
  type AlphaFeedApiForm,
  type AlphaFeedStreamForm,
  type LongPortApiForm,
} from "../features/api/apiConfigService";
import {
  apiProviderPriorityItems,
  formatApiProviderStatus,
  getApiProviderStatus,
  type ApiProviderPriorityItem,
} from "../features/api/apiProviderPriorityConfig";
import { useAuthStore } from "../features/auth/authStore";
import { initialMarketDataSyncSteps, runInitialMarketDataSync } from "../features/marketData/marketDataSyncService";
import { useAppStore } from "../state/appStore";

const defaultAlphaFeedForm: AlphaFeedApiForm = {
  apiUrl: ALPHAFEED_DEFAULT_API_URL,
  apiKey: "",
};

const defaultAlphaFeedStreamForm: AlphaFeedStreamForm = {
  wsUrl: ALPHAFEED_DEFAULT_STREAM_URL,
  apiKey: "",
  mode: "watchlist",
};

const defaultLongPortForm: LongPortApiForm = {
  apiUrl: LONGPORT_DEFAULT_HTTP_URL,
  appKey: "",
  appSecret: "",
  accessToken: "",
};

function isLongPortFormComplete(form: LongPortApiForm) {
  return Boolean(form.appKey.trim() && form.appSecret.trim() && form.accessToken.trim());
}

const initialHistoricalTimeframes: Timeframe[] = ["1d", "1w"];
const initialIntradayTimeframes: Timeframe[] = ["1m", "5m", "15m", "1h"];
const initialBarCountByTimeframe: Partial<Record<Timeframe, number>> = {
  "1m": 240,
  "5m": 240,
  "15m": 240,
  "1h": 240,
  "1d": 240,
  "1w": 240,
};

function isAlphaFeedPermissionError(message: string) {
  return message.includes("套餐无此功能或市场权限") || message.includes("HTTP 403");
}

function getRejectedMessage(result: PromiseRejectedResult) {
  return result.reason instanceof Error ? result.reason.message : "未知错误";
}

function getProviderIcon(providerId: ApiProviderPriorityItem["id"]) {
  if (providerId === "stock-sdk") {
    return <ServerCog size={20} />;
  }

  if (providerId === "alphafeed-websocket") {
    return <RadioTower size={20} />;
  }

  if (providerId === "longbridge") {
    return <ShieldCheck size={20} />;
  }

  return <DatabaseZap size={20} />;
}

export function ApiConfigPage() {
  const storedAlphaFeedBinding = useMemo(() => readAlphaFeedApiBinding(), []);
  const storedAlphaFeedStreamBinding = useMemo(() => readAlphaFeedStreamBinding(), []);
  const storedLongPortBinding = useMemo(() => readLongPortApiBinding(), []);
  const [alphaFeedForm, setAlphaFeedForm] = useState<AlphaFeedApiForm>({
    ...defaultAlphaFeedForm,
    apiUrl: storedAlphaFeedBinding?.apiUrl ?? defaultAlphaFeedForm.apiUrl,
  });
  const [alphaFeedStreamForm, setAlphaFeedStreamForm] = useState<AlphaFeedStreamForm>({
    ...defaultAlphaFeedStreamForm,
    wsUrl: storedAlphaFeedStreamBinding?.wsUrl ?? defaultAlphaFeedStreamForm.wsUrl,
    mode: storedAlphaFeedStreamBinding?.mode ?? defaultAlphaFeedStreamForm.mode,
  });
  const [longPortForm, setLongPortForm] = useState<LongPortApiForm>({
    ...defaultLongPortForm,
    apiUrl: storedLongPortBinding?.apiUrl ?? defaultLongPortForm.apiUrl,
  });
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [runningStep, setRunningStep] = useState("");
  const [status, setStatus] = useState(
    storedAlphaFeedBinding
      ? "当前设备已有 AlphaFeed REST 备用源绑定记录。"
      : storedLongPortBinding
        ? "当前设备已有长桥备用源绑定记录。"
        : "",
  );
  const [error, setError] = useState("");
  const [streamStatus, setStreamStatus] = useState(
    storedAlphaFeedStreamBinding ? "AlphaFeed WebSocket 会员通道已预留，行情网关可在后续阶段接入。" : "",
  );
  const [streamError, setStreamError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingStream, setIsSavingStream] = useState(false);
  const setApiBound = useAuthStore((state) => state.setApiBound);
  const navigate = useAppStore((state) => state.navigate);
  const hasDesktopBridge = Boolean(window.quantDesktop?.alphaFeed);
  const providerBindingState = {
    alphaFeedRestBound: Boolean(storedAlphaFeedBinding),
    alphaFeedWebSocketPrepared: Boolean(storedAlphaFeedStreamBinding),
    longBridgeBound: Boolean(storedLongPortBinding),
  };

  const updateAlphaFeedField = (field: keyof AlphaFeedApiForm, value: string) => {
    setAlphaFeedForm((current) => ({ ...current, [field]: value }));
  };

  const updateAlphaFeedStreamField = (field: keyof AlphaFeedStreamForm, value: string) => {
    setAlphaFeedStreamForm((current) => ({ ...current, [field]: field === "mode" && value === "all-symbols" ? "all-symbols" : value }));
  };

  const updateLongPortField = (field: keyof LongPortApiForm, value: string) => {
    setLongPortForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setCompletedSteps([]);
    setRunningStep("");
    setIsSubmitting(true);

    try {
      const alphaFeedCredentials = await resolveAlphaFeedCredentials(alphaFeedForm);
      const alphaFeedBinding = await verifyAlphaFeedApiConfig(alphaFeedCredentials);
      const shouldBindLongPortFallback = isLongPortFormComplete(longPortForm);
      const longPortCredentials = shouldBindLongPortFallback
        ? await resolveLongPortCredentials(longPortForm)
        : await readSavedLongPortCredentials().catch(() => null);
      const longPortBinding =
        shouldBindLongPortFallback && longPortCredentials ? await verifyLongPortApiConfig(longPortCredentials) : storedLongPortBinding;
      const canUseLongPortFallback = Boolean(longPortBinding && longPortCredentials);
      let marketDataSyncWarning = "";

      await runInitialMarketDataSync(
        {
          apiUrl: alphaFeedBinding.apiUrl,
          keyPreview: alphaFeedBinding.apiKeyPreview,
          markets: alphaFeedBinding.markets,
          verifiedAt: alphaFeedBinding.verifiedAt,
        },
        {
          provider: "alphafeed",
          fallbackProvider: canUseLongPortFallback ? "longport" : undefined,
          fetchQuoteSnapshot: async (watchlist) => {
            const alphaResult = await window.quantDesktop?.alphaFeed?.fetchQuoteSnapshot(alphaFeedCredentials, watchlist);

            if (alphaResult?.ok) {
              return alphaResult.snapshots;
            }

            if (canUseLongPortFallback && longPortCredentials) {
              const fallbackResult = await window.quantDesktop?.longPort?.fetchQuoteSnapshot(longPortCredentials, watchlist);
              if (fallbackResult?.ok) {
                return fallbackResult.snapshots;
              }
            }

            if (alphaResult && !alphaResult.ok) {
              throw new Error(alphaResult.error.message);
            }

            throw new Error("AlphaFeed 实时行情需要桌面安全桥，请在桌面应用中运行。");
          },
          fetchHistoricalBars: async (watchlist) => {
            const requests = watchlist.flatMap((item) => [
              ...initialHistoricalTimeframes.map((timeframe) => ({
                item,
                timeframe,
                mode: "historical" as const,
              })),
              ...initialIntradayTimeframes.map((timeframe) => ({
                item,
                timeframe,
                mode: "intraday" as const,
              })),
            ]);
            const results = await Promise.allSettled(
              requests.map(async ({ item, timeframe, mode }) => {
                if (mode === "intraday") {
                  const result = await window.quantDesktop?.alphaFeed?.fetchIntradayBars(alphaFeedCredentials, {
                    symbol: item.symbol,
                    market: item.market,
                    timeframe,
                    count: initialBarCountByTimeframe[timeframe] ?? 240,
                  });

                  if (!result) {
                    throw new Error("AlphaFeed 分钟 K 线同步需要桌面安全桥，请在桌面应用中运行。");
                  }

                  if (!result.ok) {
                    throw new Error(result.error.message);
                  }

                  return result.bars;
                }

                const result = await window.quantDesktop?.alphaFeed?.fetchHistoricalBars(alphaFeedCredentials, {
                  symbol: item.symbol,
                  market: item.market,
                  timeframe,
                  count: initialBarCountByTimeframe[timeframe] ?? 240,
                  adjust: "forward",
                });

                if (!result) {
                  throw new Error("AlphaFeed K 线同步需要桌面安全桥，请在桌面应用中运行。");
                }

                if (!result.ok) {
                  throw new Error(result.error.message);
                }

                return result.bars;
              }),
            );
            const failures = results
              .map((result, index) => ({ result, request: requests[index] }))
              .filter((entry): entry is { result: PromiseRejectedResult; request: (typeof requests)[number] } => entry.result.status === "rejected");
            const bars = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
            const blockingFailures = failures.filter(
              ({ result, request }) => request.mode === "historical" || !isAlphaFeedPermissionError(getRejectedMessage(result)),
            );
            const recoverableFailures = failures.filter((failure) => !blockingFailures.includes(failure));

            if (blockingFailures.length > 0) {
              const sampleFailures = blockingFailures
                .slice(0, 4)
                .map(({ result, request }) => {
                  const reason = getRejectedMessage(result);
                  return `${request.item.symbol} ${request.timeframe}: ${reason}`;
                })
                .join("；");
              throw new Error(`AlphaFeed 部分 K 线周期同步失败：${sampleFailures}`);
            }

            const failedRequestKeys = new Set(
              failures.map(({ request }) => `${request.item.market}:${request.item.symbol}:${request.timeframe}`),
            );
            const emptyRequests = requests.filter(
              (request) =>
                !failedRequestKeys.has(`${request.item.market}:${request.item.symbol}:${request.timeframe}`) &&
                !bars.some((bar) => bar.symbol === request.item.symbol && bar.market === request.item.market && bar.timeframe === request.timeframe),
            );
            const blockingEmptyRequests = emptyRequests.filter((request) => request.mode === "historical");
            const recoverableEmptyRequests = emptyRequests.filter((request) => request.mode === "intraday");

            if (blockingEmptyRequests.length > 0 || bars.length === 0) {
              throw new Error(
                `AlphaFeed 部分必要 K 线周期未返回数据：${blockingEmptyRequests
                  .slice(0, 6)
                  .map((request) => `${request.item.symbol} ${request.timeframe}`)
                  .join("、")}`,
              );
            }

            const warningItems = [
              ...recoverableFailures.map(({ request }) => `${request.item.symbol} ${request.timeframe} 无权限`),
              ...recoverableEmptyRequests.map((request) => `${request.item.symbol} ${request.timeframe} 暂无数据`),
            ];

            if (warningItems.length > 0) {
              marketDataSyncWarning = `部分分钟 K 线未同步：${warningItems.slice(0, 6).join("、")}`;
            }

            return bars.flat();
          },
          onUpdate: (state) => {
            const completed = state.steps.filter((step) => step.status === "completed").map((step) => step.id);
            const running = state.steps.find((step) => step.status === "running");

            setCompletedSteps(completed);
            setRunningStep(running?.id ?? "");
          },
        },
      );

      setApiBound(true);
      setStatus(
        marketDataSyncWarning ||
          (canUseLongPortFallback ? "备用数据源已绑定：AlphaFeed REST 与长桥均可用。" : "备用数据源已绑定：AlphaFeed REST 可用。"),
      );
      if (!marketDataSyncWarning) {
        window.setTimeout(() => navigate("dashboard"), 420);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "行情数据源绑定失败。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAlphaFeedStream = async () => {
    setStreamError("");
    setStreamStatus("");
    setIsSavingStream(true);

    try {
      const binding = await saveAlphaFeedStreamConfig(alphaFeedStreamForm);
      setStreamStatus(
        binding.mode === "all-symbols"
          ? "AlphaFeed WebSocket 全标的会员通道已预留。后续行情网关会在可用时优先使用该通道。"
          : "AlphaFeed WebSocket 关注列表通道已预留。后续行情网关会在可用时优先使用该通道。",
      );
    } catch (nextError) {
      setStreamError(nextError instanceof Error ? nextError.message : "AlphaFeed WebSocket 通道保存失败。");
    } finally {
      setIsSavingStream(false);
    }
  };

  return (
    <section className="api-config-page">
      <header className="module-header">
        <p>行情数据源</p>
        <h1>主行情源优先，备用源兜底</h1>
        <span>
          Stock SDK 将作为新的主行情源接入；当前阶段先保留占位和能力展示，AlphaFeed REST、AlphaFeed WebSocket 与长桥降级为备用数据源。
        </span>
      </header>

      <div className="api-config-grid">
        <form className="module-card api-config-form" onSubmit={handleSubmit}>
          <details className="api-provider-section primary-provider" open>
            <summary>
              <div className="module-card-header">
                <ServerCog size={20} />
                <div>
                  <h2>Stock SDK 主行情源</h2>
                  <p>阶段 6 才会接入真实适配器；当前仅展示未来主行情源能力，不读取任何真实凭据。</p>
                </div>
              </div>
            </summary>

            <div className="api-provider-content provider-placeholder-panel">
              <div className="provider-status-row">
                <span className="provider-status-pill placeholder">待接入</span>
                <strong>主行情源占位</strong>
              </div>
              <p>
                后续该源会负责 A股、港股、美股的实时行情、历史 K 线与分时数据。当前不会替换 AlphaFeed/长桥生产流量。
              </p>
              <div className="provider-badge-row">
                {apiProviderPriorityItems[0]?.capabilityBadges.map((badge) => (
                  <span key={badge}>{badge}</span>
                ))}
              </div>
            </div>
          </details>

          <div className="api-section-label">备用数据源</div>

          <details className="api-provider-section">
            <summary>
              <div className="module-card-header">
                <DatabaseZap size={20} />
                <div>
                  <h2>AlphaFeed REST</h2>
                  <p>备用实时快照与 K 线轮询源；当前仍承担绑定后的初始同步任务。</p>
                </div>
              </div>
            </summary>

            <div className="api-provider-content">
              <label>
                <span>AlphaFeed API URL</span>
                <div className="input-shell">
                  <Link2 size={16} />
                  <input
                    onChange={(event) => updateAlphaFeedField("apiUrl", event.target.value)}
                    placeholder={ALPHAFEED_DEFAULT_API_URL}
                    value={alphaFeedForm.apiUrl}
                  />
                </div>
              </label>

              <label>
                <span>AlphaFeed API Key</span>
                <div className="input-shell">
                  <KeyRound size={16} />
                  <input
                    autoComplete="off"
                    onChange={(event) => updateAlphaFeedField("apiKey", event.target.value)}
                    placeholder="请输入 AlphaFeed API Key"
                    type="password"
                    value={alphaFeedForm.apiKey}
                  />
                </div>
              </label>
            </div>
          </details>

          <details className="api-provider-section">
            <summary>
              <div className="module-card-header">
                <RadioTower size={20} />
                <div>
                  <h2>AlphaFeed WebSocket 会员通道</h2>
                  <p>仅在用户单独购买会员通道时填写；保存后作为流式行情备用入口。</p>
                </div>
              </div>
            </summary>

            <div className="api-provider-content stream-reserved-panel">
              <div>
                <strong>流式行情配置</strong>
                <small>用于后续 WebSocket 连接器、订阅协议和 REST fallback。</small>
              </div>

              <label>
                <span>WebSocket URL</span>
                <div className="input-shell">
                  <Link2 size={16} />
                  <input
                    onChange={(event) => updateAlphaFeedStreamField("wsUrl", event.target.value)}
                    placeholder={ALPHAFEED_DEFAULT_STREAM_URL}
                    value={alphaFeedStreamForm.wsUrl}
                  />
                </div>
              </label>

              <label>
                <span>WebSocket API Key</span>
                <div className="input-shell">
                  <KeyRound size={16} />
                  <input
                    autoComplete="off"
                    onChange={(event) => updateAlphaFeedStreamField("apiKey", event.target.value)}
                    placeholder="请输入 AlphaFeed 会员 API Key"
                    type="password"
                    value={alphaFeedStreamForm.apiKey}
                  />
                </div>
              </label>

              <label>
                <span>订阅范围</span>
                <div className="input-shell">
                  <RefreshCw size={16} />
                  <select
                    aria-label="AlphaFeed WebSocket 订阅范围"
                    onChange={(event) => updateAlphaFeedStreamField("mode", event.target.value)}
                    value={alphaFeedStreamForm.mode}
                  >
                    <option value="watchlist">仅关注列表</option>
                    <option value="all-symbols">会员全标的流</option>
                  </select>
                </div>
              </label>

              {storedAlphaFeedStreamBinding && (
                <div className="binding-summary compact">
                  <span>已预留</span>
                  <strong>{storedAlphaFeedStreamBinding.mode === "all-symbols" ? "全标的流" : "关注列表流"}</strong>
                  <small>API Key：{storedAlphaFeedStreamBinding.apiKeyPreview}</small>
                </div>
              )}
              {streamError && <div className="auth-message error">{streamError}</div>}
              {streamStatus && <div className="auth-message success">{streamStatus}</div>}
              <button className="secondary-auth-action" disabled={isSavingStream || !hasDesktopBridge} onClick={handleSaveAlphaFeedStream} type="button">
                {isSavingStream ? "保存中..." : "保存 WebSocket 备用通道"}
              </button>
            </div>
          </details>

          <details className="api-provider-section">
            <summary>
              <div className="module-card-header">
                <ShieldCheck size={20} />
                <div>
                  <h2>长桥备用源</h2>
                  <p>用于历史 K 线、分时回补和未来券商接口；A股/港股实时可能存在延迟。</p>
                </div>
              </div>
            </summary>

            <div className="api-provider-content">
              <label>
                <span>长桥 API URL</span>
                <div className="input-shell">
                  <Link2 size={16} />
                  <input
                    onChange={(event) => updateLongPortField("apiUrl", event.target.value)}
                    placeholder={LONGPORT_DEFAULT_HTTP_URL}
                    value={longPortForm.apiUrl}
                  />
                </div>
              </label>

              <label>
                <span>长桥 App Key</span>
                <div className="input-shell">
                  <KeyRound size={16} />
                  <input
                    autoComplete="off"
                    onChange={(event) => updateLongPortField("appKey", event.target.value)}
                    placeholder="可选，作为备用源"
                    value={longPortForm.appKey}
                  />
                </div>
              </label>

              <label>
                <span>长桥 API Secret</span>
                <div className="input-shell">
                  <KeyRound size={16} />
                  <input
                    autoComplete="off"
                    onChange={(event) => updateLongPortField("appSecret", event.target.value)}
                    placeholder="可选，作为备用源"
                    type="password"
                    value={longPortForm.appSecret}
                  />
                </div>
              </label>

              <label>
                <span>长桥 Access Token</span>
                <div className="input-shell">
                  <KeyRound size={16} />
                  <input
                    autoComplete="off"
                    onChange={(event) => updateLongPortField("accessToken", event.target.value)}
                    placeholder="可选，作为备用源"
                    type="password"
                    value={longPortForm.accessToken}
                  />
                </div>
              </label>
            </div>
          </details>

          {!hasDesktopBridge && <div className="auth-message error">真实数据源验证需要桌面安全桥，请在桌面应用中运行。</div>}
          {error && <div className="auth-message error">{error}</div>}
          {status && <div className="auth-message success">{status}</div>}

          <button className="primary-auth-action" disabled={isSubmitting || !hasDesktopBridge} type="submit">
            {isSubmitting ? "验证中..." : "验证并保存备用数据源"}
          </button>
        </form>

        <aside className="module-card api-status-card">
          <div className="module-card-header">
            <RefreshCw size={20} />
            <div>
              <h2>数据源优先级</h2>
              <p>图表、缓存和策略后续只读取 Market Data Gateway，不直接绑定具体供应商。</p>
            </div>
          </div>

          <ol className="provider-priority-list">
            {apiProviderPriorityItems.map((provider) => {
              const providerStatus = getApiProviderStatus(provider.id, providerBindingState);

              return (
                <li className={provider.role === "primary" ? "primary" : ""} key={provider.id}>
                  <span className="provider-order">{provider.order}</span>
                  {getProviderIcon(provider.id)}
                  <div>
                    <strong>{provider.name}</strong>
                    <small>{provider.role === "primary" ? "主行情源" : "备用数据源"}</small>
                    <div className="provider-badge-row">
                      {provider.capabilityBadges.map((badge) => (
                        <span key={badge}>{badge}</span>
                      ))}
                    </div>
                  </div>
                  <em className={`provider-status-pill ${providerStatus}`}>{formatApiProviderStatus(providerStatus)}</em>
                </li>
              );
            })}
          </ol>

          <div className="binding-summary">
            <span>AlphaFeed REST</span>
            <strong>{storedAlphaFeedBinding ? "已配置" : "未配置"}</strong>
            {storedAlphaFeedBinding && <small>API Key：{storedAlphaFeedBinding.apiKeyPreview}</small>}
          </div>

          <div className="binding-summary">
            <span>AlphaFeed WebSocket</span>
            <strong>{storedAlphaFeedStreamBinding ? "已预留" : "未预留"}</strong>
            {storedAlphaFeedStreamBinding && (
              <small>
                {storedAlphaFeedStreamBinding.mode === "all-symbols" ? "全标的流" : "关注列表流"} · API Key：
                {storedAlphaFeedStreamBinding.apiKeyPreview}
              </small>
            )}
          </div>

          <div className="binding-summary">
            <span>长桥备用源</span>
            <strong>{storedLongPortBinding ? "已配置" : "未配置"}</strong>
            {storedLongPortBinding && <small>App Key：{storedLongPortBinding.appKeyPreview}</small>}
          </div>

          <div className="sync-progress-panel">
            <div className="module-card-header compact">
              <CircleDot size={18} />
              <div>
                <h2>同步准备</h2>
                <p>绑定备用源后会预热默认观察列表、快照与必要 K 线缓存。</p>
              </div>
            </div>
            <ol className="sync-step-list">
              {initialMarketDataSyncSteps.map((step) => (
                <li className={completedSteps.includes(step.id) ? "completed" : runningStep === step.id ? "running" : ""} key={step.id}>
                  <CheckCircle2 size={17} />
                  <span>{step.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <p className="security-note">
            API Key、Secret 与 Access Token 只通过桌面安全桥加密保存；普通本地缓存只保存脱敏摘要、供应商状态和行情缓存。
          </p>
        </aside>
      </div>
    </section>
  );
}
