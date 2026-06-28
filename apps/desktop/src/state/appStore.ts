import { create } from "zustand";
import type { AppRoute, ThemeMode } from "@quant/shared";

interface AppState {
  currentRoute: AppRoute;
  theme: ThemeMode;
  navigate: (route: AppRoute) => void;
  setTheme: (theme: ThemeMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentRoute: "login",
  theme: "dark",
  navigate: (route) => set({ currentRoute: route }),
  setTheme: (theme) => set({ theme }),
}));
