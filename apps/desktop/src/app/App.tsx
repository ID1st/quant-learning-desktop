import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "../layouts/AppShell";
import { AppRouter } from "../routes/AppRouter";
import { useAppStore } from "../state/appStore";

const queryClient = new QueryClient();

export function App() {
  const theme = useAppStore((state) => state.theme);

  return (
    <QueryClientProvider client={queryClient}>
      <div data-theme={theme}>
        <AppShell>
          <AppRouter />
        </AppShell>
      </div>
    </QueryClientProvider>
  );
}
