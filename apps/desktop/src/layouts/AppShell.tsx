import { Activity, BarChart3, Command, KeyRound, LayoutDashboard, LogOut, Search, Settings, X } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent, type PropsWithChildren } from "react";
import type { AppRoute } from "@quant/shared";
import { useAuthStore } from "../features/auth/authStore";
import { useToastStore } from "../features/feedback/toastStore";
import { useAppStore } from "../state/appStore";
import { ToastViewport } from "../ui/ToastViewport";

const navItems: Array<{ route: AppRoute; label: string; icon: typeof LayoutDashboard }> = [
  { route: "dashboard", label: "仪表盘", icon: LayoutDashboard },
  { route: "chart", label: "超级图表", icon: BarChart3 },
  { route: "strategies", label: "策略管理", icon: Activity },
  { route: "apiConfig", label: "接口配置", icon: KeyRound },
  { route: "settings", label: "设置", icon: Settings },
];

export function AppShell({ children }: PropsWithChildren) {
  const currentRoute = useAppStore((state) => state.currentRoute);
  const navigate = useAppStore((state) => state.navigate);
  const clearSession = useAuthStore((state) => state.clearSession);
  const pushToast = useToastStore((state) => state.push);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const visibleCommands = useMemo(() => {
    const normalizedQuery = commandQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return navItems;
    }

    return navItems.filter((item) => item.label.toLowerCase().includes(normalizedQuery));
  }, [commandQuery]);

  useEffect(() => {
    if (currentRoute === "login") {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
        return;
      }

      if (event.key === "Escape") {
        setIsCommandPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentRoute]);

  if (currentRoute === "login") {
    return <main className="auth-shell">{children}</main>;
  }

  const handleLogout = () => {
    clearSession();
    navigate("login");
  };

  const runCommand = (route: AppRoute, label: string) => {
    navigate(route);
    setCommandQuery("");
    setIsCommandPaletteOpen(false);
    pushToast({ tone: "success", title: `已打开${label}`, durationMs: 2200 });
  };

  const handleCommandKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && visibleCommands[0]) {
      event.preventDefault();
      runCommand(visibleCommands[0].route, visibleCommands[0].label);
    }
  };

  return (
    <main className="app-shell">
      <aside className="app-sidebar" aria-label="主导航">
        <nav aria-label="工作区导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-label={item.label}
                className={currentRoute === item.route ? "active" : ""}
                key={item.route}
                onClick={() => navigate(item.route)}
                title={item.label}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button
          aria-label="打开命令面板"
          className="command-launcher"
          onClick={() => setIsCommandPaletteOpen(true)}
          title="命令面板 Ctrl+K"
          type="button"
        >
          <Command size={18} />
          <span>命令面板</span>
        </button>
        <button aria-label="退出登录" className="logout-button" onClick={handleLogout} title="退出登录" type="button">
          <LogOut size={18} />
          <span>退出登录</span>
        </button>
      </aside>
      <section className="app-content">{children}</section>
      {isCommandPaletteOpen && (
        <div className="command-palette-backdrop" role="presentation" onClick={() => setIsCommandPaletteOpen(false)}>
          <section aria-label="命令面板" className="command-palette" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="command-palette-input">
              <Search size={17} />
              <input
                aria-label="搜索命令"
                autoFocus
                onChange={(event) => setCommandQuery(event.currentTarget.value)}
                onKeyDown={handleCommandKeyDown}
                placeholder="搜索页面或操作"
                value={commandQuery}
              />
              <kbd>Esc</kbd>
              <button aria-label="关闭命令面板" onClick={() => setIsCommandPaletteOpen(false)} type="button">
                <X size={16} />
              </button>
            </div>
            <div className="command-palette-list" role="listbox">
              {visibleCommands.map((command) => {
                const Icon = command.icon;

                return (
                  <button key={command.route} onClick={() => runCommand(command.route, command.label)} role="option" type="button">
                    <Icon size={17} />
                    <span>{command.label}</span>
                    <kbd>{command.route === "chart" ? "G C" : command.route === "dashboard" ? "G D" : "打开"}</kbd>
                  </button>
                );
              })}
              {visibleCommands.length === 0 && <div className="command-palette-empty">没有匹配的命令。</div>}
            </div>
          </section>
        </div>
      )}
      <ToastViewport />
    </main>
  );
}
