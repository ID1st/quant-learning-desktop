import type { AppRoute } from "@quant/shared";
import { lazy, Suspense, type ElementType } from "react";
import { LoginPage } from "../pages/LoginPage";
import { useAppStore } from "../state/appStore";

const ApiConfigPage = lazy(() => import("../pages/ApiConfigPage").then((module) => ({ default: module.ApiConfigPage })));
const ChartWorkspacePage = lazy(() => import("../pages/ChartWorkspacePage").then((module) => ({ default: module.ChartWorkspacePage })));
const DashboardPage = lazy(() => import("../pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const SettingsPage = lazy(() => import("../pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const StrategyManagementPage = lazy(() =>
  import("../pages/StrategyManagementPage").then((module) => ({ default: module.StrategyManagementPage })),
);
const StrategyLearningPage = lazy(() =>
  import("../pages/StrategyLearningPage").then((module) => ({ default: module.StrategyLearningPage })),
);

const routeMap: Record<AppRoute, ElementType> = {
  login: LoginPage,
  dashboard: DashboardPage,
  chart: ChartWorkspacePage,
  strategies: StrategyManagementPage,
  learning: StrategyLearningPage,
  apiConfig: ApiConfigPage,
  settings: SettingsPage,
};

export function AppRouter() {
  const currentRoute = useAppStore((state) => state.currentRoute);
  const Page = routeMap[currentRoute];

  return (
    <Suspense fallback={<div className="route-loading-state">正在加载工作区…</div>}>
      <Page />
    </Suspense>
  );
}
