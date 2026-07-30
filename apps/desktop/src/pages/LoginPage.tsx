import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PropsWithChildren,
} from "react";

import type { AuthOperationError } from "@quant/shared";

import {
  authErrorMessage,
  evaluatePasswordRules,
  getAuthBridge,
  maskEmail,
  normalizeInviteInput,
  passwordRulesSatisfied,
} from "../features/auth/authService";
import { useAuthStore } from "../features/auth/authStore";

function AuthLayout({ children }: PropsWithChildren) {
  return (
    <main className="auth-shell">
      <section className="login-page">
        <header className="login-topbar" aria-label="登录页页眉">
          <div className="brand-lockup">
            <div className="login-mark">量</div>
            <span>量化学习系统桌面版</span>
          </div>
          <span className="auth-environment-label">安全账号验证</span>
        </header>
        <div className="login-shell">
          <aside className="login-brand-panel" aria-label="产品介绍">
            <p>TradingView + Quant Learning Workstation</p>
            <h1>专业量化学习工作台</h1>
            <span>
              账号验证在云端完成；行情凭据、策略草稿和研究数据继续保留在本机。
            </span>
          </aside>
          {children}
        </div>
      </section>
    </main>
  );
}

function AuthMessage({
  error,
  status,
}: {
  error: string;
  status: string;
}) {
  return (
    <div aria-live="polite" className="auth-message-stack">
      {error && (
        <div className="auth-message error" role="alert">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}
      {status && <div className="auth-message success">{status}</div>}
    </div>
  );
}

function errorText(error: AuthOperationError): string {
  return authErrorMessage(error.code, error.retryAfterSeconds);
}

function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) {
      return;
    }
    const timer = window.setTimeout(
      () => setSeconds((current) => Math.max(0, current - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [seconds]);
  return { seconds, start: (value = 60) => setSeconds(value) };
}

function PasswordInput({
  value,
  onChange,
  autoComplete,
  label = "密码",
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="input-shell">
        <KeyRound size={16} />
        <input
          autoComplete={autoComplete}
          maxLength={64}
          onChange={(event) => onChange(event.currentTarget.value)}
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? "隐藏密码" : "显示密码"}
          className="input-icon-button"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}

function PasswordRules({ password }: { password: string }) {
  const rules = evaluatePasswordRules(password);
  const items = [
    ["length", "8–64 位"],
    ["uppercase", "大写字母"],
    ["lowercase", "小写字母"],
    ["digit", "数字"],
    ["special", "特殊符号"],
    ["asciiNoWhitespace", "无空格 ASCII 字符"],
  ] as const;
  return (
    <ul className="password-rule-list" aria-label="密码安全规则">
      {items.map(([key, label]) => (
        <li className={rules[key] ? "valid" : ""} key={key}>
          <Check size={13} />
          {label}
        </li>
      ))}
    </ul>
  );
}

function LoginForm({
  initialEmail,
  notice,
  onEmailRemembered,
  onEntitlementExpired,
}: {
  initialEmail: string;
  notice: string;
  onEmailRemembered: (email: string) => void;
  onEntitlementExpired: (expiredAt: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const setPhase = useAuthStore((state) => state.setPhase);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const setSubmitting = useAuthStore((state) => state.setSubmitting);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const bridge = getAuthBridge();
    if (!bridge) {
      setError("当前不是 Electron 桌面运行环境，无法安全登录。");
      return;
    }
    setSubmitting(true);
    setError("");
    setStatus("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await bridge.login({
        email: normalizedEmail,
        password,
      });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      onEmailRemembered(normalizedEmail);
      if (result.data.kind === "ACCESS_DENIED") {
        setError("该账号当前无法访问测试系统。");
      } else if (result.data.kind === "INVITE_REQUIRED") {
        setPhase("INVITE_REQUIRED");
      } else if (result.data.kind === "ENTITLEMENT_EXPIRED") {
        onEntitlementExpired(result.data.expiredAt);
        setPhase("ENTITLEMENT_EXPIRED");
      }
    } finally {
      setPassword("");
      setSubmitting(false);
    }
  };

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-card-header">
        <p>账号登录</p>
        <h2 tabIndex={-1}>验证您的测试账号</h2>
        <span>首次正确登录后，需要再核验一枚有效邀请码。</span>
      </div>
      <label className="auth-field">
        <span>邮箱</span>
        <div className="input-shell">
          <Mail size={16} />
          <input
            autoComplete="email"
            autoFocus
            maxLength={254}
            onChange={(event) => setEmail(event.currentTarget.value)}
            placeholder="name@example.com"
            type="email"
            value={email}
          />
        </div>
      </label>
      <PasswordInput
        autoComplete="current-password"
        onChange={setPassword}
        value={password}
      />
      <button
        className="auth-link-button"
        onClick={() => setPhase("RESET_REQUEST")}
        type="button"
      >
        忘记密码
      </button>
      <AuthMessage error={error} status={status || notice} />
      <button
        className="primary-auth-action"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "正在验证…" : "登录"}
      </button>
      <div className="auth-secondary-row">
        <span>还没有账号？</span>
        <button onClick={() => setPhase("REGISTERING")} type="button">
          注册测试账号
        </button>
      </div>
    </form>
  );
}

