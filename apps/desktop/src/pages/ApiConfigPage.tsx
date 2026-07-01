import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, DatabaseZap, KeyRound, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  ALPHAFEED_DEFAULT_API_URL,
  LONGPORT_DEFAULT_HTTP_URL,
  readAlphaFeedApiBinding,
  readLongPortApiBinding,
  readSavedLongPortCredentials,
  resolveAlphaFeedCredentials,
  resolveLongPortCredentials,
  verifyAlphaFeedApiConfig,
  verifyLongPortApiConfig,
  type AlphaFeedApiForm,
  type LongPortApiForm,
} from "../features/api/apiConfigService";
import { useAuthStore } from "../features/auth/authStore";
import { initialMarketDataSyncSteps, runInitialMarketDataSync } from "../features/marketData/marketDataSyncService";
import { useAppStore } from "../state/appStore";

const defaultAlphaFeedForm: AlphaFeedApiForm = {
  apiUrl: ALPHAFEED_DEFAULT_API_URL,
  apiKey: "",
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

export function ApiConfigPage() {
  const storedAlphaFeedBinding = useMemo(() => readAlphaFeedApiBinding(), []);
  const storedLongPortBinding = useMemo(() => readLongPortApiBinding(), []);
  const [alphaFeedForm, setAlphaFeedForm] = useState<AlphaFeedApiForm>({
    ...defaultAlphaFeedForm,
    apiUrl: storedAlphaFeedBinding?.apiUrl ?? defaultAlphaFeedForm.apiUrl,
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const setApiBound = useAuthStore((state) => state.setApiBound);
  const navigate = useAppStore((state) => state.navigate);
  const hasDesktopBridge = Boolean(window.quantDesktop?.alphaFeed);

  const updateAlphaFeedField = (field: keyof AlphaFeedApiForm, value: string) => {
    setAlphaFeedForm((current) => ({ ...current, [field]: value }));
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
            const bars = await Promise.all(
              watchlist.map(async (item) => {
                const result = await window.quantDesktop?.alphaFeed?.fetchHistoricalBars(alphaFeedCredentials, {
                  symbol: item.symbol,
                  market: item.market,
                  timeframe: "1d",
                  count: 240,
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
      setStatus(canUseLongPortFallback ? "AlphaFeed 主数据源已绑定，长桥备用源已就绪。" : "AlphaFeed 主数据源已绑定。");
      window.setTimeout(() => navigate("dashboard"), 420);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "行情数据源绑定失败。");
    } finally {
      setIsSubmitting(false);
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
          <div className="module-card-header">
            <DatabaseZap size={20} />
            <div>
              <h2>AlphaFeed 主数据源</h2>
              <p>使用 X-API-Key 认证，优先拉取 A 股、美股、港股实时行情和默认日线缓存。</p>
            </div>
          </div>

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

          <div className="module-card-header compact">
            <ShieldCheck size={18} />
            <div>
              <h2>长桥备用源</h2>
              <p>可选填写。AlphaFeed 失败时尝试用长桥快照兜底。</p>
            </div>
          </div>

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
              <p>绑定成功后会拉取默认观察列表快照和日线 K 线缓存。</p>
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
