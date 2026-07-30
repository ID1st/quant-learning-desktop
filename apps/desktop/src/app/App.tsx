import { AlertTriangle, LoaderCircle, ShieldCheck } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { AuthSessionSnapshot, AuthStateSnapshot } from "@quant/shared";

import { getAuthBridge } from "../features/auth/authService";
import { useAuthStore } from "../features/auth/authStore";
import { clearLocalUserProfile } from "../features/auth/localProfileService";
import { AppShell } from "../layouts/AppShell";
import { LoginPage } from "../pages/LoginPage";
import { AppRouter } from "../routes/AppRouter";
import { useAppStore } from "../state/appStore";
import { AppErrorBoundary } from "../ui/AppErrorBoundary";
import { AppRuntimeErrorReporter } from "../ui/AppRuntimeErrorReporter";
import { resolveRequiredAppRoute } from "./authenticatedRouteGuard";

const queryClient = new QueryClient();

function AuthBootstrapScreen() {
  return (
    <main className="auth-bootstrap-screen" aria-live="polite">
      <LoaderCircle className="spin" size={24} />
      <div>
        <strong>正在验证本机授权</strong>
        <span>正在检查加密会话和测试资格…</span>
      </div>
    </main>
  );
}

function EntitlementActivatedScreen({
  session,
}: {
  session: AuthSessionSnapshot;
}) {
  return (
    <main className="auth-bootstrap-screen" aria-live="polite">
      <ShieldCheck size={26} />
      <div>
        <strong>{session.entitlementDurationDays} 天测试资格已生效</strong>
        <span>
          有效期至
          {new Date(session.entitlementEndsAt).toLocaleString("zh-CN", {
            hour12: false,
          })}
          ，正在进入工作区…
        </span>
      </div>
    </main>
  );
}

function LocalProfileConflictScreen() {
  const [isClearing, setClearing] = useState(false);
  const pendingSession = useAuthStore((state) => state.pendingSession);
  const acceptPendingProfileSwitch = useAuthStore(
    (state) => state.acceptPendingProfileSwitch,
  );
  const clearSession = useAuthStore((state) => state.clearSession);

  const cancel = async () => {
    await getAuthBridge()?.logout();
    clearSession();
  };
  const confirm = async () => {
    if (
      !window.confirm(
        "确认清除当前 Windows 用户下的策略草稿、画线、行情缓存和安全凭据，并切换云端账号？此操作不可撤销。",
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
          <p>本机账号隔离</p>
          <h2>本机已绑定其他量化账号</h2>
          <span>
            为避免读取前一个账号的本地研究资料，账号
            {pendingSession ? ` ${pendingSession.email} ` : " "}
            暂不能进入工作区。
          </span>
        </div>
        <button
          className="primary-auth-action danger"
          disabled={isClearing}
          onClick={() => void confirm()}
          type="button"
        >
          {isClearing ? "正在清除本机资料…" : "清除本机用户资料并切换账号"}
        </button>
        <button
          className="secondary-auth-action"
          onClick={() => void cancel()}
          type="button"
        >
          取消并退出新账号
        </button>
      </section>
    </main>
  );
}

export function App() {
  const phase = useAuthStore((state) => state.phase);
  const session = useAuthStore((state) => state.session);
  const profileConflictUserId = useAuthStore(
    (state) => state.profileConflictUserId,
  );
  const applyAuthState = useAuthStore((state) => state.applyAuthState);
  const setPhase = useAuthStore((state) => state.setPhase);
  const currentRoute = useAppStore((state) => state.currentRoute);
  const navigate = useAppStore((state) => state.navigate);
  const theme = useAppStore((state) => state.theme);
  const [entitlementNotice, setEntitlementNotice] =
    useState<AuthSessionSnapshot | null>(null);
  const [expiredAtNotice, setExpiredAtNotice] = useState("");

  const handleAuthState = useCallback(
    (nextState: AuthStateSnapshot) => {
      const previousAuthState = useAuthStore.getState();
      const previousPhase = previousAuthState.phase;
      if (
        nextState.phase === "ENTITLEMENT_EXPIRED" &&
        previousAuthState.session
      ) {
        setExpiredAtNotice(
          previousAuthState.session.entitlementEndsAt,
        );
      }
      applyAuthState(nextState);
      if (
        nextState.session &&
        (nextState.phase === "AUTHENTICATED_ONLINE" ||
          nextState.phase === "AUTHENTICATED_OFFLINE") &&
        (previousPhase === "INVITE_REQUIRED" ||
          previousPhase === "ENTITLEMENT_EXPIRED")
      ) {
        setEntitlementNotice(nextState.session);
        setExpiredAtNotice("");
      }
    },
    [applyAuthState],
  );

  const authenticated =
    (phase === "AUTHENTICATED_ONLINE" ||
      phase === "AUTHENTICATED_OFFLINE") &&
    Boolean(session);

  useEffect(() => {
    let cancelled = false;
    const bridge = getAuthBridge();
    if (!bridge) {
      setPhase("SERVICE_UNAVAILABLE");
      return;
    }
    const unsubscribe = bridge.subscribe(handleAuthState);
    void bridge.bootstrap().then((result) => {
      if (cancelled) {
        return;
      }
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
    const timer = window.setTimeout(
      () => setEntitlementNotice(null),
      1_500,
    );
    return () => window.clearTimeout(timer);
  }, [entitlementNotice]);

  useEffect(() => {
    const requiredRoute = resolveRequiredAppRoute(
      authenticated,
      currentRoute,
    );
    if (requiredRoute) {
      navigate(requiredRoute);
    }
  }, [authenticated, currentRoute, navigate]);

  let content;
  if (phase === "BOOTSTRAPPING") {
    content = <AuthBootstrapScreen />;
  } else if (profileConflictUserId) {
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
      <AppErrorBoundary
        onRecover={() => navigate(authenticated ? "chart" : "login")}
      >
        <div data-theme={theme}>{content}</div>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
