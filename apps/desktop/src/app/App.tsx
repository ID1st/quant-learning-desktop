import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuthStore } from "../features/auth/authStore";
import { AppShell } from "../layouts/AppShell";
import { AppRouter } from "../routes/AppRouter";
import { useAppStore } from "../state/appStore";
import { AppErrorBoundary } from "../ui/AppErrorBoundary";
import { AppRuntimeErrorReporter } from "../ui/AppRuntimeErrorReporter";

const queryClient = new QueryClient();

export function App() {
  const session = useAuthStore((state) => state.session);
  const currentRoute = useAppStore((state) => state.currentRoute);
  const navigate = useAppStore((state) => state.navigate);
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    if (!session && currentRoute !== "login") {
      navigate("login");
      return;
    }

    if (session && currentRoute === "login") {
      navigate(session.apiBound ? "dashboard" : "apiConfig");
    }
  }, [currentRoute, navigate, session]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary onRecover={() => navigate(session ? "dashboard" : "login")}>
        <div data-theme={theme}>
          <AppShell>
            <AppRuntimeErrorReporter />
            <AppRouter />
          </AppShell>
        </div>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
