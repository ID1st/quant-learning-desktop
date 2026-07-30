import { useState, type FormEvent } from "react";
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
  clearAlphaFeedApiBinding,
  clearAlphaFeedStreamBinding,
  clearLongPortApiBinding,
  readAlphaFeedApiBinding,
  readAlphaFeedStreamBinding,
  readLongPortApiBinding,
  readSavedLongPortCredentials,
  resolveLongPortCredentials,
  saveAlphaFeedStreamConfig,
  verifyLongPortApiConfig,
  type AlphaFeedApiForm,
  type AlphaFeedStreamForm,
  type LongPortApiForm,
} from "../features/api/apiConfigService";
import { verifySelectedBackupProvider } from "../features/api/apiConfigSubmissionService";
import {
  apiProviderPriorityItems,
  formatApiProviderStatus,
  getApiProviderStatus,
  type ApiProviderPriorityItem,
} from "../features/api/apiProviderPriorityConfig";
import { useAuthStore } from "../features/auth/authStore";
import { initialMarketDataSyncSteps, runInitialMarketDataSync } from "../features/marketData/marketDataSyncService";
import {
  readMarketDataProviderSettings,
  writeMarketDataProviderSettings,
} from "../features/marketData/marketDataProviderSettings";
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

function CredentialManagement({
  detail,
  isDeleting,
  onDelete,
  onReplace,
  title,
  verifiedAt,
}: {
  detail: string;
  isDeleting: boolean;
  onDelete: () => void;
  onReplace: () => void;
  title: string;
  verifiedAt: string;
}) {
  return (
    <div className="credential-management-card">
      <div>
        <span>当前凭据</span>
        <strong>{title}</strong>
        <small>{detail}</small>
        <small>最近验证：{new Date(verifiedAt).toLocaleString("zh-CN", { hour12: false })}</small>
      </div>
      <div className="credential-management-actions">
        <button className="secondary-auth-action" onClick={onReplace} type="button">
          修改 / 替换
        </button>
        <button className="credential-delete-action" disabled={isDeleting} onClick={onDelete} type="button">
          {isDeleting ? "删除中..." : "删除凭据"}
        </button>
      </div>
    </div>
  );
}

