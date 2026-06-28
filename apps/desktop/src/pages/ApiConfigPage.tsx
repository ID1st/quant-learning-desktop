import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  readLongPortApiBinding,
  verifyLongPortApiConfig,
  type LongPortApiForm,
} from "../features/api/apiConfigService";
import { useAuthStore } from "../features/auth/authStore";
import { useAppStore } from "../state/appStore";

const defaultForm: LongPortApiForm = {
  apiUrl: "https://openapi.longportapp.com",
  apiKey: "",
  apiSecret: "",
};

const syncSteps = ["验证长桥 API 凭证", "同步美股、港股、A股市场权限", "准备自选股与历史 K 线缓存"];

export function ApiConfigPage() {
  const storedBinding = useMemo(() => readLongPortApiBinding(), []);
  const [form, setForm] = useState<LongPortApiForm>({
    ...defaultForm,
    apiUrl: storedBinding?.apiUrl ?? defaultForm.apiUrl,
  });
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [status, setStatus] = useState(storedBinding ? "当前设备已有长桥 API 绑定记录。" : "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const setApiBound = useAuthStore((state) => state.setApiBound);
  const navigate = useAppStore((state) => state.navigate);

  const updateField = (field: keyof LongPortApiForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setCompletedSteps([]);
    setIsSubmitting(true);

    try {
      await verifyLongPortApiConfig(form);

      for (const step of syncSteps) {
        await new Promise((resolve) => window.setTimeout(resolve, 220));
        setCompletedSteps((current) => [...current, step]);
      }

      setApiBound(true);
      setStatus("绑定成功，正在进入仪表盘。");
      window.setTimeout(() => navigate("dashboard"), 420);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "长桥 API 绑定失败。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="api-config-page">
      <header className="module-header">
        <p>长桥 API 绑定</p>
        <h1>连接你的行情与交易数据</h1>
        <span>首次登录后需要完成 API 验证，后续模块将基于该连接拉取市场、自选股和历史 K 线数据。</span>
      </header>

      <div className="api-config-grid">
        <form className="module-card api-config-form" onSubmit={handleSubmit}>
          <div className="module-card-header">
            <ShieldCheck size={20} />
            <div>
              <h2>API 凭证</h2>
              <p>当前阶段为本地验证占位，后续会替换为正式长桥 OpenAPI SDK。</p>
            </div>
          </div>

          <label>
            <span>API URL</span>
            <div className="input-shell">
              <Link2 size={16} />
              <input
                onChange={(event) => updateField("apiUrl", event.target.value)}
                placeholder="https://openapi.longportapp.com"
                value={form.apiUrl}
              />
            </div>
          </label>

          <label>
            <span>API Key</span>
            <div className="input-shell">
              <KeyRound size={16} />
              <input
                autoComplete="off"
                onChange={(event) => updateField("apiKey", event.target.value)}
                placeholder="请输入 API Key"
                value={form.apiKey}
              />
            </div>
          </label>

          <label>
            <span>API Secret</span>
            <div className="input-shell">
              <KeyRound size={16} />
              <input
                autoComplete="off"
                onChange={(event) => updateField("apiSecret", event.target.value)}
                placeholder="请输入 API Secret"
                type="password"
                value={form.apiSecret}
              />
            </div>
          </label>

          {error && <div className="auth-message error">{error}</div>}
          {status && <div className="auth-message success">{status}</div>}

          <button className="primary-auth-action" disabled={isSubmitting} type="submit">
            {isSubmitting ? "验证中..." : "验证并绑定"}
          </button>
        </form>

        <aside className="module-card api-status-card">
          <div className="module-card-header">
            <RefreshCw size={20} />
            <div>
              <h2>同步准备</h2>
              <p>绑定成功后自动进入行情数据准备流程。</p>
            </div>
          </div>

          <div className="binding-summary">
            <span>当前状态</span>
            <strong>{storedBinding ? "已绑定" : "待绑定"}</strong>
            {storedBinding && <small>Key：{storedBinding.keyPreview}</small>}
          </div>

          <ol className="sync-step-list">
            {syncSteps.map((step) => (
              <li className={completedSteps.includes(step) ? "completed" : ""} key={step}>
                <CheckCircle2 size={17} />
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <p className="security-note">API Secret 当前仅参与本次验证，不写入浏览器本地存储。桌面正式版会接入系统安全凭据存储。</p>
        </aside>
      </div>
    </section>
  );
}