function RegistrationForm({
  initialEmail,
  onEmailRemembered,
}: {
  initialEmail: string;
  onEmailRemembered: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [emailCode, setEmailCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [accountAlreadyExists, setAccountAlreadyExists] = useState(false);
  const [isRequestingCode, setRequestingCode] = useState(false);
  const { seconds, start } = useCountdown();
  const setPhase = useAuthStore((state) => state.setPhase);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const setSubmitting = useAuthStore((state) => state.setSubmitting);

  const requestCode = async () => {
    const bridge = getAuthBridge();
    if (!bridge) {
      setError("当前不是 Electron 桌面运行环境。");
      return;
    }
    setRequestingCode(true);
    setError("");
    setAccountAlreadyExists(false);
    try {
      const result = await bridge.requestRegistrationCode({
        email: email.trim().toLowerCase(),
      });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      start(result.data.retryAfterSeconds);
      setStatus(
        "验证码已发送，请检查邮箱；验证码 10 分钟内有效。已注册邮箱验证后会引导您登录。",
      );
    } finally {
      setRequestingCode(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordRulesSatisfied(password)) {
      setError("请先满足全部密码安全规则。");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }
    const bridge = getAuthBridge();
    if (!bridge) {
      setError("当前不是 Electron 桌面运行环境。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await bridge.register({
        email: normalizedEmail,
        emailCode,
        password,
      });
      if (!result.ok) {
        if (result.error.code === "ACCOUNT_ALREADY_EXISTS") {
          onEmailRemembered(normalizedEmail);
          setAccountAlreadyExists(true);
        }
        setError(errorText(result.error));
        return;
      }
      onEmailRemembered(normalizedEmail);
      setPhase("LOGIN");
    } finally {
      setPassword("");
      setConfirmPassword("");
      setSubmitting(false);
    }
  };

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-card-header">
        <p>账号注册</p>
        <h2 tabIndex={-1}>创建测试账号</h2>
        <span>注册只验证邮箱和密码；邀请码在首次登录时单独核验。</span>
      </div>
      <label className="auth-field">
        <span>邮箱</span>
        <div className="input-shell">
          <Mail size={16} />
          <input
            autoComplete="email"
            autoFocus
            maxLength={254}
            onChange={(event) => {
              setEmail(event.currentTarget.value);
              setAccountAlreadyExists(false);
            }}
            type="email"
            value={email}
          />
        </div>
      </label>
      <label className="auth-field">
        <span>邮箱验证码</span>
        <div className="inline-input">
          <div className="input-shell">
            <ShieldCheck size={16} />
            <input
              inputMode="numeric"
              maxLength={6}
              onChange={(event) =>
                setEmailCode(event.currentTarget.value.replace(/\D/g, ""))
              }
              value={emailCode}
            />
          </div>
          <button
            disabled={seconds > 0 || isRequestingCode}
            onClick={() => void requestCode()}
            type="button"
          >
            {isRequestingCode
              ? "正在发送…"
              : seconds > 0
                ? `${seconds} 秒`
                : "发送验证码"}
          </button>
        </div>
      </label>
      <PasswordInput
        autoComplete="new-password"
        onChange={setPassword}
        value={password}
      />
      <PasswordInput
        autoComplete="new-password"
        label="确认密码"
        onChange={setConfirmPassword}
        value={confirmPassword}
      />
      <PasswordRules password={password} />
      <AuthMessage error={error} status={status} />
      {accountAlreadyExists ? (
        <>
          <button
            className="primary-auth-action"
            onClick={() => setPhase("LOGIN")}
            type="button"
          >
            直接登录
          </button>
          <button
            className="secondary-auth-action"
            onClick={() => setPhase("RESET_REQUEST")}
            type="button"
          >
            忘记密码，重置密码
          </button>
        </>
      ) : (
        <>
          <button
            className="primary-auth-action"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "正在创建…" : "完成注册"}
          </button>
          <button
            className="secondary-auth-action"
            onClick={() => setPhase("LOGIN")}
            type="button"
          >
            已有账号，返回登录
          </button>
        </>
      )}
    </form>
  );
}