export function ApiConfigPage() {
  const [storedAlphaFeedBinding, setStoredAlphaFeedBinding] = useState(() => readAlphaFeedApiBinding());
  const [storedAlphaFeedStreamBinding, setStoredAlphaFeedStreamBinding] = useState(() => readAlphaFeedStreamBinding());
  const [storedLongPortBinding, setStoredLongPortBinding] = useState(() => readLongPortApiBinding());
  const [marketDataProviderSettings, setMarketDataProviderSettings] = useState(() => readMarketDataProviderSettings());
  const [selectedProviderId, setSelectedProviderId] = useState<ApiProviderPriorityItem["id"]>("stock-sdk");
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
  const [deletingProvider, setDeletingProvider] = useState<ApiProviderPriorityItem["id"] | null>(null);
  const setApiBound = useAuthStore((state) => state.setApiBound);
  const navigate = useAppStore((state) => state.navigate);
  const hasDesktopBridge = Boolean(window.quantDesktop?.alphaFeed);
  const providerBindingState = {
    stockSdkPrimaryEnabled: marketDataProviderSettings.stockSdkPrimaryEnabled,
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

  const updateStockSdkPrimaryEnabled = (enabled: boolean) => {
    const nextSettings = writeMarketDataProviderSettings({
      ...marketDataProviderSettings,
      stockSdkPrimaryEnabled: enabled,
    });
    setMarketDataProviderSettings(nextSettings);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedProviderId !== "alphafeed-rest" && selectedProviderId !== "longbridge") {
      return;
    }

    setError("");
    setStatus("");
    setCompletedSteps([]);
    setRunningStep("");
    setIsSubmitting(true);

    try {
      const verification = await verifySelectedBackupProvider(
        selectedProviderId,
        {
          alphaFeed: alphaFeedForm,
          longPort: longPortForm,
        },
      );

      if (verification.provider === "longbridge") {
        setApiBound(true);
        setStoredLongPortBinding(verification.binding);
        setStatus("长桥备用源已验证并保存。");
        return;
      }

      const alphaFeedCredentials = verification.credentials;
      const alphaFeedBinding = verification.binding;
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
      setStoredAlphaFeedBinding(alphaFeedBinding);
      setStoredLongPortBinding(longPortBinding ?? null);
      setStatus(
        marketDataSyncWarning ||
          (canUseLongPortFallback ? "备用数据源已绑定：AlphaFeed REST 与长桥均可用。" : "备用数据源已绑定：AlphaFeed REST 可用。"),
      );
      if (!marketDataSyncWarning) {
        window.setTimeout(() => navigate("chart"), 420);
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
      setStoredAlphaFeedStreamBinding(binding);
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

  const handleReplaceProvider = (providerId: ApiProviderPriorityItem["id"]) => {
    setSelectedProviderId(providerId);
    setError("");
    setStreamError("");

    if (providerId === "alphafeed-rest") {
      setAlphaFeedForm({ apiUrl: storedAlphaFeedBinding?.apiUrl ?? defaultAlphaFeedForm.apiUrl, apiKey: "" });
      setStatus("请输入新的 AlphaFeed API Key 后验证保存；现有密钥不会显示。");
    } else if (providerId === "alphafeed-websocket") {
      setAlphaFeedStreamForm({
        wsUrl: storedAlphaFeedStreamBinding?.wsUrl ?? defaultAlphaFeedStreamForm.wsUrl,
        apiKey: "",
        mode: storedAlphaFeedStreamBinding?.mode ?? defaultAlphaFeedStreamForm.mode,
      });
      setStreamStatus("请输入新的 WebSocket API Key 后保存；现有密钥不会显示。");
    } else if (providerId === "longbridge") {
      setLongPortForm({ apiUrl: storedLongPortBinding?.apiUrl ?? defaultLongPortForm.apiUrl, appKey: "", appSecret: "", accessToken: "" });
      setStatus("请输入新的长桥凭据后验证保存；现有凭据不会显示。");
    }
  };

  const handleDeleteProvider = async (providerId: "alphafeed-rest" | "alphafeed-websocket" | "longbridge") => {
    const providerName = providerId === "alphafeed-rest" ? "AlphaFeed REST" : providerId === "alphafeed-websocket" ? "AlphaFeed WebSocket" : "长桥";
    if (!window.confirm(`确定删除 ${providerName} 的已保存凭据吗？删除后需要重新填写并验证。`)) {
      return;
    }

    setDeletingProvider(providerId);
    setError("");
    setStreamError("");
    try {
      if (providerId === "alphafeed-rest") {
        await clearAlphaFeedApiBinding();
        setStoredAlphaFeedBinding(null);
        setAlphaFeedForm(defaultAlphaFeedForm);
        setStatus("AlphaFeed REST 凭据已删除。");
      } else if (providerId === "alphafeed-websocket") {
        await clearAlphaFeedStreamBinding();
        setStoredAlphaFeedStreamBinding(null);
        setAlphaFeedStreamForm(defaultAlphaFeedStreamForm);
        setStreamStatus("AlphaFeed WebSocket 凭据已删除。");
      } else {
        await clearLongPortApiBinding();
        setStoredLongPortBinding(null);
        setLongPortForm(defaultLongPortForm);
        setStatus("长桥凭据已删除。");
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : `${providerName} 凭据删除失败。`;
      if (providerId === "alphafeed-websocket") {
        setStreamError(message);
      } else {
        setError(message);
      }
    } finally {
      setDeletingProvider(null);
    }
  };

  return (
    <section className="api-config-page">
      <header className="module-header">
        <p>行情数据源</p>
        <h1>主行情源优先，备用源兜底</h1>
        <span>
          Stock SDK 已作为主行情源启用；实时快照与证券搜索由官方 SDK 提供，历史 K 线与分时由桌面主进程的腾讯财经路由补强。AlphaFeed 与长桥保留为备用数据源。
        </span>
      </header>

      <div className="data-source-workspace">
        <aside className="data-source-provider-nav" aria-label="数据源优先级">
          <div className="data-source-panel-heading">
            <span>数据源优先级</span>
            <small>当前顺序</small>
          </div>
          <ol className="provider-navigation-list">
            {apiProviderPriorityItems.map((provider) => {
              const providerStatus = getApiProviderStatus(provider.id, providerBindingState);
              const isSelected = provider.id === selectedProviderId;

              return (
                <li key={provider.id}>
                  <button
                    aria-pressed={isSelected}
                    className={isSelected ? "active" : ""}
                    onClick={() => setSelectedProviderId(provider.id)}
                    type="button"
                  >
                    <span className="provider-order">{provider.order}</span>
                    {getProviderIcon(provider.id)}
                    <span className="provider-navigation-copy">
                      <strong>{provider.name}</strong>
                      <small>{provider.role === "primary" ? "主行情源" : "备用数据源"}</small>
                    </span>
                    <em className={`provider-status-pill ${providerStatus}`}>{formatApiProviderStatus(providerStatus)}</em>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="provider-navigation-note">数据源优先级由行情网关统一执行。配置页面只管理连接信息与可用状态。</p>
        </aside>

        <form className="module-card api-config-form data-source-config-panel" onSubmit={handleSubmit}>
          <details className={`api-provider-section primary-provider ${selectedProviderId === "stock-sdk" ? "selected" : ""}`} open>
            <summary>
              <div className="module-card-header">
                <ServerCog size={20} />
                <div>
                  <h2>Stock SDK 主行情源</h2>
                  <p>桌面版已接入主行情源适配器；该源不需要用户填写凭据，所有请求都由行情网关统一调度。</p>
                </div>
              </div>
            </summary>

            <div className="api-provider-content provider-placeholder-panel">
              <div className="provider-status-row">
                <span className="provider-status-pill enabled">已启用</span>
                <strong>Stock SDK · 腾讯财经历史路由</strong>
              </div>
              <p>
                已负责 A股、港股、美股的实时快照、历史 K 线与分时数据。历史数据使用腾讯财经补强；遇到网络、限频或无数据时会自动降级到备用数据源。
              </p>
              <div className="provider-badge-row">
                {apiProviderPriorityItems[0]?.capabilityBadges.map((badge) => (
                  <span key={badge}>{badge}</span>
                ))}
              </div>
              <label className="provider-toggle-row">
                <input
                  checked={marketDataProviderSettings.stockSdkPrimaryEnabled}
                  onChange={(event) => updateStockSdkPrimaryEnabled(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>启用 Stock SDK 主行情源</strong>
                  <small>开启后图表优先尝试 Stock SDK；不可用、限频或无数据时自动降级到备用数据源。</small>
                </span>
              </label>
            </div>
          </details>

          <div className="api-section-label">备用数据源</div>

          <details className={`api-provider-section ${selectedProviderId === "alphafeed-rest" ? "selected" : ""}`} open={selectedProviderId === "alphafeed-rest"}>
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

              {storedAlphaFeedBinding && (
                <CredentialManagement
                  detail={`API URL：${storedAlphaFeedBinding.apiUrl} · API Key：${storedAlphaFeedBinding.apiKeyPreview}`}
                  isDeleting={deletingProvider === "alphafeed-rest"}
                  onDelete={() => void handleDeleteProvider("alphafeed-rest")}
                  onReplace={() => handleReplaceProvider("alphafeed-rest")}
                  title="已保存的 AlphaFeed REST 凭据"
                  verifiedAt={storedAlphaFeedBinding.verifiedAt}
                />
              )}
            </div>
          </details>

          <details className={`api-provider-section ${selectedProviderId === "alphafeed-websocket" ? "selected" : ""}`} open={selectedProviderId === "alphafeed-websocket"}>
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
                <CredentialManagement
                  detail={`${storedAlphaFeedStreamBinding.mode === "all-symbols" ? "全标的流" : "关注列表流"} · WebSocket URL：${storedAlphaFeedStreamBinding.wsUrl} · API Key：${storedAlphaFeedStreamBinding.apiKeyPreview}`}
                  isDeleting={deletingProvider === "alphafeed-websocket"}
                  onDelete={() => void handleDeleteProvider("alphafeed-websocket")}
                  onReplace={() => handleReplaceProvider("alphafeed-websocket")}
                  title="已保存的 AlphaFeed WebSocket 凭据"
                  verifiedAt={storedAlphaFeedStreamBinding.preparedAt}
                />
              )}
              {streamError && <div className="auth-message error">{streamError}</div>}
              {streamStatus && <div className="auth-message success">{streamStatus}</div>}
              <button className="secondary-auth-action" disabled={isSavingStream || !hasDesktopBridge} onClick={handleSaveAlphaFeedStream} type="button">
                {isSavingStream ? "保存中..." : "保存 WebSocket 备用通道"}
              </button>
            </div>
          </details>

          <details className={`api-provider-section ${selectedProviderId === "longbridge" ? "selected" : ""}`} open={selectedProviderId === "longbridge"}>
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

              {storedLongPortBinding && (
                <CredentialManagement
                  detail={`API URL：${storedLongPortBinding.apiUrl} · App Key：${storedLongPortBinding.appKeyPreview} · Access Token：${storedLongPortBinding.accessTokenPreview}`}
                  isDeleting={deletingProvider === "longbridge"}
                  onDelete={() => void handleDeleteProvider("longbridge")}
                  onReplace={() => handleReplaceProvider("longbridge")}
                  title="已保存的长桥凭据"
                  verifiedAt={storedLongPortBinding.verifiedAt}
                />
              )}
            </div>
          </details>

          {!hasDesktopBridge && <div className="auth-message error">备用数据源的凭据验证和初始同步需要桌面安全桥，请在桌面应用中运行。</div>}
          {error && <div className="auth-message error">{error}</div>}
          {status && <div className="auth-message success">{status}</div>}

          <button
            className={
              selectedProviderId === "alphafeed-rest" || selectedProviderId === "longbridge"
                ? "primary-auth-action"
                : "primary-auth-action provider-submit-hidden"
            }
            disabled={isSubmitting || !hasDesktopBridge}
            type="submit"
          >
            {isSubmitting ? "验证中..." : selectedProviderId === "longbridge" ? "验证并保存长桥备用源" : "验证并保存备用数据源"}
          </button>
        </form>

        <aside className="module-card api-status-card data-source-diagnostics">
          <div className="data-source-panel-heading diagnostics-heading">
            <span>运行诊断</span>
            <small>连接、同步与安全状态</small>
          </div>
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
