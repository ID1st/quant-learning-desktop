import type { AppRoute } from "@quant/shared";
import type { ComponentType } from "react";
import { ApiConfigPage } from "../pages/ApiConfigPage";
import { ChartWorkspacePage } from "../pages/ChartWorkspacePage";
import { DashboardPage } from "../pages/DashboardPage";
import { LoginPage } from "../pages/LoginPage";
import { SettingsPage } from "../pages/SettingsPage";
import { StrategyManagementPage } from "../pages/StrategyManagementPage";
import { useAppStore } from "../state/appStore";

const routeMap: Record<AppRoute, ComponentType> = {
  login: LoginPage,
  dashboard: DashboardPage,
  chart: ChartWorkspacePage,
  strategies: StrategyManagementPage,
  apiConfig: ApiConfigPage,
  settings: SettingsPage,
};

export function AppRouter() {
  const currentRoute = useAppStore((state) => state.currentRoute);
  const Page = routeMap[currentRoute];

  return <Page />;
}
