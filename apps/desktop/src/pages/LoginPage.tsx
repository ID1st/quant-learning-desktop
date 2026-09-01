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
import { useEffect, useRef, useState, type FormEvent, type PropsWithChildren } from "react";

import type { AuthOperationError } from "@quant/shared";

import {
  authErrorMessage,
  evaluatePasswordRules,
  getAuthBridge,
  maskEmail,
  normalizeInviteInput,
  passwordRulesSatisfied,
  renewalCredentialsRequired,
} from "../features/auth/authService";
import { useAuthStore } from "../features/auth/authStore";
import { useI18n } from "../i18n/I18nProvider";
import type { Translate } from "../i18n/i18n";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";

function AuthLayout({ children }: PropsWithChildren) {
  const { t } = useI18n();
  return (
    <main className="auth-shell">
      <section className="login-page">
        <header className="login-topbar" aria-label={t("登录页页眉")}>
          <div className="brand-lockup">
            <div className="login-mark">{t("量")}</div>
            <span>{t("量化学习系统桌面版")}</span>
          </div>
          <div className="auth-topbar-actions">
            <span className="auth-environment-label">{t("安全账号验证")}</span>
            <LanguageSwitcher />
          </div>
        </header>
        <div className="login-shell">
          <aside className="login-brand-panel" aria-label={t("产品介绍")}>
            <p>TradingView + Quant Learning Workstation</p>
            <h1>{t("专业量化学习工作台")}</h1>
            <span>{t("账号验证在云端完成；行情凭据、策略草稿和研究数据继续保留在本机。")}</span>
          </aside>
          {children}
        </div>
      </section>
    </main>
  );
}

