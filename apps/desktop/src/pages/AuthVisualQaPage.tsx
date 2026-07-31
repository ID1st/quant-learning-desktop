import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { AuthPhase, AuthSessionSnapshot } from "@quant/shared";

import { LogoutConfirmationDialog } from "../features/auth/LogoutConfirmationDialog";
import { useAuthStore } from "../features/auth/authStore";
import { LoginPage } from "./LoginPage";

const SettingsPage = lazy(() =>
  import("./SettingsPage").then((module) => ({ default: module.SettingsPage })),
);

const visualQaPhases = new Set<AuthPhase>([
  "SIGNED_OUT",
  "LOGIN",
  "REGISTERING",
  "INVITE_REQUIRED",
  "ENTITLEMENT_EXPIRED",
  "RESET_REQUEST",
  "RESET_PASSWORD",
  "SERVICE_UNAVAILABLE",
]);

const logoutQaSession: AuthSessionSnapshot = {
  userId: "visual-qa-user",
  email: "tester@fnndp.xyz",
  accessStatus: "ACTIVE",
  entitlementDurationDays: 30,
  entitlementEndsAt: "2099-08-30T12:00:00.000Z",
  offlineUntil: "2099-08-30T12:00:00.000Z",
  deviceId: "visual-qa-device",
  activeDeviceCount: 1,
  lastValidatedAt: "2099-07-30T12:00:00.000Z",
  isOffline: false,
};

export function AuthVisualQaPage() {
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(true);
  const logoutTriggerRef = useRef<HTMLButtonElement>(null);
  const requestedPhase =
    new URLSearchParams(window.location.search).get("auth-visual-qa") ?? "LOGIN";
  const phase = visualQaPhases.has(requestedPhase as AuthPhase)
    ? (requestedPhase as AuthPhase)
    : "LOGIN";

  useEffect(() => {
    useAuthStore.setState({
      phase,
      session: null,
      errorCode: null,
      isSubmitting: false,
    });
  }, [phase]);

  if (requestedPhase === "LOGOUT_CONFIRMATION") {
    return (
      <main className="app-shell">
        <aside className="app-sidebar" />
        <section className="app-content">
          <button
            className="logout-button"
            onClick={() => setIsLogoutDialogOpen(true)}
            ref={logoutTriggerRef}
            type="button"
          >
            退出登录
          </button>
        </section>
        {isLogoutDialogOpen && (
          <LogoutConfirmationDialog
            isSubmitting={false}
            onCancel={() => setIsLogoutDialogOpen(false)}
            onConfirm={() => undefined}
            returnFocusRef={logoutTriggerRef}
            session={logoutQaSession}
          />
        )}
      </main>
    );
  }

  if (requestedPhase === "WORKSPACE_SCROLL") {
    return (
      <main className="app-shell">
        <aside aria-label="主导航" className="app-sidebar">
          <nav aria-label="工作区导航">
            {["仪表盘", "超级图表", "策略管理", "策略学习", "接口配置", "设置"].map((label) => (
              <button key={label} type="button">
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <button className="command-launcher" type="button">
            <span>命令面板</span>
          </button>
          <button className="logout-button" type="button">
            <span>退出登录</span>
          </button>
        </aside>
        <section className="app-content">
          <div className="placeholder-page">
            <header>
              <p>滚动布局验证</p>
              <h1>右侧长页面内容</h1>
              <span>页面滚动时，左侧工作区导航应始终保持在视口内。</span>
            </header>
            {Array.from({ length: 24 }, (_, index) => (
              <section className="module-card" key={index}>
                <h2>验证内容 {index + 1}</h2>
                <p>用于确认滚动只发生在右侧主内容区域。</p>
              </section>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (requestedPhase === "SETTINGS") {
    return (
      <main className="app-shell">
        <aside className="app-sidebar" />
        <section className="app-content">
          <Suspense fallback={null}>
            <SettingsPage />
          </Suspense>
        </section>
      </main>
    );
  }

  return <LoginPage />;
}
