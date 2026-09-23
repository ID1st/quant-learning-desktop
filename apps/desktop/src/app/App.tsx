import { AlertTriangle, ShieldCheck } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { AuthSessionSnapshot, AuthStateSnapshot } from "@quant/shared";

import { getAuthBridge } from "../features/auth/authService";
import { runAuthBootstrapWithDeadline } from "../features/auth/authBootstrapDeadline";
import { useAuthStore } from "../features/auth/authStore";
import { clearLocalUserProfile } from "../features/auth/localProfileService";
import { AppShell } from "../layouts/AppShell";
import { LoginPage } from "../pages/LoginPage";
import { AppRouter } from "../routes/AppRouter";
import { useAppStore } from "../state/appStore";
import { AppErrorBoundary } from "../ui/AppErrorBoundary";
import { AppRuntimeErrorReporter } from "../ui/AppRuntimeErrorReporter";
import { resolveRequiredAppRoute } from "./authenticatedRouteGuard";
import { useI18n } from "../i18n/I18nProvider";

const queryClient = new QueryClient();

function EntitlementActivatedScreen({ session }: { session: AuthSessionSnapshot }) {
  const { formatDateTime, t } = useI18n();
  return (
    <main className="auth-bootstrap-screen" aria-live="polite">
      <ShieldCheck size={26} />
      <div>
        <strong>{t("{days} 天测试资格已生效", { days: session.entitlementDurationDays })}</strong>
        <span>
          {t("有效期至{time}，正在进入工作区…", {
            time: formatDateTime(session.entitlementEndsAt),
          })}
        </span>
      </div>
    </main>
  );
}

function LocalProfileConflictScreen() {
  const { t } = useI18n();
  const [isClearing, setClearing] = useState(false);
  const pendingSession = useAuthStore((state) => state.pendingSession);
  const acceptPendingProfileSwitch = useAuthStore((state) => state.acceptPendingProfileSwitch);
  const clearSession = useAuthStore((state) => state.clearSession);

  const cancel = async () => {
    await getAuthBridge()?.logout();
    clearSession();
  };
  const confirm = async () => {
    if (
      !window.confirm(
        t(
          "确认清除当前 Windows 用户下的策略草稿、画线、行情缓存和安全凭据，并切换云端账号？此操作不可撤销。",
        ),
      )
    ) {
      return;
    }
    setClearing(true);
    await clearLocalUserProfile();
    acceptPendingProfileSwitch();
    setClearing(false);
  };

  return (
    <main className="auth-shell">
      <section className="local-profile-conflict auth-card">
        <AlertTriangle size={24} />
        <div className="auth-card-header">
          <p>{t("本机账号隔离")}</p>
          <h2>{t("本机已绑定其他量化账号")}</h2>
          <span>
            {t("为避免读取前一个账号的本地研究资料，账号 {email} 暂不能进入工作区。", {
              email: pendingSession?.email ?? "",
            })}
          </span>
        </div>
        <button
          className="primary-auth-action danger"
          disabled={isClearing}
          onClick={() => void confirm()}
          type="button"
        >
          {isClearing ? t("正在清除本机资料…") : t("清除本机用户资料并切换账号")}
        </button>
        <button className="secondary-auth-action" onClick={() => void cancel()} type="button">
          {t("取消并退出新账号")}
        </button>
      </section>
    </main>
  );
}

export function App() {
  const phase = useAuthStore((state) => state.phase);
  const session = useAuthStore((state) => state.session);
  const profileConflictUserId = useAuthStore((state) => state.profileConflictUserId);
  const applyAuthState = useAuthStore((state) => state.applyAuthState);
  const setPhase = useAuthStore((state) => state.setPhase);
  const currentRoute = useAppStore((state) => state.currentRoute);
  const navigate = useAppStore((state) => state.navigate);
  const theme = useAppStore((state) => state.theme);
  const [entitlementNotice, setEntitlementNotice] = useState<AuthSessionSnapshot | null>(null);
  const [expiredAtNotice, setExpiredAtNotice] = useState("");

  const handleAuthState = useCallback(
    (nextState: AuthStateSnapshot) => {
      const previousAuthState = useAuthStore.getState();
      const previousPhase = previousAuthState.phase;
      if (nextState.phase === "ENTITLEMENT_EXPIRED" && previousAuthState.session) {
        setExpiredAtNotice(previousAuthState.session.entitlementEndsAt);
      }
      applyAuthState(nextState);
      if (
        nextState.session &&
        (nextState.phase === "AUTHENTICATED_ONLINE" ||
          nextState.phase === "AUTHENTICATED_OFFLINE") &&
        (previousPhase === "INVITE_REQUIRED" || previousPhase === "ENTITLEMENT_EXPIRED")
      ) {
        setEntitlementNotice(nextState.session);
        setExpiredAtNotice("");
      }
    },
    [applyAuthState],
  );

  const authenticated =
    (phase === "AUTHENTICATED_ONLINE" || phase === "AUTHENTICATED_OFFLINE") && Boolean(session);

  useEffect(() => {
    let cancelled = false;
    const bridge = getAuthBridge();
    if (!bridge) {
      setPhase("SERVICE_UNAVAILABLE");
      return;
    }
    const unsubscribe = bridge.subscribe(handleAuthState);
    void runAuthBootstrapWithDeadline(() => bridge.bootstrap()).then((settled) => {
      if (cancelled) {
        return;
      }
      if (!settled.ok) {
        setPhase("SERVICE_UNAVAILABLE");
        return;
      }
      const result = settled.value;
      if (result.ok) {
        handleAuthState(result.data);
      } else {
        setPhase("SERVICE_UNAVAILABLE");
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [handleAuthState, setPhase]);

  useEffect(() => {
    if (!entitlementNotice) {
      return;
    }
    const timer = window.setTimeout(() => setEntitlementNotice(null), 1_500);
    return () => window.clearTimeout(timer);
  }, [entitlementNotice]);

  useEffect(() => {
    const requiredRoute = resolveRequiredAppRoute(authenticated, currentRoute);
    if (requiredRoute) {
      navigate(requiredRoute);
    }
  }, [authenticated, currentRoute, navigate]);

  let content;
  if (profileConflictUserId) {
    content = <LocalProfileConflictScreen />;
  } else if (authenticated && entitlementNotice) {
    content = <EntitlementActivatedScreen session={entitlementNotice} />;
  } else if (!authenticated) {
    content = <LoginPage initialExpiredAt={expiredAtNotice} />;
  } else {
    content = (
      <AppShell>
        <AppRuntimeErrorReporter />
        <AppRouter />
      </AppShell>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary onRecover={() => navigate(authenticated ? "chart" : "login")}>
        <div data-theme={theme} data-desktop-auth-phase={phase}>
          {content}
        </div>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