function AuthMessage({ error, status }: { error: string; status: string }) {
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

function errorText(error: AuthOperationError, t: Translate): string {
  const message =
    error.code === "RATE_LIMITED" && error.retryAfterSeconds
      ? t("操作过于频繁，请在 {seconds} 秒后重试。", {
          seconds: error.retryAfterSeconds,
        })
      : t(authErrorMessage(error.code, error.retryAfterSeconds));
  return error.requestId ? `${message} ${t("请求编号：{id}", { id: error.requestId })}` : message;
}

function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setSeconds((current) => Math.max(0, current - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [seconds]);
  return { seconds, start: (value = 60) => setSeconds(value) };
}

function PasswordInput({
  value,
  onChange,
  autoComplete,
  label = "密码",
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  label?: string;
  required?: boolean;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      <span>{t(label)}</span>
      <div className="input-shell">
        <KeyRound size={16} />
        <input
          autoComplete={autoComplete}
          maxLength={64}
          onChange={(event) => onChange(event.currentTarget.value)}
          required={required}
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? t("隐藏密码") : t("显示密码")}
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
  const { t } = useI18n();
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
    <ul className="password-rule-list" aria-label={t("密码安全规则")}>
      {items.map(([key, label]) => (
        <li className={rules[key] ? "valid" : ""} key={key}>
          <Check size={13} />
          {t(label)}
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
  const { t } = useI18n();
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
      setError(t("当前不是 Electron 桌面运行环境，无法安全登录。"));
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
        setError(errorText(result.error, t));
        return;
      }
      onEmailRemembered(normalizedEmail);
      if (result.data.kind === "ACCESS_DENIED") {
        setError(t("该账号当前无法访问测试系统。"));
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
        <p>{t("账号登录")}</p>
        <h2 tabIndex={-1}>{t("验证您的测试账号")}</h2>
        <span>{t("首次正确登录后，需要再核验一枚有效邀请码。")}</span>
      </div>
      <label className="auth-field">
        <span>{t("邮箱")}</span>
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
      <PasswordInput autoComplete="current-password" onChange={setPassword} value={password} />
      <button className="auth-link-button" onClick={() => setPhase("RESET_REQUEST")} type="button">
        {t("忘记密码")}
      </button>
      <AuthMessage error={error} status={status || notice} />
      <button className="primary-auth-action" disabled={isSubmitting} type="submit">
        {isSubmitting ? t("正在验证…") : t("登录")}
      </button>
      <div className="auth-secondary-row">
        <span>{t("还没有账号？")}</span>
        <button onClick={() => setPhase("REGISTERING")} type="button">
          {t("注册测试账号")}
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
  const { t } = useI18n();
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
      setError(t("当前不是 Electron 桌面运行环境。"));
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
        setError(errorText(result.error, t));
        return;
      }
      start(result.data.retryAfterSeconds);
      setStatus(
        t("验证码已发送，请检查邮箱；验证码 10 分钟内有效。已注册邮箱验证后会引导您登录。"),
      );
    } finally {
      setRequestingCode(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordRulesSatisfied(password)) {
      setError(t("请先满足全部密码安全规则。"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("两次输入的密码不一致。"));
      return;
    }
    const bridge = getAuthBridge();
    if (!bridge) {
      setError(t("当前不是 Electron 桌面运行环境。"));
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
        setError(errorText(result.error, t));
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
        <p>{t("账号注册")}</p>
        <h2 tabIndex={-1}>{t("创建测试账号")}</h2>
        <span>{t("注册只验证邮箱和密码；邀请码在首次登录时单独核验。")}</span>
      </div>
      <label className="auth-field">
        <span>{t("邮箱")}</span>
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
        <span>{t("邮箱验证码")}</span>
        <div className="inline-input">
          <div className="input-shell">
            <ShieldCheck size={16} />
            <input
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setEmailCode(event.currentTarget.value.replace(/\D/g, ""))}
              value={emailCode}
            />
          </div>
          <button
            disabled={seconds > 0 || isRequestingCode}
            onClick={() => void requestCode()}
            type="button"
          >
            {isRequestingCode
              ? t("正在发送…")
              : seconds > 0
                ? t("{seconds} 秒", { seconds })
                : t("发送验证码")}
          </button>
        </div>
      </label>
      <PasswordInput autoComplete="new-password" onChange={setPassword} value={password} />
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
          <button className="primary-auth-action" onClick={() => setPhase("LOGIN")} type="button">
            {t("直接登录")}
          </button>
          <button
            className="secondary-auth-action"
            onClick={() => setPhase("RESET_REQUEST")}
            type="button"
          >
            {t("忘记密码，重置密码")}
          </button>
        </>
      ) : (
        <>
          <button className="primary-auth-action" disabled={isSubmitting} type="submit">
            {isSubmitting ? t("正在创建…") : t("完成注册")}
          </button>
          <button className="secondary-auth-action" onClick={() => setPhase("LOGIN")} type="button">
            {t("已有账号，返回登录")}
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
  onEmailRemembered,
}: {
  email: string;
  expired: boolean;
  expiredAt?: string;
  onEmailRemembered: (email: string) => void;
}) {
  const { formatDateTime, t } = useI18n();
  const [renewalEmail, setRenewalEmail] = useState(email);
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [forceReauthentication, setForceReauthentication] = useState(email.length === 0);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const setSubmitting = useAuthStore((state) => state.setSubmitting);
  const setPhase = useAuthStore((state) => state.setPhase);
  const credentialsRequired =
    expired && (forceReauthentication || renewalCredentialsRequired(email, renewalEmail));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const bridge = getAuthBridge();
    if (!bridge) {
      setError(t("当前不是 Electron 桌面运行环境。"));
      return;
    }
    setSubmitting(true);
    setError("");
    setStatus("");
    try {
      const normalizedCode = normalizeInviteInput(inviteCode);
      let shouldRenew = expired;

      if (credentialsRequired) {
        const normalizedEmail = renewalEmail.trim().toLowerCase();
        if (!normalizedEmail || !password) {
          setError(t("请输入邮箱和密码以验证续期账号。"));
          return;
        }
        const loginResult = await bridge.login({ email: normalizedEmail, password });
        if (!loginResult.ok) {
          setError(errorText(loginResult.error, t));
          return;
        }
        if (loginResult.data.kind === "ACCESS_DENIED") {
          setError(t("该账号当前无法访问测试系统。"));
          return;
        }
        onEmailRemembered(normalizedEmail);
        setRenewalEmail(normalizedEmail);
        setForceReauthentication(false);
        if (loginResult.data.kind === "AUTHENTICATED") {
          return;
        }
        shouldRenew = loginResult.data.kind === "ENTITLEMENT_EXPIRED";
      }

      const result = shouldRenew
        ? await bridge.renewEntitlement({ inviteCode: normalizedCode })
        : await bridge.redeemInvite({ inviteCode: normalizedCode });
      if (!result.ok) {
        if (expired && result.error.code === "ACCESS_DENIED") {
          setForceReauthentication(true);
          setError(t("请重新输入邮箱和密码后再续期。"));
          return;
        }
        setError(errorText(result.error, t));
        return;
      }
      setStatus(
        t("资格已生效，有效期至 {time}", {
          time: formatDateTime(result.data.entitlementEndsAt),
        }),
      );
    } catch {
      setError(t("邀请码格式不正确，请输入 QLD-XXXXX-XXXXX-XXXXX。"));
    } finally {
      setPassword("");
      setSubmitting(false);
    }
  };

  return (
    <form className="auth-card auth-blocking-card" onSubmit={submit}>
      <div className="auth-card-header">
        <p>{expired ? t("测试资格已到期") : t("首次登录验证")}</p>
        <h2 tabIndex={-1}>{expired ? t("使用新邀请码续期") : t("验证测试用户邀请码")}</h2>
        <span>
          {expired
            ? credentialsRequired
              ? t("请输入邮箱和密码验证账号，再使用新邀请码续期。")
              : t("邮箱和密码已验证，但测试资格已经失效。")
            : t("邮箱和密码已验证，还需要邀请码确认测试资格。")}
        </span>
        {expired && expiredAt && (
          <span>
            {t("原到期时间：")}
            {formatDateTime(expiredAt)}
          </span>
        )}
      </div>
      {expired ? (
        <>
          <label className="auth-field">
            <span>{t("邮箱")}</span>
            <div className="input-shell">
              <Mail size={16} />
              <input
                autoComplete="email"
                autoFocus={!email}
                maxLength={254}
                onChange={(event) => {
                  setRenewalEmail(event.currentTarget.value);
                  setPassword("");
                  setError("");
                }}
                placeholder="name@example.com"
                required
                type="email"
                value={renewalEmail}
              />
            </div>
          </label>
          {credentialsRequired && (
            <PasswordInput
              autoComplete="current-password"
              onChange={setPassword}
              required
              value={password}
            />
          )}
        </>
      ) : (
        <div className="masked-account-row">
          <Mail size={15} />
          <span>{maskEmail(email)}</span>
        </div>
      )}
      <label className="auth-field">
        <span>{t("邀请码")}</span>
        <div className="input-shell">
          <ShieldCheck size={16} />
          <input
            autoFocus={!expired || (!credentialsRequired && Boolean(email))}
            maxLength={64}
            onChange={(event) => setInviteCode(event.currentTarget.value)}
            onPaste={(event) => {
              event.preventDefault();
              const pastedCode = event.clipboardData.getData("text");
              try {
                setInviteCode(normalizeInviteInput(pastedCode));
                setError("");
              } catch {
                setInviteCode(pastedCode);
                setError(t("邀请码格式不正确，请核对后重试。"));
              }
            }}
            placeholder="QLD-XXXXX-XXXXX-XXXXX"
            required
            value={inviteCode}
          />
        </div>
      </label>
      <AuthMessage error={error} status={status} />
      <button className="primary-auth-action" disabled={isSubmitting} type="submit">
        {isSubmitting ? t("正在核验…") : expired ? t("续期并登录") : t("验证并进入")}
      </button>
      <div className="auth-secondary-row">
        {expired && (
          <button onClick={() => setPhase("RESET_REQUEST")} type="button">
            {t("忘记密码")}
          </button>
        )}
        <button onClick={() => void getAuthBridge()?.logout()} type="button">
          {t("退出账号")}
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
  const { t } = useI18n();
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
      setError(t("当前不是 Electron 桌面运行环境。"));
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
        setError(errorText(result.error, t));
        return;
      }
      onEmailRemembered(normalizedEmail);
      start(result.data.retryAfterSeconds);
      setStatus(t("如果账号存在，验证码已发送。"));
      setPhase("RESET_PASSWORD");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordRulesSatisfied(password) || password !== confirmPassword) {
      setError(t("请满足密码规则，并确认两次输入一致。"));
      return;
    }
    const bridge = getAuthBridge();
    if (!bridge) {
      setError(t("当前不是 Electron 桌面运行环境。"));
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
        setError(errorText(result.error, t));
        return;
      }
      onResetCompleted(t("密码已重置，所有设备均已退出。请使用新密码登录。"));
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
        <p>{t("找回账号")}</p>
        <h2 tabIndex={-1}>{phase === "RESET_REQUEST" ? t("请求重置验证码") : t("设置新密码")}</h2>
        <span>{t("验证码 10 分钟内有效，最多可以尝试 5 次。")}</span>
      </div>
      <label className="auth-field">
        <span>{t("邮箱")}</span>
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
            <span>{t("邮箱验证码")}</span>
            <div className="input-shell">
              <ShieldCheck size={16} />
              <input
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setEmailCode(event.currentTarget.value.replace(/\D/g, ""))}
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
      <button className="primary-auth-action" disabled={isSubmitting} type="submit">
        {phase === "RESET_REQUEST"
          ? isSubmitting
            ? t("正在发送…")
            : t("发送重置验证码")
          : isSubmitting
            ? t("正在重置…")
            : t("重置密码并退出所有设备")}
      </button>
      {phase === "RESET_PASSWORD" && seconds > 0 && (
        <span className="auth-countdown-note">{t("{seconds} 秒后可重新请求", { seconds })}</span>
      )}
      {phase === "RESET_PASSWORD" && seconds === 0 && (
        <button
          className="auth-link-button"
          disabled={isSubmitting}
          onClick={() => void requestCode()}
          type="button"
        >
          {t("重新发送验证码")}
        </button>
      )}
      <button className="secondary-auth-action" onClick={() => setPhase("LOGIN")} type="button">
        {t("返回登录")}
      </button>
    </form>
  );
}

function ServiceUnavailable() {
  const { t } = useI18n();
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
        <p>{t("服务暂不可用")}</p>
        <h2 tabIndex={-1}>{t("无法验证本机授权")}</h2>
        <span>{t("请检查网络连接，或稍后重试。未验证前不会加载工作区。")}</span>
      </div>
      <button
        className="primary-auth-action"
        disabled={isRetrying}
        onClick={() => void retry()}
        type="button"
      >
        <RefreshCw size={15} />
        {isRetrying ? t("正在重试…") : t("重新验证")}
      </button>
    </section>
  );
}

export function LoginPage({ initialExpiredAt = "" }: { initialExpiredAt?: string }) {
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
    content = <RegistrationForm initialEmail={flowEmail} onEmailRemembered={setFlowEmail} />;
  } else if (phase === "INVITE_REQUIRED") {
    content = <InviteForm email={flowEmail} expired={false} onEmailRemembered={setFlowEmail} />;
  } else if (phase === "ENTITLEMENT_EXPIRED") {
    content = (
      <InviteForm
        email={flowEmail || session?.email || ""}
        expired
        expiredAt={expiredAt}
        onEmailRemembered={setFlowEmail}
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
