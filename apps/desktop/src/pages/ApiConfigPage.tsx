import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, DatabaseZap, KeyRound, Link2, RefreshCw, ShieldCheck } from "lucide-react";
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
      ? "当前设备已有 AlphaFeed 主数据源绑定记录。"
      : storedLongPortBinding
        ? "当前设备已有长桥备用数据源绑定记录。"
        : "",
  );
  const [error, setError] = useState("");
  const [streamStatus, setStreamStatus] = useState(
    storedAlphaFeedStreamBinding ? "AlphaFeed WebSocket 会员通道已预留，等待后续流式行情模块启用。" : "",
  );
  const [streamError, setStreamError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingStream, setIsSavingStream] = useState(false);
  const setApiBound = useAuthStore((state) => state.setApiBound);
  const navigate = useAppStore((state) => state.navigate);
  const hasDesktopBridge = Boolean(window.quantDesktop?.alphaFeed);

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
      const longPortBinding = shouldBindLongPortFallback && longPortCredentials
        ? await verifyLongPortApiConfig(longPortCredentials)
        : storedLongPortBinding;
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
                `AlphaFeed 部分必要 K 线周期未返回数据：${blockingEmptyRequests.slice(0, 6).map((request) => `${request.item.symbol} ${request.timeframe}`).join("、")}`,
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
          (canUseLongPortFallback ? "AlphaFeed 主数据源已绑定，长桥备用源已就绪。" : "AlphaFeed 主数据源已绑定。"),
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
          ? "AlphaFeed WebSocket 全标的会员通道已预留。后续流式行情模块启用后将优先使用该通道。"
          : "AlphaFeed WebSocket 关注列表通道已预留。后续流式行情模块启用后将优先使用该通道。",
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
        <h1>优先连接 AlphaFeed，长桥作为备用通道</h1>
        <span>AlphaFeed 用于实时行情、分时和历史 K 线；长桥保留为备用行情和未来交易接口入口。</span>
      </header>

      <div className="api-config-grid">
        <form className="module-card api-config-form" onSubmit={handleSubmit}>
          <details className="api-provider-section" open>
            <summary>
              <div className="module-card-header">
                <DatabaseZap size={20} />
                <div>
                  <h2>AlphaFeed 主数据源</h2>
                  <p>使用 X-API-Key 认证，优先拉取 A 股、美股、港股实时行情和默认多周期 K 线缓存。</p>
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
                <DatabaseZap size={20} />
                <div>
                  <h2>AlphaFeed WebSocket 会员通道</h2>
                  <p>会员流式行情优先用于关注列表；REST 批量轮询会保留为兜底。</p>
                </div>
              </div>
            </summary>

            <div className="api-provider-content stream-reserved-panel">
              <div>
                <strong>流式行情配置</strong>
                <small>仅在用户单独购买 AlphaFeed 会员并提供 WebSocket Key 时启用。</small>
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
              {isSavingStream ? "保存中..." : "保存 WebSocket 预留通道"}
            </button>
            </div>
          </details>

          <details className="api-provider-section">
            <summary>
              <div className="module-card-header">
                <ShieldCheck size={20} />
                <div>
                  <h2>长桥备用源</h2>
                  <p>可选填写。AlphaFeed 失败时尝试用长桥快照兜底。</p>
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
            {isSubmitting ? "验证中..." : "验证并绑定数据源"}
          </button>
        </form>

        <aside className="module-card api-status-card">
          <div className="module-card-header">
            <RefreshCw size={20} />
            <div>
              <h2>同步准备</h2>
              <p>绑定成功后会拉取默认观察列表快照，以及 1m / 5m / 15m / 1h / 1d / 1w K 线缓存。</p>
            </div>
          </div>

          <div className="binding-summary">
            <span>主数据源</span>
            <strong>{storedAlphaFeedBinding ? "AlphaFeed 已绑定" : "等待绑定"}</strong>
            {storedAlphaFeedBinding && <small>API Key：{storedAlphaFeedBinding.apiKeyPreview}</small>}
          </div>

          <div className="binding-summary">
            <span>备用源</span>
            <strong>{storedLongPortBinding ? "长桥已绑定" : "未启用"}</strong>
            {storedLongPortBinding && <small>App Key：{storedLongPortBinding.appKeyPreview}</small>}
          </div>

          <div className="binding-summary">
            <span>会员流式通道</span>
            <strong>{storedAlphaFeedStreamBinding ? "WebSocket 已预留" : "未预留"}</strong>
            {storedAlphaFeedStreamBinding && (
              <small>
                {storedAlphaFeedStreamBinding.mode === "all-symbols" ? "全标的流" : "关注列表流"} · API Key：
                {storedAlphaFeedStreamBinding.apiKeyPreview}
              </small>
            )}
          </div>

          <ol className="sync-step-list">
            {initialMarketDataSyncSteps.map((step) => (
              <li className={completedSteps.includes(step.id) ? "completed" : runningStep === step.id ? "running" : ""} key={step.id}>
                <CheckCircle2 size={17} />
                <span>{step.label}</span>
              </li>
            ))}
          </ol>

          <p className="security-note">
            AlphaFeed 与长桥密钥只通过桌面安全桥参与联网验证；本地普通缓存只保存脱敏摘要、供应商状态和行情缓存。
          </p>
        </aside>
      </div>
    </section>
  );
}
