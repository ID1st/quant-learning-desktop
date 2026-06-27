import { Activity, BarChart3, KeyRound, LayoutDashboard, Settings, TerminalSquare } from "lucide-react";
import type { PropsWithChildren } from "react";
import type { AppRoute } from "@quant/shared";
import { useAppStore } from "../state/appStore";

const navItems: Array<{ route: AppRoute; label: string; icon: typeof LayoutDashboard }> = [
  { route: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { route: "chart", label: "Chart", icon: BarChart3 },
  { route: "strategies", label: "Strategies", icon: Activity },
  { route: "apiConfig", label: "API", icon: KeyRound },
  { route: "settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: PropsWithChildren) {
  const currentRoute = useAppStore((state) => state.currentRoute);
  const navigate = useAppStore((state) => state.navigate);

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <div className="app-logo">
          <TerminalSquare size={20} />
          <span>Quant</span>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={currentRoute === item.route ? "active" : ""}
                key={item.route}
                onClick={() => navigate(item.route)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <section className="app-content">{children}</section>
    </main>
  );
}
