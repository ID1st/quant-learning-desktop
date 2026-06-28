import { create } from "zustand";
import type { AuthSession } from "./authService";

const STORAGE_KEY = "quant-learning.auth-session";

interface AuthState {
  session: AuthSession | null;
  setSession: (session: AuthSession) => void;
  setApiBound: (apiBound: boolean) => void;
  clearSession: () => void;
}

function readStoredSession(): AuthSession | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as AuthSession) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: readStoredSession(),
  setSession: (session) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    set({ session });
  },
  setApiBound: (apiBound) => {
    set((state) => {
      if (!state.session) {
        return state;
      }

      const session = { ...state.session, apiBound };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return { session };
    });
  },
  clearSession: () => {
    window.localStorage.removeItem(STORAGE_KEY);
    set({ session: null });
  },
}));
