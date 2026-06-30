import { create } from "zustand";
import type { AuthSession } from "./authService";
import { appLocalDatabase } from "../persistence/localDatabase";

const COLLECTION_KEY = "auth-session";
const STORAGE_VERSION = 1;

interface AuthState {
  session: AuthSession | null;
  setSession: (session: AuthSession) => void;
  setApiBound: (apiBound: boolean) => void;
  clearSession: () => void;
}

function sanitizeSession(value: unknown): AuthSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const session = value as Partial<AuthSession>;
  if (
    typeof session.userId !== "string" ||
    typeof session.email !== "string" ||
    typeof session.apiBound !== "boolean" ||
    typeof session.createdAt !== "string"
  ) {
    return null;
  }

  return {
    userId: session.userId,
    email: session.email,
    apiBound: session.apiBound,
    createdAt: session.createdAt,
  };
}

function readStoredSession(): AuthSession | null {
  return appLocalDatabase.readDocument(COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: null,
    sanitize: sanitizeSession,
  });
}

function writeStoredSession(session: AuthSession) {
  appLocalDatabase.writeDocument(COLLECTION_KEY, STORAGE_VERSION, session);
}

export const useAuthStore = create<AuthState>((set) => ({
  session: readStoredSession(),
  setSession: (session) => {
    writeStoredSession(session);
    set({ session });
  },
  setApiBound: (apiBound) => {
    set((state) => {
      if (!state.session) {
        return state;
      }

      const session = { ...state.session, apiBound };
      writeStoredSession(session);
      return { session };
    });
  },
  clearSession: () => {
    appLocalDatabase.removeDocument(COLLECTION_KEY);
    set({ session: null });
  },
}));