function InviteForm({
  email,
  expired,
  expiredAt,
}: {
  email: string;
  expired: boolean;
  expiredAt?: string;
}) {
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const setSubmitting = useAuthStore((state) => state.setSubmitting);
  const setPhase = useAuthStore((state) => state.setPhase);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const bridge = getAuthBridge();
    if (!bridge) {
      setError("当前不是 Electron 桌面运行环境。");
      return;
    }
    setSubmitting(true);
    setError("");
    setStatus("");
    try {
      const normalizedCode = normalizeInviteInput(inviteCode);
      const result = expired
        ? await bridge.renewEntitlement({ inviteCode: normalizedCode })
        : await bridge.redeemInvite({ inviteCode: normalizedCode });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setStatus(
        `资格已生效，有效期至 ${new Date(result.data.entitlementEndsAt).toLocaleString("zh-CN", { hour12: false })}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="auth-card auth-blocking-card" onSubmit={submit}>
      <div className="auth-card-header">
        <p>{expired ? "测试资格已到期" : "首次登录验证"}</p>
        <h2 tabIndex={-1}>
          {expired ? "使用新邀请码续期" : "验证测试用户邀请码"}
        </h2>
        <span>
          {expired
            ? "邮箱和密码已验证，但测试资格已经失效。"
            : "邮箱和密码已验证，还需要邀请码确认测试资格。"}
        </span>
        {expired && expiredAt && (
          <span>
            原到期时间：
            {new Date(expiredAt).toLocaleString("zh-CN", {
              hour12: false,
            })}
          </span>
        )}
      </div>
      <div className="masked-account-row">
        <Mail size={15} />
        <span>{maskEmail(email)}</span>
      </div>
      <label className="auth-field">
        <span>邀请码</span>
        <div className="input-shell">
          <ShieldCheck size={16} />
          <input
            autoFocus
            maxLength={64}
            onChange={(event) => setInviteCode(event.currentTarget.value)}
            onPaste={(event) => {
              event.preventDefault();
              setInviteCode(normalizeInviteInput(event.clipboardData.getData("text")));
            }}
            placeholder="QLD-XXXXX-XXXXX-XXXXX"
            value={inviteCode}
          />
        </div>
      </label>
      <AuthMessage error={error} status={status} />
      <button
        className="primary-auth-action"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "正在核验…" : expired ? "续期并登录" : "验证并进入"}
      </button>
      <div className="auth-secondary-row">
        {expired && (
          <button onClick={() => setPhase("RESET_REQUEST")} type="button">
            忘记密码
          </button>
        )}
        <button
          onClick={() => void getAuthBridge()?.logout()}
          type="button"
        >
          退出账号
        </button>
      </div>
    </form>
  );
}

function PasswordResetFlow({
  initialEmail,
  onEmailRemembered,
  onResetCompleted,
}: {
  initialEmail: string;
  onEmailRemembered: (email: string) => void;
  onResetCompleted: (message: string) => void;
}) {
  const phase = useAuthStore((state) => state.phase);
  const setPhase = useAuthStore((state) => state.setPhase);
  const [email, setEmail] = useState(initialEmail);
  const [emailCode, setEmailCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const { seconds, start } = useCountdown();
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const setSubmitting = useAuthStore((state) => state.setSubmitting);

  const requestCode = async () => {
    const bridge = getAuthBridge();
    if (!bridge) {
      setError("当前不是 Electron 桌面运行环境。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await bridge.requestPasswordReset({
        email: normalizedEmail,
      });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      onEmailRemembered(normalizedEmail);
      start(result.data.retryAfterSeconds);
      setStatus("如果账号存在，验证码已发送。");
      setPhase("RESET_PASSWORD");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordRulesSatisfied(password) || password !== confirmPassword) {
      setError("请满足密码规则，并确认两次输入一致。");
      return;
    }
    const bridge = getAuthBridge();
    if (!bridge) {
      setError("当前不是 Electron 桌面运行环境。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await bridge.resetPassword({
        email: email.trim().toLowerCase(),
        emailCode,
        password,
      });
      setPassword("");
      setConfirmPassword("");
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      onResetCompleted(
        "密码已重置，所有设备均已退出。请使用新密码登录。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="auth-card"
      onSubmit={
        phase === "RESET_REQUEST"
          ? (event) => {
              event.preventDefault();
              void requestCode();
            }
          : reset
      }
    >
      <div className="auth-card-header">
        <p>找回账号</p>
        <h2 tabIndex={-1}>
          {phase === "RESET_REQUEST" ? "请求重置验证码" : "设置新密码"}
        </h2>
        <span>验证码 10 分钟内有效，最多可以尝试 5 次。</span>
      </div>
      <label className="auth-field">
        <span>邮箱</span>
        <div className="input-shell">
          <Mail size={16} />
          <input
            autoComplete="email"
            autoFocus
            disabled={phase === "RESET_PASSWORD"}
            maxLength={254}
            onChange={(event) => setEmail(event.currentTarget.value)}
            type="email"
            value={email}
          />
        </div>
      </label>
      {phase === "RESET_PASSWORD" && (
        <>
          <label className="auth-field">
            <span>邮箱验证码</span>
            <div className="input-shell">
              <ShieldCheck size={16} />
              <input
                inputMode="numeric"
                maxLength={6}
                onChange={(event) =>
                  setEmailCode(event.currentTarget.value.replace(/\D/g, ""))
                }
                value={emailCode}
              />
            </div>
          </label>
          <PasswordInput
            autoComplete="new-password"
            label="新密码"
            onChange={setPassword}
            value={password}
          />
          <PasswordInput
            autoComplete="new-password"
            label="确认新密码"
            onChange={setConfirmPassword}
            value={confirmPassword}
          />
          <PasswordRules password={password} />
        </>
      )}
      <AuthMessage error={error} status={status} />
      <button
        className="primary-auth-action"
        disabled={isSubmitting}
        type="submit"
      >
        {phase === "RESET_REQUEST"
          ? isSubmitting
            ? "正在发送…"
            : "发送重置验证码"
          : isSubmitting
            ? "正在重置…"
            : "重置密码并退出所有设备"}
      </button>
      {phase === "RESET_PASSWORD" && seconds > 0 && (
        <span className="auth-countdown-note">{seconds} 秒后可重新请求</span>
      )}
      {phase === "RESET_PASSWORD" && seconds === 0 && (
        <button
          className="auth-link-button"
          disabled={isSubmitting}
          onClick={() => void requestCode()}
          type="button"
        >
          重新发送验证码
        </button>
      )}
      <button
        className="secondary-auth-action"
        onClick={() => setPhase("LOGIN")}
        type="button"
      >
        返回登录
      </button>
    </form>
  );
}

function ServiceUnavailable() {
  const [isRetrying, setRetrying] = useState(false);
  const applyAuthState = useAuthStore((state) => state.applyAuthState);
  const retry = async () => {
    const bridge = getAuthBridge();
    if (!bridge) {
      return;
    }
    setRetrying(true);
    const result = await bridge.bootstrap();
    if (result.ok) {
      applyAuthState(result.data);
    }
    setRetrying(false);
  };
  return (
    <section className="auth-card auth-service-state">
      <AlertCircle size={24} />
      <div className="auth-card-header">
        <p>服务暂不可用</p>
        <h2 tabIndex={-1}>无法验证本机授权</h2>
        <span>请检查网络连接，或稍后重试。未验证前不会加载工作区。</span>
      </div>
      <button
        className="primary-auth-action"
        disabled={isRetrying}
        onClick={() => void retry()}
        type="button"
      >
        <RefreshCw size={15} />
        {isRetrying ? "正在重试…" : "重新验证"}
      </button>
    </section>
  );
}

export function LoginPage({
  initialExpiredAt = "",
}: {
  initialExpiredAt?: string;
}) {
  const phase = useAuthStore((state) => state.phase);
  const session = useAuthStore((state) => state.session);
  const [flowEmail, setFlowEmail] = useState("");
  const [flowNotice, setFlowNotice] = useState("");
  const [expiredAt, setExpiredAt] = useState(initialExpiredAt);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    titleRef.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [phase]);

  let content;
  if (phase === "REGISTERING") {
    content = (
      <RegistrationForm
        initialEmail={flowEmail}
        onEmailRemembered={setFlowEmail}
      />
    );
  } else if (phase === "INVITE_REQUIRED") {
    content = <InviteForm email={flowEmail} expired={false} />;
  } else if (phase === "ENTITLEMENT_EXPIRED") {
    content = (
      <InviteForm
        email={flowEmail || session?.email || ""}
        expired
        expiredAt={expiredAt}
      />
    );
  } else if (phase === "RESET_REQUEST" || phase === "RESET_PASSWORD") {
    content = (
      <PasswordResetFlow
        initialEmail={flowEmail}
        onEmailRemembered={setFlowEmail}
        onResetCompleted={setFlowNotice}
      />
    );
  } else if (phase === "SERVICE_UNAVAILABLE") {
    content = <ServiceUnavailable />;
  } else {
    content = (
      <LoginForm
        initialEmail={flowEmail}
        notice={flowNotice}
        onEmailRemembered={setFlowEmail}
        onEntitlementExpired={setExpiredAt}
      />
    );
  }

  return (
    <AuthLayout>
      <div ref={titleRef} tabIndex={-1}>
        {content}
      </div>
    </AuthLayout>
  );
}
