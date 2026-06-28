import { useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, LockKeyhole, Mail, ShieldCheck, Wifi } from "lucide-react";
import { login, register, sendEmailCode } from "../features/auth/authService";
import { useAuthStore } from "../features/auth/authStore";
import { useAppStore } from "../state/appStore";

type AuthMode = "login" | "register";

interface AuthFormState {
  email: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
  emailCode: string;
}

const initialFormState: AuthFormState = {
  email: "",
  password: "",
  confirmPassword: "",
  inviteCode: "",
  emailCode: "",
};

const marketRows = [
  { symbol: "AAPL", name: "美股", value: "219.48", change: "+1.03%" },
  { symbol: "9988.HK", name: "港股", value: "83.20", change: "+1.49%" },
  { symbol: "600519", name: "A股", value: "1468.10", change: "+0.54%" },
];

const flowSteps = ["账户验证", "邮箱校验", "长桥 API 绑定"];

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState<AuthFormState>(initialFormState);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useAppStore((state) => state.navigate);

  const updateField = (field: keyof AuthFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setStatus("");
    setError("");
  };

  const handleSendCode = async () => {
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      await sendEmailCode(form.email);
      setCodeSent(true);
      setStatus("邮箱验证码已发送。当前本地占位验证码为 123456。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "发送验证码失败。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsSubmitting(true);

    try {
      const session =
        mode === "login"
          ? await login({ email: form.email, password: form.password })
          : await register(form);

      setSession(session);
      setStatus("登录成功。首次使用需要继续绑定长桥 API。");
      navigate("apiConfig");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "认证流程失败。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="login-page">
      <div className="login-terminal" aria-label="量化学习系统登录概览">
        <div className="login-product-bar">
          <div className="login-mark">量</div>
          <div>
            <p>量化学习桌面版</p>
            <h1>交易研究工作台</h1>
          </div>
        </div>

        <div className="market-strip" aria-label="市场概览">
          {marketRows.map((row) => (
            <div className="market-tile" key={row.symbol}>
              <span>{row.name}</span>
              <strong>{row.symbol}</strong>
              <p>
                {row.value}
                <b>{row.change}</b>
              </p>
            </div>
          ))}
        </div>

        <div className="auth-flow" aria-label="首次使用流程">
          {flowSteps.map((step, index) => (
            <div className={index === 0 ? "flow-step active" : "flow-step"} key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>

        <div className="terminal-panel">
          <div className="terminal-row">
            <Wifi size={16} />
            <span>认证服务</span>
            <strong>本地占位</strong>
          </div>
          <div className="terminal-row">
            <ShieldCheck size={16} />
            <span>注册邀请码</span>
            <strong>QUANT2026</strong>
          </div>
          <div className="terminal-row">
            <LockKeyhole size={16} />
            <span>邮箱验证码</span>
            <strong>123456</strong>
          </div>
        </div>
      </div>

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-card-header">
          <span>安全入口</span>
          <h2>{mode === "login" ? "登录账户" : "创建账户"}</h2>
          <p>{mode === "login" ? "进入图表、策略与学习进度工作区。" : "完成邮箱验证后进入 API 绑定流程。"}</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="认证模式">
          <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} type="button">
            登录
          </button>
          <button className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")} type="button">
            注册
          </button>
        </div>

        <label>
          <span>邮箱</span>
          <div className="input-shell">
            <Mail size={16} />
            <input
              autoComplete="email"
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="name@example.com"
              type="email"
              value={form.email}
            />
          </div>
        </label>

        <label>
          <span>密码</span>
          <div className="input-shell">
            <KeyRound size={16} />
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(event) => updateField("password", event.target.value)}
              placeholder="至少 8 位"
              type="password"
              value={form.password}
            />
          </div>
        </label>

        {mode === "register" && (
          <>
            <label>
              <span>确认密码</span>
              <div className="input-shell">
                <KeyRound size={16} />
                <input
                  autoComplete="new-password"
                  onChange={(event) => updateField("confirmPassword", event.target.value)}
                  placeholder="再次输入密码"
                  type="password"
                  value={form.confirmPassword}
                />
              </div>
            </label>

            <label>
              <span>邀请码</span>
              <div className="input-shell">
                <ShieldCheck size={16} />
                <input
                  onChange={(event) => updateField("inviteCode", event.target.value)}
                  placeholder="当前占位：QUANT2026"
                  value={form.inviteCode}
                />
              </div>
            </label>

            <label>
              <span>邮箱验证码</span>
              <div className="inline-input">
                <div className="input-shell">
                  <CheckCircle2 size={16} />
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateField("emailCode", event.target.value)}
                    placeholder="6 位验证码"
                    value={form.emailCode}
                  />
                </div>
                <button disabled={isSubmitting} onClick={handleSendCode} type="button">
                  {codeSent ? "重新发送" : "发送验证码"}
                </button>
              </div>
            </label>
          </>
        )}

        <div className="auth-note">
          第四阶段当前使用本地占位认证服务；真实联网校验将在云端认证接口确认后替换。
        </div>

        {error && <div className="auth-message error">{error}</div>}
        {status && <div className="auth-message success">{status}</div>}

        <button className="primary-auth-action" disabled={isSubmitting} type="submit">
          {isSubmitting ? "处理中..." : mode === "login" ? "登录并继续" : "注册并继续"}
        </button>
      </form>
    </section>
  );
}
