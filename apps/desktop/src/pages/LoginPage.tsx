import { useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
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
      setStatus("邮箱验证码已发送，请查收后继续。");
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
      setStatus("登录成功，正在进入下一步配置。");
      navigate("apiConfig");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "认证流程失败。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="login-page">
      <header className="login-topbar" aria-label="登录页页眉">
        <div className="brand-lockup">
          <div className="login-mark">量</div>
          <span>量化学习桌面版</span>
        </div>
        <button className="language-button" type="button">
          简体中文
        </button>
      </header>

      <div className="login-shell">
        <aside className="login-brand-panel" aria-label="产品介绍">
          <p>TradingView + Quant Learning Platform</p>
          <h1>专业量化学习系统</h1>
          <span>研究策略、沉淀信号、连接多市场数据，从登录开始保持专注。</span>
        </aside>

        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-tabs" role="tablist" aria-label="认证模式">
            <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} type="button">
              账号登录
            </button>
            <button className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")} type="button">
              注册账号
            </button>
          </div>

          <div className="auth-card-header">
            <h2>{mode === "login" ? "登录" : "创建账号"}</h2>
            <p>{mode === "login" ? "使用邮箱和密码进入系统。" : "完成邮箱验证后继续绑定长桥 API。"}</p>
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
                    placeholder="请输入邀请码"
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

          {error && <div className="auth-message error">{error}</div>}
          {status && <div className="auth-message success">{status}</div>}

          <button className="primary-auth-action" disabled={isSubmitting} type="submit">
            {isSubmitting ? "处理中..." : mode === "login" ? "登录并继续" : "注册并继续"}
          </button>

          <p className="auth-card-footer">继续即表示你同意使用本地安全会话保存登录状态。</p>
        </form>
      </div>
    </section>
  );
}
